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

  it("최초 후보에 이미 식사 가능 FOOD가 충분하면 식사 보충 조회는 하지 않는다(일반 방문 후보 보충은 별개)", async () => {
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
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id && (where.id as { in: string[] }).in) {
        return [
          foodRow("food-1", "A05020100"),
          foodRow("food-2", "A05020200"),
          attractionRow("a1", 128.41),
          attractionRow("a2", 128.42),
        ];
      }
      // 식사 보충(category:"FOOD")이 아니라 일반 방문 후보 보충(category:{in:[...]})만 호출돼야 한다.
      expect(where.category).not.toBe("FOOD");
      return [];
    });

    await ensureSelectedPlan("project-2");

    // DAY_TRIP 식사 선점 목표(2개)는 이미 충족하므로 식사 보충(category:"FOOD" 단일 조건) 호출은 없다.
    const foodSupplementCalls = poiFindMany.mock.calls.filter(([{ where }]) => where.category === "FOOD");
    expect(foodSupplementCalls).toHaveLength(0);
  });

  it("비숙박 POI 총량이 이 기간의 원래 목표 밀도(식사 선점 포함)에 못 미치면 같은 지역의 일반 방문 후보로 보충한다(강릉 사례 재현)", async () => {
    // DAY_TRIP 목표(4) + 식사 선점 목표(2) = 6. 최초 후보는 4개(식사 2 + 관광 2)뿐이라 2개가 부족하다.
    const ids = ["food-1", "food-2", "a1", "a2"];
    projectFindUniqueOrThrow.mockResolvedValue({
      id: "project-3",
      regionId: REGION_ID,
      selectedStrategyResultId: "strategy-3",
      selectedPlan: null,
      input: { duration: "DAY_TRIP", transport: "WALK" },
      region: { name: "강릉시" },
    });
    strategyResultFindUniqueOrThrow.mockResolvedValue({
      id: "strategy-3",
      templateId: "LOCAL_FOOD_MARKET",
      name: "로컬미식·시장 연계형",
      concept: "강릉 로컬 미식",
      totalScore: 80,
      targetDescription: "미식 여행객",
      reasons: ["r1", "r2", "r3"],
      poiIds: ids,
    });
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id && (where.id as { in: string[] }).in) {
        return [
          foodRow("food-1", "A05020100"),
          foodRow("food-2", "A05020200"),
          attractionRow("a1", 128.41),
          attractionRow("a2", 128.42),
        ];
      }
      // 일반 방문 후보 보충 호출: FOOD 카테고리가 아니라 관광/체험/축제/쇼핑 카테고리 목록으로 조회한다.
      expect(where.regionId).toBe(REGION_ID);
      expect(where.category).toEqual({ in: ["ATTRACTION", "EXPERIENCE", "FESTIVAL", "SHOPPING"] });
      return [attractionRow("a3", 128.43), attractionRow("a4", 128.44)];
    });

    const plan = await ensureSelectedPlan("project-3");

    const savedCourse = selectedPlanUpsert.mock.calls[0][0].create.course as {
      days: { items: { poiId: string }[] }[];
    };
    const allIds = savedCourse.days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(allIds).toContain("a3");
    expect(allIds).toContain("a4");
    expect(plan).toEqual({ id: "plan-1" });
  });
});

describe("ensureSelectedPlan — Phase 4: 역할·국적·테마·월 컨텍스트를 실행안 체크리스트/위험요인에 전달한다", () => {
  it("project.role/input.nationality/travelMonth/preferredThemes를 buildOperationChecklist·buildRisks에 전달한다", async () => {
    const ids = ["a1", "a2"];
    projectFindUniqueOrThrow.mockResolvedValue({
      id: "project-4",
      regionId: REGION_ID,
      selectedStrategyResultId: "strategy-4",
      selectedPlan: null,
      role: "LOCAL_GOV",
      travelMonth: 7,
      input: {
        duration: "DAY_TRIP",
        transport: "WALK",
        nationality: "FOREIGN",
        preferredThemes: ["레저 액티비티"],
      },
      region: { name: "통영시" },
    });
    strategyResultFindUniqueOrThrow.mockResolvedValue({
      id: "strategy-4",
      templateId: "NATURE_WELLNESS",
      name: "자연·웰니스형",
      concept: "통영 자연 힐링",
      totalScore: 80,
      targetDescription: "자연을 좋아하는 소규모 그룹",
      reasons: ["r1", "r2", "r3"],
      poiIds: ids,
    });
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id && (where.id as { in: string[] }).in) {
        return [attractionRow("a1", 128.4), attractionRow("a2", 128.41)];
      }
      return [];
    });

    await ensureSelectedPlan("project-4");

    const saved = selectedPlanUpsert.mock.calls[0][0].create as {
      operationChecklist: string[];
      risks: { risk: string; mitigation: string }[];
    };
    expect(saved.operationChecklist).toContain("정책 보고용 정량 지표(KPI) 수집 방법 사전 확정 필요");
    expect(saved.operationChecklist).toContain("다국어 안내판/메뉴판 준비 여부 확인 필요(외국인 대상, 서비스 준비도 기준)");
    expect(saved.operationChecklist).toContain("레저·액티비티 실외 활동 안전장비·보험 가입 여부 사전 확인 필요");
    expect(saved.risks.some((r) => r.risk.includes("장마철"))).toBe(true);
  });

  it("role/nationality/travelMonth/preferredThemes가 없는 레거시 mock에도 오류 없이 기본 체크리스트만 생성한다", async () => {
    const ids = ["food-1", "a1"];
    projectFindUniqueOrThrow.mockResolvedValue({
      id: "project-5",
      regionId: REGION_ID,
      selectedStrategyResultId: "strategy-5",
      selectedPlan: null,
      input: { duration: "DAY_TRIP", transport: "WALK" },
      region: { name: "통영시" },
    });
    strategyResultFindUniqueOrThrow.mockResolvedValue({
      id: "strategy-5",
      templateId: "LOCAL_FOOD_MARKET",
      name: "로컬미식·시장 연계형",
      concept: "통영 로컬 미식",
      totalScore: 80,
      targetDescription: "미식 여행객",
      reasons: ["r1", "r2", "r3"],
      poiIds: ids,
    });
    poiFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.id && (where.id as { in: string[] }).in) {
        return [foodRow("food-1", "A05020100"), attractionRow("a1", 128.4)];
      }
      return [];
    });

    const plan = await ensureSelectedPlan("project-5");
    expect(plan).toEqual({ id: "plan-1" });
    const saved = selectedPlanUpsert.mock.calls[0][0].create as { operationChecklist: string[] };
    expect(saved.operationChecklist).toContain("출발 3일 전 예약 인원 최종 확정");
  });
});
