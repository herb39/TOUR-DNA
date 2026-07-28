// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dataSourceFindUnique, regionFindMany, dataSnapshotFindMany } = vi.hoisted(() => ({
  dataSourceFindUnique: vi.fn(),
  regionFindMany: vi.fn(),
  dataSnapshotFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    dataSource: { findUnique: dataSourceFindUnique },
    region: { findMany: regionFindMany },
    dataSnapshot: { findMany: dataSnapshotFindMany },
  },
}));

import { checkVisitorCntCacheViaDataSnapshot } from "@/lib/services/visitorCntCacheStore";

// 완전성 검증 마커(completeMonthVerified) 도입 이전에 저장된 스냅샷을 캐시로 잘못 신뢰하지 않는지가
// 이 파일의 핵심 검증 대상이다(2026-07-29).

describe("checkVisitorCntCacheViaDataSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataSourceFindUnique.mockResolvedValue({ id: "src-visitor-cnt" });
    regionFindMany.mockResolvedValue([{ id: "region-1" }, { id: "region-2" }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("완전성 검증 마커가 있는 스냅샷이 필요한 지역 수만큼 전부 있으면 캐시로 인정한다", async () => {
    dataSnapshotFindMany.mockResolvedValue([
      { regionId: "region-1", rawPayload: { completeMonthVerified: true } },
      { regionId: "region-2", rawPayload: { completeMonthVerified: true } },
    ]);
    await expect(checkVisitorCntCacheViaDataSnapshot("202606")).resolves.toBe(true);
  });

  it("마커가 없는(도입 이전) 스냅샷은 개수가 맞아도 캐시로 인정하지 않는다", async () => {
    dataSnapshotFindMany.mockResolvedValue([
      { regionId: "region-1", rawPayload: { code: "30200", items: [] } }, // 마커 도입 이전 형태
      { regionId: "region-2", rawPayload: { completeMonthVerified: true } },
    ]);
    await expect(checkVisitorCntCacheViaDataSnapshot("202606")).resolves.toBe(false);
  });

  it("일부 지역의 스냅샷 자체가 없으면(개수 불일치) 캐시로 인정하지 않는다", async () => {
    dataSnapshotFindMany.mockResolvedValue([{ regionId: "region-1", rawPayload: { completeMonthVerified: true } }]);
    await expect(checkVisitorCntCacheViaDataSnapshot("202606")).resolves.toBe(false);
  });

  it("VISITOR_CNT DataSource 자체가 없으면 캐시로 인정하지 않는다", async () => {
    dataSourceFindUnique.mockResolvedValue(null);
    await expect(checkVisitorCntCacheViaDataSnapshot("202606")).resolves.toBe(false);
  });
});
