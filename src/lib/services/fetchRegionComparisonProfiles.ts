import { prisma } from "@/lib/db";
import { computeDna } from "@/lib/domain/dna";
import type { RegionAxisProfile } from "@/lib/domain/regionSimilarity";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { DNA_AXES, type DnaResult } from "@/lib/domain/types";
import { buildDnaEngineInput } from "./buildDnaEngineInput";
import { fetchPoisByCategory } from "./fetchPoisByCategory";

/**
 * 유사지역 비교(2026-08-02)를 위해 "현재 지원하는 모든 SIGUNGU 지역"의 DNA 5축·POI 카테고리 구성을
 * 계산한다. DNA 점수 산식은 손대지 않고 기존 `buildDnaEngineInput`/`computeDna`/`fetchPoisByCategory`를
 * 지역마다 그대로 재호출한다 — 지원 지역이 전국 226개로 늘어나면 이 방식은 느려지지만(README 로드맵
 * "유사지역 비교"는 현재 지원 지역 규모를 전제로 함), 현재 7개 지역 규모에서는 문제가 없다.
 */
export async function fetchRegionComparisonProfiles(baseYm: string): Promise<RegionAxisProfile[]> {
  const sigunguRegions = await prisma.region.findMany({
    where: { level: "SIGUNGU" },
    orderBy: { name: "asc" },
  });

  return Promise.all(
    sigunguRegions.map(async (region) => {
      const dnaInput = await buildDnaEngineInput(region.code, baseYm);
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
