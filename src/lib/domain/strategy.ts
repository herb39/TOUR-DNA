import { clamp, roundForDisplay } from "./normalize";
import { haversineDistanceKm, type GeoPoint } from "./geo";
import { STRATEGY_TEMPLATES, type PoiCategoryCode, type StrategyTemplate } from "./strategyTemplates";
import type { FoodSubcategory } from "./foodClassification";
import { AXIS_LABEL_KO, type DnaAxisKey, type DnaResult, type EvidenceItem } from "./types";
import {
  classifyThemes,
  computeNationalityFeasibilityDelta,
  computeRoleFit,
  computeThemeFit,
  roleLabel,
  type NationalityCode,
  type UserRoleCode,
} from "./audienceContext";

export type BudgetLevelCode = "LOW" | "MID" | "PREMIUM";
export type TransportCode = "WALK" | "PUBLIC_TRANSPORT" | "PRIVATE_VEHICLE" | "MIXED";
export type GroupTypeCode = "FIT" | "SMALL_10_20" | "MEDIUM_21_40";
export type DurationCode = "DAY_TRIP" | "ONE_NIGHT_TWO_DAYS" | "TWO_NIGHTS_THREE_DAYS";
export type { UserRoleCode, NationalityCode } from "./audienceContext";

export interface ProjectInputForScoring {
  ageGroups: string[];
  companionType: string;
  primaryGoal: string;
  secondaryGoal?: string | null;
  duration: DurationCode;
  budgetLevel: BudgetLevelCode;
  transport: TransportCode;
  groupType: GroupTypeCode;
  travelMonth: number; // 1~12
  preferredThemes: string[];
  excludedThemes: string[];
  /** Phase 4: 지역 객관적 데이터(DNA)는 건드리지 않고, roleFit/targetFit 등 조건별 적합도에만 반영한다.
   * 레거시 데이터 등으로 알 수 없는 값이면 undefined(역할/국적 가중치를 적용하지 않음). */
  role?: UserRoleCode;
  nationality?: NationalityCode;
}

export interface PoiLike {
  id: string;
  name: string;
  category: PoiCategoryCode;
  /** FOOD 카테고리일 때만 의미가 있다 — 실제 식사가 가능한 장소인지(카페/전통찻집 등은 false, 3단계
   * 보완). planBuilder.ts의 PoiDetail.mealEligible과 같은 규약이다: 값이 없는 호출부(기존 테스트 등)는
   * 하위 호환을 위해 식사 가능으로 취급한다. */
  mealEligible?: boolean;
  /** FOOD 세부 분류(foodClassification.ts) — 값이 없는 호출부는 기존처럼 mealEligible만으로 판단한다. */
  foodSubcategory?: FoodSubcategory;
  /** 거리 기반 선택(이번 단계)에 쓰는 좌표 — 값이 없는 후보(좌표 미확보 POI, 기존 테스트 등)는 거리
   * 판단에서 제외되고 기존 방식(회전 순서)으로 안전하게 처리된다(하위 호환, 회귀 없음). */
  lat?: number;
  lng?: number;
}

function hasPoiCoords(p: PoiLike): p is PoiLike & GeoPoint {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export interface StrategyScoreBreakdown {
  demandFit: number;
  supplyFit: number;
  seasonFit: number;
  targetFit: number;
  feasibilityFit: number;
  /** Phase 4: 역할(지자체/여행사)별 목표 우선순위 적합도. 지역 객관적 데이터가 아니라 CURATED 정책값. */
  roleFit: number;
}

export interface ConsumptionTouchpoints {
  food: boolean;
  lodging: boolean;
  experience: boolean;
  examples: string[];
}

export interface StrategyComputationResult {
  templateId: string;
  rank: number;
  name: string;
  concept: string;
  totalScore: number;
  scoreBreakdown: StrategyScoreBreakdown;
  reasons: string[];
  targetDescription: string;
  poiIds: string[];
  consumptionTouchpoints: ConsumptionTouchpoints;
  risks: string[];
  evidences: EvidenceItem[];
  modelVersion: string;
}

function circularMonthDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 12 - d);
}

function weightedAxisFit(weights: Partial<Record<DnaAxisKey, number>>, dna: DnaResult): number {
  const entries = Object.entries(weights) as [DnaAxisKey, number][];
  const available = entries.filter(([axis]) => dna[axis].score !== null);
  if (available.length === 0) return 50; // 결측 축뿐이면 중립값
  const totalWeight = available.reduce((sum, [, w]) => sum + w, 0);
  const weighted = available.reduce(
    (sum, [axis, w]) => sum + (dna[axis].score as number) * (w / totalWeight),
    0,
  );
  return roundForDisplay(clamp(weighted, 0, 100));
}

function computeSeasonFit(travelMonth: number, idealMonths: number[]): number {
  if (idealMonths.includes(travelMonth)) return 100;
  const minDist = Math.min(...idealMonths.map((m) => circularMonthDistance(travelMonth, m)));
  return clamp(100 - minDist * 20, 0, 100);
}

/** targetFit = 연령/동행/목표 기반 base(가중합) + 테마 가산점(기존 substring 규칙 + Phase 4 카테고리
 * 분류 가산점, THEME_CATEGORY_BONUS_CAP으로 clamp). 반환값과 함께 이 계산에 적용된 조건별 조정 근거도
 * 돌려줘 buildReasons/UI에서 재사용할 수 있게 한다. */
function computeTargetFit(
  template: StrategyTemplate,
  input: ProjectInputForScoring,
): { score: number; themeAdjustments: ReturnType<typeof computeThemeFit>["adjustments"] } {
  const ageScore = input.ageGroups.some((a) => template.targetAgeGroups.includes(a)) ? 100 : 40;
  const companionScore = template.targetCompanionTypes.includes(input.companionType) ? 100 : 40;
  const goalScore = template.supportedGoals.includes(input.primaryGoal)
    ? 100
    : input.secondaryGoal && template.supportedGoals.includes(input.secondaryGoal)
      ? 70
      : 40;
  const base = ageScore * 0.4 + companionScore * 0.35 + goalScore * 0.25;
  const substringBonus = input.preferredThemes.some(
    (t) => template.concept.includes(t) || template.name.includes(t),
  )
    ? 10
    : 0;
  const themeCategories = classifyThemes(input.preferredThemes);
  const { bonus, adjustments } = computeThemeFit(template, themeCategories, substringBonus);
  return { score: roundForDisplay(clamp(base + bonus, 0, 100)), themeAdjustments: adjustments };
}

/** feasibilityFit = 예산/이동수단/그룹규모 기반 base - 무박 페널티 + Phase 4 국적별 서비스 준비도 조정
 * (CURATED, 외국인일 때만 적용 — 내국인/객관적 데이터는 건드리지 않는다). */
function computeFeasibilityFit(
  template: StrategyTemplate,
  input: ProjectInputForScoring,
): { score: number; nationalityAdjustment: ReturnType<typeof computeNationalityFeasibilityDelta>["adjustment"] } {
  const budgetScore = template.preferredBudgetLevels.includes(input.budgetLevel) ? 100 : 60;
  const transportScore = template.preferredTransport.includes(input.transport) ? 100 : 60;
  const groupScore = template.preferredGroupTypes.includes(input.groupType) ? 100 : 60;
  const overnightPenalty = template.requiresOvernight && input.duration === "DAY_TRIP" ? 40 : 0;
  const raw = (budgetScore + transportScore + groupScore) / 3 - overnightPenalty;
  const { delta, adjustment } = computeNationalityFeasibilityDelta(template, input.nationality);
  return { score: roundForDisplay(clamp(raw + delta, 0, 100)), nationalityAdjustment: adjustment };
}

function isExcludedByTheme(template: StrategyTemplate, excludedThemes: string[]): boolean {
  return excludedThemes.some(
    (theme) => theme.length > 0 && (template.name.includes(theme) || template.concept.includes(theme)),
  );
}

function collectEvidences(
  template: StrategyTemplate,
  dna: DnaResult,
): EvidenceItem[] {
  const axes = new Set<DnaAxisKey>([
    ...(Object.keys(template.demandAxisWeights) as DnaAxisKey[]),
    ...(Object.keys(template.supplyAxisWeights) as DnaAxisKey[]),
  ]);
  const evidences: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const axis of axes) {
    for (const ev of dna[axis].evidence) {
      const key = `${ev.axis}:${ev.metricCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidences.push(ev);
    }
  }
  return evidences;
}

/** 템플릿 id(+카테고리) 기반 결정론적 해시. 같은 카테고리를 공유하는 템플릿끼리도 서로 다른 POI를 뽑도록
 * 정렬된 목록 안에서의 시작 위치(offset)를 템플릿마다 다르게 만든다(같은 입력엔 항상 같은 결과). */
function templateHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** 기간별 목표 비숙박 POI 개수 — 관광상품으로서 최소한의 밀도를 보장하기 위한 상수(하루 2개 문제의 개선 1단계). */
/** planService.ts도 이 값을 재사용해 "이 기간에 원래 목표했던 비숙박 밀도"를 알아낸다(단일 기준
 * 유지, 하드코딩 중복 없음) — 식사 선점이 이 목표 예산을 갉아먹은 만큼 일반 관광 후보를 보충할 때
 * 기준으로 쓴다(planBuilder.ts의 DAILY_ITEM_TARGETS_BY_DURATION 합과 정확히 같은 값이다). */
export const NON_LODGING_POI_TARGET_BY_DURATION: Record<DurationCode, number> = {
  DAY_TRIP: 4,
  ONE_NIGHT_TWO_DAYS: 7,
  TWO_NIGHTS_THREE_DAYS: 11,
};

/** 기간별 목표 숙박 후보 개수(박수 기준) — 비숙박 목표와 별도로 취급한다. 실제 일정 내 분리 배치는 다음 단계. */
const LODGING_POI_TARGET_BY_DURATION: Record<DurationCode, number> = {
  DAY_TRIP: 0,
  ONE_NIGHT_TWO_DAYS: 1,
  TWO_NIGHTS_THREE_DAYS: 2,
};

/** 템플릿 핵심 카테고리가 부족할 때 지역 소비 접점을 보완하는 후보 카테고리. */
const TOUCHPOINT_SUPPLEMENT_CATEGORIES: PoiCategoryCode[] = ["FOOD", "EXPERIENCE", "SHOPPING"];

/** 기간별로 최소 확보해야 하는 "식사 가능"(mealEligible) FOOD 후보 개수(하루 점심+저녁 최대 2개 기준).
 * 템플릿 핵심 카테고리에 FOOD가 없어도(예: NATURE_WELLNESS) 이 개수만큼은 별도로 선점한다 — 그렇지 않으면
 * 핵심 카테고리만으로 목표를 다 채워버려 poiIds에 FOOD가 하나도 안 들어가고, 실행안에 점심/저녁이 전혀
 * 배치되지 않는 문제가 있었다(2026-07-24 통영 사례). planService.ts도 이 값을 그대로 재사용해
 * 실행안 생성 시점에 후보가 부족하면 지역 DB에서 보충한다(단일 기준 유지). */
export const MEAL_RESERVE_TARGET_BY_DURATION: Record<DurationCode, number> = {
  DAY_TRIP: 2,
  ONE_NIGHT_TWO_DAYS: 4,
  TWO_NIGHTS_THREE_DAYS: 6,
};

/** 그래도 목표에 못 미치면 마지막으로 훑는 비숙박 카테고리 전체(고정 순서, LODGING 제외). */
const ALL_NON_LODGING_CATEGORIES: PoiCategoryCode[] = ["ATTRACTION", "FOOD", "EXPERIENCE", "FESTIVAL", "SHOPPING"];

/** P0-3: 마지막(가장 무관한) 티어가 하루 목표 개수에서 채울 수 있는 최대 비중. 0.4 = 목표의 40%까지만
 * "전략과 무관한" 카테고리로 채우고, 나머지는 채우지 못해도 그대로 둔다(부정확한 장소로 채우지 않음). */
const FALLBACK_TIER_MAX_SHARE = 0.4;

/** 카테고리 하나를 이름순 정렬 후, 템플릿+카테고리 조합 해시로 정한 위치부터 시작하도록 순환시킨다.
 * 입력 pool을 복사만 하고 원본은 건드리지 않는다. */
function rotatedCategoryPool(template: StrategyTemplate, cat: PoiCategoryCode, pool: PoiLike[]): PoiLike[] {
  const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  if (sorted.length === 0) return sorted;
  const offset = templateHash(`${template.id}:${cat}`) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

function selectPois(
  template: StrategyTemplate,
  poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>>,
  duration: DurationCode,
): { poiIds: string[]; touchpoints: ConsumptionTouchpoints } {
  // 이미 선택된 POI 중 좌표가 있는 것들의 무게중심 — 두 번째 선택부터 이 지점과 가까운 후보를 우선한다
  // (1단계: 날짜별로 나누는 것은 planBuilder.ts 책임이라 이 단계에서는 "전체적으로 뭉치게" 하는
  // 선호도만 담당한다). 좌표가 전혀 없으면(coordCount===0) 기존 회전 순서 방식 그대로 동작한다 —
  // 신규 선택 로직이 좌표 없는 데이터(기존 테스트, 좌표 미확보 POI)에서 회귀를 일으키지 않는다.
  let coordLatSum = 0;
  let coordLngSum = 0;
  let coordCount = 0;
  const registerCoords = (p: PoiLike): void => {
    if (hasPoiCoords(p)) {
      coordLatSum += p.lat;
      coordLngSum += p.lng;
      coordCount++;
    }
  };
  const currentCentroid = (): GeoPoint | null =>
    coordCount === 0 ? null : { lat: coordLatSum / coordCount, lng: coordLngSum / coordCount };

  const nonLodgingTarget = NON_LODGING_POI_TARGET_BY_DURATION[duration];
  const lodgingTarget = LODGING_POI_TARGET_BY_DURATION[duration];

  // 우선순위 티어: ① 템플릿 핵심 카테고리 → ② 지역 소비 접점 보완 카테고리 → ③ 나머지 비숙박 카테고리.
  const coreCats: PoiCategoryCode[] = template.poiCategories.filter((c) => c !== "LODGING");
  const supplementCats = TOUCHPOINT_SUPPLEMENT_CATEGORIES.filter((c) => !coreCats.includes(c));
  const fallbackCats = ALL_NON_LODGING_CATEGORIES.filter(
    (c) => !coreCats.includes(c) && !supplementCats.includes(c),
  );
  const priorityTiers = [coreCats, supplementCats, fallbackCats];

  const rotatedPools = new Map<PoiCategoryCode, PoiLike[]>();
  const cursorByCategory = new Map<PoiCategoryCode, number>();
  const poolFor = (cat: PoiCategoryCode): PoiLike[] => {
    let rotated = rotatedPools.get(cat);
    if (!rotated) {
      rotated = rotatedCategoryPool(template, cat, poisByCategory[cat] ?? []);
      rotatedPools.set(cat, rotated);
    }
    return rotated;
  };

  const selectedIds = new Set<string>();
  const selectedByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>> = {};
  const selectionOrder: PoiLike[] = [];

  // 식사 가능 FOOD 선점(근본 원인 수정, 2026-07-24): 템플릿 핵심 카테고리에 FOOD가 없으면 위 티어 루프가
  // 목표를 다 채운 뒤 보완 티어(FOOD 포함)까지 내려가지 않아 FOOD가 하나도 선택되지 않을 수 있었다.
  // 아래 티어 루프보다 먼저, mealEligible이 false가 아닌(=식사 가능) FOOD만 회전된 풀의 원래 순서
  // 그대로 최대 MEAL_RESERVE_TARGET_BY_DURATION개까지 선점한다. 카페 등(mealEligible===false)은
  // 여기서 건너뛰되 cursorByCategory를 건드리지 않으므로, 아래 일반 티어 루프에서는 원래 순서 그대로
  // (건너뛴 카페 포함) 다시 훑을 수 있다 — 일반 방문 후보로 선택될 기회를 잃지 않는다.
  const mealReserveTarget = Math.min(MEAL_RESERVE_TARGET_BY_DURATION[duration], nonLodgingTarget);
  if (mealReserveTarget > 0) {
    for (const candidate of poolFor("FOOD")) {
      if (selectedIds.size >= mealReserveTarget) break;
      if (candidate.mealEligible === false) continue;
      selectedIds.add(candidate.id);
      selectionOrder.push(candidate);
      registerCoords(candidate);
      const list = selectedByCategory.FOOD ?? [];
      list.push(candidate);
      selectedByCategory.FOOD = list;
    }
  }

  /** 회전 순서 기준 다음 미선택 후보(기존 방식) — 좌표가 없어 거리 판단이 불가능할 때의 fallback이다. */
  const pickNextByRotation = (cat: PoiCategoryCode): PoiLike | null => {
    const rotated = poolFor(cat);
    let idx = cursorByCategory.get(cat) ?? 0;
    let picked: PoiLike | null = null;
    while (idx < rotated.length) {
      const candidate = rotated[idx];
      idx++;
      if (!selectedIds.has(candidate.id)) {
        picked = candidate;
        break;
      }
    }
    cursorByCategory.set(cat, idx);
    return picked;
  };

  /** 해당 카테고리에서 다음으로 선택할 후보 하나. 이미 선택된 POI의 무게중심과 후보 좌표가 모두 있으면
   * 그 중심에 가장 가까운 후보를 우선한다(1단계: 가까운 POI 우선 선택 + 공간적 응집). 좌표가 없는
   * 후보뿐이면(기존 데이터/테스트) 기존 회전 순서 그대로 동작해 회귀가 없다. 동일 거리(반올림 오차
   * 이내)면 회전 순서로 동점을 깬다 — 완전히 결정론적이다. */
  const pickNext = (cat: PoiCategoryCode): PoiLike | null => {
    const centroid = currentCentroid();
    if (!centroid) return pickNextByRotation(cat);

    const rotated = poolFor(cat);
    const unselectedWithCoords = rotated
      .map((candidate, rotationIndex) => ({ candidate, rotationIndex }))
      .filter(({ candidate }) => !selectedIds.has(candidate.id) && hasPoiCoords(candidate));
    if (unselectedWithCoords.length === 0) return pickNextByRotation(cat);

    unselectedWithCoords.sort((a, b) => {
      const da = haversineDistanceKm(centroid, a.candidate as PoiLike & GeoPoint);
      const db = haversineDistanceKm(centroid, b.candidate as PoiLike & GeoPoint);
      if (Math.abs(da - db) > 0.01) return da - db;
      return a.rotationIndex - b.rotationIndex;
    });
    return unselectedWithCoords[0].candidate;
  };

  // 티어 안에서는 카테고리를 순환하며 한 개씩 뽑아 균형 있게 채우고, 목표에 못 미치면 다음 티어로 내려간다.
  // P0-3(2026-07-27): 마지막 티어(fallbackCats, 템플릿과 무관한 나머지 카테고리)만은 목표를 끝까지
  // 채우지 않는다 — core+supplement 후보가 부족하다고 해서 전략과 무관한 카테고리로 억지로 채우면
  // "전략과 무관한 음식점/캠핑장이 주요 관광지 자리를 차지"하는 문제가 생긴다. 대신 fallback 기여분을
  // 목표치의 일부(FALLBACK_TIER_MAX_SHARE)로 제한하고, 그래도 못 채우면 더 짧은 코스로 남긴다(빈
  // 자리를 부정확한 장소로 채우지 않는다는 원칙).
  const fallbackTierMaxCount = Math.ceil(nonLodgingTarget * FALLBACK_TIER_MAX_SHARE);
  for (const tier of priorityTiers) {
    const isFallbackTier = tier === fallbackCats;
    const tierLimit = isFallbackTier
      ? Math.min(nonLodgingTarget, selectedIds.size + fallbackTierMaxCount)
      : nonLodgingTarget;
    if (selectedIds.size >= tierLimit) continue;
    let progressed = true;
    while (progressed && selectedIds.size < tierLimit) {
      progressed = false;
      for (const cat of tier) {
        if (selectedIds.size >= tierLimit) break;
        const picked = pickNext(cat);
        if (!picked) continue;
        selectedIds.add(picked.id);
        selectionOrder.push(picked);
        registerCoords(picked);
        const list = selectedByCategory[cat] ?? [];
        list.push(picked);
        selectedByCategory[cat] = list;
        progressed = true;
      }
    }
  }

  // LODGING은 비숙박 목표와 별도로, 박수만큼만 선택한다(이번 단계에서는 poiIds에 함께 담되 일정 분리는 하지 않음).
  const lodgingPicked: PoiLike[] = [];
  const lodgingPool = rotatedCategoryPool(template, "LODGING", poisByCategory.LODGING ?? []);
  for (const candidate of lodgingPool) {
    if (lodgingPicked.length >= lodgingTarget) break;
    if (selectedIds.has(candidate.id)) continue;
    lodgingPicked.push(candidate);
    selectedIds.add(candidate.id);
  }
  if (lodgingPicked.length > 0) selectedByCategory.LODGING = lodgingPicked;

  const poiIds = [...selectionOrder, ...lodgingPicked].map((p) => p.id);

  const touchpointCats: PoiCategoryCode[] = ["FOOD", "LODGING", "EXPERIENCE"];
  const examples = touchpointCats.flatMap((c) => (selectedByCategory[c] ?? []).map((p) => p.name)).slice(0, 3);

  return {
    poiIds,
    touchpoints: {
      food: (selectedByCategory.FOOD?.length ?? 0) > 0,
      lodging: (selectedByCategory.LODGING?.length ?? 0) > 0,
      experience: (selectedByCategory.EXPERIENCE?.length ?? 0) > 0,
      examples,
    },
  };
}

function buildReasons(
  template: StrategyTemplate,
  breakdown: StrategyScoreBreakdown,
  dna: DnaResult,
  role: UserRoleCode | undefined,
): string[] {
  const reasons: string[] = [];

  const demandAxes = Object.keys(template.demandAxisWeights) as DnaAxisKey[];
  const strongestDemandAxis = demandAxes
    .filter((a) => dna[a].score !== null)
    .sort((a, b) => (dna[b].score as number) - (dna[a].score as number))[0];
  reasons.push(
    strongestDemandAxis
      ? `${AXIS_LABEL_KO[strongestDemandAxis]} 축 점수(${dna[strongestDemandAxis].score})가 반영되어 수요 적합도 ${breakdown.demandFit}점`
      : `데이터 부족으로 수요 적합도는 중립값(${breakdown.demandFit}점)을 적용함`,
  );

  const supplyReason =
    breakdown.supplyFit >= 60
      ? `지역 내 연계 인프라(POI/업종 연결)가 충분해 공급 적합도 ${breakdown.supplyFit}점`
      : `지역 내 연계 인프라가 제한적이라 공급 적합도 ${breakdown.supplyFit}점 — 보완 필요`;
  reasons.push(
    role
      ? `${supplyReason} · ${roleLabel(role)} 관점 목표 적합도 ${breakdown.roleFit}점(기획 규칙)`
      : supplyReason,
  );

  reasons.push(
    breakdown.seasonFit >= 80
      ? `여행 시기가 이 전략의 성수기(${template.idealMonths.join(", ")}월)와 잘 맞아 시즌 적합도 ${breakdown.seasonFit}점`
      : `여행 시기가 성수기(${template.idealMonths.join(", ")}월)와 다소 어긋나 시즌 적합도 ${breakdown.seasonFit}점`,
  );

  return reasons;
}

/**
 * 전략 3안을 계산한다. 점수/순위는 절대 하드코딩하지 않고 아래 공식으로만 결정된다.
 * strategyScore = demandFit*0.30 + supplyFit*0.20 + seasonFit*0.20 + targetFit*0.15
 *               + feasibilityFit*0.05 + roleFit*0.10  (합계는 항상 1.0)
 * 2026-07-27(P0-1): 사용자가 명시적으로 고른 테마(targetFit)가 순위에 실질적인 영향을 주도록
 * targetFit 가중치를 0.05→0.15로 올렸다(운영 검증에서 웰니스 테마를 명시적으로 고른 시나리오도
 * 테마와 무관한 전략에 밀리는 문제가 확인됨). 그만큼을 demandFit(0.35→0.30)·supplyFit(0.25→0.20)에서
 * 덜어냈다 — 다만 두 값을 합쳐도 0.50으로 여전히 가장 큰 비중을 차지해, 지역 객관적 데이터(수요/공급)가
 * 현저히 부족하면 테마가 맞아도 순위가 밀릴 수 있는 구조는 유지된다.
 * demandFit/supplyFit(지역 객관적 DNA) 값 자체는 역할·국적·테마·월에 따라 바뀌지 않는다 — 대신
 * targetFit(테마)/feasibilityFit(국적)/roleFit(역할)/seasonFit(월)이 조건별 적합도를 담당한다.
 */
export function computeStrategies(
  dna: DnaResult,
  input: ProjectInputForScoring,
  poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>>,
  modelVersion: string,
): StrategyComputationResult[] {
  const candidates = STRATEGY_TEMPLATES.filter((t) => !isExcludedByTheme(t, input.excludedThemes));

  const scored = candidates.map((template) => {
    const demandFit = weightedAxisFit(template.demandAxisWeights, dna);
    const supplyFit = weightedAxisFit(template.supplyAxisWeights, dna);
    const seasonFit = computeSeasonFit(input.travelMonth, template.idealMonths);
    const { score: targetFit } = computeTargetFit(template, input);
    const { score: feasibilityFit } = computeFeasibilityFit(template, input);
    const { score: roleFit } = computeRoleFit(template, input.role);

    const totalScore = roundForDisplay(
      clamp(
        demandFit * 0.3 +
          supplyFit * 0.2 +
          seasonFit * 0.2 +
          targetFit * 0.15 +
          feasibilityFit * 0.05 +
          roleFit * 0.1,
        0,
        100,
      ),
    );

    const breakdown: StrategyScoreBreakdown = { demandFit, supplyFit, seasonFit, targetFit, feasibilityFit, roleFit };
    const { poiIds, touchpoints } = selectPois(template, poisByCategory, input.duration);

    return {
      template,
      totalScore,
      breakdown,
      poiIds,
      touchpoints,
      evidences: collectEvidences(template, dna),
    };
  });

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.breakdown.supplyFit !== a.breakdown.supplyFit) return b.breakdown.supplyFit - a.breakdown.supplyFit;
    if (b.breakdown.demandFit !== a.breakdown.demandFit) return b.breakdown.demandFit - a.breakdown.demandFit;
    return a.template.id.localeCompare(b.template.id);
  });

  return scored.slice(0, 3).map((s, index) => ({
    templateId: s.template.id,
    rank: index + 1,
    name: s.template.name,
    concept: s.template.concept,
    totalScore: s.totalScore,
    scoreBreakdown: s.breakdown,
    reasons: buildReasons(s.template, s.breakdown, dna, input.role),
    targetDescription: s.template.targetDescriptionTemplate,
    poiIds: s.poiIds,
    consumptionTouchpoints: s.touchpoints,
    risks: s.template.riskTemplates,
    evidences: s.evidences,
    modelVersion,
  }));
}
