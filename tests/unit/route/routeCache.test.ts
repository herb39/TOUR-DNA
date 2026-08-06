// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeCacheFindUnique = vi.fn();
const routeCacheUpsert = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    routeCache: {
      findUnique: (...args: unknown[]) => routeCacheFindUnique(...args),
      upsert: (...args: unknown[]) => routeCacheUpsert(...args),
    },
  },
}));

import { getCachedRoute, saveCachedRoute, ROUTE_CACHE_ENABLED } from "@/lib/services/route/routeCache";

/**
 * 2026-08-06: 카카오 응답의 자체 DB 저장·재사용(RouteCache) 허용 여부를 공식 약관으로 확정하지 못했고,
 * 카카오 측 커뮤니티 공개 답변은 "저장 미지원"에 가까웠다 — 그래서 RouteCache 읽기·쓰기를
 * ROUTE_CACHE_ENABLED 플래그로 비활성화했다. 이 테스트는 "비활성화 상태에서는 DB를 전혀 건드리지
 * 않는다"는 안전장치 자체를 검증한다(정책 확인 전 우발적 재활성화·DB 접근을 막는 것이 핵심).
 */
describe("routeCache — ROUTE_CACHE_ENABLED=false일 때 DB를 전혀 건드리지 않는다(2026-08-06, 저장 정책 불명확)", () => {
  beforeEach(() => {
    routeCacheFindUnique.mockReset();
    routeCacheUpsert.mockReset();
  });

  it("현재 플래그는 비활성화 상태다", () => {
    expect(ROUTE_CACHE_ENABLED).toBe(false);
  });

  it("getCachedRoute는 prisma.routeCache.findUnique를 호출하지 않고 항상 null을 반환한다", async () => {
    const result = await getCachedRoute("a", "b", "PRIVATE_VEHICLE", "KAKAO_MOBILITY", "v1");
    expect(result).toBeNull();
    expect(routeCacheFindUnique).not.toHaveBeenCalled();
  });

  it("saveCachedRoute는 prisma.routeCache.upsert를 호출하지 않는다", async () => {
    await saveCachedRoute("a", "b", "PRIVATE_VEHICLE", "KAKAO_MOBILITY", "v1", 8.3, 12);
    expect(routeCacheUpsert).not.toHaveBeenCalled();
  });
});
