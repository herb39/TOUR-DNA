import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getProjectDetail } from "@/lib/services/projectQueries";
import { ensureSelectedPlan } from "@/lib/services/planService";
import { PlanEditor, type PlanEditorData } from "@/components/plan/PlanEditor";

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

  const planData: PlanEditorData = {
    id: planRow.id,
    projectId: id,
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

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <p className="text-xs font-medium text-slate-500">{project.name}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">실행안</h1>
        <p className="mt-1 text-sm text-slate-600">
          {project.region.name} · {project.travelYear}년 {project.travelMonth}월
        </p>
        <div className="mt-6">
          <PlanEditor plan={planData} />
        </div>
      </main>
    </>
  );
}
