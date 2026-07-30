import { computePoiFit, classifyPoiCategoryTier, type PoiFitResult } from "@/lib/domain/poiFit";
import { getTemplateById, type PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import {
  MEAL_RESERVE_TARGET_BY_DURATION,
  NON_LODGING_POI_TARGET_BY_DURATION,
  type DurationCode,
} from "@/lib/domain/strategy";
import { fetchPoiDetailsInOrder } from "./poiDetails";
import { fetchPoisByCategory } from "./fetchPoisByCategory";

/**
 * 목표 개수보다 적합한 POI가 부족할 때의 안내(P0-1, 2026-07-30). strategy.ts의 selectPois는 이미
 * "전략과 무관한 카테고리로 억지로 채우지 않는다"는 원칙으로 poiIds를 고정해 둔다 — 이 서비스는 그
 * 결과를 다시 선택하지 않고, 목표 대비 실제 확보된 개수만 비교해 부족 사실을 사용자에게 보여준다.
 */
export interface PoiShortageNotice {
  targetCount: number;
  actualCount: number;
  shortfallCount: number;
  /** true면 지역 전체 데이터를 다 훑어도 후보 자체가 목표에 못 미친다는 뜻(데이터 부족).
   * false면 후보 자체는 더 있지만 전략과 관련 낮은 카테고리로 억지로 채우지 않은 결과다. */
  dataInsufficient: boolean;
  message: string;
  suggestion: string;
}

export interface StrategyPoiFitSummary {
  fitsByPoiId: Record<string, PoiFitResult>;
  shortage: PoiShortageNotice | null;
}

/**
 * 현재 코스에 담긴 POI들의 전략 적합도와 후보 부족 여부를 계산한다. 선택 로직(selectPois)이나 전략
 * 점수·순위는 전혀 다시 계산하지 않고, 이미 확정된 poiIds를 평가만 한다 — 사용자가 실행안에서 장소를
 * 추가·삭제해도 이 함수를 다시 호출하면 최신 상태 그대로 재평가된다(별도 저장 없이 매번 계산).
 */
export async function buildStrategyPoiFitSummary(params: {
  templateId: string;
  regionCode: string;
  poiIds: string[];
  travelMonth: number;
  preferredThemes: string[];
  duration: DurationCode;
}): Promise<StrategyPoiFitSummary> {
  const template = getTemplateById(params.templateId);
  const context = { template, travelMonth: params.travelMonth, preferredThemes: params.preferredThemes };

  const details = await fetchPoiDetailsInOrder(params.poiIds);
  const fitsByPoiId: Record<string, PoiFitResult> = {};
  for (const detail of details) {
    fitsByPoiId[detail.id] = computePoiFit(
      {
        id: detail.id,
        name: detail.name,
        category: detail.category as PoiCategoryCode,
        sourceType: detail.sourceType ?? "FIXTURE",
        operatingHours: detail.operatingHours,
        closedDays: detail.closedDays,
      },
      context,
    );
  }

  // 2026-07-30(통합 검증): planService.ts(ensureSelectedPlan)가 실제로 코스를 구성할 때 목표로 삼는
  // 개수는 NON_LODGING_POI_TARGET_BY_DURATION 하나가 아니라 여기에 식사 선점 목표(MEAL_RESERVE_
  // TARGET_BY_DURATION)를 더한 값이다(desiredNonLodgingCount, planService.ts 참고) — 이 값을 빼먹으면
  // 실제로는 목표에 못 미쳐 부족한 상황에서도 목표치를 낮게 잡아 부족 안내가 누락될 수 있었다.
  const nonLodgingTarget =
    NON_LODGING_POI_TARGET_BY_DURATION[params.duration] + MEAL_RESERVE_TARGET_BY_DURATION[params.duration];
  const actualNonLodging = details.filter((d) => d.category !== "LODGING").length;

  let shortage: PoiShortageNotice | null = null;
  if (actualNonLodging < nonLodgingTarget) {
    const poisByCategory = await fetchPoisByCategory(params.regionCode);
    const coreSupplementCategories = (Object.keys(poisByCategory) as PoiCategoryCode[]).filter(
      (c) => c !== "LODGING" && classifyPoiCategoryTier(template, c) !== "FALLBACK",
    );
    const regionCandidateCount = coreSupplementCategories.reduce(
      (sum, c) => sum + (poisByCategory[c]?.length ?? 0),
      0,
    );
    const shortfallCount = nonLodgingTarget - actualNonLodging;
    const dataInsufficient = regionCandidateCount < nonLodgingTarget;

    shortage = {
      targetCount: nonLodgingTarget,
      actualCount: actualNonLodging,
      shortfallCount,
      dataInsufficient,
      message: dataInsufficient
        ? `이 전략에 적합한 장소가 지역 데이터에 ${regionCandidateCount}곳뿐이라 목표(${nonLodgingTarget}곳)보다 ${shortfallCount}곳 부족합니다.`
        : `전략과 관련 낮은 장소로 억지로 채우지 않아 목표(${nonLodgingTarget}곳)보다 ${shortfallCount}곳 적게 구성되었습니다.`,
      suggestion: dataInsufficient
        ? "해당 카테고리의 공공데이터 동기화 범위를 넓히거나, 관리자가 큐레이션 데이터를 추가해야 합니다."
        : "운영시간 등을 확인한 뒤 후보를 추가하거나, 테마·카테고리 범위를 넓혀 다시 분석해볼 수 있습니다.",
    };
  }

  return { fitsByPoiId, shortage };
}
