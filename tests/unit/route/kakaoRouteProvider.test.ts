// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kakaoRouteProvider, KakaoRouteError } from "@/lib/services/route/kakaoRouteProvider";

const FROM = { poiId: "poi-a", lat: 37.0, lng: 128.0 };
const TO = { poiId: "poi-b", lat: 37.1, lng: 128.1 };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("kakaoRouteProvider — 실제 호출 없이 fetch만 모킹해 요청/응답 처리를 검증한다", () => {
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

  it("REST API 키가 없으면 fetch 자체를 호출하지 않고 NO_API_KEY로 실패한다", async () => {
    delete process.env.KAKAO_REST_API_KEY;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "NO_API_KEY",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("좌표가 없으면 fetch를 호출하지 않고 MISSING_COORDS로 실패한다", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(kakaoRouteProvider.getRoute({ poiId: "a" }, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "MISSING_COORDS",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("정상 응답을 거리(km)·시간(분)으로 올바르게 변환한다(미터→km, 초→분)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        routes: [{ result_code: 0, summary: { distance: 8300, duration: 720 } }],
      }),
    ) as unknown as typeof fetch;

    const result = await kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE");
    expect(result.distanceKm).toBeCloseTo(8.3, 5);
    expect(result.minutes).toBe(12);
    expect(result.source).toBe("LIVE_API");
    expect(result.provider).toBe("KAKAO_MOBILITY");
  });

  it("요청 URL과 Authorization 헤더가 올바른 형식으로 전달된다(x,y=경도,위도 순서)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(200, { routes: [{ result_code: 0, summary: { distance: 1000, duration: 60 } }] }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    await kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("apis-navi.kakaomobility.com/v1/directions");
    expect(String(url)).toContain(`origin=${encodeURIComponent(`${FROM.lng},${FROM.lat}`)}`);
    expect(String(url)).toContain(`destination=${encodeURIComponent(`${TO.lng},${TO.lat}`)}`);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "KakaoAK test-key" });
  });

  it.each([401, 403])("HTTP %d는 UNAUTHORIZED로 분류된다", async (status) => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status })) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "UNAUTHORIZED",
      status,
    });
  });

  it("HTTP 429는 RATE_LIMITED로 분류된다", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "RATE_LIMITED",
    });
  });

  it.each([500, 503])("HTTP %d는 SERVER_ERROR로 분류된다", async (status) => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status })) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "SERVER_ERROR",
    });
  });

  it("잘못된 JSON 응답은 INVALID_RESPONSE로 분류된다", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("<html>error</html>", { status: 200 })) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "INVALID_RESPONSE",
    });
  });

  it("result_code가 0이 아니면(경로 없음) NO_ROUTE_FOUND로 분류된다", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { routes: [{ result_code: 1 }] }),
    ) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "NO_ROUTE_FOUND",
    });
  });

  it("네트워크 오류(fetch 자체 실패)는 NETWORK_ERROR로 분류된다", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "NETWORK_ERROR",
    });
  });

  it("timeout(AbortError)은 TIMEOUT으로 분류된다", async () => {
    global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })) as unknown as typeof fetch;
    await expect(kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE")).rejects.toMatchObject({
      reason: "TIMEOUT",
    });
  });

  it("KakaoRouteError는 Error 인스턴스이고 메시지에 키 값을 포함하지 않는다", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 })) as unknown as typeof fetch;
    try {
      await kakaoRouteProvider.getRoute(FROM, TO, "PRIVATE_VEHICLE");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(KakaoRouteError);
      expect((e as Error).message).not.toContain("test-key");
    }
  });
});
