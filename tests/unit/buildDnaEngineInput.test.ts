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

  it("POI가 하나도 없으면 networkInputs 자체가 null이다(MISSING과 대응)", async () => {
    poiFindMany.mockResolvedValue([]);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs).toBeNull();
  });
});

describe("buildDnaEngineInput — Network 산식 재설계(Phase 3, 2026-08-13): PoiRelation 완전 제외", () => {
  it("networkInputs에 relation/relatedPoiCount 필드가 더 이상 존재하지 않는다", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "API" },
    ]);

    const input = await buildDnaEngineInput("DAEJEON", "202606");

    expect(input.networkInputs).not.toHaveProperty("relation");
    expect(input.networkInputs).not.toHaveProperty("relatedPoiCount");
  });

  it("PoiRelation 테이블을 전혀 조회하지 않는다(DB의 기존 relation 데이터가 있어도 Network 계산에 영향 없음)", async () => {
    poiFindMany.mockResolvedValue([
      { category: "ATTRACTION", sourceType: "API" },
      { category: "FOOD", sourceType: "API" },
    ]);
    poiRelationCount.mockResolvedValue(3); // 실제 DB에 relation row가 있어도 이 함수가 조회하지 않아야 한다.

    await buildDnaEngineInput("DAEJEON", "202606");

    expect(poiRelationCount).not.toHaveBeenCalled();
  });
});
