import { describe, expect, it } from "vitest";
import { computeDataVersion } from "@/lib/domain/dataVersion";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";

const BASE_YM = "202606";

function metric(regionCode: string, rawValue: number, metricCode: string, collectedAt: string): RegionMetricValue {
  return {
    regionCode,
    baseYm: BASE_YM,
    metricCode,
    rawValue,
    unit: "index",
    adminLevel: "SIGUNGU",
    sourceCode: "TAR_SVC_DEM",
    collectedAt,
    provenance: "LIVE_API",
    isSnapshotFallback: false,
  };
}

function baseInput(overrides: Partial<DnaEngineInput> = {}, collectedAt = "2026-07-01T00:00:00.000Z"): DnaEngineInput {
  return {
    regionCode: "SGG_GYEONGJU",
    baseYm: BASE_YM,
    adminLevel: "SIGUNGU",
    metricCohorts: {
      [METRIC_CODES.DEMAND_SERVICE]: [
        metric("SGG_GYEONGJU", 87.45, METRIC_CODES.DEMAND_SERVICE, collectedAt),
        metric("SGG_GANGNEUNG", 113.38, METRIC_CODES.DEMAND_SERVICE, collectedAt),
      ],
      [METRIC_CODES.STAY]: [metric("SGG_GYEONGJU", 113.3, METRIC_CODES.STAY, collectedAt)],
    },
    networkInputs: {
      attractionCount: 5,
      foodCount: 3,
      lodgingCount: 1,
      experienceCount: 1,
      collectedAt,
      poi: { apiCount: 5, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
    },
    ...overrides,
  };
}

describe("computeDataVersion — P0-5: canonical payload, 휘발성 메타데이터 제외", () => {
  it("동일한 실제 데이터는 collectedAt(수집 시각)이 달라도 동일한 해시를 낸다", () => {
    const a = computeDataVersion(baseInput({}, "2026-07-01T00:00:00.000Z"));
    const b = computeDataVersion(baseInput({}, "2026-07-27T09:12:34.000Z"));
    expect(a).toBe(b);
  });

  it("동일한 입력을 반복 계산해도 항상 같은 해시를 낸다(결정론성)", () => {
    const input = baseInput();
    expect(computeDataVersion(input)).toBe(computeDataVersion(input));
  });

  it("대상 지역 자신의 지표 원값이 바뀌면 해시가 바뀐다", () => {
    const original = computeDataVersion(baseInput());
    const changed = baseInput();
    changed.metricCohorts[METRIC_CODES.DEMAND_SERVICE] = [
      metric("SGG_GYEONGJU", 99.99, METRIC_CODES.DEMAND_SERVICE, "2026-07-01T00:00:00.000Z"),
      metric("SGG_GANGNEUNG", 113.38, METRIC_CODES.DEMAND_SERVICE, "2026-07-01T00:00:00.000Z"),
    ];
    expect(computeDataVersion(changed)).not.toBe(original);
  });

  it("비교 코호트(다른 지역)의 값이 바뀌어도 해시가 바뀐다(정규화 결과에 영향을 주므로)", () => {
    const original = computeDataVersion(baseInput());
    const changed = baseInput();
    changed.metricCohorts[METRIC_CODES.DEMAND_SERVICE] = [
      metric("SGG_GYEONGJU", 87.45, METRIC_CODES.DEMAND_SERVICE, "2026-07-01T00:00:00.000Z"),
      metric("SGG_GANGNEUNG", 200, METRIC_CODES.DEMAND_SERVICE, "2026-07-01T00:00:00.000Z"),
    ];
    expect(computeDataVersion(changed)).not.toBe(original);
  });

  it("provenance(신뢰 수준)가 바뀌면 원값이 같아도 해시가 바뀐다", () => {
    const original = computeDataVersion(baseInput());
    const changed = baseInput();
    changed.metricCohorts[METRIC_CODES.DEMAND_SERVICE] = [
      { ...metric("SGG_GYEONGJU", 87.45, METRIC_CODES.DEMAND_SERVICE, "2026-07-01T00:00:00.000Z"), provenance: "CACHED_API" },
      metric("SGG_GANGNEUNG", 113.38, METRIC_CODES.DEMAND_SERVICE, "2026-07-01T00:00:00.000Z"),
    ];
    expect(computeDataVersion(changed)).not.toBe(original);
  });

  it("networkInputs의 POI 개수가 바뀌면 해시가 바뀐다", () => {
    const original = computeDataVersion(baseInput());
    const changed = computeDataVersion(
      baseInput({
        networkInputs: {
          attractionCount: 50,
          foodCount: 3,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 50, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
        },
      }),
    );
    expect(changed).not.toBe(original);
  });

  it("networkInputs가 없으면(null) 오류 없이 처리된다", () => {
    expect(() => computeDataVersion(baseInput({ networkInputs: null }))).not.toThrow();
  });
});
