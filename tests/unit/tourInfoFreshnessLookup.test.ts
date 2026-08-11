// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataSourceFindUnique = vi.fn();
const dataSnapshotGroupBy = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    dataSource: { findUnique: (...args: unknown[]) => dataSourceFindUnique(...args) },
    dataSnapshot: { groupBy: (...args: unknown[]) => dataSnapshotGroupBy(...args) },
  },
}));

import { fetchTourInfoLastFreshFetchByRegion } from "@/lib/services/tourInfoFreshnessLookup";

beforeEach(() => {
  dataSourceFindUnique.mockReset();
  dataSnapshotGroupBy.mockReset();
});

describe("fetchTourInfoLastFreshFetchByRegion — Phase 2-D(2026-08-12)", () => {
  it("TOUR_INFO DataSource가 없으면 빈 Map을 반환하고 groupBy를 호출하지 않는다", async () => {
    dataSourceFindUnique.mockResolvedValue(null);
    const result = await fetchTourInfoLastFreshFetchByRegion();
    expect(result.size).toBe(0);
    expect(dataSnapshotGroupBy).not.toHaveBeenCalled();
  });

  it("region별 가장 최근 SUCCESS/EMPTY fetchedAt을 Map으로 반환한다", async () => {
    dataSourceFindUnique.mockResolvedValue({ id: "src-tour-info", code: "TOUR_INFO" });
    const fetchedAt1 = new Date("2026-08-01T00:00:00.000Z");
    const fetchedAt2 = new Date("2026-07-15T00:00:00.000Z");
    dataSnapshotGroupBy.mockResolvedValue([
      { regionId: "r1", _max: { fetchedAt: fetchedAt1 } },
      { regionId: "r2", _max: { fetchedAt: fetchedAt2 } },
    ]);

    const result = await fetchTourInfoLastFreshFetchByRegion();

    expect(result.get("r1")).toEqual(fetchedAt1);
    expect(result.get("r2")).toEqual(fetchedAt2);
    expect(dataSnapshotGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["regionId"],
        where: { dataSourceId: "src-tour-info", status: { in: ["SUCCESS", "EMPTY"] } },
      }),
    );
  });

  it("fetchedAt이 null인 행은 결과 Map에서 제외한다", async () => {
    dataSourceFindUnique.mockResolvedValue({ id: "src-tour-info", code: "TOUR_INFO" });
    dataSnapshotGroupBy.mockResolvedValue([{ regionId: "r1", _max: { fetchedAt: null } }]);

    const result = await fetchTourInfoLastFreshFetchByRegion();

    expect(result.has("r1")).toBe(false);
  });
});
