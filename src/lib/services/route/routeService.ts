import type { TransportModeCode } from "@/lib/domain/geo";
import { haversineRouteProvider } from "./haversineRouteProvider";
import { kakaoRouteProvider, KakaoRouteError } from "./kakaoRouteProvider";
import { getCachedRoute, saveCachedRoute } from "./routeCache";
import { KAKAO_ROUTE_VERSION, type RoutePoint, type RouteResult } from "./types";

/**
 * 두 지점 사이의 이동 결과(거리·시간)를 구한다 — 서버 전용(REST API 키를 쓰므로 클라이언트 컴포넌트나
 * 도메인 순수 함수에서 직접 호출하면 안 되고, Server Action/서비스 계층에서만 호출한다).
 *
 * PRIVATE_VEHICLE이 아니거나 좌표가 없으면 즉시 haversine 추정치를 반환한다(카카오를 아예 호출하지
 * 않음 — 이 두 조건 자체가 "카카오 호출 조건 불충족"이므로 실패로 보지 않는다). PRIVATE_VEHICLE이고
 * 좌표가 모두 있으면: 캐시 확인 → 캐시 미스 시 카카오 호출 → 실패(키 없음/timeout/401/403/429/5xx/
 * 잘못된 응답 등 무엇이든) 시 haversine으로 안전하게 대체한다. 이 fallback 때문에 실행안 생성·저장
 * 자체가 실패하는 일은 없다(항상 RouteResult를 반환하고 예외를 던지지 않는다).
 */
export async function getRoute(from: RoutePoint, to: RoutePoint, transport: TransportModeCode): Promise<RouteResult> {
  if (transport !== "PRIVATE_VEHICLE") {
    return haversineRouteProvider.getRoute(from, to, transport);
  }
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
    return haversineRouteProvider.getRoute(from, to, transport);
  }

  // 캐시 조회 자체가 실패해도(DB 오류 등) 이 구간 하나만 카카오 호출을 시도하고, 그마저 실패하면
  // haversine으로 대체한다 — 캐시 오류 때문에 이후 나머지 구간 전체의 enrichment가 통째로 중단되면
  // 안 된다(courseRouteEnrichment.ts는 구간별로 이 함수를 순차 호출하므로, 여기서 예외가 새어나가면
  // 그 시점 이후 구간이 전부 haversine 그대로 남는다).
  let cached: RouteResult | null = null;
  try {
    cached = await getCachedRoute(from.poiId, to.poiId, transport, "KAKAO_MOBILITY", KAKAO_ROUTE_VERSION);
  } catch (e) {
    console.error(
      JSON.stringify({ level: "warn", source: "routeService", message: "cache read failed, trying kakao directly", reason: e instanceof Error ? e.message : "unknown" }),
    );
  }
  if (cached) return cached;

  let result: RouteResult;
  try {
    result = await kakaoRouteProvider.getRoute(from, to, transport);
  } catch (e) {
    const reason = e instanceof KakaoRouteError ? e.reason : "UNKNOWN_ERROR";
    console.error(
      JSON.stringify({ level: "warn", source: "routeService", message: "kakao fallback to haversine", reason }),
    );
    return haversineRouteProvider.getRoute(from, to, transport);
  }

  // 캐시 저장 실패는 별도로 처리한다 — 카카오 호출 자체는 성공했으므로(result), 저장만 실패했다고
  // 방금 받은 실제 결과를 haversine으로 되돌리면 안 된다(저장 실패와 조회 실패를 같은 catch로
  // 묶으면 이 역행이 생긴다).
  try {
    await saveCachedRoute(
      from.poiId,
      to.poiId,
      transport,
      "KAKAO_MOBILITY",
      KAKAO_ROUTE_VERSION,
      result.distanceKm,
      result.minutes,
    );
  } catch (e) {
    console.error(
      JSON.stringify({ level: "warn", source: "routeService", message: "cache write failed, keeping live kakao result", reason: e instanceof Error ? e.message : "unknown" }),
    );
  }
  return result;
}
