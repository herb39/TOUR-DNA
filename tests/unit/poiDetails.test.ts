// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// poiDetails.ts는 @/lib/db(prisma)를 import한다 — 순수 함수 테스트에서는 DB와 무관하지만,
// 기존 프로젝트 관례(syncService.test.ts 등)를 따라 실제 Prisma 클라이언트가 생성/연결되지 않도록
// mock으로 대체한다(공유 Neon DB에 절대 접속하지 않기 위함). fetchAdditionalMealEligibleFood
// 테스트에서는 이 poiFindMany를 직접 제어한다.
const poiFindMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { poi: { findMany: (...args: unknown[]) => poiFindMany(...args) } } }));

import {
  deriveFoodSubcategory,
  deriveMealEligible,
  extractCat3FromRawPayload,
  extractLclsSystm1FromRawPayload,
  extractLclsSystm2FromRawPayload,
  fetchAdditionalGeneralPois,
  fetchAdditionalMealEligibleFood,
} from "@/lib/services/poiDetails";

describe("extractCat3FromRawPayload", () => {
  it("rawPayload 객체에서 cat3 문자열을 그대로 꺼낸다", () => {
    expect(extractCat3FromRawPayload({ cat1: "A05", cat2: "A0502", cat3: "A05020900" })).toBe("A05020900");
  });

  it("rawPayload가 없거나 cat3가 없으면 null을 반환한다", () => {
    expect(extractCat3FromRawPayload(null)).toBeNull();
    expect(extractCat3FromRawPayload(undefined)).toBeNull();
    expect(extractCat3FromRawPayload({})).toBeNull();
    expect(extractCat3FromRawPayload({ cat3: 12345 })).toBeNull(); // 문자열이 아니면 무시
  });
});

/** 2026-08-14(POI 추천 품질 2차 고도화) — poiFit.ts의 구조적 테마 신호가 읽는 원본 필드 추출기. */
describe("extractLclsSystm1/2FromRawPayload", () => {
  it("rawPayload 객체에서 lclsSystm1/2 문자열을 그대로 꺼낸다", () => {
    expect(extractLclsSystm1FromRawPayload({ lclsSystm1: "HS", lclsSystm2: "HS01" })).toBe("HS");
    expect(extractLclsSystm2FromRawPayload({ lclsSystm1: "HS", lclsSystm2: "HS01" })).toBe("HS01");
  });

  it("rawPayload가 없거나(FIXTURE) 필드가 없으면(구형 데이터) null을 반환한다", () => {
    expect(extractLclsSystm1FromRawPayload(null)).toBeNull();
    expect(extractLclsSystm1FromRawPayload(undefined)).toBeNull();
    expect(extractLclsSystm1FromRawPayload({})).toBeNull();
    expect(extractLclsSystm2FromRawPayload({ cat3: "A05020900" })).toBeNull(); // 신 체계 전환 이전 구형 데이터
    expect(extractLclsSystm1FromRawPayload({ lclsSystm1: 123 })).toBeNull(); // 문자열이 아니면 무시
  });
});

describe("deriveMealEligible — Poi.rawPayload 기준 식사 가능 여부 판별(3단계 카페 구분)", () => {
  it("FIXTURE(큐레이션 데모 데이터)는 TourAPI 분류 개념이 없으므로 식사 가능으로 본다", () => {
    expect(deriveMealEligible({ sourceType: "FIXTURE", rawPayload: null })).toBe(true);
  });

  it("API로 동기화된 일반 음식점(한식 등)은 식사 가능으로 판별한다", () => {
    expect(deriveMealEligible({ sourceType: "API", rawPayload: { cat3: "A05020100" } })).toBe(true);
  });

  it("API로 동기화된 카페/전통찻집은 식사 불가로 판별한다", () => {
    expect(deriveMealEligible({ sourceType: "API", rawPayload: { cat3: "A05020900" } })).toBe(false);
  });

  it("API로 동기화됐지만 cat3가 없거나 알 수 없으면 안전하게 식사 불가로 본다", () => {
    expect(deriveMealEligible({ sourceType: "API", rawPayload: null })).toBe(false);
    expect(deriveMealEligible({ sourceType: "API", rawPayload: {} })).toBe(false);
    expect(deriveMealEligible({ sourceType: "API", rawPayload: { cat3: "UNKNOWN" } })).toBe(false);
  });

  it("cat3가 없어도 이름 키워드로 카페를 보조 판정한다(4단계 FOOD 세부 분류)", () => {
    expect(deriveMealEligible({ sourceType: "API", name: "동네카페", rawPayload: null })).toBe(false);
    expect(deriveMealEligible({ sourceType: "API", name: "전통 한식당", rawPayload: null })).toBe(true);
  });
});

describe("deriveFoodSubcategory — FOOD 세부 분류(4단계)", () => {
  it("FIXTURE는 항상 MEAL로 본다", () => {
    expect(deriveFoodSubcategory({ sourceType: "FIXTURE", name: "아무개 식당", rawPayload: null })).toBe("MEAL");
  });

  it("cat3가 있으면 이름과 무관하게 cat3를 우선한다", () => {
    expect(deriveFoodSubcategory({ sourceType: "API", name: "OO카페", rawPayload: { cat3: "A05020100" } })).toBe("MEAL");
    expect(deriveFoodSubcategory({ sourceType: "API", name: "한식당", rawPayload: { cat3: "A05020900" } })).toBe("CAFE");
  });

  it("cat3가 없으면 이름 키워드로 보조 판정하고, 그마저 모호하면 UNKNOWN이다", () => {
    expect(deriveFoodSubcategory({ sourceType: "API", name: "행복 베이커리", rawPayload: null })).toBe("CAFE");
    expect(deriveFoodSubcategory({ sourceType: "API", name: "행복상회", rawPayload: null })).toBe("UNKNOWN");
  });
});

function foodRow(id: string, cat3: string | null) {
  return {
    id,
    name: `식당-${id}`,
    category: "FOOD",
    address: "주소",
    lat: 34.8,
    lng: 128.4,
    operatingHours: null,
    closedDays: null,
    sourceType: "API",
    rawPayload: cat3 ? { cat1: "A05", cat2: "A0502", cat3 } : {},
  };
}

describe("fetchAdditionalMealEligibleFood — 최초 후보 부족 시 지역 DB에서 식사 가능 FOOD 보충(통영 재현 회귀)", () => {
  beforeEach(() => {
    poiFindMany.mockReset();
  });

  it("식사 가능한 것만 걸러서 최대 limit개까지 반환하고, 카페는 제외한다", async () => {
    poiFindMany.mockResolvedValue([
      foodRow("cafe-1", "A05020900"),
      foodRow("korean-1", "A05020100"),
      foodRow("western-1", "A05020200"),
      foodRow("unknown-1", null),
    ]);

    const result = await fetchAdditionalMealEligibleFood("region-1", ["already-selected"], 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("korean-1");
    expect(result.every((p) => p.mealEligible === true)).toBe(true);
  });

  it("limit이 0 이하면 DB를 조회하지 않는다", async () => {
    const result = await fetchAdditionalMealEligibleFood("region-1", [], 0);
    expect(result).toEqual([]);
    expect(poiFindMany).not.toHaveBeenCalled();
  });

  it("이미 선택된 POI(excludeIds)는 조회 조건에서 제외되도록 요청한다", async () => {
    poiFindMany.mockResolvedValue([foodRow("korean-1", "A05020100")]);
    await fetchAdditionalMealEligibleFood("region-1", ["already-1", "already-2"], 2);

    const calledWith = poiFindMany.mock.calls[0][0];
    expect(calledWith.where.regionId).toBe("region-1");
    expect(calledWith.where.category).toBe("FOOD");
    expect(calledWith.where.id.notIn).toEqual(["already-1", "already-2"]);
  });

  it("실제 식사 가능 후보가 요청한 limit보다 적으면 있는 만큼만 반환한다", async () => {
    poiFindMany.mockResolvedValue([foodRow("cafe-1", "A05020900"), foodRow("korean-1", "A05020100")]);
    const result = await fetchAdditionalMealEligibleFood("region-1", [], 5);
    expect(result).toHaveLength(1);
  });
});

function attractionRow(id: string) {
  return {
    id,
    name: `관광지-${id}`,
    category: "ATTRACTION",
    address: "주소",
    lat: 34.8,
    lng: 128.4,
    operatingHours: null,
    closedDays: null,
    sourceType: "API",
    rawPayload: { contenttypeid: "12" },
  };
}

function shoppingRow(id: string, name: string, lat: number, lng: number) {
  return {
    id,
    name,
    category: "SHOPPING",
    address: "주소",
    lat,
    lng,
    operatingHours: null,
    closedDays: null,
    sourceType: "API",
    rawPayload: { contenttypeid: "38" },
  };
}

describe("fetchAdditionalGeneralPois — 비숙박 밀도 부족 시 일반 방문 후보 보충(강릉 사례 재현)", () => {
  beforeEach(() => {
    poiFindMany.mockReset();
  });

  it("FOOD가 아닌 카테고리(관광/체험/축제/쇼핑)만 조회 조건에 포함한다", async () => {
    poiFindMany.mockResolvedValue([attractionRow("a1")]);
    await fetchAdditionalGeneralPois("region-1", ["already-1"], 2);

    const calledWith = poiFindMany.mock.calls[0][0];
    expect(calledWith.where.regionId).toBe("region-1");
    expect(calledWith.where.category).toEqual({ in: ["ATTRACTION", "EXPERIENCE", "FESTIVAL", "SHOPPING"] });
    expect(calledWith.where.id.notIn).toEqual(["already-1"]);
    // 2026-08-16: SHOPPING 동일 시설 중복을 걸러내고도 limit을 채울 수 있도록 여유 있게(최대 배수/상한
    // 캡 적용) 가져온다 — limit 그대로가 아니다.
    expect(calledWith.take).toBe(6);
  });

  it("limit이 0 이하면 DB를 조회하지 않는다", async () => {
    const result = await fetchAdditionalGeneralPois("region-1", [], 0);
    expect(result).toEqual([]);
    expect(poiFindMany).not.toHaveBeenCalled();
  });

  it("조회된 행을 PoiDetail로 매핑해 그대로 반환한다(mealEligible 필터링 없음 — FOOD가 아니므로 무의미)", async () => {
    poiFindMany.mockResolvedValue([attractionRow("a1"), attractionRow("a2")]);
    const result = await fetchAdditionalGeneralPois("region-1", [], 5);
    expect(result.map((p) => p.id)).toEqual(["a1", "a2"]);
  });

  it("2026-08-16: 이번 보충 배치 안에서 동일 좌표 SHOPPING 후보는 대표 1건만 통과시킨다", async () => {
    poiFindMany.mockResolvedValue([
      shoppingRow("shop-a", "갤럭시 현대백화점", 36.63, 127.45),
      shoppingRow("shop-b", "골든듀 현대백화점", 36.63, 127.45),
      shoppingRow("shop-c", "탑텐 현대백화점", 36.63, 127.45),
      shoppingRow("shop-independent", "가경 터미널시장", 36.6, 127.4),
    ]);
    const result = await fetchAdditionalGeneralPois("region-1", [], 4);
    const ids = result.map((p) => p.id);
    expect(ids).toContain("shop-independent");
    const departmentSelected = ids.filter((id) => id === "shop-a" || id === "shop-b" || id === "shop-c");
    expect(departmentSelected.length).toBe(1);
  });

  it("2026-08-16: 이미 선택된 SHOPPING 좌표(alreadySelectedShoppingCoordKeys)와 겹치면 보충 후보에서 제외한다", async () => {
    poiFindMany.mockResolvedValue([
      shoppingRow("shop-b", "골든듀 현대백화점", 36.63, 127.45),
      shoppingRow("shop-independent", "가경 터미널시장", 36.6, 127.4),
    ]);
    const alreadySelected = new Set(["36.63|127.45"]); // shop-a가 이미 strategy.poiIds에 있다고 가정
    const result = await fetchAdditionalGeneralPois("region-1", [], 2, alreadySelected);
    expect(result.map((p) => p.id)).toEqual(["shop-independent"]);
  });

  it("2026-08-16: SHOPPING이 아닌 카테고리는 동일 좌표라도 그대로 유지한다(dedup 대상 아님)", async () => {
    poiFindMany.mockResolvedValue([attractionRow("a1"), attractionRow("a2")]); // 둘 다 동일 좌표(34.8, 128.4)
    const result = await fetchAdditionalGeneralPois("region-1", [], 2);
    expect(result.map((p) => p.id)).toEqual(["a1", "a2"]);
  });
});

describe("shoppingCoordKeysOf", () => {
  it("SHOPPING 카테고리 POI의 좌표만 키 집합으로 뽑는다", async () => {
    const { shoppingCoordKeysOf } = await import("@/lib/services/poiDetails");
    const pois = [
      { id: "s1", name: "매장", category: "SHOPPING" as const, address: "", lat: 36.63, lng: 127.45, operatingHours: null, closedDays: null, sourceType: "API" as const },
      { id: "a1", name: "관광지", category: "ATTRACTION" as const, address: "", lat: 34.8, lng: 128.4, operatingHours: null, closedDays: null, sourceType: "API" as const },
    ];
    const keys = shoppingCoordKeysOf(pois);
    expect(keys.has("36.63|127.45")).toBe(true);
    expect(keys.has("34.8|128.4")).toBe(false);
    expect(keys.size).toBe(1);
  });
});
