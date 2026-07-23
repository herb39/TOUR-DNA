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

describe("buildDnaEngineInput — Network 축 provenance 판정(Phase 1-C)", () => {
  it("모든 POI가 API 출처이고 연관관광지가 없으면 LIVE_API로 분류한다", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "API" },
    ]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.provenance).toBe("LIVE_API");
    expect(input.networkInputs?.isSnapshotFallback).toBe(false);
  });

  it("FIXTURE(큐레이션) POI가 하나라도 섞이면 CURATED로 분류하고 fallback 처리한다", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "FIXTURE" },
    ]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.provenance).toBe("CURATED");
    expect(input.networkInputs?.isSnapshotFallback).toBe(true);
  });

  it("연관관광지(PoiRelation)가 하나라도 있으면 CURATED로 분류한다(현재 실 API가 절대 채우지 않는 데이터)", async () => {
    poiFindMany.mockResolvedValue([{ category: "ATTRACTION", sourceType: "API" }]);
    poiRelationCount.mockResolvedValue(5);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs?.provenance).toBe("CURATED");
    expect(input.networkInputs?.isSnapshotFallback).toBe(true);
  });

  it("POI가 하나도 없으면 networkInputs 자체가 null이다(MISSING과 대응)", async () => {
    poiFindMany.mockResolvedValue([]);
    poiRelationCount.mockResolvedValue(0);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs).toBeNull();
  });
});
