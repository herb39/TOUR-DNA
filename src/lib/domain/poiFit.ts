import { classifyThemes } from "./audienceContext";
import type { PoiCategoryCode, StrategyTemplate } from "./strategyTemplates";
import { poiCategoryLabel } from "@/lib/format";

/**
 * 전략별 POI 적합성 평가(P0-1, 2026-07-30). 인기순·임의 순서가 아니라, 이 전략(template)에 대한
 * POI 개별 적합도를 실제 데이터(카테고리, 이름, 여행월, 데이터 출처, 운영시간 확인 여부)만으로
 * 결정론적으로 계산한다 — 같은 입력이면 항상 같은 점수가 나오고, 확인할 수 없는 항목(예: 실제 매출·
 * 방문객 수, 정확한 영업시간)은 추정하지 않고 평가에서 제외하거나 "확인 필요"로만 표시한다.
 */

/** POI 카테고리가 이 전략에서 차지하는 위치. strategy.ts의 selectPois가 이미 쓰는 우선순위 티어
 * (핵심 → 지역 소비 접점 보완 → 나머지)와 같은 개념을 재사용한다 — 순환 의존을 피하기 위해 strategy.ts를
 * import하지 않고 같은 판정 규칙만 이 파일에 독립적으로 둔다. 이 배열을 바꿀 때는 strategy.ts의
 * TOUCHPOINT_SUPPLEMENT_CATEGORIES도 함께 맞춰야 화면 적합도와 실제 선택 로직이 어긋나지 않는다. */
export type PoiCategoryTier = "CORE" | "SUPPLEMENT" | "FALLBACK";

const TOUCHPOINT_SUPPLEMENT_CATEGORIES: PoiCategoryCode[] = ["FOOD", "EXPERIENCE", "SHOPPING"];

export function classifyPoiCategoryTier(template: StrategyTemplate, category: PoiCategoryCode): PoiCategoryTier {
  // coreCats에 명시적으로 PoiCategoryCode[] 타입을 지정한다 — 지정하지 않으면 TypeScript가
  // `c !== "LODGING"` 비교를 타입 predicate로 자동 추론해 LODGING이 빠진 좁은 타입으로 좁혀버려서,
  // 아래에서 원래 PoiCategoryCode 값을 넣으려는 includes() 호출이 타입 오류가 난다.
  const coreCats: PoiCategoryCode[] = template.poiCategories.filter((c) => c !== "LODGING");
  if (category === "LODGING") return template.poiCategories.includes("LODGING") ? "CORE" : "FALLBACK";
  if (coreCats.includes(category)) return "CORE";
  const supplementCats: PoiCategoryCode[] = TOUCHPOINT_SUPPLEMENT_CATEGORIES.filter((c) => !coreCats.includes(c));
  if (supplementCats.includes(category)) return "SUPPLEMENT";
  return "FALLBACK";
}

export const POI_CATEGORY_TIER_LABEL_KO: Record<PoiCategoryTier, string> = {
  CORE: "전략 핵심 카테고리",
  SUPPLEMENT: "지역 소비 접점 보완 카테고리",
  FALLBACK: "전략과 직접 관련은 낮은 보완 후보",
};

/** 항목별 배점(결정론적 상수) — 합계 100점이 아니라 "평가된 항목의 만점 합"을 분모로 재정규화한다
 * (아래 computePoiFit 참고). 선호 테마를 아예 입력하지 않은 경우처럼 확인할 수 없는 항목은 만점
 * 계산에서도 제외해, "데이터가 없어서 낮은 점수"와 "실제로 안 맞아서 낮은 점수"를 구분한다.
 *
 * 2026-07-30(통합 검증): 카테고리 배점을 처음(CORE 45)보다 낮췄다 — 경주 문화·역사 전략으로 실제
 * 브라우저 검증을 해보니, "워터파크"·"캠핑장"처럼 카테고리(ATTRACTION/EXPERIENCE)만 이 전략의
 * poiCategories에 속할 뿐 실제로는 문화·역사와 무관한 장소가 테마 불일치에도 불구하고 카테고리
 * 배점만으로 "적합도 보통"을 받는 문제가 확인됐다. `template.poiCategories`는 원래 "이 전략이 주로
 * 다루는 후보군"이라는 느슨한 신호일 뿐 "테마가 실제로 맞다"는 근거가 아니므로, 실제 장소명 키워드로
 * 확인하는 테마 일치(THEME_MATCH_SCORE)보다 낮은 가중치를 둔다. */
const CATEGORY_TIER_SCORE: Record<PoiCategoryTier, number> = {
  CORE: 30,
  SUPPLEMENT: 15,
  FALLBACK: 6,
};
const THEME_MATCH_SCORE = 45;
const SEASON_MATCH_SCORE = 20;

export type PoiFitGrade = "HIGH" | "MEDIUM" | "LOW";

/**
 * 실행안 추천 포함 여부 판정(2026-07-30, 저적합 POI 추천 제외 보완). 단순히 grade==="LOW"라고 해서
 * 전부 제외하면, 실제로는 "정보가 부족해서 낮게 나온 것"과 "실제 근거가 있어 안 맞다고 확인된 것"이
 * 뒤섞여 정당한 이유 없이 제외될 위험이 있다.
 * - RECOMMENDED: grade가 LOW가 아니거나(그대로 추천), 아래 REQUIRED_SLOT.
 * - BELOW_MINIMUM_FIT: grade가 LOW이면서, 실제로 확인 가능한 부정적 근거가 있는 경우 — 카테고리
 *   자체가 이 전략과 전혀 무관한 FALLBACK 티어이거나(항상 확실한 데이터), 사용자가 실제로 입력한
 *   선호 테마와 장소명 키워드가 명백히 불일치(themeFit.evaluated===true && matched===false, 사용자
 *   선호가 실제로 존재하는데 이름에서 그 근거를 찾지 못함)하는 경우. 실행안 추천에서 제외한다.
 * - INSUFFICIENT_EVALUATION_DATA: grade가 LOW이지만 위 두 근거 중 어느 것도 해당하지 않는 경우 —
 *   보통 사용자가 선호 테마 자체를 입력하지 않아(themeFit.evaluated===false) 테마 판단 근거가 없이
 *   카테고리+계절만으로 낮게 나온 경우다. 실제로 안 맞다는 근거가 없으므로 제외하지 않는다.
 * - REQUIRED_SLOT: FOOD/LODGING처럼 일정 구성상 반드시 필요한 역할 — 등급과 무관하게 항상 유지한다.
 */
export type PoiRecommendationStatus =
  | "RECOMMENDED"
  | "BELOW_MINIMUM_FIT"
  | "INSUFFICIENT_EVALUATION_DATA"
  | "REQUIRED_SLOT";

/** FOOD/LODGING은 일정 구성상 필수 슬롯 역할이라 일반 관광 POI 필터링 대상에서 제외한다(2026-07-30).
 * 코드에 명시적으로 분리해 두어 일반 관광 POI 판정 로직과 섞이지 않게 한다. */
const REQUIRED_SLOT_CATEGORIES: PoiCategoryCode[] = ["FOOD", "LODGING"];
export function isRequiredSlotCategory(category: PoiCategoryCode): boolean {
  return REQUIRED_SLOT_CATEGORIES.includes(category);
}

export interface PoiFitInput {
  id: string;
  name: string;
  category: PoiCategoryCode;
  /** Prisma PoiSourceType 문자열("API" | "FIXTURE") 그대로 받는다 — domain 계층은 Prisma를 몰라야
   * 하므로 열거형이 아니라 string으로 받고, 알 수 없는 값은 안전하게 CURATED로 취급한다. */
  sourceType: string;
  operatingHours: string | null;
  closedDays: string | null;
}

export interface PoiFitContext {
  template: StrategyTemplate;
  travelMonth: number;
  preferredThemes: string[];
}

export interface PoiFitResult {
  totalScore: number; // 0~100(평가된 항목만으로 재정규화)
  grade: PoiFitGrade;
  recommendationStatus: PoiRecommendationStatus;
  breakdown: {
    categoryFit: { score: number; tier: PoiCategoryTier };
    /** evaluated=false면 선호 테마 자체가 입력되지 않아 이 항목을 점수에 포함하지 않았다는 뜻이다
     * (matched는 항상 false로 두되, 화면에서는 evaluated로 "평가 제외"와 "불일치"를 구분해야 한다). */
    themeFit: { score: number; evaluated: boolean; matched: boolean };
    seasonFit: { score: number; isIdealMonth: boolean };
  };
  /** 점수 계산에 실제로 반영된 근거만 문장화한다 — 계산에 안 쓰인 근거를 덧붙이지 않는다. */
  positiveReasons: string[];
  /** 감점 요소이거나, 점수화하지는 않았지만 사용자가 확인해야 하는 사항(운영시간 등)을 함께 담는다. */
  cautions: string[];
  dataSource: {
    provenance: "LIVE_API" | "CURATED";
    sourceLabel: string;
    operatingHoursConfirmed: boolean;
    operatingHoursText: string | null;
    closedDaysText: string | null;
  };
}

export function computePoiFit(input: PoiFitInput, context: PoiFitContext): PoiFitResult {
  const tier = classifyPoiCategoryTier(context.template, input.category);
  const categoryScore = CATEGORY_TIER_SCORE[tier];

  // 테마 일치는 사용자가 실제로 선택한 preferredThemes(자유 텍스트)와 POI 이름에 같은 키워드 분류
  // 기준(classifyThemes, audienceContext.ts)을 그대로 적용해 교집합이 있는지만 확인한다 — 새 분류
  // 체계를 만들지 않고 기존 전략 매칭 로직을 재사용한다. 선호 테마가 없으면 "불일치(0점)"가 아니라
  // "평가 제외"로 처리해 만점 계산에서도 뺀다.
  //
  // 2026-08-13(강릉 코스 밀도 버그 수정): 선호 테마가 순수 "미식(FOOD)" 단독일 때, FOOD가 아닌
  // 카테고리(ATTRACTION 등)에도 무조건 "미식" 이름 키워드 일치를 요구하면, FOOD 테마 여행에서
  // ATTRACTION CORE POI(예: 해변)가 "이름에 미식 키워드가 없다"는 이유만으로 BELOW_MINIMUM_FIT
  // 처리돼 코스에서 통째로 빠지는 문제가 있었다(실제 강릉 프로젝트에서 재현·확인 — 1박2일 코스가
  // 식당 3곳뿐이었던 원인). 미식 테마는 "식음 경험이 핵심 anchor이고 관광/체험/숙박과 연결되는
  // 여행"이라는 뜻이지 "모든 방문지가 식당"이라는 뜻이 아니므로, FOOD가 아닌 카테고리에 미식
  // 키워드 매칭을 강제하지 않는다(테마 평가 자체를 이 POI에는 적용하지 않음 — 선호 테마 미입력과
  // 동일하게 "평가 제외"). 다른 테마(문화·역사/자연·웰니스 등)나 테마가 여러 개 섞인 경우는 건드리지
  // 않는다 — 테마별로 동일 정책을 강제하지 않고, 카테고리만으로 확정하기 어려운 테마(예:
  // CULTURE_HISTORY의 EXPERIENCE — "워터파크"류 오인 방지, 2026-07-30)는 기존 보수 정책을 그대로
  // 유지한다.
  const themeCategories = context.preferredThemes.length > 0 ? classifyThemes(context.preferredThemes) : [];
  const isPureFoodTheme = themeCategories.length === 1 && themeCategories[0] === "FOOD";
  const categoryIsThemeRelevant = !isPureFoodTheme || input.category === "FOOD";
  const themeEvaluated = context.preferredThemes.length > 0 && categoryIsThemeRelevant;
  const preferredCategories = themeEvaluated ? new Set(themeCategories) : null;
  const poiThemeCategories = themeEvaluated ? classifyThemes([input.name]) : [];
  const themeMatched = themeEvaluated ? poiThemeCategories.some((c) => preferredCategories!.has(c)) : false;
  const themeScore = themeEvaluated && themeMatched ? THEME_MATCH_SCORE : 0;

  const isIdealMonth = context.template.idealMonths.includes(context.travelMonth);
  const seasonScore = isIdealMonth ? SEASON_MATCH_SCORE : 0;

  const maxScore = CATEGORY_TIER_SCORE.CORE + (themeEvaluated ? THEME_MATCH_SCORE : 0) + SEASON_MATCH_SCORE;
  const rawScore = categoryScore + themeScore + seasonScore;
  const totalScore = Math.round((rawScore / maxScore) * 100);

  // 2026-07-30(통합 검증): 카테고리만 일치하고 테마가 명백히 불일치하는 경우(예: CORE+계절 일치,
  // 테마 불일치 → 100점 만점에 약 53점)가 "적합도 낮음"으로 분류되도록 MEDIUM 하한을 55로 올렸다
  // (기존 40이었을 때는 이런 경우도 "보통"으로 표시돼 실제로는 무관한 장소가 그럴듯해 보였다).
  const grade: PoiFitGrade = totalScore >= 75 ? "HIGH" : totalScore >= 55 ? "MEDIUM" : "LOW";

  // 2026-07-30(저적합 POI 추천 제외 보완): FOOD/LODGING은 등급과 무관하게 필수 슬롯으로 유지한다.
  // 일반 관광 POI 중 LOW는 "실제 확인 가능한 부정적 근거가 있는 경우"만 제외 대상(BELOW_MINIMUM_FIT)
  // 으로 판정하고, 그 근거가 없으면(선호 테마 자체를 안 정해 테마 판단 근거가 없는 경우 등)
  // INSUFFICIENT_EVALUATION_DATA로 남겨 임의로 부적합 취급하지 않는다.
  let recommendationStatus: PoiRecommendationStatus;
  if (isRequiredSlotCategory(input.category)) {
    recommendationStatus = "REQUIRED_SLOT";
  } else if (grade !== "LOW") {
    recommendationStatus = "RECOMMENDED";
  } else {
    const hasConfirmedNegativeEvidence = tier === "FALLBACK" || (themeEvaluated && !themeMatched);
    recommendationStatus = hasConfirmedNegativeEvidence ? "BELOW_MINIMUM_FIT" : "INSUFFICIENT_EVALUATION_DATA";
  }

  const positiveReasons: string[] = [];
  const cautions: string[] = [];

  const categoryLabel = poiCategoryLabel(input.category);
  if (tier === "CORE") {
    positiveReasons.push(`${context.template.name} 전략의 ${POI_CATEGORY_TIER_LABEL_KO.CORE}(${categoryLabel})와 일치합니다.`);
  } else if (tier === "SUPPLEMENT") {
    positiveReasons.push(`${POI_CATEGORY_TIER_LABEL_KO.SUPPLEMENT}입니다(${categoryLabel} — 식음료·체험·쇼핑 등 지역 소비 접점).`);
  } else {
    cautions.push(`${POI_CATEGORY_TIER_LABEL_KO.FALLBACK}입니다(${categoryLabel}).`);
  }

  if (themeEvaluated) {
    if (themeMatched) {
      positiveReasons.push("선택한 선호 테마와 장소명 키워드가 일치합니다.");
    } else {
      cautions.push("선호 테마와 일치하는 키워드를 장소명에서 확인하지 못했습니다(실제 성격은 다를 수 있어 별도 확인 권장).");
    }
  }

  if (isIdealMonth) {
    positiveReasons.push(`여행월(${context.travelMonth}월)이 이 전략의 성수기와 맞습니다.`);
  } else {
    cautions.push(`여행월(${context.travelMonth}월)이 이 전략의 성수기와는 다소 어긋납니다.`);
  }

  const operatingHoursConfirmed = Boolean(input.operatingHours && input.operatingHours.trim().length > 0);
  if (!operatingHoursConfirmed) {
    cautions.push("운영시간 정보가 확인되지 않았습니다 — 실제 상품 확정 전 별도로 확인해야 합니다.");
  }

  if (recommendationStatus === "BELOW_MINIMUM_FIT") {
    cautions.push("전략 적합 기준에 미달해 실행안 추천에서 제외되었습니다.");
  } else if (recommendationStatus === "INSUFFICIENT_EVALUATION_DATA") {
    cautions.push("현재 데이터만으로는 전략 적합 여부를 충분히 판단하기 어려워 추천에서 제외하지 않았습니다.");
  }

  const provenance = input.sourceType === "API" ? "LIVE_API" : "CURATED";
  const sourceLabel = input.sourceType === "API" ? "실제 공공데이터 동기화 결과" : "관리자가 정리한 데이터(큐레이션)";

  return {
    totalScore,
    grade,
    recommendationStatus,
    breakdown: {
      categoryFit: { score: categoryScore, tier },
      themeFit: { score: themeScore, evaluated: themeEvaluated, matched: themeMatched },
      seasonFit: { score: seasonScore, isIdealMonth },
    },
    positiveReasons,
    cautions,
    dataSource: {
      provenance,
      sourceLabel,
      operatingHoursConfirmed,
      operatingHoursText: input.operatingHours,
      closedDaysText: input.closedDays,
    },
  };
}

/** 이 판정 결과가 실행안 추천 목록에서 제외되어야 하는지 — 필터링 위치(코스 생성·요약 계산 등)마다
 * 같은 기준을 반복해서 하드코딩하지 않도록 단일 함수로 둔다. */
export function isExcludedFromRecommendation(fit: PoiFitResult): boolean {
  return fit.recommendationStatus === "BELOW_MINIMUM_FIT";
}

export interface PoiFilterResult<T> {
  recommended: T[];
  excluded: Array<{ poi: T; fit: PoiFitResult }>;
}

/**
 * 후보 목록에서 최소 적합 기준에 미달한 일반 관광 POI를 걸러낸다(2026-07-30, 저적합 POI 추천 제외
 * 보완). FOOD/LODGING(필수 슬롯)과 "정보 부족으로 낮게 나온" POI는 제외하지 않는다 — 제외 기준은
 * computePoiFit()의 recommendationStatus 판정 하나로 일원화해, 코스 생성(planService.ts)과 화면 표시
 * (poiFitService.ts) 양쪽이 같은 함수를 호출해 같은 결과를 얻도록 한다.
 */
export function filterRecommendablePois<T extends PoiFitInput>(
  pois: T[],
  context: PoiFitContext,
): PoiFilterResult<T> {
  const recommended: T[] = [];
  const excluded: Array<{ poi: T; fit: PoiFitResult }> = [];
  for (const poi of pois) {
    const fit = computePoiFit(poi, context);
    if (isExcludedFromRecommendation(fit)) {
      excluded.push({ poi, fit });
    } else {
      recommended.push(poi);
    }
  }
  return { recommended, excluded };
}
