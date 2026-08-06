// @vitest-environment node
import { describe, expect, it } from "vitest";
import { haversineRouteProvider } from "@/lib/services/route/haversineRouteProvider";
import { haversineDistanceKm, AVERAGE_SPEED_KMH, estimateTravelMinutesForDistance } from "@/lib/domain/geo";

describe("haversineRouteProvider — 기존 haversine 공식(geo.ts)을 그대로 재사용한다", () => {
  it("PRIVATE_VEHICLE 기준으로 geo.ts와 동일한 거리·시간을 반환한다", async () => {
    const from = { poiId: "a", lat: 37.5, lng: 127.0 };
    const to = { poiId: "b", lat: 37.6, lng: 127.1 };
    const result = await haversineRouteProvider.getRoute(from, to, "PRIVATE_VEHICLE");

    const expectedDistance = haversineDistanceKm(from, to);
    const expectedMinutes = estimateTravelMinutesForDistance(expectedDistance, AVERAGE_SPEED_KMH.PRIVATE_VEHICLE);

    expect(result.distanceKm).toBeCloseTo(expectedDistance, 6);
    expect(result.minutes).toBe(expectedMinutes);
    expect(result.source).toBe("ESTIMATED");
    expect(result.provider).toBe("HAVERSINE");
    expect(result.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("좌표가 없으면 거리 0으로 안전하게 처리한다(크래시 없음)", async () => {
    const result = await haversineRouteProvider.getRoute({ poiId: "a" }, { poiId: "b" }, "WALK");
    expect(result.distanceKm).toBe(0);
    expect(result.source).toBe("ESTIMATED");
  });
});
