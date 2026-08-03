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
import { getTemplateById, type PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { filterRecommendablePois, isRequiredSlotCategory, type PoiFitContext } from "@/lib/domain/poiFit";
import { enrichKpis, type AxisScoreLike } from "@/lib/domain/kpiLinking";
import { DNA_AXES, type AxisStatus } from "@/lib/domain/types";
import { labelForPrimaryGoal } from "@/lib/validation/codes";
import { fetchAdditionalGeneralPois, fetchAdditionalMealEligibleFood, fetchPoiDetailsInOrder } from "./poiDetails";

function countMealEligibleFood(pois: PoiDetail[]): number {
  return pois.filter((p) => p.category === "FOOD" && p.mealEligible !== false).length;
}

function countNonLodging(pois: PoiDetail[]): number {
  return pois.filter((p) => p.category !== "LODGING").length;
}

/**
 * 최소 적합 기준(poiFit.ts)에 미달한 일반 관광 POI를 코스 생성 전에 실제로 제외한다(2026-07-30,
 * 저적합 POI 추천 제외 보완). 여기서 제외하면 SelectedPlan.course 자체가 걸러진 결과를 담게 되어,
 * 실행안·인쇄 화면이 같은 DB 값을 읽는 한 항상 같은 POI 목록·점수를 보게 된다(화면 렌더링 시점에
 * 따로 필터링을 반복하지 않아도 됨). FOOD/LODGING(필수 슬롯)은 이 필터링 대상에서 제외한다 — 테마
 * 키워드가 이름에 없다는 이유만으로 식사·숙박 자리가 사라지면 안 되기 때문이다. 선택 로직(selectPois)
 * 자체나 전략 점수는 건드리지 않고, 이미 확정된 후보 목록을 다시 한 번 걸러낼 뿐이다.
 */
function excludeBelowMinimumFitPois(
  pois: PoiDetail[],
  templateId: string,
  travelMonth: number,
  preferredThemes: string[],
): PoiDetail[] {
  const template = getTemplateById(templateId);
  const context: PoiFitContext = { template, travelMonth, preferredThemes };

  const generalPois = pois.filter((p) => !isRequiredSlotCategory(p.category as PoiCategoryCode));
  const fitInputs = generalPois.map((p) => ({
    ...p,
    category: p.category as PoiCategoryCode,
    sourceType: p.sourceType ?? "FIXTURE",
  }));
  const { recommended } = filterRecommendablePois(fitInputs, context);
  const recommendedGeneralIds = new Set(recommended.map((p) => p.id));

  // 필수 슬롯(FOOD/LODGING)은 항상 통과시키고, 일반 관광 POI만 위 판정 결과로 거른다 — 원래 목록
  // 순서는 그대로 유지한다(선택 순서가 의미 있는 다른 로직에 영향을 주지 않도록).
  return pois.filter((p) => isRequiredSlotCategory(p.category as PoiCategoryCode) || recommendedGeneralIds.has(p.id));
}

/**
 * 선택된 전략 기준으로 실행안을 준비한다. 실행안이 없으면 새로 만들고, 이미 있지만 선택된 전략이
 * 바뀌었다면(전략 재선택) 새 전략 기준으로 다시 생성한다. 동일 전략이면 사용자가 편집한 내용을 그대로 둔다.
 */
export async function ensureSelectedPlan(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { selectedPlan: true, input: true, region: true, analysisResult: true },
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

  // 보충까지 끝난 최종 후보에 최소 적합 기준을 적용한다 — 여기서 걸러진 자리는 다시 채우지 않는다
  // ("전략과 무관한 장소로 억지로 채우지 않는다"는 원칙을 필터링 이후에도 그대로 유지). preferredThemes
  // 필드가 없는 레거시 데이터(마이그레이션 이전 프로젝트)도 빈 배열로 안전하게 처리한다.
  pois = excludeBelowMinimumFitPois(
    pois,
    strategy.templateId,
    project.travelMonth,
    (project.input.preferredThemes as string[] | undefined) ?? [],
  );

  const course = buildDraftCourse(pois, duration, project.input.transport as TransportCode);
  const audienceContext: AudiencePlanContext = {
    role: project.role,
    nationality: project.input.nationality,
    travelMonth: project.travelMonth,
    preferredThemes: project.input.preferredThemes,
  };
  const operationChecklist = buildOperationChecklist(strategy.templateId, audienceContext);
  const rawKpis = buildKpis(strategy.templateId, audienceContext);
  const risks = buildRisks(strategy.templateId, audienceContext);

  // KPI 연결 보강(2026-08-03) — buildKpis()가 만든 KPI 목록·전략별 생성 로직은 그대로 두고, 이미
  // 계산된 DNA 5축(analysisResult)·프로젝트 목표(input.primaryGoal)만 참고해 측정 목적/연결 축/연결
  // 목표/권장 시점/목표값 근거를 덧붙인다. 실행안 최초 생성 시점에 한 번 계산해 SelectedPlan.kpis에
  // 그대로 저장하므로, 실행안·인쇄 화면이 같은 DB 값을 읽는 한 항상 같은 KPI 연결을 본다.
  const analysisResult = project.analysisResult;
  const axisScores: AxisScoreLike[] | null = analysisResult
    ? DNA_AXES.map((axis) => ({
        axis,
        score: analysisResult[`${axis}Score` as const] as number | null,
        status: analysisResult[`${axis}Status` as const] as AxisStatus,
      }))
    : null;
  const primaryGoalCode = project.input.primaryGoal ?? null;
  const kpis = enrichKpis(rawKpis, {
    axisScores,
    primaryGoalCode,
    primaryGoalLabel: primaryGoalCode ? labelForPrimaryGoal(primaryGoalCode) : null,
  });

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
    kpis: JSON.parse(JSON.stringify(kpis)),
    memo: "",
    kpiMemo: "",
  };

  return prisma.selectedPlan.upsert({
    where: { projectId },
    update: data,
    create: { projectId, ...data },
  });
}
