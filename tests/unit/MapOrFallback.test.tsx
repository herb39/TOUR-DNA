// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MapOrFallback, type MapPoi } from "@/components/map/MapOrFallback";

const pois: MapPoi[] = [{ id: "p1", name: "경포대", address: "강릉시", lat: 37.79, lng: 128.9 }];

describe("MapOrFallback", () => {
  beforeEach(() => {
    delete (window as { kakao?: unknown }).kakao;
    document.getElementById("kakao-map-sdk")?.remove();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { kakao?: unknown }).kakao;
    document.getElementById("kakao-map-sdk")?.remove();
  });

  it("키가 없으면 좌표/주소 목록으로 대체 표시한다", () => {
    render(<MapOrFallback pois={pois} kakaoKey={undefined} />);
    expect(screen.getByText(/지도 API 키가 설정되지 않아/)).toBeInTheDocument();
    expect(screen.getByText("경포대")).toBeInTheDocument();
  });

  it("키가 있고 SDK가 정상 로드되면 지도 컨테이너를 렌더링한다", () => {
    (window as unknown as { kakao: unknown }).kakao = { maps: { load: (cb: () => void) => cb(), LatLng: class {}, Map: class {}, Marker: class {}, InfoWindow: class { open() {} }, event: { addListener: () => {} } } };
    render(<MapOrFallback pois={pois} kakaoKey="test-key" />);
    expect(screen.getByTestId("kakao-map-container")).toBeInTheDocument();
  });

  it("SDK 로드 콜백이 끝내 오지 않으면(도메인 미등록 등) 타임아웃 후 좌표 목록으로 대체한다", () => {
    render(<MapOrFallback pois={pois} kakaoKey="test-key" />);
    // kakao.maps.load 콜백이 전혀 오지 않는 상황(도메인 미등록으로 인한 무응답)을 재현한다.
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByText(/지도를 불러오지 못해/)).toBeInTheDocument();
    expect(screen.getByText("경포대")).toBeInTheDocument();
  });
});
