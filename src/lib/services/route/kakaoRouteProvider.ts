import { isReasonableKoreanCoordinate, type TransportModeCode } from "@/lib/domain/geo";
import type { RouteProvider, RoutePoint, RouteResult } from "./types";

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const REQUEST_TIMEOUT_MS = 5000;

/** 카카오 호출 실패 사유 — 로그와 fallback 판단에만 쓰고, 사용자에게는 절대 노출하지 않는다
 * (routeService.ts가 이 사유를 구조화 로그로만 남기고 화면에는 "직선거리 기반 추정"으로만 보여준다). */
export type KakaoRouteFailureReason =
  | "NO_API_KEY"
  | "MISSING_COORDS"
  | "INVALID_COORDINATE"
  | "TIMEOUT"
  | "UNAUTHORIZED" // 401/403
  | "RATE_LIMITED" // 429
  | "SERVER_ERROR" // 5xx
  | "NO_ROUTE_FOUND" // HTTP 200이지만 응답의 result_code가 실패를 뜻함
  | "INVALID_RESPONSE" // JSON 파싱 실패, 예상 필드 누락
  | "NETWORK_ERROR";

export class KakaoRouteError extends Error {
  constructor(
    public readonly reason: KakaoRouteFailureReason,
    public readonly status?: number,
    public readonly apiCode?: string | number,
    public readonly apiMessage?: string,
  ) {
    super(`kakao route failed: ${reason}`);
    this.name = "KakaoRouteError";
  }
}

async function readKakaoErrorDetails(response: Response): Promise<{ code?: string | number; message?: string }> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    const body = JSON.parse(text) as { code?: unknown; msg?: unknown };
    return {
      code: typeof body.code === "string" || typeof body.code === "number" ? body.code : undefined,
      message: typeof body.msg === "string" ? body.msg : undefined,
    };
  } catch {
    return {};
  }
}

/** 카카오 응답의 result_code 값(공식 문서 기준 코드표를 전부 확인하지는 못했으나, 0은 정상, 그 외는
 * 경로를 찾지 못했거나 요청이 유효하지 않은 경우로 다룬다 — 원문 메시지는 로그에 남기지 않는다). */
interface KakaoDirectionsResponse {
  routes?: Array<{
    result_code?: number;
    summary?: {
      distance?: number; // 미터
      duration?: number; // 초
    };
  }>;
}

/**
 * 카카오모빌리티 자동차 길찾기(단건 출발-도착, 경유지 없음)를 호출한다. 서버 전용 REST API 키
 * (`KAKAO_REST_API_KEY`)를 Authorization 헤더에만 담아 보내고, 키 값이나 Authorization 헤더, 응답
 * 원문은 어디에도 로그로 남기지 않는다 — 실패 시 KakaoRouteError.reason(상태 코드 분류)만 던진다.
 */
export const kakaoRouteProvider: RouteProvider = {
  name: "KAKAO_MOBILITY",
  async getRoute(from: RoutePoint, to: RoutePoint, transport: TransportModeCode): Promise<RouteResult> {
    void transport; // 자동차 길찾기 전용 provider — routeService.ts가 PRIVATE_VEHICLE일 때만 호출을 보장한다.
    const apiKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey) throw new KakaoRouteError("NO_API_KEY");
    if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) {
      throw new KakaoRouteError("MISSING_COORDS");
    }
    if (
      !isReasonableKoreanCoordinate({ lat: from.lat, lng: from.lng }) ||
      !isReasonableKoreanCoordinate({ lat: to.lat, lng: to.lng })
    ) {
      throw new KakaoRouteError("INVALID_COORDINATE");
    }

    const params = new URLSearchParams({
      origin: `${from.lng},${from.lat}`,
      destination: `${to.lng},${to.lat}`,
      priority: "RECOMMEND",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${KAKAO_DIRECTIONS_URL}?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `KakaoAK ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const reason: KakaoRouteFailureReason =
        e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
      console.error(JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason }));
      throw new KakaoRouteError(reason);
    }
    clearTimeout(timer);

    if (res.status === 401 || res.status === 403) {
      console.error(JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason: "UNAUTHORIZED", status: res.status }));
      throw new KakaoRouteError("UNAUTHORIZED", res.status);
    }
    if (res.status === 429) {
      console.error(JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason: "RATE_LIMITED", status: res.status }));
      throw new KakaoRouteError("RATE_LIMITED", res.status);
    }
    if (res.status >= 500) {
      console.error(JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason: "SERVER_ERROR", status: res.status }));
      throw new KakaoRouteError("SERVER_ERROR", res.status);
    }
    if (!res.ok) {
      const details = await readKakaoErrorDetails(res);
      console.error(
        JSON.stringify({
          level: "error",
          source: "kakaoRouteProvider",
          reason: "INVALID_RESPONSE",
          status: res.status,
          apiCode: details.code,
          apiMessage: details.message,
        }),
      );
      throw new KakaoRouteError("INVALID_RESPONSE", res.status, details.code, details.message);
    }

    let body: KakaoDirectionsResponse;
    try {
      body = await res.json();
    } catch {
      console.error(JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason: "INVALID_RESPONSE" }));
      throw new KakaoRouteError("INVALID_RESPONSE", res.status);
    }

    const route = body.routes?.[0];
    if (!route || route.result_code !== 0 || !route.summary) {
      console.error(
        JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason: "NO_ROUTE_FOUND", resultCode: route?.result_code }),
      );
      throw new KakaoRouteError("NO_ROUTE_FOUND", res.status);
    }

    const { distance, duration } = route.summary;
    if (typeof distance !== "number" || typeof duration !== "number") {
      console.error(JSON.stringify({ level: "error", source: "kakaoRouteProvider", reason: "INVALID_RESPONSE" }));
      throw new KakaoRouteError("INVALID_RESPONSE", res.status);
    }

    return {
      distanceKm: distance / 1000,
      minutes: Math.max(1, Math.round(duration / 60)),
      source: "LIVE_API",
      provider: "KAKAO_MOBILITY",
      calculatedAt: new Date().toISOString(),
    };
  },
};
