import { classifyStructuralPoiThemes, type ThemeCategory } from "./audienceContext";

export type PoiCurationStatusCode = "UNREVIEWED" | "APPROVED" | "REJECTED";
export type PoiRepresentationCode = "UNKNOWN" | "DESTINATION" | "SUPPORT" | "CONSUMPTION" | "LODGING";
export type PoiRecommendationStatus = "ALLOW" | "DEMOTE" | "EXCLUDE";

export interface PoiRecommendationShape {
  name: string;
  category: string;
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
  curationStatus?: PoiCurationStatusCode | null;
  representation?: PoiRepresentationCode | null;
}

export interface PoiRecommendationDecision {
  status: PoiRecommendationStatus;
  representation: PoiRepresentationCode;
  reason: string;
  structuralThemes: ThemeCategory[];
}

/**
 * POI 원천 분류와 관광상품 대표성을 분리한다.
 *
 * 이름·지역명 blacklist는 사용하지 않는다. 공식 중분류는 생활권 보조시설을 "보조 후보"로
 * 낮추는 신호로만 사용하고, 지역 검수(PoiCuration)가 있으면 그 결과를 우선한다.
 */
export function classifyPoiRepresentation(poi: PoiRecommendationShape): PoiRepresentationCode {
  if (poi.category === "LODGING") return "LODGING";
  if (poi.category === "FOOD" || poi.category === "SHOPPING") return "CONSUMPTION";

  // 한국관광공사 분류상 생활권 보조시설로 볼 여지가 큰 중분류다.
  // 관광 명소를 영구 차단하는 규칙이 아니라, 검수 전 자동 코스에서 한 단계 낮추는 신호다.
  if (poi.lclsSystm2 === "VE03" || poi.lclsSystm2 === "AC05" || poi.lclsSystm2 === "EX07") {
    return "SUPPORT";
  }

  if (poi.category === "ATTRACTION" || poi.category === "EXPERIENCE" || poi.category === "FESTIVAL") {
    return "DESTINATION";
  }

  return "UNKNOWN";
}

function hasNatureWellnessConflict(
  poi: PoiRecommendationShape,
  structuralThemes: ThemeCategory[],
  themeCategories: ThemeCategory[],
): boolean {
  const natureWellnessContext = themeCategories.includes("NATURE") || themeCategories.includes("WELLNESS");
  if (!natureWellnessContext) return false;
  if (structuralThemes.length > 0) {
    return !structuralThemes.some((theme) => theme === "NATURE" || theme === "WELLNESS");
  }

  // 공식 분류가 아직 세부 테마로 매핑되지 않은 경우에도, 자연·웰니스와 명백히 다른 대분류만
  // 보수적으로 제외한다. 이름·지역명은 사용하지 않는다.
  if (poi.lclsSystm1 === "HS" || poi.lclsSystm1 === "LS" || poi.lclsSystm1 === "VE") return true;
  if (poi.lclsSystm1 === "EX" && poi.lclsSystm2 !== "EX05") return true;
  return false;
}

/** 자동 코스/후보 패널이 같은 정책을 공유하도록 대표성 판단을 한 곳에서 계산한다. */
export function decidePoiRecommendation(
  poi: PoiRecommendationShape,
  themeCategories: ThemeCategory[],
): PoiRecommendationDecision {
  const structuralThemes = classifyStructuralPoiThemes(poi.lclsSystm1, poi.lclsSystm2);
  const curatedRepresentation = poi.representation ?? null;
  const representation = curatedRepresentation ?? classifyPoiRepresentation(poi);

  if (poi.category === "LODGING" || representation === "LODGING") {
    return { status: "EXCLUDE", representation: "LODGING", reason: "숙박은 관광 후보가 아니라 별도 숙박 슬롯으로 관리합니다.", structuralThemes };
  }

  if (poi.curationStatus === "REJECTED") {
    return {
      status: "EXCLUDE",
      representation,
      reason: "지역 POI 검수에서 관광상품 후보로 부적합 판정을 받은 장소입니다.",
      structuralThemes,
    };
  }

  // 승인된 목적지는 공식 중분류가 보조시설이어도 지역 검수 결과를 우선한다.
  if (poi.curationStatus === "APPROVED" && representation === "DESTINATION") {
    return { status: "ALLOW", representation, reason: "지역 POI 검수에서 관광 목적지로 승인된 장소입니다.", structuralThemes };
  }

  if (hasNatureWellnessConflict(poi, structuralThemes, themeCategories)) {
    return {
      status: "EXCLUDE",
      representation,
      reason: "공식 관광 분류가 선택한 전략·테마와 달라 자동 후보에서 제외했습니다.",
      structuralThemes,
    };
  }

  if (representation === "SUPPORT") {
    return {
      status: "DEMOTE",
      representation,
      reason: "생활권 보조시설 신호가 있어 자동 코스에서는 낮추고, 사용자가 검토할 보조 후보로 남겼습니다.",
      structuralThemes,
    };
  }

  return {
    status: "ALLOW",
    representation,
    reason:
      poi.curationStatus === "APPROVED"
        ? "지역 POI 검수에서 후보로 승인된 장소입니다."
        : "공식 분류와 전략·테마 적합도를 기준으로 자동 후보에 포함했습니다.",
    structuralThemes,
  };
}

/** 자동 생성 코스와 일반 backfill에 사용할 판정. 보조 후보(DEMOTE)는 자동 코스에 넣지 않는다. */
export function isAutoTourismCandidate(
  poi: PoiRecommendationShape,
  themeCategories: ThemeCategory[],
): boolean {
  return decidePoiRecommendation(poi, themeCategories).status === "ALLOW";
}

/** 사용자가 직접 검토할 추천 후보 패널에는 DEMOTE도 표시하되, EXCLUDE만 숨긴다. */
export function isVisibleRecommendationCandidate(
  poi: PoiRecommendationShape,
  themeCategories: ThemeCategory[],
): boolean {
  return decidePoiRecommendation(poi, themeCategories).status !== "EXCLUDE";
}

export function recommendationStatusRank(status: PoiRecommendationStatus): number {
  return status === "ALLOW" ? 0 : status === "DEMOTE" ? 1 : 2;
}

export function poiRepresentationLabel(representation: PoiRepresentationCode): string {
  return representation === "DESTINATION"
    ? "관광 목적지"
    : representation === "SUPPORT"
      ? "보조 자원"
      : representation === "CONSUMPTION"
        ? "소비 접점"
        : representation === "LODGING"
          ? "숙박"
          : "대표성 미검수";
}
