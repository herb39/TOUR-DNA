import { prisma } from "@/lib/db";
import type { PoiCategory } from "@/generated/prisma/enums";
import type { PoiDetail } from "@/lib/domain/planBuilder";
import { classifyFoodSubcategory, isMealEligibleFoodSubcategory, type FoodSubcategory } from "@/lib/domain/foodClassification";

/** Poi.rawPayload(Json?)에서 신 분류체계 lclsSystm3(소분류)를 안전하게 꺼낸다 — 스키마 변경 없이
 * 이미 저장된 원본 응답을 그대로 읽는다. DB 없이 직접 테스트할 수 있도록 export한다(순수 함수). */
export function extractLclsSystm3FromRawPayload(rawPayload: unknown): string | null {
  if (rawPayload && typeof rawPayload === "object" && "lclsSystm3" in rawPayload) {
    const value = (rawPayload as Record<string, unknown>).lclsSystm3;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** Poi.rawPayload(Json?)에서 신 분류체계 lclsSystm1(대분류)을 안전하게 꺼낸다(2026-08-14, POI 추천
 * 품질 2차 고도화 — poiFit.ts의 classifyStructuralPoiThemes가 쓴다). */
export function extractLclsSystm1FromRawPayload(rawPayload: unknown): string | null {
  if (rawPayload && typeof rawPayload === "object" && "lclsSystm1" in rawPayload) {
    const value = (rawPayload as Record<string, unknown>).lclsSystm1;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** Poi.rawPayload(Json?)에서 신 분류체계 lclsSystm2(중분류)를 안전하게 꺼낸다(2026-08-14, 위와 동일한
 * 용도). */
export function extractLclsSystm2FromRawPayload(rawPayload: unknown): string | null {
  if (rawPayload && typeof rawPayload === "object" && "lclsSystm2" in rawPayload) {
    const value = (rawPayload as Record<string, unknown>).lclsSystm2;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** 2026-07-27 신 체계 전환 이전(cat3만 있고 lclsSystm3가 없는)에 저장된 rawPayload에서만 쓰는 구형
 * 데이터 호환 fallback — 신규 저장 데이터에는 cat3 자체가 없으므로 항상 null을 반환한다. */
export function extractCat3FromRawPayload(rawPayload: unknown): string | null {
  if (rawPayload && typeof rawPayload === "object" && "cat3" in rawPayload) {
    const value = (rawPayload as Record<string, unknown>).cat3;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** FOOD 세부 분류(식사/카페/불명확) — 큐레이션된 FIXTURE 데모 데이터는 TourAPI 분류 개념 자체가
 * 없으므로 식사 중심(MEAL)으로 본다(기존 데모/테스트 동작 보존). API 동기화 데이터는 lclsSystm3(신,
 * 최우선) → cat3(구, 구형 데이터 호환 전용) → 이름 키워드(마지막 fallback) 순으로 판정한다
 * (foodClassification.ts, 단일 기준). */
export function deriveFoodSubcategory(row: { sourceType: string; name?: string; rawPayload: unknown }): FoodSubcategory {
  if (row.sourceType === "FIXTURE") return "MEAL";
  return classifyFoodSubcategory({
    lclsSystm3: extractLclsSystm3FromRawPayload(row.rawPayload),
    cat3: extractCat3FromRawPayload(row.rawPayload),
    name: row.name ?? "",
  });
}

/** FOOD가 실제로 식사 가능한 장소인지(점심·저녁 후보로 쓸 수 있는지) 판별한다. DB 없이 직접
 * 테스트할 수 있도록 export한다. */
export function deriveMealEligible(row: { sourceType: string; name?: string; rawPayload: unknown }): boolean {
  return isMealEligibleFoodSubcategory(deriveFoodSubcategory(row));
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
    foodSubcategory: r.category === "FOOD" ? deriveFoodSubcategory(r) : undefined,
    sourceType: r.sourceType,
    lclsSystm1: extractLclsSystm1FromRawPayload(r.rawPayload),
    lclsSystm2: extractLclsSystm2FromRawPayload(r.rawPayload),
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

/** 식사 선점(MEAL_RESERVE_TARGET_BY_DURATION)이 원래 목표했던 비숙박 밀도(NON_LODGING_POI_TARGET_
 * BY_DURATION) 예산을 그대로 갉아먹기 때문에(2026-07-26 강릉 사례: 하루 4개 목표 중 2개가 식사로
 * 소진돼 실제 관광 시간을 채울 후보가 2개뿐이었다), 같은 지역의 FOOD가 아닌 일반 방문 POI(관광지·체험·
 * 축제·쇼핑)를 지역 DB에서 보충한다. mealEligible 판별이 필요 없으므로 넉넉히 가져올 필요도 없다. */
const GENERAL_BACKFILL_CATEGORIES: PoiCategory[] = ["ATTRACTION", "EXPERIENCE", "FESTIVAL", "SHOPPING"];

/** 최초 후보 풀의 비숙박 POI 개수가 이 기간의 원래 목표 밀도에 못 미칠 때(주로 식사 선점이 예산을
 * 나눠 쓴 결과), 같은 지역 DB에서 일반 방문 후보를 보충한다(planService.ts에서 사용 — 서비스 계층에서만
 * DB를 조회하고, planBuilder.ts 등 도메인 계산 함수에는 이미 확보된 PoiDetail[]만 인자로 전달한다).
 * excludeIds에 있는 POI는 이미 후보에 포함돼 있으므로 다시 뽑지 않는다(중복 방지). */
export async function fetchAdditionalGeneralPois(
  regionId: string,
  excludeIds: string[],
  limit: number,
): Promise<PoiDetail[]> {
  if (limit <= 0) return [];
  const rows = await prisma.poi.findMany({
    where: { regionId, category: { in: GENERAL_BACKFILL_CATEGORIES }, id: { notIn: excludeIds } },
    take: limit,
  });
  return rows.map(mapRowToPoiDetail);
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
    sourceType: r.sourceType,
  }));
}
