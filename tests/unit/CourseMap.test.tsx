// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/plan/actions", () => ({
  fetchPlanRouteGeometryAction: vi.fn(async () => ({ segments: [] })),
}));

import { CourseMap, type CourseMapDay } from "@/components/map/CourseMap";
import { fetchPlanRouteGeometryAction } from "@/app/projects/[id]/plan/actions";

const daysWithCoords: CourseMapDay[] = [
  {
    dayIndex: 1,
    items: [
      { poiId: "a", poiName: "A장소", timeSlot: "10:00", lat: 36.35, lng: 127.38 },
      { poiId: "b", poiName: "B장소", timeSlot: "13:00", lat: 36.4, lng: 127.45 },
    ],
  },
];

const daysWithoutCoords: CourseMapDay[] = [
  { dayIndex: 1, items: [{ poiId: "a", poiName: "A장소", timeSlot: "10:00" }] },
];

/** 실제 카카오맵 JS SDK 대신 최소한의 mock 객체를 심는다 — jsdom은 외부 스크립트를 실제로 로드하지
 * 않아 이 mock 없이는 지도 그리기 로직(마커·Polyline 생성) 자체가 한 번도 실행되지 않는다. Polyline/
 * Marker 생성자 호출을 그대로 기록해, 실제 색상·zIndex·경로 좌표를 단정할 수 있게 한다. */
interface PolylineCallArgs {
  path: unknown[];
  strokeWeight?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeStyle?: string;
  zIndex?: number;
}
interface MarkerCallArgs {
  position: unknown;
  map: unknown;
  zIndex?: number;
}

function installKakaoMock() {
  const polylineCalls: PolylineCallArgs[] = [];
  const markerCalls: MarkerCallArgs[] = [];
  const boundsExtendCalls: unknown[] = [];
  let mapConstructorCalls = 0;
  const setMapNullCalls: unknown[] = [];

  class FakeLatLng {
    lat: number;
    lng: number;
    constructor(lat: number, lng: number) {
      this.lat = lat;
      this.lng = lng;
    }
  }
  class FakeBounds {
    extend(latlng: unknown) {
      boundsExtendCalls.push(latlng);
    }
  }
  class FakeMap {
    constructor() {
      mapConstructorCalls++;
    }
    setBounds() {}
  }
  class FakeMarker {
    constructor(opts: MarkerCallArgs) {
      markerCalls.push(opts);
    }
  }
  class FakeInfoWindow {
    open() {}
  }
  class FakePolyline {
    constructor(opts: PolylineCallArgs) {
      polylineCalls.push(opts);
    }
    setMap(map: unknown) {
      if (map === null) setMapNullCalls.push(this);
    }
  }

  window.kakao = {
    maps: {
      load: (cb: () => void) => cb(),
      LatLng: FakeLatLng as unknown as never,
      LatLngBounds: FakeBounds as unknown as never,
      Map: FakeMap as unknown as never,
      Marker: FakeMarker as unknown as never,
      InfoWindow: FakeInfoWindow as unknown as never,
      Polyline: FakePolyline as unknown as never,
      event: { addListener: () => {} },
    },
  };

  return {
    polylineCalls,
    markerCalls,
    boundsExtendCalls,
    getMapConstructorCalls: () => mapConstructorCalls,
    setMapNullCalls,
  };
}

describe("CourseMap", () => {
  beforeEach(() => {
    delete (window as { kakao?: unknown }).kakao;
    vi.mocked(fetchPlanRouteGeometryAction).mockClear();
  });

  it("카카오맵 키가 없으면 안내 문구를 보여준다", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey={undefined} />);
    expect(screen.getByText(/지도 API 키가 설정되지 않아/)).toBeInTheDocument();
  });

  it("좌표 있는 장소가 하나도 없으면 안내 문구를 보여준다", () => {
    render(<CourseMap days={daysWithoutCoords} kakaoKey="test-key" />);
    expect(screen.getByText(/좌표 정보가 있는 장소가 없어/)).toBeInTheDocument();
  });

  it("키와 좌표가 있으면 지도 컨테이너를 렌더링한다", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" />);
    expect(screen.getByTestId("course-map-container")).toBeInTheDocument();
  });

  it("날짜가 2개 이상이고 둘 다 좌표가 있으면 날짜 탭이 나온다", () => {
    const twoDays: CourseMapDay[] = [
      ...daysWithCoords,
      { dayIndex: 2, items: [{ poiId: "c", poiName: "C장소", timeSlot: "10:00", lat: 36.3, lng: 127.3 }] },
    ];
    render(<CourseMap days={twoDays} kakaoKey="test-key" />);
    expect(screen.getByRole("button", { name: "1일차" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2일차" })).toBeInTheDocument();
  });

  it("날짜가 하나뿐이면 날짜 탭을 보여주지 않는다", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" />);
    expect(screen.queryByRole("button", { name: "1일차" })).not.toBeInTheDocument();
  });

  it("화면에는 기술적인 경로 출처 문구를 노출하지 않는다(2026-08-06 2차 — 이동수단 무관 전체 적용)", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
    const bannedPhrases = [
      "실제 도로 경로",
      "자동차 도로 기준",
      "도로망 기준",
      "방문 순서 연결선",
      "경로 조회 실패",
      "실제 도로 경로가 아닙니다",
      "fallback",
      "LIVE_ROUTE",
      "이동수단과 다른 경로일 수 있습니다",
    ];
    for (const phrase of bannedPhrases) {
      expect(screen.queryByText(phrase, { exact: false })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/이동 경로/)).toBeInTheDocument();
  });

  it("projectId가 있으면 이동수단과 무관하게 마운트 후 경로를 조회한다", async () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
    await waitFor(() => expect(fetchPlanRouteGeometryAction).toHaveBeenCalledWith("proj-1"));
  });

  it("projectId가 없으면(예: 인쇄 화면) 경로를 조회하지 않는다", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" />);
    expect(fetchPlanRouteGeometryAction).not.toHaveBeenCalled();
  });

  it("경로 조회가 실패해도 페이지는 정상이고 기술적 오류 문구를 노출하지 않는다", async () => {
    vi.mocked(fetchPlanRouteGeometryAction).mockRejectedValueOnce(new Error("network error"));
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);

    await waitFor(() => expect(fetchPlanRouteGeometryAction).toHaveBeenCalled());
    expect(screen.getByTestId("course-map-container")).toBeInTheDocument();
    expect(screen.queryByText(/실패|오류|error/i)).not.toBeInTheDocument();
  });

  describe("실제 지도 그리기(카카오 SDK mock)", () => {
    it("실제 경로 확보 성공 시 짙은 검정이 아닌 강조색으로 실선을 그리고, 직선은 함께 그리지 않는다", async () => {
      const { polylineCalls } = installKakaoMock();
      vi.mocked(fetchPlanRouteGeometryAction).mockResolvedValueOnce({
        segments: [
          {
            dayIndex: 1,
            fromPoiId: "a",
            toPoiId: "b",
            path: [
              { lat: 36.35, lng: 127.38 },
              { lat: 36.36, lng: 127.4 },
              { lat: 36.4, lng: 127.45 },
            ],
            source: "LIVE_ROUTE",
          },
        ],
      });

      render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
      // geometry 조회가 아주 빠르게 끝나면 fallback 없이 곧바로 실제 경로로 그려질 수도 있고, 조회
      // 전에 fallback을 한 번 그렸다가 다시 그릴 수도 있다 — 두 순서 모두 정상이므로 "마지막으로 그린
      // 결과"만 확인한다(halo 1개 + 본선 1개, 좌표 3개짜리 실제 경로).
      await waitFor(() => {
        expect(polylineCalls.length).toBeGreaterThanOrEqual(2);
        const last = polylineCalls[polylineCalls.length - 1];
        expect(last.strokeStyle).toBe("solid");
        expect(last.path).toHaveLength(3);
      });

      const mainLine = polylineCalls[polylineCalls.length - 1];
      const haloLine = polylineCalls[polylineCalls.length - 2];
      expect(mainLine.strokeColor).toBe("#0d9488");
      expect(mainLine.strokeColor).not.toBe("#0f172a");
      expect(mainLine.strokeColor?.toLowerCase()).not.toBe("#000000");
      expect(haloLine.strokeColor).toBe("#ffffff");
      expect(mainLine.path).toHaveLength(3); // 실제 geometry 좌표 3개 그대로 사용(직선 2점 아님)
    });

    it("실제 경로가 늦게 도착해도 지도를 다시 만들지 않고 이전 경로선만 지운다(2026-08-08, 확대/축소 시 fallback 점선 깜빡임 원인 수정)", async () => {
      const { polylineCalls, getMapConstructorCalls, setMapNullCalls } = installKakaoMock();
      let resolveGeometry: (v: {
        segments: { dayIndex: number; fromPoiId: string; toPoiId: string; path: { lat: number; lng: number }[]; source: "LIVE_ROUTE" | "FALLBACK" }[];
      }) => void = () => {};
      vi.mocked(fetchPlanRouteGeometryAction).mockImplementationOnce(
        () => new Promise((resolve) => (resolveGeometry = resolve)),
      );

      render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
      // 조회가 끝나기 전: fallback 점선(halo+본선 2개)이 이미 그려져 있고, 지도는 1번만 생성됐다.
      await waitFor(() => expect(polylineCalls.length).toBe(2));
      expect(getMapConstructorCalls()).toBe(1);

      resolveGeometry({
        segments: [
          {
            dayIndex: 1,
            fromPoiId: "a",
            toPoiId: "b",
            path: [
              { lat: 36.35, lng: 127.38 },
              { lat: 36.36, lng: 127.4 },
              { lat: 36.4, lng: 127.45 },
            ],
            source: "LIVE_ROUTE",
          },
        ],
      });

      // 실제 경로 도착 후: 이전 fallback 2개는 setMap(null)로 지워지고, 실제 경로 2개가 새로 그려진다 —
      // 하지만 지도(kakao.maps.Map) 자체는 다시 만들어지지 않는다(생성 횟수 그대로 1).
      await waitFor(() => {
        expect(polylineCalls.length).toBe(4);
        expect(setMapNullCalls.length).toBe(2);
      });
      expect(getMapConstructorCalls()).toBe(1);
    });

    it("경로 확보에 실패한 구간은 강조색 계열의 옅은 점선으로 대체되고, 화면에는 실패 사실을 알리지 않는다", async () => {
      const { polylineCalls } = installKakaoMock();
      vi.mocked(fetchPlanRouteGeometryAction).mockResolvedValueOnce({ segments: [] });

      render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
      await waitFor(() => expect(polylineCalls.length).toBeGreaterThan(0));

      const mainLine = polylineCalls[1];
      expect(mainLine.strokeColor).toBe("#0d9488");
      expect(mainLine.strokeStyle).toBe("shortdash");
      expect(mainLine.path).toHaveLength(2); // 두 지점 직선
    });

    it("마커가 경로선보다 항상 위에 보이도록 zIndex가 더 높다", async () => {
      const { polylineCalls, markerCalls } = installKakaoMock();
      render(<CourseMap days={daysWithCoords} kakaoKey="test-key" />);
      await waitFor(() => expect(polylineCalls.length).toBeGreaterThan(0));

      expect(markerCalls[0].zIndex).toBeGreaterThan(polylineCalls[0].zIndex ?? 0);
      expect(markerCalls[0].zIndex).toBeGreaterThan(polylineCalls[1].zIndex ?? 0);
    });

    it("bounds에 실제 경로 좌표 전체가 포함된다(끝점 2개가 아니라 굴곡 좌표까지)", async () => {
      const { boundsExtendCalls } = installKakaoMock();
      vi.mocked(fetchPlanRouteGeometryAction).mockResolvedValueOnce({
        segments: [
          {
            dayIndex: 1,
            fromPoiId: "a",
            toPoiId: "b",
            path: [
              { lat: 36.35, lng: 127.38 },
              { lat: 36.37, lng: 127.41 },
              { lat: 36.4, lng: 127.45 },
            ],
            source: "LIVE_ROUTE",
          },
        ],
      });

      render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
      // 마커 2개(끝점) + 경로 좌표 3개 = 최소 5회 이상 extend 호출
      await waitFor(() => expect(boundsExtendCalls.length).toBeGreaterThanOrEqual(5));
    });

    it("날짜 탭을 바꿔도 이전 날짜의 Polyline이 누적되지 않는다(매번 새 지도 컨테이너로 초기화)", async () => {
      const { polylineCalls } = installKakaoMock();
      const twoDays: CourseMapDay[] = [
        ...daysWithCoords, // 1일차: 구간 1개 → Polyline 2개(halo+본선)
        {
          dayIndex: 2,
          items: [
            { poiId: "c", poiName: "C장소", timeSlot: "10:00", lat: 36.3, lng: 127.3 },
            { poiId: "d", poiName: "D장소", timeSlot: "13:00", lat: 36.32, lng: 127.33 },
            { poiId: "e", poiName: "E장소", timeSlot: "16:00", lat: 36.34, lng: 127.36 },
          ], // 2일차: 구간 2개 → Polyline 4개
        },
      ];
      render(<CourseMap days={twoDays} kakaoKey="test-key" />);
      await waitFor(() => expect(polylineCalls.length).toBe(2));

      polylineCalls.length = 0;
      screen.getByRole("button", { name: "2일차" }).click();
      // 2일차로 전환하면 2일차 구간 수(2개)에 해당하는 Polyline만 그려지고, 1일차 것이 남아 누적되지 않는다.
      await waitFor(() => expect(polylineCalls.length).toBe(4));
    });
  });
});

describe("CourseMap — cleanup", () => {
  it("unmount 이후에는 지연 응답이 와도 state를 업데이트하지 않는다(경고 없이 안전)", async () => {
    let resolveGeometry: (v: { segments: never[] }) => void = () => {};
    vi.mocked(fetchPlanRouteGeometryAction).mockImplementationOnce(
      () => new Promise((resolve) => (resolveGeometry = resolve)),
    );
    const { unmount } = render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" />);
    unmount();
    expect(() => resolveGeometry({ segments: [] })).not.toThrow();
    cleanup();
  });
});
