import {
  computePoiFit,
  classifyPoiCategoryTier,
  isExcludedFromRecommendation,
  isRequiredSlotCategory,
  type PoiFitResult,
} from "@/lib/domain/poiFit";
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
  /** true면 지역 전체 데이터를 다 훑어도(적합 기준을 통과하는 후보만 세어도) 후보 자체가 목표에 못
   * 미친다는 뜻(데이터 부족). false면 지역에 후보 자체는 있지만 최소 적합 기준에 미달해 제외된
   * 결과다(filteredOutCount > 0). 둘 다 해당할 수도 있다. */
  dataInsufficient: boolean;
  /** 지역 전체 후보 중 최소 적합 기준(poiFit.ts recommendationStatus)에 미달해 제외된 개수
   * (2026-07-30, 저적합 POI 추천 제외 보완) — planService.ts(ensureSelectedPlan)가 실제로 코스에서
   * 제외한 것과 같은 기준으로 다시 계산한 값이다. */
  filteredOutCount: number;
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
    // 2026-07-30(저적합 POI 추천 제외 보완): 카테고리만 맞으면 후보로 세던 것을, planService.ts가
    // 코스 생성 시 실제로 적용하는 것과 같은 최소 적합 기준(recommendationStatus)으로 다시 걸러
    // "지역 데이터 자체 부족"과 "적합 기준 미달로 제외됨"을 구분한다 — 지역 후보가 충분한데 저적합
    // 판정으로 부족해진 경우를 "지역 데이터 부족"이라고 잘못 안내하지 않기 위함이다.
    const poisByCategory = await fetchPoisByCategory(params.regionCode);
    const coreSupplementCategories = (Object.keys(poisByCategory) as PoiCategoryCode[]).filter(
      (c) => c !== "LODGING" && classifyPoiCategoryTier(template, c) !== "FALLBACK",
    );
    const regionCandidates = coreSupplementCategories.flatMap((c) => poisByCategory[c] ?? []);
    let recommendableRegionCount = 0;
    let filteredOutCount = 0;
    for (const candidate of regionCandidates) {
      const category = candidate.category as PoiCategoryCode;
      if (isRequiredSlotCategory(category)) {
        recommendableRegionCount++;
        continue;
      }
      const fit = computePoiFit(
        {
          id: candidate.id,
          name: candidate.name,
          category,
          sourceType: "FIXTURE",
          operatingHours: null,
          closedDays: null,
        },
        context,
      );
      if (isExcludedFromRecommendation(fit)) filteredOutCount++;
      else recommendableRegionCount++;
    }

    const shortfallCount = nonLodgingTarget - actualNonLodging;
    const dataInsufficient = recommendableRegionCount < nonLodgingTarget;

    const reasonParts: string[] = [];
    if (dataInsufficient) {
      reasonParts.push(
        `이 전략의 적합 기준을 통과하는 장소가 지역 데이터에 ${recommendableRegionCount}곳뿐입니다.`,
      );
    }
    if (filteredOutCount > 0) {
      reasonParts.push(`전략 적합 기준에 미달한 장소 ${filteredOutCount}곳을 추천에서 제외했습니다.`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push("전략과 관련 낮은 장소로 억지로 채우지 않았습니다.");
    }

    shortage = {
      targetCount: nonLodgingTarget,
      actualCount: actualNonLodging,
      shortfallCount,
      dataInsufficient,
      filteredOutCount,
      message: `목표(${nonLodgingTarget}곳)보다 ${shortfallCount}곳 적게 구성되었습니다. ${reasonParts.join(" ")}`,
      suggestion: dataInsufficient
        ? "해당 카테고리의 공공데이터 동기화 범위를 넓히거나, 관리자가 큐레이션 데이터를 추가해야 합니다."
        : "운영시간 등을 확인한 뒤 후보를 추가하거나, 테마·카테고리 범위를 넓혀 다시 분석해볼 수 있습니다.",
    };
  }

  return { fitsByPoiId, shortage };
}
