import { prisma } from "@/lib/db";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { PoiLike } from "@/lib/domain/strategy";

export async function fetchPoisByCategory(
  regionCode: string,
): Promise<Partial<Record<PoiCategoryCode, PoiLike[]>>> {
  const region = await prisma.region.findUniqueOrThrow({ where: { code: regionCode } });
  const pois = await prisma.poi.findMany({ where: { regionId: region.id } });

  const map: Partial<Record<PoiCategoryCode, PoiLike[]>> = {};
  for (const p of pois) {
    const category = p.category as PoiCategoryCode;
    const list = map[category] ?? [];
    list.push({ id: p.id, name: p.name, category });
    map[category] = list;
  }
  return map;
}
