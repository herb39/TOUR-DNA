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
  const coreCats = template.poiCategories.filter((c) => c !== "LODGING");
  if (category === "LODGING") return template.poiCategories.includes("LODGING") ? "CORE" : "FALLBACK";
  if (coreCats.includes(category)) return "CORE";
  const supplementCats = TOUCHPOINT_SUPPLEMENT_CATEGORIES.filter((c) => !coreCats.includes(c));
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
 * 계산에서도 제외해, "데이터가 없어서 낮은 점수"와 "실제로 안 맞아서 낮은 점수"를 구분한다. */
const CATEGORY_TIER_SCORE: Record<PoiCategoryTier, number> = {
  CORE: 45,
  SUPPLEMENT: 25,
  FALLBACK: 10,
};
const THEME_MATCH_SCORE = 35;
const SEASON_MATCH_SCORE = 20;

export type PoiFitGrade = "HIGH" | "MEDIUM" | "LOW";

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
  const themeEvaluated = context.preferredThemes.length > 0;
  const preferredCategories = themeEvaluated ? new Set(classifyThemes(context.preferredThemes)) : null;
  const poiThemeCategories = themeEvaluated ? classifyThemes([input.name]) : [];
  const themeMatched = themeEvaluated ? poiThemeCategories.some((c) => preferredCategories!.has(c)) : false;
  const themeScore = themeEvaluated && themeMatched ? THEME_MATCH_SCORE : 0;

  const isIdealMonth = context.template.idealMonths.includes(context.travelMonth);
  const seasonScore = isIdealMonth ? SEASON_MATCH_SCORE : 0;

  const maxScore = CATEGORY_TIER_SCORE.CORE + (themeEvaluated ? THEME_MATCH_SCORE : 0) + SEASON_MATCH_SCORE;
  const rawScore = categoryScore + themeScore + seasonScore;
  const totalScore = Math.round((rawScore / maxScore) * 100);

  const grade: PoiFitGrade = totalScore >= 70 ? "HIGH" : totalScore >= 40 ? "MEDIUM" : "LOW";

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

  const provenance = input.sourceType === "API" ? "LIVE_API" : "CURATED";
  const sourceLabel = input.sourceType === "API" ? "실제 공공데이터 동기화 결과" : "관리자가 정리한 데이터(큐레이션)";

  return {
    totalScore,
    grade,
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
