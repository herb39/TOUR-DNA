import { describe, expect, it, vi } from "vitest";
import type { PoiLike } from "@/lib/domain/strategy";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";

const fetchPoisByCategoryMock = vi.fn();
vi.mock("@/lib/services/fetchPoisByCategory", () => ({
  fetchPoisByCategory: (...args: unknown[]) => fetchPoisByCategoryMock(...args),
}));

import { buildRecommendedPoiCandidates } from "@/lib/services/candidatePoolService";

function poi(id: string, name: string, category: PoiCategoryCode, extra: Partial<PoiLike> = {}): PoiLike {
  return { id, name, category, lat: 35.8, lng: 129.2, ...extra };
}

function setPool(pool: Partial<Record<PoiCategoryCode, PoiLike[]>>) {
  fetchPoisByCategoryMock.mockResolvedValue(pool);
}

describe("buildRecommendedPoiCandidates", () => {
  it("현재 SelectedPlan.course에 이미 포함된 POI는 후보 풀에서 제외한다", async () => {
    setPool({
      ATTRACTION: [poi("a1", "첨성대", "ATTRACTION", { lclsSystm1: "HS" }), poi("a2", "대릉원", "ATTRACTION", { lclsSystm1: "HS" })],
    });
    const result = await buildRecommendedPoiCandidates({
      templateId: "CULTURE_HISTORY",
      regionCode: "region-1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      existingPoiIds: ["a1"],
    });
    expect(result.map((c) => c.id)).not.toContain("a1");
    expect(result.map((c) => c.id)).toContain("a2");
  });

  it("구조 신호(lclsSystm1)로 확인되는 후보가 이름 키워드 후보보다 먼저 온다(structural relevance 우선)", async () => {
    setPool({
      ATTRACTION: [
        poi("keyword1", "가나다문화유적지(키워드만)", "ATTRACTION"),
        poi("structural1", "힣역사유물", "ATTRACTION", { lclsSystm1: "HS", lclsSystm2: "HS02" }),
      ],
    });
    const result = await buildRecommendedPoiCandidates({
      templateId: "CULTURE_HISTORY",
      regionCode: "region-1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      existingPoiIds: [],
    });
    const ids = result.map((c) => c.id);
    expect(ids.indexOf("structural1")).toBeLessThan(ids.indexOf("keyword1"));
  });

  it("preferredThemes가 비어 있어도(청주 재현) 전략 핵심 테마(templateCoreThemeCategories) 기반으로 관련 후보가 우선된다", async () => {
    setPool({
      ATTRACTION: [
        poi("shopping-like", "일반명소", "ATTRACTION"),
        poi("nature1", "문암생태공원", "ATTRACTION", { lclsSystm1: "NA", lclsSystm2: "NA01" }),
      ],
    });
    const result = await buildRecommendedPoiCandidates({
      templateId: "NATURE_WELLNESS",
      regionCode: "region-1",
      travelMonth: 9,
      preferredThemes: [],
      existingPoiIds: [],
    });
    const ids = result.map((c) => c.id);
    expect(ids.indexOf("nature1")).toBeLessThan(ids.indexOf("shopping-like"));
  });

  it("동일 시설(동일 좌표) SHOPPING 후보는 대표 1건만 후보 풀에 포함한다", async () => {
    setPool({
      SHOPPING: [
        poi("shop-a", "갤럭시 현대백화점", "SHOPPING", { lat: 36.63, lng: 127.45 }),
        poi("shop-b", "골든듀 현대백화점", "SHOPPING", { lat: 36.63, lng: 127.45 }),
        poi("shop-c", "가경 터미널시장", "SHOPPING", { lat: 36.6, lng: 127.4 }),
      ],
    });
    const result = await buildRecommendedPoiCandidates({
      templateId: "LOCAL_FOOD_MARKET",
      regionCode: "region-1",
      travelMonth: 9,
      preferredThemes: [],
      existingPoiIds: [],
    });
    const departmentSelected = result.filter((c) => c.id === "shop-a" || c.id === "shop-b");
    expect(departmentSelected.length).toBeLessThanOrEqual(1);
    expect(result.map((c) => c.id)).toContain("shop-c");
  });

  it("BELOW_MINIMUM_FIT 판정을 받는 후보(전략과 무관한 FALLBACK 카테고리+테마 불일치)는 후보 풀에서 제외한다", async () => {
    setPool({
      ATTRACTION: [poi("waterpark", "강동 워터파크", "ATTRACTION")],
      SHOPPING: [poi("shop1", "일반 쇼핑몰", "SHOPPING")], // CULTURE_HISTORY에서 SHOPPING은 FALLBACK 티어
    });
    const result = await buildRecommendedPoiCandidates({
      templateId: "CULTURE_HISTORY",
      regionCode: "region-1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      existingPoiIds: [],
    });
    expect(result.map((c) => c.id)).not.toContain("shop1");
  });

  it("좌표가 없는 POI는 일정 추가에 필요한 필수 데이터가 없어 후보 풀에서 제외한다", async () => {
    setPool({
      ATTRACTION: [poi("no-coords", "좌표없음", "ATTRACTION", { lat: undefined, lng: undefined })],
    });
    const result = await buildRecommendedPoiCandidates({
      templateId: "CULTURE_HISTORY",
      regionCode: "region-1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      existingPoiIds: [],
    });
    expect(result.map((c) => c.id)).not.toContain("no-coords");
  });

  it("추천 가능한 후보가 없으면 빈 배열을 반환한다(오류가 아니라 정상적인 빈 결과)", async () => {
    setPool({});
    const result = await buildRecommendedPoiCandidates({
      templateId: "CULTURE_HISTORY",
      regionCode: "region-1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      existingPoiIds: [],
    });
    expect(result).toEqual([]);
  });

  it("동일 입력에는 항상 동일 결과(deterministic)", async () => {
    setPool({
      ATTRACTION: [
        poi("a1", "가나다명소", "ATTRACTION"),
        poi("a2", "힣역사유물", "ATTRACTION", { lclsSystm1: "HS" }),
      ],
    });
    const params = {
      templateId: "CULTURE_HISTORY",
      regionCode: "region-1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      existingPoiIds: [],
    };
    const first = await buildRecommendedPoiCandidates(params);
    const second = await buildRecommendedPoiCandidates(params);
    expect(first).toEqual(second);
  });
});
