import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getProjectDetail } from "@/lib/services/projectQueries";
import { ensureSelectedPlan } from "@/lib/services/planService";
import { getPromoContentForProject } from "@/lib/services/promoContentService";
import { buildStrategyPoiFitSummary } from "@/lib/services/poiFitService";
import type { DurationCode } from "@/lib/domain/strategy";
import { PlanEditor, type PlanEditorData } from "@/components/plan/PlanEditor";
import { PromoContentEditor } from "@/components/plan/PromoContentEditor";

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
  const planRow = await ensureSelectedPlan(id);
  const promoContentResult = await getPromoContentForProject(id);

  const planData: PlanEditorData = {
    id: planRow.id,
    projectId: id,
    regionId: project.regionId,
    transport: project.input?.transport as PlanEditorData["transport"],
    kakaoKey: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY,
    productName: planRow.productName,
    conceptText: planRow.conceptText,
    background: planRow.background,
    targetSummary: planRow.targetSummary,
    sellingPoints: planRow.sellingPoints as string[],
    course: planRow.course as unknown as PlanEditorData["course"],
    operationChecklist: planRow.operationChecklist as string[],
    risks: planRow.risks as PlanEditorData["risks"],
    kpis: planRow.kpis as PlanEditorData["kpis"],
    memo: planRow.memo ?? "",
    kpiMemo: planRow.kpiMemo ?? "",
  };

  // 2026-07-30(P0-1): 전략별 POI 적합도·후보 부족 안내를 이 코스에 담긴 poiId 기준으로 매번 새로
  // 계산한다(저장하지 않음) — 사용자가 장소를 추가·삭제해도 다음 렌더링에서 항상 최신 상태로 반영되고,
  // 선택 로직(selectPois)이나 전략 점수·순위는 전혀 건드리지 않는다.
  const selectedStrategy = project.analysisResult?.strategyResults.find((s) => s.id === planRow.strategyResultId);
  const templateId = selectedStrategy?.templateId;
  let poiFitSummary: Awaited<ReturnType<typeof buildStrategyPoiFitSummary>> | null = null;
  if (templateId && project.input) {
    const poiIds = planData.course.days.flatMap((d) => [
      ...d.items.map((i) => i.poiId),
      ...(d.lodging ? [d.lodging.poiId] : []),
    ]);
    try {
      poiFitSummary = await buildStrategyPoiFitSummary({
        templateId,
        regionCode: project.region.code,
        poiIds,
        travelMonth: project.travelMonth,
        preferredThemes: project.input.preferredThemes as string[],
        duration: project.input.duration as DurationCode,
      });
    } catch {
      // 적합도 표시는 부가 정보라 계산에 실패해도 실행안 화면 자체는 그대로 보여준다.
      poiFitSummary = null;
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <p className="text-xs font-medium text-slate-500">{project.name}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">실행안</h1>
        <p className="mt-1 text-sm text-slate-600">
          {project.region.name} · {project.travelYear}년 {project.travelMonth}월
        </p>
        {selectedStrategy ? (
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700">
            <p className="text-sm font-semibold text-slate-900">
              선택 전략: {selectedStrategy.name} ({selectedStrategy.totalScore}점)
            </p>
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
          </section>
        ) : null}
        <div className="mt-6">
          <PlanEditor
            plan={planData}
            poiFits={poiFitSummary?.fitsByPoiId}
            poiShortage={poiFitSummary?.shortage ?? null}
          />
        </div>
        <div className="mt-6">
          <PromoContentEditor projectId={id} initial={promoContentResult} />
        </div>
      </main>
    </>
  );
}
