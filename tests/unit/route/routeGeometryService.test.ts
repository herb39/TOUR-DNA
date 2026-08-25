// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCourseRouteGeometry } from "@/lib/services/route/routeGeometryService";
import type { CourseDay } from "@/lib/domain/planBuilder";

const DAYS = [
  {
    dayIndex: 1,
    items: [
      { poiId: "poi-a", lat: 37.0, lng: 128.0 },
      { poiId: "poi-b", lat: 37.1, lng: 128.1 },
    ],
    lodging: null,
  },
] as unknown as CourseDay[];

describe("routeGeometryService — actual route와 fallback 분리", () => {
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

  it("정상 2점 route는 LIVE_ROUTE로 반환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [{ result_code: 0, sections: [{ roads: [{ vertexes: [128, 37, 128.05, 37.05, 128.1, 37.1] }] }] }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await fetchCourseRouteGeometry(DAYS);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("LIVE_ROUTE");
    expect(result[0].path.length).toBeGreaterThanOrEqual(2);
  });

  it("Kakao HTTP 400은 페이지 예외가 아니라 해당 구간 FALLBACK으로 변환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: -2, msg: "잘못된 요청" }), { status: 400 }),
    ) as unknown as typeof fetch;

    const result = await fetchCourseRouteGeometry(DAYS);

    expect(result).toEqual([
      { dayIndex: 1, fromPoiId: "poi-a", toPoiId: "poi-b", path: [], source: "FALLBACK" },
    ]);
  });

  it("좌표가 없는 구간은 외부 route 요청 없이 결과에서 제외한다", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await fetchCourseRouteGeometry([
      { dayIndex: 1, items: [{ poiId: "poi-a", lat: null, lng: null }, { poiId: "poi-b", lat: 37.1, lng: 128.1 }], lodging: null },
    ] as unknown as CourseDay[]);

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
