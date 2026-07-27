import { prisma } from "@/lib/db";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { PoiLike } from "@/lib/domain/strategy";
import { deriveFoodSubcategory, deriveMealEligible } from "./poiDetails";

export async function fetchPoisByCategory(
  regionCode: string,
): Promise<Partial<Record<PoiCategoryCode, PoiLike[]>>> {
  const region = await prisma.region.findUniqueOrThrow({ where: { code: regionCode } });
  const pois = await prisma.poi.findMany({ where: { regionId: region.id } });

  const map: Partial<Record<PoiCategoryCode, PoiLike[]>> = {};
  for (const p of pois) {
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
      mealEligible: category === "FOOD" ? deriveMealEligible(p) : undefined,
      ...(category === "FOOD" ? { foodSubcategory: deriveFoodSubcategory(p) } : {}),
    });
    map[category] = list;
  }
  return map;
}
