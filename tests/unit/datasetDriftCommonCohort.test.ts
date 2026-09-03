import { describe, expect, it } from "vitest";
import {
  buildCommonMetricCohort,
  buildCommonPresenceCohort,
  intersectRegionCodeSets,
} from "@/lib/domain/datasetDriftCommonCohort";
import { normalizeByTransform } from "@/lib/domain/normalize";
import type { RegionMetricValue } from "@/lib/domain/types";

function metric(regionCode: string, rawValue: number, metricCode = "metric", baseYm = "202607", provenance: "LIVE_API" | "ESTIMATED" = "LIVE_API"): RegionMetricValue {
  return {
    regionCode,
    baseYm,
    metricCode,
    rawValue,
    unit: "index",
    adminLevel: "SIGUNGU",
    sourceCode: "SOURCE",
    collectedAt: "2026-09-01T00:00:00.000Z",
    provenance,
    isSnapshotFallback: provenance !== "LIVE_API",
  };
}

describe("datasetDriftCommonCohort", () => {
  it("양쪽에 존재하는 visitor growth만 공통 evidence로 남긴다", () => {
    const result = buildCommonPresenceCohort(["BOTH", "PREVIOUS_ONLY"], ["BOTH", "CANDIDATE_ONLY"]);

    expect(result.commonRegionCodes).toEqual(["BOTH"]);
    expect(result.asymmetricRegionCount).toBe(2);
  });

  it("resource evidence가 한쪽 월에만 있으면 양쪽 comparison에서 제외한다", () => {
    const result = buildCommonMetricCohort(
      [metric("BOTH", 60, "touResDemIxVal", "202606"), metric("PREVIOUS_ONLY", 70, "touResDemIxVal", "202606")],
      [metric("BOTH", 62, "touResDemIxVal", "202607"), metric("CANDIDATE_ONLY", 80, "touResDemIxVal", "202607")],
    );

    expect(result.commonRegionCodes).toEqual(["BOTH"]);
    expect(result.active).toHaveLength(1);
    expect(result.candidate).toHaveLength(1);
  });

  it("양쪽에 있는 ESTIMATED evidence는 provenance만으로 제거하지 않는다", () => {
    const result = buildCommonMetricCohort(
      [metric("R1", 10, "touResDemIxVal", "202606", "ESTIMATED")],
      [metric("R1", 20, "touResDemIxVal", "202607", "ESTIMATED")],
    );

    expect(result.commonRegionCodes).toEqual(["R1"]);
    expect(result.active[0].provenance).toBe("ESTIMATED");
    expect(normalizeByTransform("LOG1P_MIN_MAX", result.active[0].rawValue, [10, 20])).toBeGreaterThanOrEqual(0);
  });

  it("EMPTY처럼 raw entry가 없으면 cohort에 0으로 채우지 않는다", () => {
    const result = buildCommonMetricCohort([metric("R1", 10)], []);

    expect(result.commonRegionCodes).toEqual([]);
    expect(result.active).toEqual([]);
    expect(result.candidate).toEqual([]);
  });

  it("5축 공통 cohort는 모든 축 region 집합의 교집합이다", () => {
    expect(
      intersectRegionCodeSets([
        ["R1", "R2", "R3"],
        ["R2", "R3"],
        ["R0", "R2", "R3"],
      ]),
    ).toEqual(["R2", "R3"]);
  });
});
