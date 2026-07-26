import { prisma } from "@/lib/db";
import {
  buildDraftCourse,
  buildKpis,
  buildOperationChecklist,
  buildRisks,
  type AudiencePlanContext,
  type PoiDetail,
  type TransportCode,
} from "@/lib/domain/planBuilder";
import {
  MEAL_RESERVE_TARGET_BY_DURATION,
  NON_LODGING_POI_TARGET_BY_DURATION,
  type DurationCode,
} from "@/lib/domain/strategy";
import { fetchAdditionalGeneralPois, fetchAdditionalMealEligibleFood, fetchPoiDetailsInOrder } from "./poiDetails";

function countMealEligibleFood(pois: PoiDetail[]): number {
  return pois.filter((p) => p.category === "FOOD" && p.mealEligible !== false).length;
}

function countNonLodging(pois: PoiDetail[]): number {
  return pois.filter((p) => p.category !== "LODGING").length;
}

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

  const duration = project.input.duration as DurationCode;
  let pois = await fetchPoiDetailsInOrder(strategy.poiIds as string[]);

  // strategy.poiIds는 전략 계산 시점(computeStrategies/selectPois)에 고정된 값이다 — selectPois가
  // 식사 가능 FOOD를 우선 선점하지만(strategy.ts), 그 이전에 이미 생성돼 저장된 StrategyResult처럼
  // 이 보정 전에 고정된 후보는 여전히 식사 가능 FOOD가 부족할 수 있다. 실행안을 실제로 만드는 이
  // 시점에 다시 확인해, 부족하면 같은 지역 DB에서 직접 보충한다(삭제·중복 없이 추가만 한다).
  const mealReserveTarget = MEAL_RESERVE_TARGET_BY_DURATION[duration];
  const mealEligibleCount = countMealEligibleFood(pois);
  if (mealEligibleCount < mealReserveTarget) {
    const supplement = await fetchAdditionalMealEligibleFood(
      project.regionId,
      pois.map((p) => p.id),
      mealReserveTarget - mealEligibleCount,
    );
    if (supplement.length > 0) pois = [...pois, ...supplement];
  }

  // 식사 선점(mealReserveTarget)은 이 기간의 원래 비숙박 목표 밀도(NON_LODGING_POI_TARGET_BY_DURATION)
  // 예산 안에서 이뤄지므로, 그만큼 일반 관광 후보가 줄어든다 — 2026-07-26 강릉 사례: 하루 목표 4개 중
  // 2개가 식사로 쓰여 실제 관광 시간을 채울 후보가 2개뿐이었고, 그 결과 FOOD가 연속으로 붙거나 오후에
  // 큰 공백이 생겼다. 원래 목표 밀도 + 식사 선점 목표만큼을 비숙박 POI 총량의 기준으로 삼아 부족하면
  // 같은 지역의 일반 방문 후보(FOOD 아님)로 보충한다.
  const desiredNonLodgingCount = NON_LODGING_POI_TARGET_BY_DURATION[duration] + mealReserveTarget;
  const nonLodgingCount = countNonLodging(pois);
  if (nonLodgingCount < desiredNonLodgingCount) {
    const generalSupplement = await fetchAdditionalGeneralPois(
      project.regionId,
      pois.map((p) => p.id),
      desiredNonLodgingCount - nonLodgingCount,
    );
    if (generalSupplement.length > 0) pois = [...pois, ...generalSupplement];
  }

  const course = buildDraftCourse(pois, duration, project.input.transport as TransportCode);
  const audienceContext: AudiencePlanContext = {
    role: project.role,
    nationality: project.input.nationality,
    travelMonth: project.travelMonth,
    preferredThemes: project.input.preferredThemes,
  };
  const operationChecklist = buildOperationChecklist(strategy.templateId, audienceContext);
  const kpis = buildKpis(strategy.templateId);
  const risks = buildRisks(strategy.templateId, audienceContext);

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
