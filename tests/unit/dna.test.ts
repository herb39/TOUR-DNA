import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";

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
    isSnapshotFallback: false,
  };
}

function baseInput(overrides: Partial<DnaEngineInput> = {}): DnaEngineInput {
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
      relatedPoiCount: 12,
      foodCount: 20,
      lodgingCount: 10,
      experienceCount: 5,
      sourceCode: "POI_RELATION",
      collectedAt: "2026-07-01T00:00:00.000Z",
      isSnapshotFallback: false,
    },
    ...overrides,
  };
}

describe("computeDna", () => {
  it("모든 축에 데이터가 있으면 overallDataMode가 LIVE이고 liveAxisCount가 5", () => {
    const result = computeDna(baseInput());
    expect(result.overallDataMode).toBe("LIVE");
    expect(result.liveAxisCount).toBe(5);
    expect(result.demand.score).not.toBeNull();
    expect(result.stay.score).not.toBeNull();
    expect(result.spend.score).not.toBeNull();
    expect(result.diversity.score).not.toBeNull();
    expect(result.network.score).not.toBeNull();
  });

  it("모든 점수는 0~100 범위 안에 있다", () => {
    const result = computeDna(baseInput());
    for (const axis of [result.demand, result.stay, result.spend, result.diversity, result.network]) {
      if (axis.score !== null) {
        expect(axis.score).toBeGreaterThanOrEqual(0);
        expect(axis.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("코호트 내 최댓값을 가진 지역은 해당 축에서 100점에 가깝다", () => {
    // DAEJEON은 DEMAND_SERVICE 코호트에서 최댓값(80)을 가짐
    const result = computeDna(baseInput());
    expect(result.demand.score).toBeGreaterThan(50);
  });

  it("지표가 전혀 없는 축은 null과 MISSING 상태를 반환한다 (0점 아님)", () => {
    const input = baseInput();
    delete input.metricCohorts[METRIC_CODES.STAY];
    const result = computeDna(input);
    expect(result.stay.score).toBeNull();
    expect(result.stay.status).toBe("MISSING");
    expect(result.overallDataMode).not.toBe("LIVE");
  });

  it("networkInputs가 없으면 network 축이 MISSING", () => {
    const input = baseInput({ networkInputs: null });
    const result = computeDna(input);
    expect(result.network.score).toBeNull();
    expect(result.network.status).toBe("MISSING");
  });

  it("일부 지표가 스냅샷 폴백이면 해당 축 상태가 SNAPSHOT이고 overallDataMode는 HYBRID", () => {
    const input = baseInput();
    const stayCohort = input.metricCohorts[METRIC_CODES.STAY]!;
    input.metricCohorts[METRIC_CODES.STAY] = stayCohort.map((m) =>
      m.regionCode === "DAEJEON" ? { ...m, isSnapshotFallback: true } : m,
    );
    const result = computeDna(input);
    expect(result.stay.status).toBe("SNAPSHOT");
    expect(result.overallDataMode).toBe("HYBRID");
  });

  it("방문자수 증감률이 있으면 demand 축 근거에 포함된다", () => {
    const input = baseInput({
      previousVisitorCount: { value: 1000, baseYm: "202508", sourceCode: "VISITOR_CNT", collectedAt: "2026-06-01T00:00:00.000Z" },
      currentVisitorCount: { value: 1200, baseYm: "202509", sourceCode: "VISITOR_CNT", collectedAt: "2026-07-01T00:00:00.000Z" },
    });
    const result = computeDna(input);
    expect(result.demand.evidence.some((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH)).toBe(
      true,
    );
  });

  it("강점 2개, 기회 2개, 주의점 1개를 항상 반환한다", () => {
    const result = computeDna(baseInput());
    expect(result.strengths).toHaveLength(2);
    expect(result.opportunities).toHaveLength(2);
    expect(result.cautions).toHaveLength(1);
  });

  it("동일 입력에 대해 결정론적으로 동일한 결과를 반환한다", () => {
    const input = baseInput();
    const r1 = computeDna(input);
    const r2 = computeDna(input);
    expect(r1).toEqual(r2);
  });
});
