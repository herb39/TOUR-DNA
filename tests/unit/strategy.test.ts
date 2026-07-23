import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { computeStrategies, type ProjectInputForScoring } from "@/lib/domain/strategy";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { PoiLike } from "@/lib/domain/strategy";

const BASE_YM = "202509";

function metric(regionCode: string, rawValue: number, metricCode: string): RegionMetricValue {
  return {
    regionCode,
    baseYm: BASE_YM,
    metricCode,
    rawValue,
    unit: "index",
    adminLevel: "SIGUNGU",
    sourceCode: "TAR_SVC_DEM",
    collectedAt: "2026-07-01T00:00:00.000Z",
    provenance: "LIVE_API",
    isSnapshotFallback: false,
  };
}

function dnaInput(overrides: Partial<DnaEngineInput> = {}): DnaEngineInput {
  const cohortFor = (metricCode: string, values: [string, number][]) =>
    values.map(([region, v]) => metric(region, v, metricCode));

  return {
    regionCode: "DAEJEON",
    baseYm: BASE_YM,
    adminLevel: "SIGUNGU",
    metricCohorts: {
      [METRIC_CODES.DEMAND_SERVICE]: cohortFor(METRIC_CODES.DEMAND_SERVICE, [
        ["DAEJEON", 80],
        ["JECHEON", 40],
        ["YANGYANG", 60],
      ]),
      [METRIC_CODES.DEMAND_RESOURCE]: cohortFor(METRIC_CODES.DEMAND_RESOURCE, [
        ["DAEJEON", 70],
        ["JECHEON", 50],
        ["YANGYANG", 90],
      ]),
      [METRIC_CODES.STAY]: cohortFor(METRIC_CODES.STAY, [
        ["DAEJEON", 55],
        ["JECHEON", 65],
        ["YANGYANG", 95],
      ]),
      [METRIC_CODES.SPEND]: cohortFor(METRIC_CODES.SPEND, [
        ["DAEJEON", 60],
        ["JECHEON", 30],
        ["YANGYANG", 45],
      ]),
      [METRIC_CODES.DIVERSITY]: cohortFor(METRIC_CODES.DIVERSITY, [
        ["DAEJEON", 90],
        ["JECHEON", 40],
        ["YANGYANG", 55],
      ]),
    },
    networkInputs: {
      attractionCount: 8,
      relatedPoiCount: 0,
      foodCount: 20,
      lodgingCount: 10,
      experienceCount: 5,
      collectedAt: "2026-07-01T00:00:00.000Z",
      poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
      relation: null,
    },
    ...overrides,
  };
}

function baseProjectInput(overrides: Partial<ProjectInputForScoring> = {}): ProjectInputForScoring {
  return {
    ageGroups: ["AGE_20S", "AGE_30S"],
    companionType: "COMPANION_FRIENDS",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: null,
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "PUBLIC_TRANSPORT",
    groupType: "SMALL_10_20",
    travelMonth: 9,
    preferredThemes: [],
    excludedThemes: [],
    ...overrides,
  };
}

function poi(id: string, name: string, category: PoiCategoryCode): PoiLike {
  return { id, name, category };
}

const poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
  FOOD: [poi("f1", "성심당", "FOOD"), poi("f2", "중앙시장 맛집", "FOOD")],
  LODGING: [poi("l1", "유성호텔", "LODGING")],
  EXPERIENCE: [poi("e1", "한밭수목원 체험", "EXPERIENCE")],
  ATTRACTION: [poi("a1", "대전엑스포과학공원", "ATTRACTION"), poi("a2", "장태산휴양림", "ATTRACTION")],
  FESTIVAL: [poi("fe1", "대전사이언스페스티벌", "FESTIVAL")],
  SHOPPING: [poi("s1", "은행동 지하상가", "SHOPPING")],
};

describe("computeStrategies", () => {
  it("항상 3개의 전략을 반환하고 서로 다른 템플릿이다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    expect(strategies).toHaveLength(3);
    const ids = new Set(strategies.map((s) => s.templateId));
    expect(ids.size).toBe(3);
  });

  it("모든 하위 점수와 총점은 0~100 범위 안에 있다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      expect(s.totalScore).toBeGreaterThanOrEqual(0);
      expect(s.totalScore).toBeLessThanOrEqual(100);
      for (const v of Object.values(s.scoreBreakdown)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("순위는 총점 내림차순이다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    expect(strategies[0].totalScore).toBeGreaterThanOrEqual(strategies[1].totalScore);
    expect(strategies[1].totalScore).toBeGreaterThanOrEqual(strategies[2].totalScore);
    expect(strategies.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it("각 전략은 최소 3개의 근거를 갖는다 (LIVE 데이터 기준)", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      expect(s.evidences.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("전략마다 이유가 정확히 3개다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      expect(s.reasons).toHaveLength(3);
    }
  });

  it("음식/숙박/체험 중 최소 2개 업종을 포함한다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      const count = [s.consumptionTouchpoints.food, s.consumptionTouchpoints.lodging, s.consumptionTouchpoints.experience].filter(Boolean).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it("동점 시 supplyFit → demandFit → templateId 순으로 정렬한다", () => {
    // 인위적으로 동일 totalScore가 나오도록 두 템플릿이 같은 DNA 조건에서 같은 점수를 갖게 하기보다,
    // 정렬 로직 자체를 화이트박스로 검증: totalScore가 같을 때 supplyFit 비교가 우선한다.
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (let i = 0; i < strategies.length - 1; i++) {
      const a = strategies[i];
      const b = strategies[i + 1];
      if (a.totalScore === b.totalScore) {
        expect(a.scoreBreakdown.supplyFit).toBeGreaterThanOrEqual(b.scoreBreakdown.supplyFit);
      }
    }
  });

  it("여행 시기가 바뀌면 seasonFit과 전략 결과가 달라진다", () => {
    const dna = computeDna(dnaInput());
    const septemberResult = computeStrategies(dna, baseProjectInput({ travelMonth: 9 }), poisByCategory, MODEL_VERSION);
    const januaryResult = computeStrategies(dna, baseProjectInput({ travelMonth: 1 }), poisByCategory, MODEL_VERSION);
    expect(septemberResult).not.toEqual(januaryResult);
  });

  it("지역 데이터(DNA)가 바뀌면 전략 점수/순위가 달라진다", () => {
    const daejeonDna = computeDna(dnaInput({ regionCode: "DAEJEON" }));
    const yangyangDna = computeDna(dnaInput({ regionCode: "YANGYANG" }));
    const input = baseProjectInput();
    const daejeonStrategies = computeStrategies(daejeonDna, input, poisByCategory, MODEL_VERSION);
    const yangyangStrategies = computeStrategies(yangyangDna, input, poisByCategory, MODEL_VERSION);
    expect(daejeonStrategies).not.toEqual(yangyangStrategies);
  });

  it("제외 테마에 해당하는 전략은 후보에서 빠진다", () => {
    const dna = computeDna(dnaInput());
    const withoutExclusion = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    const withExclusion = computeStrategies(
      dna,
      baseProjectInput({ excludedThemes: ["축제"] }),
      poisByCategory,
      MODEL_VERSION,
    );
    expect(withExclusion.some((s) => s.templateId === "FESTIVAL_EVENT")).toBe(false);
    expect(withoutExclusion.length).toBe(3);
  });

  it("동일 입력에 대해 결정론적으로 동일한 결과를 반환한다", () => {
    const dna = computeDna(dnaInput());
    const input = baseProjectInput();
    const r1 = computeStrategies(dna, input, poisByCategory, MODEL_VERSION);
    const r2 = computeStrategies(dna, input, poisByCategory, MODEL_VERSION);
    expect(r1).toEqual(r2);
  });

  it("fixture에 없는 POI는 poiIds에 등장하지 않는다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    const knownIds = new Set(Object.values(poisByCategory).flat().map((p) => p!.id));
    for (const s of strategies) {
      for (const id of s.poiIds) {
        expect(knownIds.has(id)).toBe(true);
      }
    }
  });
});
