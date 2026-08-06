import {
  AVERAGE_SPEED_KMH,
  haversineDistanceKm,
  estimateTravelMinutesForDistance,
  type TransportModeCode,
} from "@/lib/domain/geo";
import type { RouteProvider, RoutePoint, RouteResult } from "./types";

/** 기존 estimateTravel(planBuilder.ts)이 쓰는 것과 동일한 haversine 공식(geo.ts)을 그대로 재사용한다 —
 * 이동시간 산식 자체는 이번 작업에서 바꾸지 않는다. 카카오 호출이 불가능하거나 실패했을 때의
 * fallback으로만 쓰인다. */
export const haversineRouteProvider: RouteProvider = {
  name: "HAVERSINE",
  async getRoute(from: RoutePoint, to: RoutePoint, transport: TransportModeCode): Promise<RouteResult> {
    const distanceKm =
      from.lat != null && from.lng != null && to.lat != null && to.lng != null
        ? haversineDistanceKm({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng })
        : 0;
    const minutes = estimateTravelMinutesForDistance(distanceKm, AVERAGE_SPEED_KMH[transport]);
    return {
      distanceKm,
      minutes,
      source: "ESTIMATED",
      provider: "HAVERSINE",
      calculatedAt: new Date().toISOString(),
    };
  },
};
