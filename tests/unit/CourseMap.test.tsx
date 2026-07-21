// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { CourseMap, type CourseMapDay } from "@/components/map/CourseMap";

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
});
