import { classifyStructuralPoiThemes, type ThemeCategory } from "./audienceContext";

export interface PoiRecommendationShape {
  name: string;
  category: string;
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
}

/**
 * 공공 분류가 테마와 맞는다는 사실과, 지역의 대표 관광지라는 사실은 다르다.
 * 자동 코스에 바로 넣기에는 대표성 근거가 약한 생활권·보조시설 유형을 별도로 표시한다.
 *
 * 이 규칙은 특정 지역·상호를 차단하지 않는다. 공식 중분류와 일반 시설 유형만 사용하며,
 * 사용자가 직접 검색해 추가하는 수동 경로에는 적용하지 않는다.
 */
export function isGenericLocalSupportPoi(poi: PoiRecommendationShape): boolean {
  if (poi.category === "LODGING") return true;

  const name = poi.name.replace(/\s+/gu, "");
  if (/(가로수길|근린공원|어린이공원|도시공원|캠핑장|야영장|스포츠월드|스포츠센터|체육관|체육센터)$/u.test(name)) {
    return true;
  }
  if (poi.lclsSystm2 === "VE03") return true; // 도시공원
  if (poi.lclsSystm2 === "AC05") return true; // 캠핑장
  if (poi.category === "ATTRACTION" && poi.lclsSystm1 === "NA" && poi.lclsSystm2 === "NA04" && /공원/u.test(name)) {
    return true;
  }

  return false;
}

/** 숙박은 관광 후보와 분리하고, 보조시설은 해당 테마의 주된 경험으로 확정하지 않는다.
 * 레저 테마의 공식 레포츠 분류처럼 명확한 구조 신호가 있는 경우에는 보조시설 예외로 둔다. */
export function isAutoTourismCandidate(
  poi: PoiRecommendationShape,
  themeCategories: ThemeCategory[],
): boolean {
  if (poi.category === "LODGING") return false;

  const structuralThemes = classifyStructuralPoiThemes(poi.lclsSystm1, poi.lclsSystm2);

  // 자연·웰니스 전략은 "관광지/체험" 카테고리만 맞는다는 이유로 문화유산·일반 체험시설까지
  // 섞으면 안 된다. 이 경우 공식 대분류가 명확히 다른 후보는 자동 핵심 후보에서 제외한다.
  // 다른 전략은 기존의 구조 관련성 랭킹을 유지해 과도한 hard filter를 피한다.
  const natureWellnessContext = themeCategories.includes("NATURE") || themeCategories.includes("WELLNESS");
  if (natureWellnessContext && (poi.category === "ATTRACTION" || poi.category === "EXPERIENCE")) {
    if (poi.lclsSystm1 === "HS" || poi.lclsSystm1 === "LS" || poi.lclsSystm1 === "VE") return false;
    if (poi.lclsSystm1 === "EX" && poi.lclsSystm2 !== "EX05") return false;
  }

  if (!isGenericLocalSupportPoi(poi)) return true;
  if (themeCategories.includes("LEISURE_ACTIVITY") && structuralThemes.includes("LEISURE_ACTIVITY")) return true;

  return false;
}
