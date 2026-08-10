import {
  computeRegionSimilarityComparisons,
  REGION_SIMILARITY_RULE_VERSION,
  type RegionComparisonAnalysis,
} from "@/lib/domain/regionSimilarity";
import { fetchRegionComparisonProfiles } from "./fetchRegionComparisonProfiles";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";

export interface ResolveRegionComparisonAnalysisInput {
  regionCode: string;
  regionName: string;
  /** analysisResult.regionComparisonSnapshot을 그대로 전달한다(Prisma Json 컬럼). */
  snapshot: unknown;
  /** 이 분석의 근거에 실제로 저장된 기준월(baseYmSummary.primary) — 스냅샷이 없는 레거시 분석에서만
   * 실시간 재계산의 기준월로 쓰인다. */
  analysisOwnBaseYm: string | null;
}

/**
 * 유사지역 비교 결과를 가져온다 — 우선순위: (1) 분석 시점 스냅샷(AnalysisResult.regionComparisonSnapshot,
 * 2026-08-10) (2) 스냅샷이 없는 레거시 분석 결과만 예외적으로 현재 DB를 다시 조회해 재계산한다
 * (poiCategorySummary와 동일한 폴백 원칙). analysis/print/plan 세 화면이 이 함수를 공유해 같은
 * 분석 결과라면 항상 같은 유사지역 비교 결과를 보여준다.
 *
 * 스냅샷을 쓰는 경우 `usingLiveFallback: false`, 레거시 재계산인 경우 `true`를 반환해 화면이
 * "분석 당시 값"과 "현재 최신 값"이 섞였음을 필요시 안내할 수 있게 한다.
 */
export async function resolveRegionComparisonAnalysis(
  input: ResolveRegionComparisonAnalysisInput,
): Promise<{ analysis: RegionComparisonAnalysis; usingLiveFallback: boolean }> {
  if (input.snapshot !== null && input.snapshot !== undefined) {
    return {
      analysis: input.snapshot as unknown as RegionComparisonAnalysis,
      usingLiveFallback: false,
    };
  }

  const regionComparisonBaseYm = input.analysisOwnBaseYm ?? DEFAULT_BASE_YM;
  const regionProfiles = await fetchRegionComparisonProfiles(regionComparisonBaseYm);
  const targetRegionProfile = regionProfiles.find((p) => p.code === input.regionCode);
  const analysis: RegionComparisonAnalysis = targetRegionProfile
    ? computeRegionSimilarityComparisons(targetRegionProfile, regionProfiles)
    : {
        targetRegionName: input.regionName,
        comparisonBaseYm: regionComparisonBaseYm,
        mixedBaseYm: false,
        baseYmNote: null,
        comparisons: [],
        uniqueStrengthNote: null,
        note: "이 지역의 비교 데이터를 찾지 못해 유사지역 비교를 생성하지 못했습니다.",
        commonLimitationNote: null,
        candidatePoolSize: 0,
        isSmallCandidatePool: true,
        ruleVersion: REGION_SIMILARITY_RULE_VERSION,
      };

  return { analysis, usingLiveFallback: true };
}
