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

const POI_SEARCH_LIMIT = 20;

/** 실행안 편집기의 "장소 추가" 검색용 — 해당 지역(regionId)의 POI 중 이름에 query가 포함된 것만 조회한다. */
export async function searchPoisInRegion(regionId: string, query: string): Promise<PoiDetail[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const rows = await prisma.poi.findMany({
    where: { regionId, name: { contains: trimmed } },
    orderBy: { name: "asc" },
    take: POI_SEARCH_LIMIT,
  });
  return rows.map((r) => ({
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
