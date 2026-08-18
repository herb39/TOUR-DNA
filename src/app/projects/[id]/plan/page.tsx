import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getProjectDetail } from "@/lib/services/projectQueries";
import { ensureSelectedPlan } from "@/lib/services/planService";
import { getPromoContentForProject } from "@/lib/services/promoContentService";
import { buildStrategyPoiFitSummary } from "@/lib/services/poiFitService";
import { buildRecommendedPoiCandidates, type CandidatePoi } from "@/lib/services/candidatePoolService";
import type { DurationCode } from "@/lib/domain/strategy";
import { PlanEditor, type PlanEditorData } from "@/components/plan/PlanEditor";
import { PromoContentEditor } from "@/components/plan/PromoContentEditor";
import { DNA_AXES, type DataProvenance } from "@/lib/domain/types";
import { resolveRegionComparisonAnalysis } from "@/lib/services/resolveRegionComparisonAnalysis";
import { summarizeEvidenceBaseYms } from "@/lib/format";
import { computePreLaunchValidation } from "@/lib/domain/preLaunchValidation";
import { PreLaunchValidationSection } from "@/components/plan/PreLaunchValidationSection";
import { labelForPrimaryGoal, labelForRole } from "@/lib/validation/codes";
import { buildRoleDecisionSummary } from "@/lib/domain/roleDecisionSummary";
import { buildShortStrategyRationaleLine } from "@/lib/domain/strategyRationale";
import { toDisplayDnaScore } from "@/lib/domain/dnaDisplayScore";
import { preferredThemeLabels } from "@/lib/validation/project-preferences";
import { getProjectAnchor } from "@/lib/services/projectAnchorService";
import { isFestivalAnchorItem } from "@/lib/domain/planBuilder";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: Awaited<ReturnType<typeof getProjectDetail>> = null;
  let loadError: string | null = null;
  try {
    project = await getProjectDetail(id);
  } catch {
    loadError = "실행안을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (loadError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {loadError}
          </div>
        </main>
      </>
    );
  }

  if (!project) notFound();
  if (!project.selectedStrategyResultId) {
    redirect(`/projects/${id}/analysis`);
  }

  // ensureSelectedPlan은 selectedPlan.strategyResultId가 현재 선택된 전략과 다르면 새로 생성하고,
  // 같으면 기존 값(사용자 편집분 포함)을 그대로 반환한다 — 항상 호출해야 전략 재선택이 반영된다.
  // course의 poiId 목록(poiFitSummary용)이 이 결과에서 나오므로 아래 병렬 조회보다 먼저 완료돼야 한다.
  const planRow = await ensureSelectedPlan(id);
  // P1-2a: 다음 단계(P1-2b)에서 Anchor를 일정 편집에 연결할 수 있도록 현재 프로젝트 Anchor를
  // 함께 읽어 전달한다. 이번 단계에서는 코스에 표시·삽입·순서 변경을 하지 않는다.
  const festivalAnchorResult = await getProjectAnchor(id);

  const selectedStrategy = project.analysisResult?.strategyResults.find((s) => s.id === planRow.strategyResultId);
  const templateId = selectedStrategy?.templateId;
  const duration = project.input?.duration as DurationCode;
  const preferredThemes = preferredThemeLabels(project.input?.preferredThemes);

  const planData: PlanEditorData = {
    id: planRow.id,
    projectId: id,
    regionId: project.regionId,
    transport: project.input?.transport as PlanEditorData["transport"],
    duration,
    templateId,
    preferredThemes,
    kakaoKey: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY,
    productName: planRow.productName,
    conceptText: planRow.conceptText,
    background: planRow.background,
    targetSummary: planRow.targetSummary,
    sellingPoints: planRow.sellingPoints as string[],
    course: planRow.course as unknown as PlanEditorData["course"],
    operationChecklist: planRow.operationChecklist as string[],
    risks: planRow.risks as PlanEditorData["risks"],
    kpis: planRow.kpis as unknown as PlanEditorData["kpis"],
    memo: planRow.memo ?? "",
    kpiMemo: planRow.kpiMemo ?? "",
    primaryGoalCode: project.input?.primaryGoal ?? null,
    primaryGoalLabel: project.input?.primaryGoal ? labelForPrimaryGoal(project.input.primaryGoal) : null,
    festivalAnchor: festivalAnchorResult.anchor,
  };

  // 2026-07-30(P0-1): 전략별 POI 적합도·후보 부족 안내를 이 코스에 담긴 poiId 기준으로 매번 새로
  // 계산한다(저장하지 않음) — 사용자가 장소를 추가·삭제해도 다음 렌더링에서 항상 최신 상태로 반영되고,
  // 선택 로직(selectPois)이나 전략 점수·순위는 전혀 건드리지 않는다.
  const poiIds =
    templateId && project.input
      ? planData.course.days.flatMap((d) => [
          ...d.items.filter((item) => !isFestivalAnchorItem(item)).map((i) => i.poiId),
          ...(d.lodging ? [d.lodging.poiId] : []),
        ])
      : null;
  const analysisResult = project.analysisResult;
  const analysisOwnBaseYm = analysisResult ? summarizeEvidenceBaseYms(analysisResult.evidences).primary : null;

  // 2026-08-13(로딩 성능 개선): promoContent 조회·POI 적합도 계산·유사지역 비교 재계산은 서로 완전히
  // 독립적인데 이전에는 순차 await로 걸려 있었다 — 세 작업 중 가장 느린 것 하나만큼만 기다리도록
  // Promise.all로 병렬화한다(각 함수의 계산 로직·산식 자체는 전혀 바꾸지 않음).
  const [promoContentResult, poiFitSummary, regionComparisonResolved, candidatePois] = await Promise.all([
    getPromoContentForProject(id),
    poiIds && templateId && project.input
      ? buildStrategyPoiFitSummary({
          templateId,
          regionCode: project.region.code,
          poiIds,
          travelMonth: project.travelMonth,
          preferredThemes,
          duration: project.input.duration as DurationCode,
        }).catch(() => null) // 적합도 표시는 부가 정보라 계산 실패해도 실행안 화면 자체는 그대로 보여준다.
      : Promise.resolve(null),
    analysisResult && project.input
      ? resolveRegionComparisonAnalysis({
          regionCode: project.region.code,
          regionName: project.region.name,
          snapshot: analysisResult.regionComparisonSnapshot,
          analysisOwnBaseYm,
        })
      : Promise.resolve(null),
    // 추천 POI 후보 풀(Phase B 첫 단계, 2026-08-16) — 이미 계산된 신호(structural/keyword relevance,
    // core-theme, SHOPPING dedup)만 재사용해 현재 course에 없는 대체 POI를 보여준다. 실패해도(null)
    // 기존 실행안 화면 자체는 그대로 동작해야 한다 — 후보 풀만 오류 상태로 표시한다.
    poiIds && templateId && project.input
      ? buildRecommendedPoiCandidates({
          templateId,
          regionCode: project.region.code,
          travelMonth: project.travelMonth,
          preferredThemes,
          existingPoiIds: poiIds,
        }).catch((): CandidatePoi[] | null => null)
      : Promise.resolve([] as CandidatePoi[]),
  ]);

  // 사업 사전검증 리포트(2026-08-03) — DNA 5축·POI 공급·이동 경고·유사지역 비교·위험 요인 등 이미
  // 계산된 값만 조합한다(새 지표 없음, DNA·전략 점수 공식 변경 없음). 유사지역 비교는 분석·인쇄 화면과
  // 같은 baseYm(이 분석의 evidence에 실제로 저장된 기준월)으로 계산해 화면 간 결과가 일치하게 한다.
  let preLaunchValidation: ReturnType<typeof computePreLaunchValidation> | null = null;
  if (analysisResult && project.input) {
    const regionComparisonAnalysis = regionComparisonResolved?.analysis ?? null;
    const travelNoticeCount = planData.course.days.reduce((sum, d) => sum + (d.notices?.length ?? 0), 0);

    preLaunchValidation = computePreLaunchValidation({
      axisScores: DNA_AXES.map((axis) => ({
        axis,
        score: analysisResult[`${axis}Score` as const] as number | null,
        evidenceProvenances: analysisResult.evidences
          .filter((e) => e.axis === axis)
          .map((e) => e.provenance as DataProvenance | null),
      })),
      poiShortage: poiFitSummary?.shortage ?? null,
      travelNoticeCount,
      totalCourseDays: planData.course.days.length,
      regionComparisonCount: regionComparisonAnalysis?.comparisons.length ?? 0,
      regionUniqueStrengthNote: regionComparisonAnalysis?.uniqueStrengthNote ?? null,
      riskMitigations: planData.risks,
    });
  }

  // 역할별 핵심 의사결정 요약(2026-08-13) — analysis 화면과 같은 DNA 축 데이터·추천 전략명을 재사용해
  // "이 실행안을 지금 이 역할로 볼 때 무엇을 먼저 봐야 하는가"를 한 문장으로 보여준다. 이전에는 실행안
  // 화면에 project.role이 아예 표시되지 않았다.
  const roleDecisionSummary = analysisResult
    ? buildRoleDecisionSummary({
        role: project.role,
        axisScores: DNA_AXES.map((axis) => ({
          axis,
          score: analysisResult[`${axis}Score` as const] as number | null,
        })),
        topStrategyName: selectedStrategy?.name ?? null,
        displayScores: Object.fromEntries(
          DNA_AXES.map((axis) => [axis, toDisplayDnaScore(analysisResult[`${axis}Score` as const] as number | null)]),
        ),
      })
    : null;

  // 선택 전략 근거 축약형(2026-08-13) — analysis 화면의 4단계 전체 블록을 복제하지 않고, coreProblem
  // (해석)·coreResource(추천 자원)만으로 "이 전략을 선택한 이유"를 한 줄로 재확인시킨다.
  // roleDecisionSummary(이 역할이 지금 우선 볼 것)와 책임이 겹치지 않는다.
  const shortRationale = selectedStrategy
    ? buildShortStrategyRationaleLine(selectedStrategy.coreProblem, selectedStrategy.coreResource)
    : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <p className="text-xs font-medium text-slate-500">{project.name}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">실행안</h1>
        <p className="mt-1 text-sm text-slate-600">
          {project.region.name} · {project.travelYear}년 {project.travelMonth}월 · {labelForRole(project.role)}
        </p>
        {roleDecisionSummary ? (
          <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800">
            {roleDecisionSummary}
          </p>
        ) : null}
        {selectedStrategy ? (
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700">
            <p className="text-sm font-semibold text-slate-900">
              선택 전략: {selectedStrategy.name} ({selectedStrategy.totalScore}점)
            </p>
            {shortRationale ? (
              <p className="mt-1 text-xs text-slate-600">선택 전략 근거: {shortRationale}</p>
            ) : null}
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-slate-600">전략 방향 상세 보기</summary>
              <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">해결하려는 문제</dt>
                <dd>{selectedStrategy.coreProblem ?? "재분석 필요"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">활용 자원</dt>
                <dd>{selectedStrategy.coreResource ?? "재분석 필요"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">체류 방식</dt>
                <dd>{selectedStrategy.stayStyle ?? "재분석 필요"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">기대 효과</dt>
                <dd>{selectedStrategy.expectedEffect ?? "재분석 필요"}</dd>
              </div>
              </dl>
            </details>
          </section>
        ) : null}
        {preLaunchValidation ? (
          <div className="mt-4">
            <PreLaunchValidationSection report={preLaunchValidation} kpis={planData.kpis} compact />
          </div>
        ) : null}
        <div className="mt-6">
          <PlanEditor
            plan={planData}
            poiFits={poiFitSummary?.fitsByPoiId}
            poiShortage={poiFitSummary?.shortage ?? null}
            candidatePois={candidatePois}
          />
        </div>
        <div className="mt-6">
          <PromoContentEditor
            projectId={id}
            initial={promoContentResult}
            projectSummary={{
              regionName: project.region.name,
              travelYear: project.travelYear,
              travelMonth: project.travelMonth,
              strategyName: selectedStrategy?.name ?? "선택 전략",
            }}
          />
        </div>
      </main>
    </>
  );
}
