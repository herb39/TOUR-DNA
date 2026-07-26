import { prisma } from "@/lib/db";
import type { PoiDetail } from "@/lib/domain/planBuilder";
import { isMealEligibleFoodCat3 } from "@/lib/public-data/adapters/tourInfo";

/** Poi.rawPayload(Json?)에서 TourAPI의 cat3(소분류)를 안전하게 꺼낸다 — 스키마 변경 없이 이미 저장된
 * 원본 응답을 그대로 읽는다. DB 없이 직접 테스트할 수 있도록 export한다(순수 함수). */
export function extractCat3FromRawPayload(rawPayload: unknown): string | null {
  if (rawPayload && typeof rawPayload === "object" && "cat3" in rawPayload) {
    const value = (rawPayload as Record<string, unknown>).cat3;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** FOOD가 실제로 식사 가능한 장소인지(점심·저녁 후보로 쓸 수 있는지) 판별한다. 큐레이션된 FIXTURE
 * 데모 데이터는 TourAPI 분류 개념 자체가 없으므로 식사 가능으로 본다(기존 데모/테스트 동작 보존).
 * API로 동기화된 데이터는 cat3 기준으로 판별하고, cat3가 없거나 알 수 없으면 안전하게 false로 본다
 * (잘못 배치하는 것보다 식사 슬롯을 생략하는 쪽을 우선한다). DB 없이 직접 테스트할 수 있도록 export한다. */
export function deriveMealEligible(row: { sourceType: string; rawPayload: unknown }): boolean {
  if (row.sourceType === "FIXTURE") return true;
  return isMealEligibleFoodCat3(extractCat3FromRawPayload(row.rawPayload));
}

interface PoiRow {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  operatingHours: string | null;
  closedDays: string | null;
  sourceType: string;
  rawPayload: unknown;
}

/** DB Poi 행 → PoiDetail 매핑을 한 곳에만 둔다(fetchPoiDetailsInOrder/fetchAdditionalMealEligibleFood 공용). */
function mapRowToPoiDetail(r: PoiRow): PoiDetail {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    operatingHours: r.operatingHours,
    closedDays: r.closedDays,
    mealEligible: deriveMealEligible(r),
  };
}

/** poiIds 순서를 그대로 유지해 POI 상세정보를 조회한다. */
export async function fetchPoiDetailsInOrder(poiIds: string[]): Promise<PoiDetail[]> {
  if (poiIds.length === 0) return [];
  const rows = await prisma.poi.findMany({ where: { id: { in: poiIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return poiIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map(mapRowToPoiDetail);
}

/** 지역에서 여러 후보를 함께 뽑아 그 중 실제 식사 가능(mealEligible===true)한 것만 최대 limit개 반환한다
 * — cat3는 rawPayload(JSON) 안에 있어 DB 쿼리 자체로는 걸러낼 수 없으므로, 넉넉히 가져온 뒤 애플리케이션
 * 레벨에서 판별한다. */
const SUPPLEMENT_FOOD_FETCH_MULTIPLIER = 3;
const SUPPLEMENT_FOOD_FETCH_CAP = 30;

/** 전략 계산 시점에 고정된 poiIds에 식사 가능 FOOD가 부족할 때, 같은 지역 DB에서 직접 보충한다
 * (planService.ts에서 실행안 생성 직전에 사용 — 서비스 계층에서만 DB를 조회하고, planBuilder.ts 등
 * 도메인 계산 함수에는 이미 확보된 PoiDetail[]만 인자로 전달한다). excludeIds에 있는 POI는 이미
 * 후보에 포함돼 있으므로 다시 뽑지 않는다(중복 방지). */
export async function fetchAdditionalMealEligibleFood(
  regionId: string,
  excludeIds: string[],
  limit: number,
): Promise<PoiDetail[]> {
  if (limit <= 0) return [];
  const rows = await prisma.poi.findMany({
    where: { regionId, category: "FOOD", id: { notIn: excludeIds } },
    take: Math.min(limit * SUPPLEMENT_FOOD_FETCH_MULTIPLIER, SUPPLEMENT_FOOD_FETCH_CAP),
  });
  return rows
    .map(mapRowToPoiDetail)
    .filter((p) => p.mealEligible === true)
    .slice(0, limit);
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
