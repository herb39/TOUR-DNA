// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchKakaoRouteGeometry } from "@/lib/services/route/kakaoRouteGeometryProvider";

const FROM = { lat: 37.0, lng: 128.0 };
const TO = { lat: 37.1, lng: 128.1 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("kakaoRouteGeometryProvider — 요청 계약·geometry 파싱·실패 분류", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;

  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.KAKAO_REST_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("정상 2점 요청은 vertexes를 [lng, lat]에서 LatLng로 변환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        routes: [{ result_code: 0, sections: [{ roads: [{ vertexes: [128.0, 37.0, 128.05, 37.05, 128.1, 37.1] }] }] }],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchKakaoRouteGeometry(FROM, TO);

    expect(result).toEqual([
      { lat: 37.0, lng: 128.0 },
      { lat: 37.05, lng: 128.05 },
      { lat: 37.1, lng: 128.1 },
    ]);
  });

  it("REST 계약에 맞는 endpoint·헤더·좌표 순서를 보내고 waypoint는 보내지 않는다", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        routes: [{ result_code: 0, sections: [{ roads: [{ vertexes: [128, 37, 128.1, 37.1] }] }] }],
      }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    await fetchKakaoRouteGeometry(FROM, TO);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("apis-navi.kakaomobility.com/v1/directions");
    expect(String(url)).toContain(`origin=${encodeURIComponent(`${FROM.lng},${FROM.lat}`)}`);
    expect(String(url)).toContain(`destination=${encodeURIComponent(`${TO.lng},${TO.lat}`)}`);
    expect(String(url)).toContain("priority=RECOMMEND");
    expect(String(url)).toContain("road_details=true");
    expect(String(url)).not.toContain("waypoints=");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "KakaoAK test-key",
      "Content-Type": "application/json",
    });
  });

  it("좌표가 유효하지 않으면 외부 호출 없이 MISSING_COORDS로 실패한다", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchKakaoRouteGeometry({ lat: Number.NaN, lng: 128 }, TO)).rejects.toMatchObject({
      reason: "MISSING_COORDS",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("국내 범위를 벗어난 좌표는 외부 호출 없이 INVALID_COORDINATE로 실패한다", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchKakaoRouteGeometry({ lat: 19.69442748, lng: 117.9925662504 }, TO)).rejects.toMatchObject({
      reason: "INVALID_COORDINATE",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("HTTP 400의 안전한 code/msg를 보존하면서 INVALID_RESPONSE로 분류한다", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(400, { code: -2, msg: "필수 인자가 포함되지 않았습니다." }),
    ) as unknown as typeof fetch;

    await expect(fetchKakaoRouteGeometry(FROM, TO)).rejects.toMatchObject({
      reason: "INVALID_RESPONSE",
      status: 400,
      apiCode: -2,
      apiMessage: "필수 인자가 포함되지 않았습니다.",
    });
  });
});
