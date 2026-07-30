// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const poiFindMany = vi.fn();
const regionFindUniqueOrThrow = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    poi: { findMany: (...args: unknown[]) => poiFindMany(...args) },
    region: { findUniqueOrThrow: (...args: unknown[]) => regionFindUniqueOrThrow(...args) },
  },
}));

import { buildStrategyPoiFitSummary } from "@/lib/services/poiFitService";

// CULTURE_HISTORY: poiCategories=["ATTRACTION","EXPERIENCE","FOOD"], idealMonths=[3,4,5,9,10,11].
const TEMPLATE_ID = "CULTURE_HISTORY";
const REGION_CODE = "region-gyeongju";

function poiRow(id: string, name: string, category: string) {
  return {
    id,
    name,
    category,
    address: "경주시 어딘가",
    lat: 35.8,
    lng: 129.2,
    operatingHours: null,
    closedDays: null,
    sourceType: "API",
    rawPayload: null,
  };
}

beforeEach(() => {
  poiFindMany.mockReset();
  regionFindUniqueOrThrow.mockReset();
  regionFindUniqueOrThrow.mockResolvedValue({ id: "region-1", code: REGION_CODE, level: "SIGUNGU" });
});

describe("buildStrategyPoiFitSummary — 필터링 후 개수로 후보 부족을 계산한다(2026-07-30 보완)", () => {
  it("코스에 담긴 POI 목록(이미 필터링됨) 기준으로 fit을 계산하고, 목표보다 적으면 부족 안내를 만든다", async () => {
    // 코스에는 REQUIRED_SLOT(FOOD) 2개 + 적합 판정을 통과한 관광지 몇 개만 있다고 가정(실제로는
    // planService.ts가 이미 저적합을 걸러낸 뒤의 course.days에서 poiIds를 뽑아 넘긴다).
    const poiIds = ["food1", "food2", "heritage1"];
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id) {
        return [
          poiRow("food1", "식당1", "FOOD"),
          poiRow("food2", "식당2", "FOOD"),
          poiRow("heritage1", "경주 문화유적 전시관", "ATTRACTION"),
        ];
      }
      // 지역 전체 후보 풀 — 적합 기준을 통과하는 것과 통과 못 하는 것을 섞어 둔다.
      return [
        poiRow("food1", "식당1", "FOOD"),
        poiRow("food2", "식당2", "FOOD"),
        poiRow("heritage1", "경주 문화유적 전시관", "ATTRACTION"),
        poiRow("waterpark", "강동 워터파크", "ATTRACTION"), // 테마 불일치로 걸러짐
        poiRow("camp", "경주초우오토캠핑장", "EXPERIENCE"), // 테마 불일치로 걸러짐
      ];
    });

    const summary = await buildStrategyPoiFitSummary({
      templateId: TEMPLATE_ID,
      regionCode: REGION_CODE,
      poiIds,
      travelMonth: 10,
      preferredThemes: ["문화·역사"],
      duration: "DAY_TRIP",
    });

    // FOOD는 REQUIRED_SLOT, heritage1은 RECOMMENDED(테마 일치) — fitsByPoiId에 모두 존재해야 한다.
    expect(summary.fitsByPoiId.food1.recommendationStatus).toBe("REQUIRED_SLOT");
    expect(summary.fitsByPoiId.heritage1.recommendationStatus).toBe("RECOMMENDED");

    // DAY_TRIP 목표(4)+식사선점(2)=6, 실제 비숙박 개수=3(food1,food2,heritage1) → 3곳 부족.
    expect(summary.shortage).not.toBeNull();
    expect(summary.shortage?.targetCount).toBe(6);
    expect(summary.shortage?.actualCount).toBe(3);
    expect(summary.shortage?.shortfallCount).toBe(3);
    // 지역 전체 후보 중 워터파크·캠핑장 2곳이 적합 기준 미달로 제외된 것으로 계산돼야 한다.
    expect(summary.shortage?.filteredOutCount).toBe(2);
  });

  it("지역 전체 후보 자체가 목표보다 적으면(적합 기준을 통과해도 부족) dataInsufficient=true로 표시한다", async () => {
    const poiIds = ["food1"];
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id) return [poiRow("food1", "식당1", "FOOD")];
      // 지역 전체에 적합 후보가 거의 없다.
      return [poiRow("food1", "식당1", "FOOD"), poiRow("heritage1", "경주 문화유적 전시관", "ATTRACTION")];
    });

    const summary = await buildStrategyPoiFitSummary({
      templateId: TEMPLATE_ID,
      regionCode: REGION_CODE,
      poiIds,
      travelMonth: 10,
      preferredThemes: ["문화·역사"],
      duration: "TWO_NIGHTS_THREE_DAYS",
    });

    expect(summary.shortage).not.toBeNull();
    expect(summary.shortage?.dataInsufficient).toBe(true);
    expect(summary.shortage?.filteredOutCount).toBe(0);
  });

  it("목표를 채우고도 남으면 부족 안내를 만들지 않는다(회귀 확인)", async () => {
    const poiIds = ["food1", "food2", "a1", "a2", "a3", "a4"];
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id) {
        return [
          poiRow("food1", "식당1", "FOOD"),
          poiRow("food2", "식당2", "FOOD"),
          poiRow("a1", "경주 문화유적 전시관 1", "ATTRACTION"),
          poiRow("a2", "경주 문화유적 전시관 2", "ATTRACTION"),
          poiRow("a3", "경주 문화유적 전시관 3", "ATTRACTION"),
          poiRow("a4", "경주 문화유적 전시관 4", "ATTRACTION"),
        ];
      }
      return [];
    });

    const summary = await buildStrategyPoiFitSummary({
      templateId: TEMPLATE_ID,
      regionCode: REGION_CODE,
      poiIds,
      travelMonth: 10,
      preferredThemes: ["문화·역사"],
      duration: "DAY_TRIP",
    });

    expect(summary.shortage).toBeNull();
  });

  it("실행안·인쇄 화면은 같은 함수를 같은 입력으로 호출하므로, 동일 poiIds에 대해 항상 동일한 결과를 반환한다", async () => {
    const poiIds = ["food1", "heritage1"];
    const rows = [
      poiRow("food1", "식당1", "FOOD"),
      poiRow("heritage1", "경주 문화유적 전시관", "ATTRACTION"),
    ];
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      return where.id ? rows : [];
    });

    const params = {
      templateId: TEMPLATE_ID,
      regionCode: REGION_CODE,
      poiIds,
      travelMonth: 10,
      preferredThemes: ["문화·역사"],
      duration: "DAY_TRIP" as const,
    };
    const summaryForPlanPage = await buildStrategyPoiFitSummary(params);
    const summaryForPrintPage = await buildStrategyPoiFitSummary(params);

    expect(summaryForPlanPage).toEqual(summaryForPrintPage);
  });
});
