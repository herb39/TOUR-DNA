import { hasReasonableKoreanCoordinate, haversineDistanceKm } from "./geo";
import type { PoiFitResult } from "./poiFit";
import type { PoiRecommendationStatus } from "./poiRecommendation";
import type { PoiCategoryCode } from "./strategyTemplates";

export interface CandidateRerankInput {
  id: string;
  category: PoiCategoryCode;
  lat?: number | null;
  lng?: number | null;
  recommendationStatus?: PoiRecommendationStatus | null;
  fit: Pick<PoiFitResult, "breakdown">;
}

export interface CandidateRerankItem<T extends CandidateRerankInput> {
  candidate: T;
  /** 현재 코스의 유효 좌표와 후보 사이 최소 직선거리. 계산 불가하면 null이다. */
  proximityKm: number | null;
}

type CoordinateInput = { lat?: number | null; lng?: number | null };

/** 거리 자체를 점수로 과대 반영하지 않도록 설명 가능한 구간만 사용한다. */
const PROXIMITY_BAND_KM = [2, 5, 10] as const;

function recommendationRank(status: PoiRecommendationStatus | null | undefined): number {
  return status === "DEMOTE" ? 1 : status === "EXCLUDE" ? 2 : 0;
}

/** candidatePoolService의 themeRelevanceTier와 같은 구조·키워드·미확인 순서를 재사용한다. */
function themeRelevanceRank(candidate: CandidateRerankInput): number {
  const themeFit = candidate.fit.breakdown.themeFit;
  if (!themeFit.matched) return 2;
  return themeFit.source === "STRUCTURAL" ? 0 : 1;
}

function categoryTierRank(candidate: CandidateRerankInput): number {
  return candidate.fit.breakdown.categoryFit.tier === "CORE"
    ? 0
    : candidate.fit.breakdown.categoryFit.tier === "SUPPLEMENT"
      ? 1
      : 2;
}

function proximityBand(distanceKm: number | null): number | null {
  if (distanceKm === null) return null;
  const index = PROXIMITY_BAND_KM.findIndex((threshold) => distanceKm <= threshold);
  return index === -1 ? PROXIMITY_BAND_KM.length : index;
}

function minimumProximityKm(candidate: CoordinateInput, anchors: CoordinateInput[]): number | null {
  if (!hasReasonableKoreanCoordinate(candidate) || anchors.length === 0) return null;
  return Math.min(
    ...anchors.map((anchor) =>
      haversineDistanceKm(
        { lat: candidate.lat, lng: candidate.lng },
        { lat: anchor.lat as number, lng: anchor.lng as number },
      ),
    ),
  );
}

/**
 * 현재 코스 편집 상태를 반영해 일반 추천 후보만 안정적으로 재정렬한다.
 *
 * 기존 relevance 순서(추천 상태 → 테마 관련성 → 카테고리 tier)는 절대 앞선다.
 * 같은 relevance 묶음 안에서만 현재 코스와의 최소 Haversine 거리 구간(2/5/10km)을
 * 보조 신호로 사용하며, 같은 구간의 작은 거리 차이와 좌표 미확인 값은 기존 순서를 유지한다.
 * Anchor 후보·외부 API·DB에는 관여하지 않는다.
 */
export function rerankCandidatesForCurrentCourse<T extends CandidateRerankInput>(
  candidates: readonly T[],
  currentCourseItems: readonly CoordinateInput[],
): CandidateRerankItem<T>[] {
  const anchors = currentCourseItems.filter(hasReasonableKoreanCoordinate);
  const ranked = candidates.map((candidate, originalIndex) => ({
    candidate,
    originalIndex,
    proximityKm: minimumProximityKm(candidate, anchors),
  }));

  ranked.sort((a, b) => {
    const recommendationDiff = recommendationRank(a.candidate.recommendationStatus) - recommendationRank(b.candidate.recommendationStatus);
    if (recommendationDiff !== 0) return recommendationDiff;

    const themeDiff = themeRelevanceRank(a.candidate) - themeRelevanceRank(b.candidate);
    if (themeDiff !== 0) return themeDiff;

    const categoryDiff = categoryTierRank(a.candidate) - categoryTierRank(b.candidate);
    if (categoryDiff !== 0) return categoryDiff;

    const aBand = proximityBand(a.proximityKm);
    const bBand = proximityBand(b.proximityKm);
    if (aBand !== null && bBand !== null && aBand !== bBand) return aBand - bBand;

    // 좌표가 없거나 같은 거리 구간이면 서버가 정한 기존 순서를 보존한다.
    return a.originalIndex - b.originalIndex;
  });

  return ranked.map(({ candidate, proximityKm }) => ({ candidate, proximityKm }));
}
