// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { regionFindUniqueOrThrow, poiFindMany, poiRelationCount } = vi.hoisted(() => ({
  regionFindUniqueOrThrow: vi.fn(),
  poiFindMany: vi.fn(),
  poiRelationCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    region: { findUniqueOrThrow: regionFindUniqueOrThrow },
    poi: { findMany: poiFindMany },
    poiRelation: { count: poiRelationCount },
  },
}));

vi.mock("@/lib/services/metricCohort", () => ({
  fetchMetricCohort: vi.fn().mockResolvedValue([]),
}));

import { buildDnaEngineInput } from "@/lib/services/buildDnaEngineInput";

beforeEach(() => {
  vi.clearAllMocks();
  regionFindUniqueOrThrow.mockResolvedValue({ id: "region-1", code: "DAEJEON", level: "SIGUNGU" });
});

describe("buildDnaEngineInput — Network 축 POI/관계 근거 분리 판정(Phase 1-E)", () => {
  it("모든 POI가 API 출처이면 poi 근거는 LIVE_API/apiCount만 채워진다(관계 여부와 무관)", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "API" },
    ]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.poi).toEqual({
      apiCount: 2,
      fixtureCount: 0,
      provenance: "LIVE_API",
      isSnapshotFallback: false,
    });
  });

  it("FIXTURE(큐레이션) POI가 하나라도 섞이면 poi 근거는 CURATED이고 API/fixture 건수를 함께 노출한다", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "FIXTURE" },
    ]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.poi).toEqual({
      apiCount: 1,
      fixtureCount: 1,
      provenance: "CURATED",
      isSnapshotFallback: true,
    });
  });

  it("연관관광지(PoiRelation)가 있어도 API POI만으로 구성된 poi 근거는 LIVE_API를 유지한다(관계가 POI 근거를 격하하지 않음)", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "API" },
    ]);
    poiRelationCount.mockResolvedValue(5);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.poi.provenance).toBe("LIVE_API");
    expect(input.networkInputs?.poi.isSnapshotFallback).toBe(false);
    // 관계 근거는 별도로 CURATED다(현재 실 API가 절대 채우지 않는 데이터 — docs/public-api-status.md 6번).
    expect(input.networkInputs?.relation).toEqual({ count: 5, provenance: "CURATED", isSnapshotFallback: true });
  });

  it("연관관광지가 하나도 없으면 relation은 null이다(0을 임의로 CURATED 근거로 지어내지 않음)", async () => {
    poiFindMany.mockResolvedValue([{ category: "ATTRACTION", sourceType: "API" }]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.relation).toBeNull();
  });

  it("POI가 하나도 없으면 networkInputs 자체가 null이다(MISSING과 대응)", async () => {
    poiFindMany.mockResolvedValue([]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs).toBeNull();
  });
});
