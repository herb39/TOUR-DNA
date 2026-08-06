import type { TransportModeCode } from "@/lib/domain/geo";

/** 이동 결과의 출처 — 화면 표시 문구를 결정한다(format.ts가 아니라 여기서 관리: 지도/실행안/인쇄가
 * 모두 이 3값만 보고 "실제 도로 기준"/"실제 도로 기준 · 캐시"/"직선거리 기반 추정"을 구분한다). */
export type RouteResultSource = "LIVE_API" | "CACHED_API" | "ESTIMATED";

export type RouteProviderName = "KAKAO_MOBILITY" | "HAVERSINE";

/** 두 지점 사이 이동 결과 — provider가 카카오든 haversine fallback이든 항상 이 모양으로 반환해
 * 호출부(courseRouteEnrichment.ts)가 provider 구현을 몰라도 되게 한다. */
export interface RouteResult {
  distanceKm: number;
  minutes: number;
  source: RouteResultSource;
  provider: RouteProviderName;
  calculatedAt: string; // ISO 문자열(호출 시각) — SelectedPlan.course JSON에 그대로 저장한다.
}

export interface RoutePoint {
  poiId: string;
  lat?: number;
  lng?: number;
}

export interface RouteProvider {
  name: RouteProviderName;
  getRoute(from: RoutePoint, to: RoutePoint, transport: TransportModeCode): Promise<RouteResult>;
}

/** kakaoRouteProvider가 응답을 파싱하는 규격 버전 — 파싱 로직이 바뀌면 이 값을 올려 RouteCache의
 * 이전 캐시 행과 섞이지 않게 한다(routeCache.ts 유니크 키에 포함). */
export const KAKAO_ROUTE_VERSION = "kakao-directions-v1";
