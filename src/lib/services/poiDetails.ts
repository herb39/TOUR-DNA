import { prisma } from "@/lib/db";
import type { PoiDetail } from "@/lib/domain/planBuilder";

/** poiIds 순서를 그대로 유지해 POI 상세정보를 조회한다. */
export async function fetchPoiDetailsInOrder(poiIds: string[]): Promise<PoiDetail[]> {
  if (poiIds.length === 0) return [];
  const rows = await prisma.poi.findMany({ where: { id: { in: poiIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return poiIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      operatingHours: r.operatingHours,
      closedDays: r.closedDays,
    }));
}
