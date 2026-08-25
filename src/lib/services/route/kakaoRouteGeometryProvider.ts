import type { KakaoRouteFailureReason } from "./kakaoRouteProvider";
import { isReasonableKoreanCoordinate } from "@/lib/domain/geo";

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const REQUEST_TIMEOUT_MS = 4000;

export type KakaoGeometryFailureReason = KakaoRouteFailureReason | "INVALID_GEOMETRY";

export class KakaoGeometryError extends Error {
  constructor(
    public readonly reason: KakaoGeometryFailureReason,
    public readonly status?: number,
    public readonly apiCode?: string | number,
    public readonly apiMessage?: string,
  ) {
    super(`kakao route geometry failed: ${reason}`);
    this.name = "KakaoGeometryError";
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

interface KakaoDirectionsGeometryResponse {
  routes?: Array<{
    result_code?: number;
    sections?: Array<{
      roads?: Array<{ vertexes?: number[] }>;
    }>;
  }>;
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

/** `roads[].vertexes`는 [lng, lat, lng, lat, ...] 순서의 평탄화 배열이다(2026-08-06 실측 확인) — 이
 * 순서를 뒤집어 읽으면 지도에 완전히 잘못된 위치가 찍히므로 명시적으로 짝을 지어 변환한다. section·road
 * 순서를 그대로 이어붙이면 출발→도착의 연속된 실제 도로 경로가 된다. */
function extractPath(response: KakaoDirectionsGeometryResponse): LatLng[] {
  const route = response.routes?.[0];
  if (!route || route.result_code !== 0) return [];
  const path: LatLng[] = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      const vertexes = road.vertexes ?? [];
      for (let i = 0; i + 1 < vertexes.length; i += 2) {
        const lng = vertexes[i];
        const lat = vertexes[i + 1];
        if (Number.isFinite(lat) && Number.isFinite(lng)) path.push({ lat, lng });
      }
    }
  }
  return path;
}

/**
 * 카카오모빌리티 자동차 길찾기를 `road_details=true`로 호출해 실제 도로 경로 좌표만 뽑아 반환한다
 * (2026-08-06, Phase 12 후속). 거리·시간 계산(`kakaoRouteProvider.ts`)과는 완전히 독립된 모듈이다 —
 * 이 함수의 실패가 기존 거리·시간 저장 흐름에 전혀 영향을 주지 않게 하기 위해 의도적으로 분리했다.
 * 반환값은 좌표 배열뿐이며, 카카오 원본 응답이나 요약 정보는 호출부에도 절대 넘기지 않는다.
 */
export async function fetchKakaoRouteGeometry(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) throw new KakaoGeometryError("NO_API_KEY");
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng) || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) {
    throw new KakaoGeometryError("MISSING_COORDS");
  }
  if (!isReasonableKoreanCoordinate(from) || !isReasonableKoreanCoordinate(to)) {
    throw new KakaoGeometryError("INVALID_COORDINATE");
  }

  const params = new URLSearchParams({
    origin: `${from.lng},${from.lat}`,
    destination: `${to.lng},${to.lat}`,
    priority: "RECOMMEND",
    road_details: "true",
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
    const reason: KakaoGeometryFailureReason =
      e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
    console.error(JSON.stringify({ level: "warn", source: "kakaoRouteGeometryProvider", reason }));
    throw new KakaoGeometryError(reason);
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    console.error(JSON.stringify({ level: "warn", source: "kakaoRouteGeometryProvider", reason: "UNAUTHORIZED", status: res.status }));
    throw new KakaoGeometryError("UNAUTHORIZED", res.status);
  }
  if (res.status === 429) {
    console.error(JSON.stringify({ level: "warn", source: "kakaoRouteGeometryProvider", reason: "RATE_LIMITED", status: res.status }));
    throw new KakaoGeometryError("RATE_LIMITED", res.status);
  }
  if (res.status >= 500) {
    console.error(JSON.stringify({ level: "warn", source: "kakaoRouteGeometryProvider", reason: "SERVER_ERROR", status: res.status }));
    throw new KakaoGeometryError("SERVER_ERROR", res.status);
  }
  if (!res.ok) {
    const details = await readKakaoErrorDetails(res);
    console.error(
      JSON.stringify({
        level: "warn",
        source: "kakaoRouteGeometryProvider",
        reason: "INVALID_RESPONSE",
        status: res.status,
        apiCode: details.code,
        apiMessage: details.message,
      }),
    );
    throw new KakaoGeometryError("INVALID_RESPONSE", res.status, details.code, details.message);
  }

  let body: KakaoDirectionsGeometryResponse;
  try {
    body = await res.json();
  } catch {
    console.error(JSON.stringify({ level: "warn", source: "kakaoRouteGeometryProvider", reason: "INVALID_RESPONSE" }));
    throw new KakaoGeometryError("INVALID_RESPONSE", res.status);
  }

  const path = extractPath(body);
  if (path.length < 2) {
    console.error(JSON.stringify({ level: "warn", source: "kakaoRouteGeometryProvider", reason: "INVALID_GEOMETRY" }));
    throw new KakaoGeometryError("INVALID_GEOMETRY", res.status);
  }
  return path;
}
