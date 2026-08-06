// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const haversineGetRoute = vi.fn();
vi.mock("@/lib/services/route/haversineRouteProvider", () => ({
  haversineRouteProvider: { name: "HAVERSINE", getRoute: (...args: unknown[]) => haversineGetRoute(...args) },
}));

const kakaoGetRoute = vi.fn();
vi.mock("@/lib/services/route/kakaoRouteProvider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/route/kakaoRouteProvider")>(
    "@/lib/services/route/kakaoRouteProvider",
  );
  return {
    ...actual,
    kakaoRouteProvider: { name: "KAKAO_MOBILITY", getRoute: (...args: unknown[]) => kakaoGetRoute(...args) },
  };
});

const getCachedRoute = vi.fn();
const saveCachedRoute = vi.fn();
vi.mock("@/lib/services/route/routeCache", () => ({
  getCachedRoute: (...args: unknown[]) => getCachedRoute(...args),
  saveCachedRoute: (...args: unknown[]) => saveCachedRoute(...args),
}));

import { getRoute } from "@/lib/services/route/routeService";
import { KakaoRouteError } from "@/lib/services/route/kakaoRouteProvider";

const FROM = { poiId: "a", lat: 37.0, lng: 128.0 };
const TO = { poiId: "b", lat: 37.1, lng: 128.1 };
const ESTIMATED = { distanceKm: 1, minutes: 5, source: "ESTIMATED" as const, provider: "HAVERSINE" as const, calculatedAt: "t" };
const LIVE = { distanceKm: 8.3, minutes: 12, source: "LIVE_API" as const, provider: "KAKAO_MOBILITY" as const, calculatedAt: "t" };

describe("routeService.getRoute — 카카오 호출 조건과 캐시/fallback 오케스트레이션", () => {
  beforeEach(() => {
    haversineGetRoute.mockReset().mockResolvedValue(ESTIMATED);
    kakaoGetRoute.mockReset();
    getCachedRoute.mockReset().mockResolvedValue(null);
    saveCachedRoute.mockReset().mockResolvedValue(undefined);
  });

  it("PRIVATE_VEHICLE이 아니면 카카오/캐시를 전혀 건드리지 않고 haversine만 쓴다", async () => {
    const result = await getRoute(FROM, TO, "MIXED");
    expect(result).toBe(ESTIMATED);
    expect(getCachedRoute).not.toHaveBeenCalled();
    expect(kakaoGetRoute).not.toHaveBeenCalled();
  });

  it("좌표가 없으면 PRIVATE_VEHICLE이어도 카카오를 호출하지 않는다", async () => {
    const result = await getRoute({ poiId: "a" }, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(ESTIMATED);
    expect(kakaoGetRoute).not.toHaveBeenCalled();
  });

  it("캐시 hit이면 카카오를 다시 호출하지 않는다", async () => {
    const cached = { ...LIVE, source: "CACHED_API" as const };
    getCachedRoute.mockResolvedValue(cached);
    const result = await getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(cached);
    expect(kakaoGetRoute).not.toHaveBeenCalled();
  });

  it("캐시 miss면 카카오를 호출하고 성공하면 캐시에 저장한다", async () => {
    kakaoGetRoute.mockResolvedValue(LIVE);
    const result = await getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(LIVE);
    expect(saveCachedRoute).toHaveBeenCalledWith("a", "b", "PRIVATE_VEHICLE", "KAKAO_MOBILITY", expect.any(String), 8.3, 12);
  });

  it("카카오 호출이 실패하면(어떤 이유든) haversine으로 안전하게 대체하고 예외를 던지지 않는다", async () => {
    kakaoGetRoute.mockRejectedValue(new KakaoRouteError("RATE_LIMITED", 429));
    const result = await getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(ESTIMATED);
    expect(saveCachedRoute).not.toHaveBeenCalled();
  });

  it("카카오가 예상 밖 오류(KakaoRouteError가 아님)를 던져도 haversine으로 대체한다", async () => {
    kakaoGetRoute.mockRejectedValue(new Error("unexpected"));
    const result = await getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(ESTIMATED);
  });

  it("캐시 조회(getCachedRoute) 자체가 실패해도 카카오 호출을 계속 시도한다(그 구간만 영향, 예외를 밖으로 던지지 않음)", async () => {
    getCachedRoute.mockRejectedValue(new Error("DB connection lost"));
    kakaoGetRoute.mockResolvedValue(LIVE);
    const result = await getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(LIVE);
  });

  it("카카오 호출은 성공했는데 캐시 저장(saveCachedRoute)만 실패해도 방금 받은 실제 결과를 그대로 반환한다(haversine으로 되돌리지 않음)", async () => {
    kakaoGetRoute.mockResolvedValue(LIVE);
    saveCachedRoute.mockRejectedValue(new Error("DB write failed"));
    const result = await getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result).toBe(LIVE);
  });
});
