import { classifyThemes, classifyStructuralPoiThemes } from "./audienceContext";
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
 * - CORE_MINIMUM_RESERVE(2026-08-13 추가): BELOW_MINIMUM_FIT 판정을 받았지만, 이 전략의 테마 핵심
 *   카테고리(FOOD/LODGING 제외 CORE)를 채울 다른 후보가 전혀 없어 `filterRecommendablePois`가 최소
 *   보존을 위해 코스에 되돌린 경우 — `applyCoreMinimumReserve` 참고. 실제로 코스에 포함되므로
 *   "제외되었다"고 표시하면 안 된다.
 */
export type PoiRecommendationStatus =
  | "RECOMMENDED"
  | "BELOW_MINIMUM_FIT"
  | "INSUFFICIENT_EVALUATION_DATA"
  | "REQUIRED_SLOT"
  | "CORE_MINIMUM_RESERVE";

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
  /** TourAPI 신 분류체계 대/중분류(2026-08-14, POI 추천 품질 2차 고도화 — classifyStructuralPoiThemes
   * 참고). Poi.rawPayload(Json)에서 꺼낸 값을 그대로 받는다 — 값이 없으면(FIXTURE, 구형 데이터, 미확인
   * 코드) 안전하게 이름 키워드 판정으로 fallback한다(하위 호환, 값을 넘기지 않는 기존 호출부도 그대로
   * 동작한다). */
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
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
    themeFit: {
      score: number;
      evaluated: boolean;
      matched: boolean;
      /** 이 판정에 실제로 쓰인 근거(2026-08-14) — "STRUCTURAL"은 TourAPI 공식 분류체계
       * (classifyStructuralPoiThemes), "KEYWORD"는 장소명 substring 매칭, evaluated=false면 "NONE". */
      source: "STRUCTURAL" | "KEYWORD" | "NONE";
    };
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

  // 2026-08-14(POI 추천 품질 2차 고도화): 이름 키워드보다 신뢰할 수 있는 공식 분류 신호
  // (classifyStructuralPoiThemes, TourAPI lclsSystm1/2)가 있으면 그것을 우선 쓰고, 없을 때만(FIXTURE,
  // 구형 데이터, 매핑 없는 코드) 기존 이름 키워드 판정으로 fallback한다(10절 "구조 신호 우선 원칙").
  // 실제 로컬 DB 검증(2026-08-14): 경주 첨성대·대릉원·천마총처럼 이름에 "문화"/"역사" 등 일반 키워드가
  // 전혀 없는 실제 사적지가, 구조 신호(lclsSystm1="HS")로는 확인되지만 기존 이름 키워드로는 전혀
  // 확인되지 않았다(경주 ATTRACTION 231건 중 124건이 이런 "구조 신호는 있지만 키워드로는 못 잡는" 사례).
  const structuralThemeCategories = classifyStructuralPoiThemes(input.lclsSystm1, input.lclsSystm2);
  const hasStructuralSignal = themeEvaluated && structuralThemeCategories.length > 0;
  const poiThemeCategories = themeEvaluated && !hasStructuralSignal ? classifyThemes([input.name]) : [];

  const themeMatched = hasStructuralSignal
    ? structuralThemeCategories.some((c) => preferredCategories!.has(c))
    : themeEvaluated
      ? poiThemeCategories.some((c) => preferredCategories!.has(c))
      : false;
  const themeMatchSource: "STRUCTURAL" | "KEYWORD" | "NONE" = !themeEvaluated
    ? "NONE"
    : hasStructuralSignal
      ? "STRUCTURAL"
      : "KEYWORD";
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
      positiveReasons.push(
        themeMatchSource === "STRUCTURAL"
          ? "한국관광공사 관광정보의 공식 분류상 선택한 선호 테마와 일치하는 유형입니다."
          : "선택한 선호 테마와 장소명 키워드가 일치합니다.",
      );
    } else {
      cautions.push(
        themeMatchSource === "STRUCTURAL"
          ? "한국관광공사 관광정보의 공식 분류상 선호 테마와 다른 유형으로 확인되었습니다(실제 성격은 다를 수 있어 별도 확인 권장)."
          : "선호 테마와 일치하는 키워드를 장소명에서 확인하지 못했습니다(실제 성격은 다를 수 있어 별도 확인 권장).",
      );
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
      themeFit: { score: themeScore, evaluated: themeEvaluated, matched: themeMatched, source: themeMatchSource },
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

export interface PoiFitEvaluation<T> {
  poi: T;
  fit: PoiFitResult;
}

const CORE_MINIMUM_RESERVE_CAUTION =
  "선호 테마와 일치하는 다른 후보가 없어, 전략 핵심 카테고리를 채우기 위해 최소한으로 포함되었습니다(실제 성격은 다를 수 있어 별도 확인 권장).";

/** BELOW_MINIMUM_FIT 판정의 cautions에서 "제외되었습니다" 문구를 CORE_MINIMUM_RESERVE 문구로
 * 바꾼, 상태만 다른 새 PoiFitResult를 만든다(원본은 변경하지 않는다 — 순수 함수 원칙 유지). */
function reclassifyAsCoreMinimumReserve(fit: PoiFitResult): PoiFitResult {
  const cautions = fit.cautions.filter((c) => c !== "전략 적합 기준에 미달해 실행안 추천에서 제외되었습니다.");
  cautions.push(CORE_MINIMUM_RESERVE_CAUTION);
  return { ...fit, recommendationStatus: "CORE_MINIMUM_RESERVE", cautions };
}

/** 카테고리 하나당 최소 보존으로 복구할 최대 개수(2026-08-14, 경주 "강동 워터파크" 등 낮은 품질
 * 보완 추천 과다 포함 문제 수정). "최소 보존"이라는 이름 그대로, 테마 근거가 불확실한 후보를 전부
 * 되돌리지 않고 카테고리당 이 개수만큼만 되돌린다 — 아래 applyCoreMinimumReserve 참고.
 *
 * 값 3은 대표 프로젝트(강릉/경주/제천) 실제 재분석 결과로 결정했다(임의로 정하지 않음) — 1이나 2로는
 * 코스가 지나치게 얇아졌다(예: 경주 3일차가 1곳뿐인 날이 생김, 목표 대비 부족 개수가 2곳→8~10곳으로
 * 급증). 3에서는 (a) 제천처럼 원래 카테고리당 탈락 후보가 3곳 이하인 경우 기존 코스 구성이 그대로
 * 유지되고, (b) 경주처럼 4곳 이상인 카테고리(ATTRACTION 6곳)만 상위 3곳으로 줄어 "강동 워터파크"
 * 같은 순위가 낮은 후보는 여전히 제외되면서도, 코스가 과도하게 비지 않는 균형점이었다. */
const RESERVE_PER_CATEGORY_LIMIT = 3;

/**
 * 전략의 테마 핵심 카테고리(FOOD/LODGING 제외 CORE)가 fit 필터링으로 완전히 0개가 되는 것을 막는
 * 최소 보존 정책(2026-08-13, 경주/제천 FOOD-only 코스 버그 수정 — 강릉과 같은 근본 원인의 일반화).
 *
 * FOOD/LODGING은 REQUIRED_SLOT이라 등급과 무관하게 항상 살아남지만, 같은 전략의 CORE 카테고리라도
 * ATTRACTION/EXPERIENCE는 테마 키워드가 이름에 없으면 BELOW_MINIMUM_FIT으로 탈락한다 — 실제 한국
 * POI 이름은 "문화"/"역사"/"웰니스" 같은 일반 테마 단어를 거의 포함하지 않으므로, 이 비대칭 때문에
 * 전략의 테마 핵심(sightseeing) 카테고리가 통째로 0개가 되고 코스가 FOOD(+LODGING)만으로 채워지는
 * 문제가 경주(CULTURE_HISTORY)·제천(NATURE_WELLNESS)에서도 재현됐다.
 *
 * 개별 POI의 판정 기준(computePoiFit) 자체를 완화하면 2026-07-30에 막은 "워터파크/캠핑장이 문화·역사로
 * 오인되는" 회귀가 다시 생기므로, 대신 평가 이후 단계에서 "이미 확인된(themeFit 근거가 실제로 일치하는)
 * CORE POI가 하나라도 있는가"만 확인해, 하나도 없을 때만 테마 근거 불확실로 배제됐던 CORE 후보의
 * recommendationStatus를 CORE_MINIMUM_RESERVE로 바꿔 되돌린다(BELOW_MINIMUM_FIT 그대로 두지 않음 —
 * 그러면 "제외됨" 문구가 실제로는 포함된 POI에 남아 화면 표시가 실제 코스 구성과 어긋난다). 이미 확인된
 * CORE POI가 하나라도 있으면 이 복귀 로직 자체가 발동하지 않으므로, 워터파크/캠핑장 시나리오처럼
 * "이미 좋은 후보가 있는 경우"는 그대로 보수적으로 유지된다(회귀 없음 — 테스트로 확인).
 *
 * **2026-08-14 수정 — 카테고리당 최소 개수(RESERVE_PER_CATEGORY_LIMIT)만 복구한다.** 기존에는 발동
 * 조건이 맞으면 해당 카테고리의 탈락 CORE 후보 *전부*를 되돌려, 실제로는 "최소 보존"이 아니라 "탈락한
 * 후보 그룹 전체 복구"가 되는 문제가 있었다(경주 실제 데이터: ATTRACTION 6곳이 전부 복구됨 — 그 중
 * 하나가 "강동 워터파크"였다). 이미 계산된 fit 점수(computePoiFit의 totalScore, 새 신호를 추가하지
 * 않고 재사용)가 높은 순으로 카테고리당 최대 RESERVE_PER_CATEGORY_LIMIT곳만 복구하고 나머지는 그대로
 * BELOW_MINIMUM_FIT으로 둔다 — "핵심 카테고리가 0개가 되지 않는다"는 원래 보장은 그대로 유지하면서
 * (카테고리별 최소 1곳은 여전히 채워짐), 낮은 품질 후보가 지나치게 많이 한꺼번에 코스에 들어오는 것만
 * 막는다. 점수가 동점이면(실제 데이터에서 흔함 — 테마 미매칭 후보는 카테고리+계절 점수만 같은 경우가
 * 많다) 원래 후보 순서(안정 정렬, `Array.prototype.sort`가 보장)로 동점을 깬다 — 이름 키워드 블랙리스트
 * 없이 결정론적이다.
 *
 * 코스 생성(filterRecommendablePois)과 화면 표시(poiFitService.ts의 buildStrategyPoiFitSummary)
 * 양쪽이 이 함수 하나를 공유해, "실제로 코스에 포함된 POI인데 배지에는 제외됐다고 표시되는" 불일치를
 * 만들지 않는다.
 */
export function applyCoreMinimumReserve<T extends PoiFitInput>(
  evaluations: PoiFitEvaluation<T>[],
  template: StrategyTemplate,
): PoiFitEvaluation<T>[] {
  const themeCoreCategories = template.poiCategories.filter((c) => !isRequiredSlotCategory(c));
  const hasConfirmedThemeCore = evaluations.some(
    (e) => !isExcludedFromRecommendation(e.fit) && themeCoreCategories.includes(e.poi.category),
  );
  if (hasConfirmedThemeCore) return evaluations;

  const recoverableByCategory = new Map<string, PoiFitEvaluation<T>[]>();
  for (const e of evaluations) {
    const isRecoverable =
      isExcludedFromRecommendation(e.fit) &&
      e.fit.breakdown.categoryFit.tier === "CORE" &&
      themeCoreCategories.includes(e.poi.category);
    if (!isRecoverable) continue;
    const list = recoverableByCategory.get(e.poi.category) ?? [];
    list.push(e);
    recoverableByCategory.set(e.poi.category, list);
  }

  const reservedIds = new Set<string>();
  for (const candidates of recoverableByCategory.values()) {
    const ranked = [...candidates].sort((a, b) => b.fit.totalScore - a.fit.totalScore);
    for (const e of ranked.slice(0, RESERVE_PER_CATEGORY_LIMIT)) {
      reservedIds.add(e.poi.id);
    }
  }

  return evaluations.map((e) =>
    reservedIds.has(e.poi.id) ? { poi: e.poi, fit: reclassifyAsCoreMinimumReserve(e.fit) } : e,
  );
}

/**
 * 후보 목록에서 최소 적합 기준에 미달한 일반 관광 POI를 걸러낸다(2026-07-30, 저적합 POI 추천 제외
 * 보완). FOOD/LODGING(필수 슬롯)과 "정보 부족으로 낮게 나온" POI는 제외하지 않는다 — 제외 기준은
 * computePoiFit()의 recommendationStatus 판정 하나로 일원화해, 코스 생성(planService.ts)과 화면 표시
 * (poiFitService.ts) 양쪽이 같은 함수를 호출해 같은 결과를 얻도록 한다. CORE_MINIMUM_RESERVE로
 * 재분류된 POI는 isExcludedFromRecommendation이 false를 반환하므로 자동으로 recommended에 포함된다.
 */
export function filterRecommendablePois<T extends PoiFitInput>(
  pois: T[],
  context: PoiFitContext,
): PoiFilterResult<T> {
  const evaluations = applyCoreMinimumReserve(
    pois.map((poi) => ({ poi, fit: computePoiFit(poi, context) })),
    context.template,
  );
  const recommended: T[] = [];
  const excluded: Array<{ poi: T; fit: PoiFitResult }> = [];
  for (const e of evaluations) {
    if (isExcludedFromRecommendation(e.fit)) excluded.push(e);
    else recommended.push(e.poi);
  }
  return { recommended, excluded };
}
