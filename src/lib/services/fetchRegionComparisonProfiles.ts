import { prisma } from "@/lib/db";
import { computeDna } from "@/lib/domain/dna";
import type { RegionAxisProfile } from "@/lib/domain/regionSimilarity";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { DNA_AXES, type DnaResult, type RegionMetricValue } from "@/lib/domain/types";
import { buildDnaEngineInput } from "./buildDnaEngineInput";
import { fetchPoisByCategory } from "./fetchPoisByCategory";
import { measureAnalysisStage } from "./analysisTiming";

/**
 * 유사지역 비교(2026-08-02)를 위해 "현재 지원하는 모든 SIGUNGU 지역"의 DNA 5축·POI 카테고리 구성을
 * 계산한다. DNA 점수 산식은 손대지 않고 기존 `buildDnaEngineInput`/`computeDna`/`fetchPoisByCategory`를
 * 지역마다 그대로 재호출한다 — 지원 지역이 전국 226개로 늘어나면 이 방식은 느려지지만(README 로드맵
 * "유사지역 비교"는 현재 지원 지역 규모를 전제로 함), 현재 전국 SIGUNGU 255개 지역을 대상으로 한다.
 */
export async function fetchRegionComparisonProfiles(baseYm: string): Promise<RegionAxisProfile[]> {
  const sigunguRegions = await measureAnalysisStage(
    "region-comparison.region-list",
    () =>
      prisma.region.findMany({
        where: { level: "SIGUNGU" },
        orderBy: { name: "asc" },
      }),
    { io: "db", queryCount: 1 },
  );

  // 모든 지역이 같은 baseYm·행정단위의 코호트를 사용하므로, 지역별로 같은 8개 코호트를 다시
  // 읽지 않고 이번 요청 안에서만 Promise를 공유한다. 영속 캐시나 결과 산식은 변경하지 않는다.
  const metricCohortCache = new Map<string, Promise<RegionMetricValue[]>>();

  return measureAnalysisStage(
    "region-comparison.profile-build",
    () =>
      Promise.all(
        sigunguRegions.map(async (region) => {
          const dnaInput = await buildDnaEngineInput(region.code, baseYm, { metricCohortCache });
          const dna = computeDna(dnaInput);
          const poisByCategory = await fetchPoisByCategory(region.code);
          const poiCountByCategory = Object.fromEntries(
            Object.entries(poisByCategory).map(([category, pois]) => [category, pois?.length ?? 0]),
          ) as Partial<Record<PoiCategoryCode, number>>;

          const axisScores = Object.fromEntries(
            DNA_AXES.map((axis) => [axis, { score: dna[axis].score, status: dna[axis].status }]),
          ) as RegionAxisProfile["axisScores"];

          return {
            code: region.code,
            name: region.name,
            baseYm: extractActualBaseYm(dna, baseYm),
            axisScores,
            poiCountByCategory,
          };
        }),
      ),
    { io: "db", regionCount: sigunguRegions.length, execution: "parallel-regions" },
  );
}

/** DNA 축 evidence에 실제로 기록된 기준월을 찾는다(요청한 baseYm과 다를 수 있어 방어적으로 직접 확인
 * 한다 — 오늘의 데이터 모델에서는 항상 요청값과 같지만, 유사지역 비교의 기준월 안내 정확성을 위해
 * "요청한 값"이 아니라 "실제로 쓰인 값"을 신뢰한다). 어떤 축에도 evidence가 없으면(전부 MISSING)
 * 요청한 baseYm으로 대체한다. */
function extractActualBaseYm(dna: DnaResult, requestedBaseYm: string): string {
  for (const axis of DNA_AXES) {
    const found = dna[axis].evidence.find((e) => e.baseYm);
    if (found) return found.baseYm;
  }
  return requestedBaseYm;
}
