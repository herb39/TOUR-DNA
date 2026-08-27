import { prisma } from "@/lib/db";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { PoiLike } from "@/lib/domain/strategy";
import {
  deriveFoodSubcategory,
  deriveMealEligible,
  extractLclsSystm1FromRawPayload,
  extractLclsSystm2FromRawPayload,
} from "./poiDetails";
import { readOptionalPoiCuration, withOptionalPoiCuration } from "./optionalPoiCuration";
import { measureAnalysisStage } from "./analysisTiming";

export async function fetchPoisByCategory(
  regionCode: string,
): Promise<Partial<Record<PoiCategoryCode, PoiLike[]>>> {
  const region = await measureAnalysisStage(
    "poi-categories.region-load",
    () => prisma.region.findUniqueOrThrow({ where: { code: regionCode } }),
    { io: "db", queryCount: 1, regionCode },
  );
  const where = { regionId: region.id };
  const pois = await measureAnalysisStage(
    "poi-categories.poi-load",
    () =>
      withOptionalPoiCuration(
        () => prisma.poi.findMany({ where, include: { curation: true } }),
        () => prisma.poi.findMany({ where }),
      ),
    { io: "db", queryCount: 1, regionCode },
  );

  const map: Partial<Record<PoiCategoryCode, PoiLike[]>> = {};
  for (const p of pois) {
    const curation = readOptionalPoiCuration(p);
    const category = p.category as PoiCategoryCode;
    const list = map[category] ?? [];
    // 거리 기반 선택(strategy.ts selectPois)이 실제 좌표를 쓸 수 있도록 채운다 — 이전에는 여기서
    // lat/lng/mealEligible을 모두 버려 selectPois가 지리 정보를 전혀 활용하지 못했다(선택 단계는
    // 이동시간과 무관하게 100% 카테고리 회전 순서로만 동작했다).
    list.push({
      id: p.id,
      name: p.name,
      category,
      lat: p.lat,
      lng: p.lng,
      operatingHours: p.operatingHours,
      closedDays: p.closedDays,
      mealEligible: category === "FOOD" ? deriveMealEligible(p) : undefined,
      ...(category === "FOOD" ? { foodSubcategory: deriveFoodSubcategory(p) } : {}),
      // 2026-08-15: selectPois의 테마 관련성 랭킹(themeRelevanceTier)이 이름 키워드보다 우선 참고할
      // TourAPI 공식 분류 신호 — computePoiFit과 동일한 신호를 재사용한다(새 판정 로직 아님).
      lclsSystm1: extractLclsSystm1FromRawPayload(p.rawPayload),
      lclsSystm2: extractLclsSystm2FromRawPayload(p.rawPayload),
      curationStatus: curation?.status ?? null,
      representation: curation?.representation ?? null,
      sourceType: p.sourceType,
    });
    map[category] = list;
  }
  return map;
}
