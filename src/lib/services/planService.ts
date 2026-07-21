import { prisma } from "@/lib/db";
import {
  buildDraftCourse,
  buildKpis,
  buildOperationChecklist,
  buildRisks,
  type TransportCode,
} from "@/lib/domain/planBuilder";
import type { DurationCode } from "@/lib/domain/strategy";
import { fetchPoiDetailsInOrder } from "./poiDetails";

/**
 * 선택된 전략 기준으로 실행안을 준비한다. 실행안이 없으면 새로 만들고, 이미 있지만 선택된 전략이
 * 바뀌었다면(전략 재선택) 새 전략 기준으로 다시 생성한다. 동일 전략이면 사용자가 편집한 내용을 그대로 둔다.
 */
export async function ensureSelectedPlan(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { selectedPlan: true, input: true, region: true },
  });

  if (!project.selectedStrategyResultId) {
    throw new Error("전략을 먼저 선택해주세요.");
  }
  if (!project.input) {
    throw new Error("입력 조건을 찾을 수 없습니다.");
  }
  if (project.selectedPlan && project.selectedPlan.strategyResultId === project.selectedStrategyResultId) {
    return project.selectedPlan;
  }

  const strategy = await prisma.strategyResult.findUniqueOrThrow({
    where: { id: project.selectedStrategyResultId },
  });

  const pois = await fetchPoiDetailsInOrder(strategy.poiIds as string[]);
  const course = buildDraftCourse(pois, project.input.duration as DurationCode, project.input.transport as TransportCode);
  const operationChecklist = buildOperationChecklist(strategy.templateId);
  const kpis = buildKpis(strategy.templateId);
  const risks = buildRisks(strategy.templateId);

  const data = {
    strategyResultId: strategy.id,
    productName: `${project.region.name} ${strategy.name} 코스`,
    conceptText: strategy.concept,
    background: `${project.region.name} 지역 관광 DNA 분석 결과를 바탕으로 ${strategy.name} 전략(적합도 ${strategy.totalScore}점)을 선택해 구성한 코스입니다.`,
    targetSummary: strategy.targetDescription,
    sellingPoints: (strategy.reasons as string[]).slice(0, 3),
    course: JSON.parse(JSON.stringify({ days: course })),
    operationChecklist,
    risks,
    kpis,
    memo: "",
    kpiMemo: "",
  };

  return prisma.selectedPlan.upsert({
    where: { projectId },
    update: data,
    create: { projectId, ...data },
  });
}
