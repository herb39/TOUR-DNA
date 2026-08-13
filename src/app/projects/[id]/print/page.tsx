import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProjectDetail } from "@/lib/services/projectQueries";
import {
  labelForBudgetLevel,
  labelForDuration,
  labelForGroupType,
  labelForRole,
  labelForTransport,
} from "@/lib/validation/codes";
import { formatBaseYm, formatDateTime, metricLabel, sourceLabel, summarizeEvidenceBaseYms, travelSourceLabel } from "@/lib/format";
import { buildTourismMetricCards } from "@/lib/domain/tourismMetricSummary";
import { METRIC_CODES } from "@/lib/domain/types";
import { PrintButton } from "@/components/plan/PrintButton";
import { describeCourseItemPurpose, type CourseDay } from "@/lib/domain/planBuilder";
import { parsePromoContent } from "@/lib/validation/promoContent.schema";
import { buildStrategyPoiFitSummary } from "@/lib/services/poiFitService";
import type { DurationCode } from "@/lib/domain/strategy";
import type { PoiFitResult } from "@/lib/domain/poiFit";
import { computeBusinessOpportunities } from "@/lib/domain/businessOpportunity";
import { DNA_AXES, type DataProvenance } from "@/lib/domain/types";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { fetchPoisByCategory } from "@/lib/services/fetchPoisByCategory";
import { resolveAnalysisBaseYmMismatchNote } from "@/lib/domain/regionSimilarity";
import { resolveRegionComparisonAnalysis } from "@/lib/services/resolveRegionComparisonAnalysis";
import { buildShortStrategyRationaleLine } from "@/lib/domain/strategyRationale";
import { buildRegionBenchmarkInsight } from "@/lib/domain/regionBenchmarkInsight";
import { computePreLaunchValidation } from "@/lib/domain/preLaunchValidation";
import { findRelatedKpiNames, type EnrichedKpi } from "@/lib/domain/kpiLinking";
import { AXIS_LABEL_KO } from "@/lib/domain/types";
import {
  buildStrategyBudgetItems,
  buildStrategyComparisonRows,
  buildStrategyPartners,
  describeMissingStrategyField,
  EXECUTION_DIFFICULTY_LABEL_KO,
  formatRoleFitRanking,
} from "@/lib/domain/strategyResourcePlan";

export const dynamic = "force-dynamic";

/** 하루 코스 중 실제 도로 기준(카카오, 캐시 포함) 구간과 추정치 구간 수를 요약한다(Phase 12,
 * 2026-08-05, PlanEditor.tsx의 summarizeDayTravelSources와 동일한 집계 기준). 인쇄 화면은 외부 API를
 * 다시 호출하지 않고 SelectedPlan에 이미 저장된 travelSource만 읽는다. */
function summarizePrintDayTravelSources(day: CourseDay): string {
  const edges = [...day.items.slice(1), ...(day.lodging ? [day.lodging] : [])];
  const real = edges.filter((e) => e.travelSource === "LIVE_API" || e.travelSource === "CACHED_API").length;
  const estimated = edges.length - real;
  return `실제 도로 기준 ${real}개 구간 · 직선거리 기반 추정 ${estimated}개 구간`;
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectDetail(id);
  if (!project) notFound();
  if (!project.selectedPlan || !project.analysisResult) {
    redirect(`/projects/${id}/analysis`);
  }

  const plan = project.selectedPlan;
  const analysisResult = project.analysisResult;
  const selectedStrategy = analysisResult.strategyResults.find((s) => s.id === plan.strategyResultId);
  const course = plan.course as unknown as { days: CourseDay[] };
  const evidenceSummary = analysisResult.evidences.slice(0, 6);
  // 분석 화면과 동일하게, env 상수가 아니라 이 프로젝트의 근거에 실제로 저장된 기준월을 표시한다
  // (2026-07-29) — 지표마다 기준월이 다를 수 있어 하나로 뭉개지 않는다.
  const baseYmSummary = summarizeEvidenceBaseYms(analysisResult.evidences);

  // 2026-07-29(2차 개선): 분석 화면과 동일한 함수로 핵심 관광 지표 요약카드를 구성한다(값·단위·포맷 일치).
  const findEvidence = (metricCode: string) =>
    analysisResult.evidences.find((e) => e.metricCode === metricCode) ?? null;
  const tourismMetricCards = buildTourismMetricCards({
    visitor: findEvidence(METRIC_CODES.VISITOR_CNT),
    growth: findEvidence(METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY),
    stay: findEvidence(METRIC_CODES.STAY),
    spend: findEvidence(METRIC_CODES.SPEND),
  });

  // 유사지역 비교 요약(2026-08-02) — 분석 화면과 같은 baseYm(이 분석의 evidence에 실제로 저장된
  // 기준월)로 다시 계산해, 분석·인쇄 화면이 같은 입력으로 계산되게 한다. 인쇄 화면은 지면 제약상
  // 지역명·상대 위치·강점·취약점 요약만 표시한다(최소 범위).
  const analysisOwnBaseYm = baseYmSummary.primary;

  // 공급 격차 판정용 POI 카테고리별 개수는 분석 화면과 마찬가지로 분석 시점 스냅샷을 우선 사용해,
  // 같은 분석 결과라면 분석 화면과 인쇄 화면이 항상 같은 입력으로 계산되게 한다(재현성 보완,
  // 2026-08-02). 스냅샷이 없는 레거시 분석 결과만 예외적으로 현재 DB를 조회한다.
  const storedPoiCategorySummary = analysisResult.poiCategorySummary as Partial<
    Record<PoiCategoryCode, number>
  > | null;

  const poiIdsForFit =
    selectedStrategy && project.input
      ? course.days.flatMap((d) => [...d.items.map((i) => i.poiId), ...(d.lodging ? [d.lodging.poiId] : [])])
      : null;

  // 2026-08-13(로딩 성능 개선): 유사지역 비교 재계산, (레거시 분석만 발생하는) 카테고리별 POI
  // 재조회, 실행안과 동일한 POI 적합도 계산은 서로 완전히 독립적인데 이전에는 순차 await로 걸려
  // 있었다 — Promise.all로 병렬화한다(각 계산 로직·산식 자체는 바꾸지 않음).
  const [
    { analysis: regionComparisonAnalysis },
    poiCategoryFallback,
    poiFitSummaryResult,
  ] = await Promise.all([
    resolveRegionComparisonAnalysis({
      regionCode: project.region.code,
      regionName: project.region.name,
      snapshot: analysisResult.regionComparisonSnapshot,
      analysisOwnBaseYm,
    }),
    storedPoiCategorySummary === null && project.input
      ? fetchPoisByCategory(project.region.code)
      : Promise.resolve(null),
    poiIdsForFit && selectedStrategy && project.input
      ? buildStrategyPoiFitSummary({
          templateId: selectedStrategy.templateId,
          regionCode: project.region.code,
          poiIds: poiIdsForFit,
          travelMonth: project.travelMonth,
          preferredThemes: project.input.preferredThemes as string[],
          duration: project.input.duration as DurationCode,
        }).catch(() => null) // 적합도 표시는 부가 정보라 계산 실패해도 인쇄 화면 자체는 그대로 보여준다.
      : Promise.resolve(null),
  ]);

  // 분석 화면과 동일한 함수로 기준월 불일치 안내를 만든다(분석·인쇄 화면 안내 일치, 2026-08-02).
  const analysisBaseYmMismatchNote = resolveAnalysisBaseYmMismatchNote(
    analysisOwnBaseYm,
    regionComparisonAnalysis.comparisonBaseYm,
  );

  // 관광사업 기회 3안 요약(2026-08-02) — 분석 화면과 같은 순수 함수를 그대로 재사용한다(저장하지
  // 않고 인쇄 시점에 다시 계산). 인쇄 화면은 지면 제약상 제목·문제·방향만 요약해서 보여준다(최소 범위).
  const poiCountByCategory =
    storedPoiCategorySummary ??
    (project.input
      ? (Object.fromEntries(
          Object.entries(poiCategoryFallback ?? {}).map(([category, pois]) => [
            category,
            pois?.length ?? 0,
          ]),
        ) as Partial<Record<PoiCategoryCode, number>>)
      : {});
  const opportunityAnalysis = project.input
    ? computeBusinessOpportunities({
        regionName: project.region.name,
        axisScores: DNA_AXES.map((axis) => ({
          axis,
          score: analysisResult[`${axis}Score` as const] as number | null,
          status: analysisResult[`${axis}Status` as const] as "LIVE" | "SNAPSHOT" | "MISSING",
        })),
        role: project.role,
        travelMonth: project.travelMonth,
        preferredThemes: (project.input.preferredThemes as string[] | undefined) ?? [],
        poiCountByCategory,
      })
    : null;
  // 유사지역 벤치마킹 인사이트(2026-08-13, 핵심 1~2개만) — analysis 화면과 같은 함수를 재사용해, 이미
  // 계산된 유사지역 비교(regionComparisonAnalysis)만으로 만든다(새 계산 없음).
  const regionBenchmarkAnalysis = regionComparisonAnalysis
    ? buildRegionBenchmarkInsight({
        targetAxisScores: DNA_AXES.map((axis) => ({
          axis,
          score: analysisResult[`${axis}Score` as const] as number | null,
        })),
        comparisons: regionComparisonAnalysis.comparisons,
        role: project.role,
      })
    : null;

  // 저장된 promoContent가 없으면(DB NULL) 섹션 자체를 만들지 않는다. 값이 있어도 Phase 5-B와 동일한
  // 검증 경계(parsePromoContent)를 통과하지 못하면 잘못된 데이터를 그대로 출력하지 않고 조용히 생략한다.
  const promoContentParsed = plan.promoContent !== null ? parsePromoContent(plan.promoContent) : null;
  const promoContent = promoContentParsed?.ok ? promoContentParsed.value : null;

  // 2026-07-30(P0-1): 실행안 화면과 동일한 근거로 POI 적합도·후보 부족 안내를 계산한다(저장하지 않고
  // 렌더링 시점에 매번 계산 — 전략 점수·선택 로직은 건드리지 않는다).
  const poiFits: Record<string, PoiFitResult> | undefined = poiFitSummaryResult?.fitsByPoiId;
  const poiShortage: Awaited<ReturnType<typeof buildStrategyPoiFitSummary>>["shortage"] =
    poiFitSummaryResult?.shortage ?? null;
  const poiShortageMessage: string | null = poiFitSummaryResult?.shortage
    ? `${poiFitSummaryResult.shortage.message} ${poiFitSummaryResult.shortage.suggestion}`
    : null;

  // 사업 사전검증 리포트(2026-08-03) — 분석 화면에서 이미 계산한 DNA·유사지역 비교와 위에서 계산한
  // POI 공급·이동 경고를 조합한다(새 지표 없음). 실행안 화면과 완전히 동일한 규칙 함수를 재사용해
  // 분석·인쇄·실행안 세 화면이 같은 입력이면 같은 결론을 내도록 한다.
  const preLaunchValidation =
    project.input && regionComparisonAnalysis
      ? computePreLaunchValidation({
          axisScores: DNA_AXES.map((axis) => ({
            axis,
            score: analysisResult[`${axis}Score` as const] as number | null,
            evidenceProvenances: analysisResult.evidences
              .filter((e) => e.axis === axis)
              .map((e) => e.provenance as DataProvenance | null),
          })),
          poiShortage,
          travelNoticeCount: course.days.reduce((sum, d) => sum + (d.notices?.length ?? 0), 0),
          totalCourseDays: course.days.length,
          regionComparisonCount: regionComparisonAnalysis.comparisons.length,
          regionUniqueStrengthNote: regionComparisonAnalysis.uniqueStrengthNote,
          riskMitigations: plan.risks as { risk: string; mitigation: string }[],
        })
      : null;

  // KPI 연결 보강(2026-08-03) — planService.ts(ensureSelectedPlan)가 실행안 최초 생성 시점에 이미
  // 계산해 저장한 값을 그대로 읽는다(다시 계산하지 않음 — 실행안·인쇄 화면이 항상 같은 값을 본다).
  const enrichedKpis = plan.kpis as unknown as EnrichedKpi[];
  const dataReliabilityRelatedKpis = preLaunchValidation
    ? findRelatedKpiNames(enrichedKpis, preLaunchValidation.dataReliabilityFlaggedAxes)
    : [];
  const weakAxisRelatedKpis = preLaunchValidation?.weakestAxis
    ? findRelatedKpiNames(enrichedKpis, [preLaunchValidation.weakestAxis])
    : [];

  // 선택 전략 예산 항목·협력 대상(2026-08-04) — 분석 화면과 동일한 순수 함수를 그대로 재사용한다
  // (저장하지 않고 인쇄 시점에 다시 계산, 값은 항상 같다).
  const selectedStrategyBudgetItems = selectedStrategy
    ? buildStrategyBudgetItems(selectedStrategy.templateId, project.role)
    : [];
  const selectedStrategyPartners = selectedStrategy
    ? buildStrategyPartners(selectedStrategy.templateId, project.role)
    : [];
  // 선택 전략 근거 축약형(2026-08-13) — plan 화면과 동일한 문장(coreProblem·coreResource 재사용)을
  // 인쇄 결과에도 실어 지역 진단→추천 이유→전략→실행안 흐름이 인쇄물에서도 끊기지 않게 한다.
  const selectedStrategyShortRationale = selectedStrategy
    ? buildShortStrategyRationaleLine(selectedStrategy.coreProblem, selectedStrategy.coreResource)
    : null;

  // 전략 3안 비교(A4 압축형, 2026-08-04) — 분석 화면(analysis/page.tsx)과 완전히 동일한
  // buildStrategyComparisonRows()를 그대로 재사용해, 레거시 판정("이전 분석 결과" 안내)까지
  // 두 화면이 항상 일치하게 한다.
  const strategyComparisonRows = buildStrategyComparisonRows(
    analysisResult.strategyResults.map((s) => ({
      id: s.id,
      rank: s.rank,
      name: s.name,
      totalScore: s.totalScore,
      templateId: s.templateId,
      coreProblem: s.coreProblem,
      coreResource: s.coreResource,
      stayStyle: s.stayStyle,
      executionDifficulty: s.executionDifficulty as "LOW" | "MEDIUM" | "HIGH" | null,
      expectedEffect: s.expectedEffect,
      risks: s.risks as string[],
    })),
  );

  return (
    <div className="mx-auto max-w-[840px] px-8 py-8 text-slate-900">
      <div className="no-print mb-4">
        <Link href={`/projects/${id}/plan`} className="text-sm text-slate-600 underline hover:text-slate-900">
          ← 실행안으로 돌아가기
        </Link>
      </div>
      <PrintButton />

      <header className="border-b border-slate-300 pb-4">
        <p className="text-xs text-slate-500">TOUR DNA · {project.region.name}</p>
        <h1 className="mt-1 text-xl font-bold">{plan.productName}</h1>
        <p className="mt-1 text-sm text-slate-600">{plan.conceptText}</p>
        <p className="mt-2 text-xs text-slate-500">
          {project.travelYear}년 {project.travelMonth}월 · {labelForRole(project.role)} ·{" "}
          {labelForDuration(project.input?.duration ?? "")} ·{" "}
          {labelForBudgetLevel(project.input?.budgetLevel ?? "")} ·{" "}
          {labelForTransport(project.input?.transport ?? "")} · {labelForGroupType(project.input?.groupType ?? "")}
        </p>
      </header>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">기획 배경</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-700">{plan.background}</p>
      </section>

      {tourismMetricCards.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">핵심 관광 지표</h2>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tourismMetricCards.map((card) => (
              <div key={card.key} className="rounded border border-slate-200 p-2">
                <p className="text-[10px] text-slate-500">{card.label}</p>
                <p className="text-sm font-semibold text-slate-900">{card.valueText}</p>
                <p className="text-[9px] text-slate-400">{card.metaText}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {regionComparisonAnalysis && regionComparisonAnalysis.comparisons.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">
            유사지역 비교(요약){" "}
            <span className="text-[10px] font-normal text-slate-400">
              (현재 지원 지역 데이터 기준, 기준월 {regionComparisonAnalysis.comparisonBaseYm})
            </span>
          </h2>
          {analysisBaseYmMismatchNote ? (
            <p className="mt-1 text-[10px] text-amber-700">{analysisBaseYmMismatchNote}</p>
          ) : null}
          {regionComparisonAnalysis.baseYmNote ? (
            <p className="mt-1 text-[10px] text-amber-700">{regionComparisonAnalysis.baseYmNote}</p>
          ) : null}
          <ul className="mt-1 space-y-1.5">
            {regionComparisonAnalysis.comparisons.map((c) => (
              <li key={c.regionCode} className="rounded border border-slate-200 p-2 text-xs">
                <p className="font-semibold text-slate-900">{c.regionName}</p>
                <p className="mt-0.5 text-slate-600">{c.relativePosition}</p>
                <p className="mt-0.5 text-slate-500">{c.strengthWeaknessSummary}</p>
              </li>
            ))}
          </ul>
          {regionBenchmarkAnalysis && regionBenchmarkAnalysis.insights.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-slate-900">벤치마킹 포인트</p>
              <ul className="mt-1 space-y-1">
                {regionBenchmarkAnalysis.insights.map((insight) => (
                  <li key={`${insight.benchmarkRegionName}-${insight.targetAxis}`} className="text-[11px] text-slate-600">
                    <span className="font-medium text-slate-900">
                      {insight.benchmarkRegionName} — {insight.targetAxisLabel} 구조 참고:{" "}
                    </span>
                    {insight.whatIsBetter} {insight.whatToReference}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {opportunityAnalysis && opportunityAnalysis.items.length > 0 ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">
            관광사업 기회 3안(요약)
          </h2>
          <ul className="mt-1 space-y-1.5">
            {opportunityAnalysis.items.map((o) => (
              <li key={o.category} className="rounded border border-slate-200 p-2 text-xs">
                <p className="font-semibold text-slate-900">{o.title}</p>
                <p className="mt-0.5 text-slate-600">{o.problem}</p>
                <p className="mt-0.5 text-slate-500">사업 방향: {o.direction}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {preLaunchValidation ? (
        <section className="mt-4 border-t border-slate-300 pt-3">
          <h2 className="text-sm font-semibold">
            사업 사전검증 리포트
          </h2>
          <p className="mt-1 text-xs font-bold text-slate-900">
            추진 권고: {preLaunchValidation.recommendationLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">{preLaunchValidation.reason}</p>
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
            <li>데이터 신뢰도 — {preLaunchValidation.dataReliability.detail}</li>
            <li>POI 공급 충분성 — {preLaunchValidation.poiSupplySufficiency.detail}</li>
            <li>이동 현실성 — {preLaunchValidation.travelFeasibility.detail}</li>
            <li>지역 차별성 — {preLaunchValidation.regionalDifferentiation.detail}</li>
          </ul>
          {preLaunchValidation.requiredImprovements.length > 0 ? (
            <div className="mt-1.5">
              <p className="text-[11px] font-semibold text-slate-700">필수 보완사항</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
                {preLaunchValidation.requiredImprovements.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {dataReliabilityRelatedKpis.length > 0 ? (
            <p className="mt-1 text-[10px] text-slate-500">
              <span className="font-medium text-slate-600">데이터 신뢰도 보완 KPI: </span>
              {dataReliabilityRelatedKpis.join(", ")}
            </p>
          ) : null}
          {weakAxisRelatedKpis.length > 0 ? (
            <p className="mt-0.5 text-[10px] text-slate-500">
              <span className="font-medium text-slate-600">
                취약 축({AXIS_LABEL_KO[preLaunchValidation.weakestAxis!]}) 연결 KPI:{" "}
              </span>
              {weakAxisRelatedKpis.join(", ")}
            </p>
          ) : null}
          <p className="mt-1.5 text-[10px] text-slate-400">{preLaunchValidation.criteria}</p>
        </section>
      ) : null}

      {strategyComparisonRows.length > 0 ? (
        <section className="mt-4 border-t border-slate-300 pt-3">
          <h2 className="text-sm font-semibold">
            전략 3안 비교
          </h2>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {strategyComparisonRows.map((row) => (
              <div
                key={row.id}
                className={`rounded border p-1.5 text-[9px] leading-tight text-slate-700 ${
                  row.id === plan.strategyResultId ? "border-slate-900" : "border-slate-200"
                }`}
              >
                <p className="text-[10px] font-semibold text-slate-900">
                  {row.rank}순위 · {row.name} ({row.totalScore}점)
                  {row.id === plan.strategyResultId ? (
                    <span className="ml-1 rounded bg-slate-900 px-1 py-0.5 text-[8px] font-medium text-white">
                      선택됨
                    </span>
                  ) : null}
                </p>
                <p className="mt-1">
                  <span className="font-medium text-slate-500">해결 문제 </span>
                  {row.coreProblem ?? describeMissingStrategyField(row.dataAvailability)}
                </p>
                <p className="mt-0.5">
                  <span className="font-medium text-slate-500">활용 자원 </span>
                  {row.coreResource ?? describeMissingStrategyField(row.dataAvailability)}
                </p>
                <p className="mt-0.5">
                  <span className="font-medium text-slate-500">체류 방식 </span>
                  {row.stayStyle ?? describeMissingStrategyField(row.dataAvailability)}
                </p>
                <p className="mt-0.5">
                  <span className="font-medium text-slate-500">실행 난이도 </span>
                  {row.executionDifficulty
                    ? EXECUTION_DIFFICULTY_LABEL_KO[row.executionDifficulty]
                    : describeMissingStrategyField(row.dataAvailability)}
                </p>
                <p className="mt-0.5">
                  <span className="font-medium text-slate-500">기대 효과 </span>
                  {row.expectedEffect ?? describeMissingStrategyField(row.dataAvailability)}
                </p>
                <p className="mt-0.5">
                  <span className="font-medium text-slate-500">주요 위험 </span>
                  {row.risks.join(" · ")}
                </p>
                <p className="mt-0.5">
                  <span className="font-medium text-slate-500">적합 역할 </span>
                  {formatRoleFitRanking(row.roleFitRanking)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {selectedStrategy ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold">
            선택 전략: {selectedStrategy.name} ({selectedStrategy.totalScore}점)
          </h2>
          {selectedStrategyShortRationale ? (
            <p className="mt-1 text-xs text-slate-600">선택 전략 근거: {selectedStrategyShortRationale}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-600">타깃: {plan.targetSummary}</p>
          {(() => {
            const breakdown = selectedStrategy.scoreBreakdown as unknown as {
              roleFit?: number;
              roleFitReason?: string;
            } | null | undefined;
            if (
              typeof breakdown?.roleFit !== "number" ||
              !Number.isFinite(breakdown.roleFit)
            ) {
              return <p className="mt-1 text-xs text-amber-700">역할 적합도: 재분석 필요</p>;
            }
            return (
              <p className="mt-1 text-xs text-slate-600">
                역할 적합도 {breakdown.roleFit}점{breakdown.roleFitReason ? ` — ${breakdown.roleFitReason}` : ""}
              </p>
            );
          })()}

          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-700">
                예상 예산 항목
              </h3>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                {selectedStrategyBudgetItems.map((item) => (
                  <li key={item.category}>
                    <span className="font-medium text-slate-700">{item.category}</span> — {item.description} (
                    {item.amount})
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700">협력 대상</h3>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                {selectedStrategyPartners.map((partner) => (
                  <li key={partner.category}>
                    <span className="font-medium text-slate-700">{partner.category}</span> — {partner.name}(
                    {partner.reason})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-4">
        <h2 className="text-sm font-semibold">코스</h2>
        {poiShortageMessage ? (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">⚠ {poiShortageMessage}</p>
        ) : null}
        <div className="mt-1 grid grid-cols-2 gap-4">
          {course.days.map((day) => (
            <div key={day.dayIndex}>
              <p className="text-xs font-semibold text-slate-600">{day.dayIndex}일차</p>
              {project.input?.transport === "PRIVATE_VEHICLE" ? (
                <p className="text-[10px] text-slate-400">{summarizePrintDayTravelSources(day)}</p>
              ) : null}
              <ol className="mt-1 space-y-1 text-xs text-slate-700">
                {day.items.map((item, i) => {
                  const fit = poiFits?.[item.poiId];
                  return (
                    <li key={i}>
                      {item.timeSlot} {item.poiName} ({describeCourseItemPurpose(item)}, {item.stayMinutes}분, {item.travel})
                      {i > 0 && project.input?.transport === "PRIVATE_VEHICLE" ? (
                        <span className="text-slate-400"> · {travelSourceLabel(item.travelSource)}</span>
                      ) : null}
                      {fit ? <span className="text-slate-400"> · 적합도 {fit.totalScore}점</span> : null}
                    </li>
                  );
                })}
              </ol>
              {day.lodging != null ? (
                <p className="mt-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                  <span className="font-semibold">[숙박]</span> {day.lodging.timeSlot} {day.lodging.poiName} (
                  {day.lodging.category}, {day.lodging.travel})
                  {project.input?.transport === "PRIVATE_VEHICLE" ? (
                    <span className="text-slate-400"> · {travelSourceLabel(day.lodging.travelSource)}</span>
                  ) : null}
                </p>
              ) : null}
              {day.notices?.map((notice, i) => (
                <p key={i} className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                  ⚠ {notice}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold">운영 체크리스트</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
            {(plan.operationChecklist as string[]).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">위험과 대응안</h2>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
            {(plan.risks as { risk: string; mitigation: string }[]).map((r, i) => (
              <li key={i}>
                {r.risk} — {r.mitigation}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">KPI</h2>
        <ul className="mt-1 space-y-1 text-xs text-slate-700">
          {enrichedKpis.map((k, i) => (
            <li key={i}>
              <p>
                {k.name} — {k.method}
              </p>
              {k.purpose ? (
                <p className="text-[10px] text-slate-500">
                  목적: {k.purpose} · 연결 축: {k.linkedAxis ? AXIS_LABEL_KO[k.linkedAxis] : "해당 없음"} · 연결 목표:{" "}
                  {k.linkedGoalLabel ?? "미설정"} · 권장 시점: {k.recommendedTiming}
                  <br />
                  목표값 근거: {k.targetBasis}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">데이터 근거 요약</h2>
        <table className="mt-1 w-full text-left text-[10px] text-slate-600">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-1 pr-2">지표</th>
              <th className="py-1 pr-2">값</th>
              <th className="py-1 pr-2">기준월</th>
              <th className="py-1 pr-2">출처</th>
            </tr>
          </thead>
          <tbody>
            {evidenceSummary.map((e, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-0.5 pr-2">{metricLabel(e.metricCode)}</td>
                <td className="py-0.5 pr-2">{e.rawValue}</td>
                <td className="py-0.5 pr-2">{formatBaseYm(e.baseYm)}</td>
                <td className="py-0.5 pr-2">{sourceLabel(e.sourceCode)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {promoContent ? (
        <section className="mt-4 border-t border-slate-300 pt-3">
          <h2 className="text-sm font-semibold">홍보자료</h2>
          {promoContent.translationNotice ? (
            <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              ⚠ {promoContent.translationNotice}
            </p>
          ) : null}

          <div className="mt-2">
            <h3 className="text-xs font-semibold text-slate-700">제안서 요약</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-700">
              {promoContent.proposalSummary.sentences.map((sentence, i) => (
                <li key={i}>{sentence}</li>
              ))}
            </ol>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-700">랜딩페이지</h3>
              <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.landing.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{promoContent.landing.body}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-700">블로그</h3>
              <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.blog.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{promoContent.blog.body}</p>
            </div>
          </div>

          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-700">Instagram</h3>
            <p className="mt-1 text-xs text-slate-700">{promoContent.instagram.caption}</p>
            {promoContent.instagram.hashtags.length > 0 ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {promoContent.instagram.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            ) : null}
          </div>

          <div className="mt-3">
            <h3 className="text-xs font-semibold text-slate-700">카드뉴스 구성안</h3>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {promoContent.cardNews.slides.map((slide, i) => (
                <div key={i} className="rounded border border-slate-200 p-1.5">
                  <p className="text-[10px] font-semibold text-slate-800">{slide.title}</p>
                  <p className="text-[10px] text-slate-600">{slide.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3">
            {promoContent.roleContent.role === "TRAVEL_AGENCY" ? (
              <>
                <h3 className="text-xs font-semibold text-slate-700">여행상품 홍보자료</h3>
                <p className="mt-1 text-xs text-slate-700">
                  <span className="font-medium">{promoContent.roleContent.productName}</span> ·{" "}
                  {promoContent.roleContent.targetAudience}
                </p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                  {promoContent.roleContent.sellingPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
                <p className="mt-0.5 text-xs text-slate-700">{promoContent.roleContent.itineraryHighlight}</p>
              </>
            ) : promoContent.roleContent.role === "FESTIVAL_PLANNER" ? (
              <>
                <h3 className="text-xs font-semibold text-slate-700">프로그램 운영 자료</h3>
                <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.roleContent.title}</p>
                <p className="mt-0.5 text-xs text-slate-700">콘텐츠 구성: {promoContent.roleContent.programHighlight}</p>
                {promoContent.roleContent.timeSlotPlan.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.timeSlotPlan.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-0.5 text-xs text-slate-700">체류 유도: {promoContent.roleContent.retentionTip}</p>
                {promoContent.roleContent.operationChecklist.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.operationChecklist.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                {promoContent.roleContent.risks.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold text-slate-700">보도자료</h3>
                <p className="mt-1 text-xs font-medium text-slate-800">{promoContent.roleContent.title}</p>
                <p className="mt-0.5 text-xs text-slate-700">{promoContent.roleContent.lead}</p>
                <p className="mt-0.5 text-xs text-slate-700">추진 배경: {promoContent.roleContent.background}</p>
                <p className="mt-0.5 text-xs text-slate-700">핵심 프로그램: {promoContent.roleContent.coreProgram}</p>
                {promoContent.roleContent.dataBasedEvidence.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.dataBasedEvidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
                {promoContent.roleContent.expectedEffects.length > 0 ? (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                    {promoContent.roleContent.expectedEffects.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      <footer className="mt-6 border-t border-slate-300 pt-2 text-[10px] text-slate-400">
        <span>
          생성일 {formatDateTime(new Date())} · 분석 기준월{" "}
          {baseYmSummary.primary ? formatBaseYm(baseYmSummary.primary) : "확인 불가"}
          {baseYmSummary.mixed ? `(지표별 기준월 상이: ${baseYmSummary.all.map(formatBaseYm).join(", ")})` : ""}
        </span>
      </footer>
    </div>
  );
}
