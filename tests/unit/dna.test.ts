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
    provenance: "LIVE_API",
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

  describe("Network 축 — POI 근거/관계 근거 분리(Phase 1-E)", () => {
    it("POI/관계 근거가 서로 다른 metricCode의 별도 Evidence로 생성된다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 3,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: { count: 3, provenance: "CURATED", isSnapshotFallback: true },
        },
      });
      const result = computeDna(input);
      expect(result.network.evidence).toHaveLength(2);
      const codes = result.network.evidence.map((e) => e.metricCode);
      expect(codes).toContain("networkPoiCount");
      expect(codes).toContain("networkRelationCount");
    });

    it("API POI만 있으면 POI 근거는 LIVE_API/isSnapshotFallback:false다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 0,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 12, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: null,
        },
      });
      const result = computeDna(input);
      const poiEvidence = result.network.evidence.find((e) => e.metricCode === "networkPoiCount");
      expect(poiEvidence?.provenance).toBe("LIVE_API");
    });

    it("fixture POI가 섞이면 POI 근거는 CURATED/isSnapshotFallback:true다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 0,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 5, fixtureCount: 3, provenance: "CURATED", isSnapshotFallback: true },
          relation: null,
        },
      });
      const result = computeDna(input);
      const poiEvidence = result.network.evidence.find((e) => e.metricCode === "networkPoiCount");
      expect(poiEvidence?.provenance).toBe("CURATED");
      // 혼합 상태를 API/fixture 건수로 투명하게 노출한다(단순히 "하나라도 API면 LIVE_API"가 아님).
      expect(poiEvidence?.appliedRule).toContain("API 수집 5건");
      expect(poiEvidence?.appliedRule).toContain("큐레이션(FIXTURE) 3건");
    });

    it("관계 근거(CURATED)가 있어도 API POI 근거는 CURATED로 격하되지 않는다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 4,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 10, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: { count: 4, provenance: "CURATED", isSnapshotFallback: true },
        },
      });
      const result = computeDna(input);
      const poiEvidence = result.network.evidence.find((e) => e.metricCode === "networkPoiCount");
      const relationEvidence = result.network.evidence.find((e) => e.metricCode === "networkRelationCount");
      // 관계는 CURATED지만 POI 근거는 여전히 LIVE_API — 관계가 POI 근거를 격하하지 않는다.
      expect(poiEvidence?.provenance).toBe("LIVE_API");
      expect(relationEvidence?.provenance).toBe("CURATED");
      // 단, 축 전체 상태는 두 근거 중 하나라도 fallback이면 SNAPSHOT(기존 원칙 유지).
      expect(result.network.status).toBe("SNAPSHOT");
    });

    it("관계가 하나도 없으면(relation: null) 관계 Evidence 자체를 만들지 않는다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 0,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: null,
        },
      });
      const result = computeDna(input);
      expect(result.network.evidence).toHaveLength(1);
      expect(result.network.evidence[0].metricCode).toBe("networkPoiCount");
      // 관계 근거가 없을 뿐 POI 근거만으로는 여전히 LIVE 판정이 가능하다.
      expect(result.network.status).toBe("LIVE");
    });
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
      previousVisitorCount: {
        value: 1000,
        baseYm: "202508",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-06-01T00:00:00.000Z",
        provenance: "ESTIMATED",
        isSnapshotFallback: true,
      },
      currentVisitorCount: {
        value: 1200,
        baseYm: "202509",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-07-01T00:00:00.000Z",
        provenance: "ESTIMATED",
        isSnapshotFallback: true,
      },
    });
    const result = computeDna(input);
    expect(result.demand.evidence.some((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH)).toBe(
      true,
    );
    // 방문자수 Evidence의 provenance는 ESTIMATED 그대로 보존된다 — 임의로 LIVE_API로 승격하지 않는다.
    const growthEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH);
    expect(growthEvidence?.provenance).toBe("ESTIMATED");
  });

  it("방문자수 증감률 근거는 current/previous 둘 다 LIVE_API일 때만 LIVE_API로 분류된다", () => {
    const input = baseInput({
      previousVisitorCount: {
        value: 1000,
        baseYm: "202508",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-06-01T00:00:00.000Z",
        provenance: "LIVE_API",
        isSnapshotFallback: false,
      },
      currentVisitorCount: {
        value: 1200,
        baseYm: "202509",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-07-01T00:00:00.000Z",
        provenance: "LIVE_API",
        isSnapshotFallback: false,
      },
    });
    const result = computeDna(input);
    const growthEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH);
    expect(growthEvidence?.provenance).toBe("LIVE_API");
  });

  it("방문자수 증감률 근거는 current/previous 중 하나라도 fallback이면 전체가 fallback으로 취급된다", () => {
    const input = baseInput({
      previousVisitorCount: {
        value: 1000,
        baseYm: "202508",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-06-01T00:00:00.000Z",
        provenance: "CACHED_API",
        isSnapshotFallback: true,
      },
      currentVisitorCount: {
        value: 1200,
        baseYm: "202509",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-07-01T00:00:00.000Z",
        provenance: "LIVE_API",
        isSnapshotFallback: false,
      },
    });
    const result = computeDna(input);
    // demand 축은 서비스수요/자원수요 다른 지표도 섞이므로, 증감률 evidence 자체의 fallback 여부는
    // combineAxisStatus에 들어가는 entries를 통해 간접 확인한다(evidence 자체엔 별도 필드 없음) —
    // 대신 provenance가 current(LIVE_API)를 우선하되, 증감률이 신뢰할 수 있는 값인지는 두 값을 모두
    // 사용한다는 점에서 previous가 fallback이면 axis 결합 상태도 영향을 받아야 한다.
    expect(result.demand.status).not.toBe("LIVE");
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
