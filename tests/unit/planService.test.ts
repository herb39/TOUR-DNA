// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const projectFindUniqueOrThrow = vi.fn();
const strategyResultFindUniqueOrThrow = vi.fn();
const poiFindMany = vi.fn();
const selectedPlanUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUniqueOrThrow: (...args: unknown[]) => projectFindUniqueOrThrow(...args) },
    strategyResult: { findUniqueOrThrow: (...args: unknown[]) => strategyResultFindUniqueOrThrow(...args) },
    poi: { findMany: (...args: unknown[]) => poiFindMany(...args) },
    selectedPlan: { upsert: (...args: unknown[]) => selectedPlanUpsert(...args) },
  },
}));

import { ensureSelectedPlan } from "@/lib/services/planService";

const REGION_ID = "region-tongyeong";

function attractionRow(id: string, lng: number) {
  return {
    id,
    name: `관광지-${id}`,
    category: "ATTRACTION",
    address: "통영시 어딘가",
    lat: 34.8,
    lng,
    operatingHours: null,
    closedDays: null,
    sourceType: "API",
    rawPayload: { contenttypeid: "12" },
  };
}

function foodRow(id: string, cat3: string | null) {
  return {
    id,
    name: `식당-${id}`,
    category: "FOOD",
    address: "통영시 어딘가",
    lat: 34.81,
    lng: 128.42,
    operatingHours: null,
    closedDays: null,
    sourceType: "API",
    rawPayload: cat3 ? { contenttypeid: "39", cat1: "A05", cat2: "A0502", cat3 } : { contenttypeid: "39" },
  };
}

beforeEach(() => {
  projectFindUniqueOrThrow.mockReset();
  strategyResultFindUniqueOrThrow.mockReset();
  poiFindMany.mockReset();
  selectedPlanUpsert.mockReset();
  selectedPlanUpsert.mockResolvedValue({ id: "plan-1" });
});

describe("ensureSelectedPlan — 최초 후보에 식사 가능 FOOD가 부족하면 지역 DB에서 보충한다(통영 재현 회귀)", () => {
  it("전략의 poiIds가 전부 ATTRACTION이어도(과거에 고정된 후보를 흉내) 지역 FOOD를 보충해 점심이 배치된다", async () => {
    const attractionIds = ["a1", "a2", "a3", "a4"];
    projectFindUniqueOrThrow.mockResolvedValue({
      id: "project-1",
      regionId: REGION_ID,
      selectedStrategyResultId: "strategy-1",
      selectedPlan: null,
      input: { duration: "DAY_TRIP", transport: "WALK" },
      region: { name: "통영시" },
    });
    strategyResultFindUniqueOrThrow.mockResolvedValue({
      id: "strategy-1",
      templateId: "NATURE_WELLNESS",
      name: "자연·웰니스형",
      concept: "통영 자연 힐링",
      totalScore: 80,
      targetDescription: "자연을 좋아하는 소규모 그룹",
      reasons: ["r1", "r2", "r3"],
      poiIds: attractionIds, // FOOD가 하나도 없음 — selectPois 보정 이전에 고정된 값을 흉내낸다.
    });

    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id && (where.id as { in: string[] }).in) {
        // fetchPoiDetailsInOrder(strategy.poiIds) 호출
        return attractionIds.map((id, i) => attractionRow(id, 128.4 + i * 0.01));
      }
      // fetchAdditionalMealEligibleFood(regionId, excludeIds, limit) 호출
      expect(where.regionId).toBe(REGION_ID);
      expect(where.category).toBe("FOOD");
      return [foodRow("food-cafe", "A05020900"), foodRow("food-korean", "A05020100"), foodRow("food-western", "A05020200")];
    });

    const plan = await ensureSelectedPlan("project-1");

    expect(selectedPlanUpsert).toHaveBeenCalledTimes(1);
    const savedCourse = selectedPlanUpsert.mock.calls[0][0].create.course as { days: { items: { poiId: string; category: string; timeSlot: string }[] }[] };
    const allItems = savedCourse.days.flatMap((d) => d.items);

    // 보충된 식사 가능 FOOD(카페 제외) 중 최소 1개는 실제로 일정에 포함돼야 한다.
    expect(allItems.some((i) => i.poiId === "food-korean" || i.poiId === "food-western")).toBe(true);
    // 카페(mealEligible=false)는 보충 대상에서 아예 제외된다.
    expect(allItems.some((i) => i.poiId === "food-cafe")).toBe(false);
    // 점심 시간대(11:30~13:30)에 FOOD가 배치됐는지 확인한다.
    const foodItems = allItems.filter((i) => i.category === "FOOD");
    expect(foodItems.length).toBeGreaterThan(0);
    const lunchStart = 11 * 60 + 30;
    const lunchEnd = 13 * 60 + 30;
    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    expect(foodItems.some((i) => toMinutes(i.timeSlot) >= lunchStart && toMinutes(i.timeSlot) <= lunchEnd)).toBe(true);

    expect(plan).toEqual({ id: "plan-1" });
  });

  it("최초 후보에 이미 식사 가능 FOOD가 충분하면 지역 DB 보충 조회를 하지 않는다", async () => {
    const ids = ["food-1", "food-2", "a1", "a2"];
    projectFindUniqueOrThrow.mockResolvedValue({
      id: "project-2",
      regionId: REGION_ID,
      selectedStrategyResultId: "strategy-2",
      selectedPlan: null,
      input: { duration: "DAY_TRIP", transport: "WALK" },
      region: { name: "통영시" },
    });
    strategyResultFindUniqueOrThrow.mockResolvedValue({
      id: "strategy-2",
      templateId: "LOCAL_FOOD_MARKET",
      name: "로컬미식·시장 연계형",
      concept: "통영 로컬 미식",
      totalScore: 80,
      targetDescription: "미식 여행객",
      reasons: ["r1", "r2", "r3"],
      poiIds: ids,
    });
    poiFindMany.mockResolvedValue([
      foodRow("food-1", "A05020100"),
      foodRow("food-2", "A05020200"),
      attractionRow("a1", 128.41),
      attractionRow("a2", 128.42),
    ]);

    await ensureSelectedPlan("project-2");

    // DAY_TRIP 식사 선점 목표(2개)를 이미 충족하므로 보충용 findMany(카테고리 조건)는 호출되지 않아야 한다
    // — 호출은 fetchPoiDetailsInOrder의 1회(전체 id 목록 조회)만 있어야 한다.
    expect(poiFindMany).toHaveBeenCalledTimes(1);
  });
});
