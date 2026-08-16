import { clamp, roundForDisplay } from "./normalize";
import { haversineDistanceKm, type GeoPoint } from "./geo";
import { STRATEGY_TEMPLATES, type PoiCategoryCode, type StrategyTemplate } from "./strategyTemplates";
import type { FoodSubcategory } from "./foodClassification";
import { dedupeBySameCoordinates } from "./poiDedup";
import { AXIS_LABEL_KO, METRIC_CODES, type DnaAxisKey, type DnaResult, type EvidenceItem } from "./types";
import { formatSignedPercent } from "@/lib/format";
import {
  classifyStructuralPoiThemes,
  classifyThemes,
  computeNationalityFeasibilityDelta,
  computeRoleFit,
  computeThemeFit,
  roleLabel,
  templateCoreThemeCategories,
  themePreferredPoiCategories,
  type NationalityCode,
  type ThemeCategory,
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
  /** TourAPI/DB에서 확인된 운영시간·휴무일. 후보 선정은 이 값을 판정하지 않지만 실행안 품질검증까지 보존한다. */
  operatingHours?: string | null;
  closedDays?: string | null;
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
  /** TourAPI 신 분류체계 대/중분류(2026-08-15, POI 후보 선정 품질 개선 — poiFit.ts의
   * classifyStructuralPoiThemes와 동일한 신호를 selectPois의 후보 우선순위에도 재사용한다). 값이
   * 없으면(FIXTURE, 구형 데이터, 값을 넘기지 않는 기존 호출부) 이름 키워드 판정으로 안전하게
   * fallback한다(하위 호환, 회귀 없음). */
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
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
  /** 2026-07-29(2차 개선): computeRoleFit()이 이미 계산해 두는 근거 문장(ContextAdjustment.reason)을
   * 그대로 보존한다. role이 없으면(중립값 50) 애초에 근거 문장이 없으므로 undefined — 화면에서는 이
   * 값이 없을 때 "재분석 필요"가 아니라 단순히 이유 문구를 생략한다(신규/구버전 구분과는 별개). */
  roleFitReason?: string;
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
  /** 2026-07-31: 전략 3안 구조적 차별화 필드 — strategyTemplates.ts에 그대로 정의된 값을 옮긴다
   * (조건별로 계산되지 않는 템플릿 고유 속성, CURATED). */
  coreProblem: string;
  coreResource: string;
  stayStyle: string;
  executionDifficulty: "LOW" | "MEDIUM" | "HIGH";
  expectedEffect: string;
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

/** 선호 테마 티어가 하루 목표 개수에서 채울 수 있는 최대 비중(2026-08-10 도입). 사용자가 미식 테마를
 * 골랐다고 코스 전체가 음식점으로 도배되면 안 되므로(다양성 유지 원칙), FALLBACK_TIER_MAX_SHARE보다는
 * 넉넉하되(사용자가 명시적으로 선호한 것이므로) 절반을 넘지 않게 제한한다. hard filter가 아니라
 * "먼저 채워지는 우선순위" 개념이라 테마 POI가 부족하면 이 상한과 무관하게 자연스럽게 다음 티어로
 * 넘어간다(코스 생성 실패 없음). */
const THEME_TIER_MAX_SHARE = 0.5;

/**
 * 전략 핵심 테마 POI 최소 확보 비중(2026-08-16, 전략 핵심 테마 중심 코스 구성 강화). 기존 core 카테고리
 * 라운드로빈은 카테고리별로 균등하게 한 개씩만 채우기 때문에, 핵심 테마를 담당하는 카테고리(예:
 * CULTURE_HISTORY의 ATTRACTION)가 FOOD 등 다른 core 카테고리와 같은 비중만 배정받아, 실제 문화역사
 * 코스인데도 ATTRACTION 슬롯이 1개뿐인 문제가 있었다(경주 ONE_NIGHT_TWO_DAYS: 목표 7개 중 mealReserve가
 * 4개를 먼저 선점해 남은 3개를 ATTRACTION/EXPERIENCE/FOOD 3개 카테고리가 1개씩 나눠 가짐).
 *
 * 전국 30개 지역 조사 결과(핵심 테마가 있는 4개 템플릿 — LOCAL_FOOD_MARKET/NATURE_WELLNESS/
 * CULTURE_HISTORY/FESTIVAL_EVENT), CULTURE_HISTORY/NATURE_WELLNESS/LOCAL_FOOD_MARKET은 29~30개 지역에서
 * 관련성이 확인되는 후보가 3개 이상 존재해 30% 비중의 floor를 안정적으로 채울 수 있었다. FESTIVAL_EVENT는
 * 축제 데이터 특성상 공급이 고르지 않아(3/30 지역이 관련 후보 0개) 이 floor를 적용해도 공급이 부족한
 * 지역은 채워지지 않고 그대로 남는다(아래 구현이 강제로 채우지 않고 그래도 부족하면 포기하는 이유).
 * 기존 THEME_TIER_MAX_SHARE(50%)보다는 작게, FALLBACK_TIER_MAX_SHARE(40%)보다도 작게 잡아 이 floor가
 * 다양성(FOOD/EXPERIENCE 등 다른 필수 카테고리) 자체를 밀어내지 않도록 한다.
 */
/** 코스 편집 중에도 자동 생성과 같은 핵심 테마 권장 비중을 advisory 기준으로 재사용한다. */
export const CORE_THEME_FLOOR_SHARE = 0.3;

/** 카테고리 하나를 이름순 정렬 후, 템플릿+카테고리 조합 해시로 정한 위치부터 시작하도록 순환시킨다.
 * 입력 pool을 복사만 하고 원본은 건드리지 않는다. */
function rotatedCategoryPool(template: StrategyTemplate, cat: PoiCategoryCode, pool: PoiLike[]): PoiLike[] {
  const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  if (sorted.length === 0) return sorted;
  const offset = templateHash(`${template.id}:${cat}`) % sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}

/**
 * POI 후보가 이 전략에서 실제로 관련성이 확인되는 테마와 얼마나 맞는지(2026-08-15, POI 후보 선정 품질
 * 개선). 0(구조 신호로 확인된 일치)이 가장 우선이고, 2(확인 불가/불일치)가 가장 낮다 — 가나다순/해시
 * 회전(deterministic tie-break)보다 이 관련성을 먼저 본다는 것이 이번 변경의 핵심이다. `themeCategories`가
 * 비어 있으면(전략 자체에도 핵심 테마가 없고 사용자도 선호 테마를 입력하지 않은 경우) 비교할 대상이
 * 없으므로 전부 동일 tier(2)로 취급해 기존 순서를 그대로 유지한다(회귀 없음).
 *
 * `classifyStructuralPoiThemes`(poiFit.ts와 동일한 함수 재사용, 새 판정 로직을 만들지 않는다)로 확인되는
 * 공식 분류가 있으면 그것만 근거로 쓰고, 없을 때만 이름 키워드(classifyThemes)로 fallback한다 — "구조
 * 신호 우선, 없으면 keyword fallback" 원칙을 여기서도 그대로 따른다. 구조 신호가 있지만 이 전략의 테마와
 * 명백히 다른 경우("강동 워터파크"류)는 tier 0을 받지 못해 구조 신호 없는 후보와 동일하게(tier 2) 취급될
 * 뿐, 별도로 더 낮은 tier로 떨어뜨리지는 않는다 — 최소 구조로 "관련성 높은 후보가 우선"만 보장한다.
 */
export function themeRelevanceTier(candidate: PoiLike, themeCategories: ThemeCategory[]): 0 | 1 | 2 {
  if (themeCategories.length === 0) return 2;
  const structural = classifyStructuralPoiThemes(candidate.lclsSystm1, candidate.lclsSystm2);
  if (structural.some((c) => themeCategories.includes(c))) return 0;
  const keyword = classifyThemes([candidate.name]);
  if (keyword.some((c) => themeCategories.includes(c))) return 1;
  return 2;
}

function selectPois(
  template: StrategyTemplate,
  poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>>,
  duration: DurationCode,
  preferredThemeCategories: ThemeCategory[] = [],
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

  // 후보 랭킹에 쓰는 "관련성 있는 테마" 집합(2026-08-15) — 사용자가 입력한 선호 테마와 전략 자체의
  // 핵심 테마(templateCoreThemeCategories, THEME_TEMPLATE_BONUS에서 도출)를 합친다. 사용자가
  // preferredThemes를 입력하지 않았어도(Production에서 실제로 흔한 경우) 전략 자체가 정체성으로 갖는
  // 테마(예: CULTURE_HISTORY 전략의 CULTURE_HISTORY 테마)가 있으면 그것만으로도 후보 랭킹에 반영된다.
  const rankingThemeCategories = [...new Set([...preferredThemeCategories, ...templateCoreThemeCategories(template.id)])];

  // 동일 시설 중복 억제(2026-08-16): SHOPPING 카테고리에 한해(전국 좌표 분포 조사 근거는 poiDedup.ts
  // 참고), 완전히 동일한 좌표를 가진 후보 그룹을 대표 1건으로 좁힌다. DB 원본은 바꾸지 않고 이 전략의
  // 후보 배열만 좁힌다 — 대표 선택은 이 전략의 관련성 tier(구조 신호 우선, 키워드 fallback)를 먼저
  // 보고, 동률이면 기존 이름 가나다순 tie-break를 그대로 쓴다(새 유명도 점수를 만들지 않는다). SHOPPING
  // 외 카테고리는 동일 좌표라도 서로 다른 콘텐츠(다른 날짜의 축제, 같은 리조트의 다른 동 등)인 사례가
  // 있어 건드리지 않는다.
  if (poisByCategory.SHOPPING && poisByCategory.SHOPPING.length > 0) {
    poisByCategory = {
      ...poisByCategory,
      SHOPPING: dedupeBySameCoordinates(poisByCategory.SHOPPING, (group) => {
        if (group.length === 1) return group[0];
        return [...group].sort((a, b) => {
          const tierA = themeRelevanceTier(a, rankingThemeCategories);
          const tierB = themeRelevanceTier(b, rankingThemeCategories);
          if (tierA !== tierB) return tierA - tierB;
          return a.name.localeCompare(b.name, "ko");
        })[0];
      }),
    };
  }

  // 우선순위 티어: ① 템플릿 핵심 카테고리 → ② 선호 테마 카테고리(2026-08-10) → ③ 지역 소비 접점
  // 보완 카테고리 → ④ 나머지 비숙박 카테고리. 테마 티어를 hard filter가 아니라 우선순위로만 넣어,
  // 테마 POI가 존재하면 먼저 채워지되 부족하면 자연스럽게 다음 티어로 넘어간다(코스 생성 실패 없음).
  const coreCats: PoiCategoryCode[] = template.poiCategories.filter((c) => c !== "LODGING");
  const themeCats = themePreferredPoiCategories(preferredThemeCategories).filter((c) => !coreCats.includes(c));
  const supplementCats = TOUCHPOINT_SUPPLEMENT_CATEGORIES.filter(
    (c) => !coreCats.includes(c) && !themeCats.includes(c),
  );
  const fallbackCats = ALL_NON_LODGING_CATEGORIES.filter(
    (c) => !coreCats.includes(c) && !themeCats.includes(c) && !supplementCats.includes(c),
  );
  const priorityTiers = [coreCats, themeCats, supplementCats, fallbackCats];

  const rotatedPools = new Map<PoiCategoryCode, PoiLike[]>();
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
  // 여기서 건너뛰되 selectedIds에만 반영하므로, 아래 일반 티어 루프에서는 건너뛴 카페도 포함해 다시
  // 훑을 수 있다 — 일반 방문 후보로 선택될 기회를 잃지 않는다.
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

  /** 회전 순서 기준 다음 미선택 후보 — 좌표가 없어 거리 판단이 불가능할 때의 fallback이다.
   * 2026-08-15: 이제 "다음 순번"을 그대로 받지 않고, 미선택 후보 전체에서 관련성 tier가 가장 낮은(=가장
   * 관련 있는) 후보를 먼저 찾는다 — 같은 tier 안에서는 원래 회전 순서(가장 먼저 나온 후보)로 동점을
   * 깨므로 결정론성은 그대로 유지된다("관련성 > deterministic tie-break"). rankingThemeCategories가
   * 비어 있으면 모든 후보가 동일 tier(2)이므로 기존 동작과 완전히 같다(회귀 없음). */
  const pickNextByRotation = (cat: PoiCategoryCode): PoiLike | null => {
    const rotated = poolFor(cat);
    let best: PoiLike | null = null;
    let bestTier = 3;
    for (const candidate of rotated) {
      if (selectedIds.has(candidate.id)) continue;
      const tier = themeRelevanceTier(candidate, rankingThemeCategories);
      if (tier < bestTier) {
        bestTier = tier;
        best = candidate;
        if (tier === 0) break; // 가장 좋은 tier를 이미 찾았고, 이후 후보는 회전 순서상 늦으므로 더 볼 필요 없다.
      }
    }
    return best;
  };

  /** 해당 카테고리에서 다음으로 선택할 후보 하나. 이미 선택된 POI의 무게중심과 후보 좌표가 모두 있으면
   * 그 중심에 가장 가까운 후보를 우선한다(1단계: 가까운 POI 우선 선택 + 공간적 응집). 좌표가 없는
   * 후보뿐이면(기존 데이터/테스트) 기존 회전 순서 그대로 동작해 회귀가 없다. 동일 거리(반올림 오차
   * 이내)면 회전 순서로 동점을 깬다 — 완전히 결정론적이다.
   * 2026-08-15: 거리보다 먼저 관련성 tier를 비교한다 — 같은 카테고리 안에서 테마가 명확히 확인되는
   * 후보를 우선 소진한 뒤에만 거리 기반 선택으로 넘어간다(장거리 이동 정책·CORE_MINIMUM_RESERVE는
   * 그대로 두고, 이 함수가 "어떤 후보를 먼저 고려하는지"만 바꾼다). */
  const pickNext = (cat: PoiCategoryCode): PoiLike | null => {
    const centroid = currentCentroid();
    if (!centroid) return pickNextByRotation(cat);

    const rotated = poolFor(cat);
    const unselectedWithCoords = rotated
      .map((candidate, rotationIndex) => ({ candidate, rotationIndex }))
      .filter(({ candidate }) => !selectedIds.has(candidate.id) && hasPoiCoords(candidate));
    if (unselectedWithCoords.length === 0) return pickNextByRotation(cat);

    unselectedWithCoords.sort((a, b) => {
      const tierA = themeRelevanceTier(a.candidate, rankingThemeCategories);
      const tierB = themeRelevanceTier(b.candidate, rankingThemeCategories);
      if (tierA !== tierB) return tierA - tierB;
      const da = haversineDistanceKm(centroid, a.candidate as PoiLike & GeoPoint);
      const db = haversineDistanceKm(centroid, b.candidate as PoiLike & GeoPoint);
      if (Math.abs(da - db) > 0.01) return da - db;
      return a.rotationIndex - b.rotationIndex;
    });
    return unselectedWithCoords[0].candidate;
  };

  // 전략 핵심 테마 최소 확보(2026-08-16): 아래 priorityTiers 루프는 core 카테고리를 균등 라운드로빈으로
  // 채우기 때문에, 핵심 테마를 담당하는 카테고리(coreThemeCarrierCats, 예: CULTURE_HISTORY→ATTRACTION)가
  // FOOD 등 다른 core 카테고리와 같은 비중만 배정받는다. 라운드로빈 전에 이 카테고리들만 먼저
  // CORE_THEME_FLOOR_SHARE만큼 우선 채운다 — templateCoreThemeCategories(선호 테마가 아니라 전략 자체의
  // 핵심 테마만 기준)로 확인되는 관련 후보(구조 신호 우선, 없으면 키워드 fallback)만 채택하고, 그런
  // 후보가 더 없으면 강제로 채우지 않고 그대로 둔다(공급 부족 지역은 기존처럼 아래 라운드로빈이 나머지를
  // 처리). 핵심 테마 자체가 없는 템플릿(coreThemeCarrierCats가 빈 배열)은 이 블록이 전혀 동작하지 않아
  // 기존 동작과 동일하다(회귀 없음).
  const templateCoreThemes = templateCoreThemeCategories(template.id);
  const coreThemeCarrierCats = themePreferredPoiCategories(templateCoreThemes).filter((c) => coreCats.includes(c));
  if (coreThemeCarrierCats.length > 0) {
    const pickNextForThemeFloor = (cat: PoiCategoryCode): PoiLike | null => {
      for (const candidate of poolFor(cat)) {
        if (selectedIds.has(candidate.id)) continue;
        if (themeRelevanceTier(candidate, templateCoreThemes) < 2) return candidate;
      }
      return null;
    };
    const themeFloorTarget = Math.min(
      nonLodgingTarget - selectedIds.size,
      Math.max(1, Math.ceil(nonLodgingTarget * CORE_THEME_FLOOR_SHARE)),
    );
    let themeFloorFilled = 0;
    let themeFloorProgressed = true;
    while (themeFloorProgressed && themeFloorFilled < themeFloorTarget) {
      themeFloorProgressed = false;
      for (const cat of coreThemeCarrierCats) {
        if (themeFloorFilled >= themeFloorTarget) break;
        const picked = pickNextForThemeFloor(cat);
        if (!picked) continue;
        selectedIds.add(picked.id);
        selectionOrder.push(picked);
        registerCoords(picked);
        const list = selectedByCategory[cat] ?? [];
        list.push(picked);
        selectedByCategory[cat] = list;
        themeFloorFilled++;
        themeFloorProgressed = true;
      }
    }
  }

  // 티어 안에서는 카테고리를 순환하며 한 개씩 뽑아 균형 있게 채우고, 목표에 못 미치면 다음 티어로 내려간다.
  // P0-3(2026-07-27): 마지막 티어(fallbackCats, 템플릿과 무관한 나머지 카테고리)만은 목표를 끝까지
  // 채우지 않는다 — core+supplement 후보가 부족하다고 해서 전략과 무관한 카테고리로 억지로 채우면
  // "전략과 무관한 음식점/캠핑장이 주요 관광지 자리를 차지"하는 문제가 생긴다. 대신 fallback 기여분을
  // 목표치의 일부(FALLBACK_TIER_MAX_SHARE)로 제한하고, 그래도 못 채우면 더 짧은 코스로 남긴다(빈
  // 자리를 부정확한 장소로 채우지 않는다는 원칙).
  const fallbackTierMaxCount = Math.ceil(nonLodgingTarget * FALLBACK_TIER_MAX_SHARE);
  // 선호 테마 티어도 같은 방식으로 상한을 둔다 — 테마가 단일 카테고리(예: FOOD)만 가리켜도 코스 전체가
  // 그 카테고리로 도배되지 않고, 상한 이후 남은 자리는 supplement/fallback 티어가 채운다(다양성 유지).
  const themeTierMaxCount = Math.ceil(nonLodgingTarget * THEME_TIER_MAX_SHARE);
  for (const tier of priorityTiers) {
    const isFallbackTier = tier === fallbackCats;
    const isThemeTier = tier === themeCats;
    const tierLimit = isFallbackTier
      ? Math.min(nonLodgingTarget, selectedIds.size + fallbackTierMaxCount)
      : isThemeTier
        ? Math.min(nonLodgingTarget, selectedIds.size + themeTierMaxCount)
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
  touchpoints: ConsumptionTouchpoints,
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
      ? `${supplyReason} · ${roleLabel(role)} 적합도 ${breakdown.roleFit}점 — ${breakdown.roleFitReason ?? "기획 규칙 반영"}`
      : supplyReason,
  );

  reasons.push(
    breakdown.seasonFit >= 80
      ? `여행 시기가 이 전략의 성수기(${template.idealMonths.join(", ")}월)와 잘 맞아 시즌 적합도 ${breakdown.seasonFit}점`
      : `여행 시기가 성수기(${template.idealMonths.join(", ")}월)와 다소 어긋나 시즌 적합도 ${breakdown.seasonFit}점`,
  );

  const metricReason = buildMetricGroundedReason(dna, touchpoints);
  if (metricReason) reasons.push(metricReason);

  return reasons;
}

/**
 * 2026-07-29(2차 개선 Section 5): 핵심 관광 지표(방문자수 증감률, 체류/소비 지수)를 실제 선택된 전략의
 * 소비 접점(touchpoints)과 연결해 "왜 이 전략인가"를 설명한다. dna.demand.evidence에 저장된 화면
 * 표시용 증감률(전년 동월 우선, DEMAND_VISITOR_GROWTH_DISPLAY)이 없으면 아무 문장도 만들지 않는다 —
 * 존재하지 않는 비교 지역 평균이나 실측되지 않은 체류/소비 데이터를 지어내지 않는다. 근거가 있어도
 * 뚜렷한 패턴(방문자↑+체류·소비 약세, 방문자↓+수요 강세)에 해당하지 않으면 과장 없이 제한된 일반
 * 문구로 대체한다(Section 5 명시 허용 범위).
 */
function buildMetricGroundedReason(dna: DnaResult, touchpoints: ConsumptionTouchpoints): string | null {
  const growthEvidence = dna.demand.evidence.find(
    (e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY,
  );
  if (!growthEvidence) return null;

  const percent = growthEvidence.rawValue;
  const basisLabel = growthEvidence.appliedRule.startsWith("전년 동월") ? "전년 동월 대비" : "직전 확인월 대비";
  const growthText = `${basisLabel} ${formatSignedPercent(percent)}`;

  if (percent > 0 && dna.stay.score !== null && dna.stay.score < 50 && touchpoints.lodging) {
    return `방문자는 ${growthText}했지만 체류 지표는 비교군 내 상대적으로 낮습니다(${dna.stay.score}점). 신규 방문객 유치보다 체류형·숙박 연계를 우선 추천합니다.`;
  }
  if (percent > 0 && dna.spend.score !== null && dna.spend.score < 50 && (touchpoints.food || touchpoints.experience)) {
    return `방문자는 ${growthText}했지만 소비 지표는 비교군 내 상대적으로 낮습니다(${dna.spend.score}점). 유료 체험·로컬 상품 연계를 우선 추천합니다.`;
  }
  if (percent < 0 && dna.demand.score !== null && dna.demand.score >= 60) {
    return `방문자는 ${growthText}했지만 수요 적합도는 비교군 내 상대적으로 높습니다(${dna.demand.score}점). 강점 테마 중심의 명확한 타깃 상품을 우선 추천합니다.`;
  }
  return `방문자는 ${growthText}했습니다. 현재 확보된 방문자 및 관광 지표를 바탕으로 이 전략을 추천합니다.`;
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
  // computeTargetFit도 템플릿마다 classifyThemes를 다시 호출하지만(순수 함수라 결과는 항상 같음),
  // POI 선택 단계(selectPois)는 템플릿과 무관하게 동일한 값을 쓰므로 루프 밖에서 한 번만 계산한다.
  const preferredThemeCategories = classifyThemes(input.preferredThemes);

  const scored = candidates.map((template) => {
    const demandFit = weightedAxisFit(template.demandAxisWeights, dna);
    const supplyFit = weightedAxisFit(template.supplyAxisWeights, dna);
    const seasonFit = computeSeasonFit(input.travelMonth, template.idealMonths);
    const { score: targetFit } = computeTargetFit(template, input);
    const { score: feasibilityFit } = computeFeasibilityFit(template, input);
    const { score: roleFit, adjustment: roleAdjustment } = computeRoleFit(template, input.role);

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

    const breakdown: StrategyScoreBreakdown = {
      demandFit,
      supplyFit,
      seasonFit,
      targetFit,
      feasibilityFit,
      roleFit,
      ...(roleAdjustment ? { roleFitReason: roleAdjustment.reason } : {}),
    };
    const { poiIds, touchpoints } = selectPois(template, poisByCategory, input.duration, preferredThemeCategories);

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
    reasons: buildReasons(s.template, s.breakdown, dna, input.role, s.touchpoints),
    targetDescription: s.template.targetDescriptionTemplate,
    poiIds: s.poiIds,
    consumptionTouchpoints: s.touchpoints,
    risks: s.template.riskTemplates,
    evidences: s.evidences,
    modelVersion,
    coreProblem: s.template.coreProblem,
    coreResource: s.template.coreResource,
    stayStyle: s.template.stayStyle,
    executionDifficulty: s.template.executionDifficulty,
    expectedEffect: s.template.expectedEffect,
  }));
}
