// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("CourseMap", () => {
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

  /** 카카오모빌리티 실제 도로 거리·시간은 일정 목록에 반영돼 있지만, transport가 PRIVATE_VEHICLE이
   * 아니거나 projectId가 없으면(예: 인쇄 화면) 실제 경로를 조회하지 않고 항상 방문 순서 직선을
   * 보여준다(2026-08-06 조사 결과). */
  it("PRIVATE_VEHICLE이 아니면 실제 경로를 조회하지 않고 방문 순서 연결선 문구만 보여준다", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" transport="WALK" />);
    expect(screen.getByText("방문 순서 연결선")).toBeInTheDocument();
    expect(screen.getByText(/지도 선은 실제 도로 경로가 아닌 방문 순서 연결선입니다/)).toBeInTheDocument();
    expect(fetchPlanRouteGeometryAction).not.toHaveBeenCalled();
  });

  it("projectId가 없으면 PRIVATE_VEHICLE이어도 실제 경로를 조회하지 않는다", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" transport="PRIVATE_VEHICLE" />);
    expect(fetchPlanRouteGeometryAction).not.toHaveBeenCalled();
  });

  /** 실제 도로 Polyline 도입(2026-08-06, Phase 12 후속) — PRIVATE_VEHICLE + projectId가 있으면
   * 마운트 후 서버 액션으로 실제 경로를 조회하고, 성공한 구간은 "실제 도로 경로" 범례로 표시한다. DB에는
   * 저장하지 않고 이 컴포넌트의 state에만 잠깐 머문다(액션 자체가 저장하지 않음, 여기서는 호출 여부만
   * 확인한다). */
  it("PRIVATE_VEHICLE + projectId면 마운트 후 실제 경로를 조회하고, 성공하면 '실제 도로 경로' 범례를 보여준다", async () => {
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
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" transport="PRIVATE_VEHICLE" />);

    expect(fetchPlanRouteGeometryAction).toHaveBeenCalledWith("proj-1");
    await waitFor(() => expect(screen.getByText("실제 도로 경로")).toBeInTheDocument());
    expect(screen.queryByText("경로 조회 실패 · 장소 연결선")).not.toBeInTheDocument();
  });

  it("실제 경로 조회가 실패해도 페이지는 정상이고 기존 방문 순서 연결선으로 대체된다", async () => {
    vi.mocked(fetchPlanRouteGeometryAction).mockRejectedValueOnce(new Error("network error"));
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" projectId="proj-1" transport="PRIVATE_VEHICLE" />);

    await waitFor(() => expect(fetchPlanRouteGeometryAction).toHaveBeenCalled());
    expect(screen.getByTestId("course-map-container")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/지도 선은 실제 도로 경로가 아닌 방문 순서 연결선입니다/)).toBeInTheDocument(),
    );
  });

  it("지도 선이 방문 순서 연결선이며 실제 도로 경로가 아니라는 범례·문구를 보여준다(transport 미지정)", () => {
    render(<CourseMap days={daysWithCoords} kakaoKey="test-key" />);
    expect(screen.getByText("방문 순서 연결선")).toBeInTheDocument();
    expect(screen.getByText(/지도 선은 실제 도로 경로가 아닌 방문 순서 연결선입니다/)).toBeInTheDocument();
  });
});
