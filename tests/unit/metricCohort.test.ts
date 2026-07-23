// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { normalizedMetricFindMany } = vi.hoisted(() => ({
  normalizedMetricFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { normalizedMetric: { findMany: normalizedMetricFindMany } },
}));

import { fetchMetricCohort } from "@/lib/services/metricCohort";

function row(provenance: string | null, overrides: Partial<{ rawValue: number; regionCode: string }> = {}) {
  return {
    regionId: "region-1",
    baseYm: "202606",
    metricCode: "tarSjrnDsIxVal",
    rawValue: overrides.rawValue ?? 80,
    unit: "지수",
    adminLevel: "SIGUNGU",
    sourceId: "src-1",
    collectedAt: new Date("2026-07-01T00:00:00.000Z"),
    provenance,
    region: { code: overrides.regionCode ?? "DAEJEON" },
    source: { code: "TAR_SVC_DEM" },
  };
}

describe("fetchMetricCohort — provenance/isSnapshotFallback 판정(Phase 1-C)", () => {
  it("provenance가 LIVE_API인 행만 isSnapshotFallback:false로 분류한다", async () => {
    normalizedMetricFindMany.mockResolvedValue([row("LIVE_API")]);
    const [entry] = await fetchMetricCohort("tarSjrnDsIxVal", "202606", "SIGUNGU");
    expect(entry.provenance).toBe("LIVE_API");
    expect(entry.isSnapshotFallback).toBe(false);
  });

  it("provenance가 NULL(과거 미분류)이면 값이 있어도 LIVE_API로 간주하지 않고 isSnapshotFallback:true다", async () => {
    normalizedMetricFindMany.mockResolvedValue([row(null)]);
    const [entry] = await fetchMetricCohort("tarSjrnDsIxVal", "202606", "SIGUNGU");
    expect(entry.provenance).toBeNull();
    expect(entry.isSnapshotFallback).toBe(true);
  });

  it("CACHED_API/CURATED/ESTIMATED/MISSING은 전부 isSnapshotFallback:true다", async () => {
    for (const provenance of ["CACHED_API", "CURATED", "ESTIMATED", "MISSING"]) {
      normalizedMetricFindMany.mockResolvedValue([row(provenance)]);
      const [entry] = await fetchMetricCohort("tarSjrnDsIxVal", "202606", "SIGUNGU");
      expect(entry.provenance).toBe(provenance);
      expect(entry.isSnapshotFallback).toBe(true);
    }
  });

  it("코호트 안에 LIVE_API와 fallback이 섞여도 항목별로 각자 올바르게 판정된다", async () => {
    normalizedMetricFindMany.mockResolvedValue([
      row("LIVE_API", { regionCode: "DAEJEON" }),
      row(null, { regionCode: "JECHEON" }),
      row("CACHED_API", { regionCode: "YANGYANG" }),
    ]);
    const entries = await fetchMetricCohort("tarSjrnDsIxVal", "202606", "SIGUNGU");
    const byRegion = Object.fromEntries(entries.map((e) => [e.regionCode, e]));
    expect(byRegion.DAEJEON.isSnapshotFallback).toBe(false);
    expect(byRegion.JECHEON.isSnapshotFallback).toBe(true);
    expect(byRegion.YANGYANG.isSnapshotFallback).toBe(true);
  });
});
