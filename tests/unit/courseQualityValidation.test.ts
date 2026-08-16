import { describe, expect, it } from "vitest";
import { computeCourseQuality } from "@/lib/domain/courseQualityValidation";
import type { CourseDay, CourseItem } from "@/lib/domain/planBuilder";

function item(overrides: Partial<CourseItem> = {}): CourseItem {
  return {
    order: 1,
    poiId: "poi-1",
    poiName: "장소",
    category: "ATTRACTION",
    timeSlot: "10:00",
    stayMinutes: 60,
    travel: "숙소/집결지에서 이동",
    lat: 36.35,
    lng: 127.38,
    ...overrides,
  };
}

function day(dayIndex: number, items: CourseItem[], lodging?: CourseItem | null): CourseDay {
  return { dayIndex, items, ...(lodging !== undefined ? { lodging } : {}) };
}

describe("computeCourseQuality", () => {
  it("기존 30% 기준과 TourAPI 구조 분류로 핵심 테마 구성을 advisory 검사한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "a1", poiName: "첨성대", lclsSystm1: "HS" }),
          item({ poiId: "a2", poiName: "일반 공원", lat: 36.36, lng: 127.39 }),
          item({ poiId: "a3", poiName: "일반 체험", category: "EXPERIENCE", lat: 36.37, lng: 127.4 }),
          item({ poiId: "a4", poiName: "일반 쇼핑", category: "SHOPPING", lat: 36.38, lng: 127.41 }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
      templateId: "CULTURE_HISTORY",
      preferredThemes: [],
    });

    expect(report.warnings.map((warning) => warning.id)).toContain("core-theme-composition");
    expect(report.warnings.find((warning) => warning.id === "core-theme-composition")?.message).toContain("1곳");
  });

  it("SHOPPING만 동일 좌표를 시설 중복으로 안내한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "s1", poiName: "백화점 매장 A", category: "SHOPPING" }),
          item({ poiId: "s2", poiName: "백화점 매장 B", category: "SHOPPING" }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    expect(report.warnings.map((warning) => warning.id)).toContain("shopping-duplicate");
  });

  it("기존 날짜별 목표 개수와 시간 슬롯을 넘긴 과밀 일정을 안내한다", () => {
    const report = computeCourseQuality({
      days: [
        day(
          1,
          Array.from({ length: 5 }, (_, index) =>
            item({
              poiId: `p-${index}`,
              poiName: `장소 ${index}`,
              order: index + 1,
              timeSlot: index === 4 ? "21:00" : `${10 + index * 2}:00`,
              lat: 36.35 + index * 0.001,
              lng: 127.38 + index * 0.001,
            }),
          ),
        ),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    expect(report.warnings.map((warning) => warning.id)).toContain("daily-density");
  });

  it("기간 규칙에 맞지 않는 식사·숙박 구성을 동시에 안내한다", () => {
    const report = computeCourseQuality({
      days: [day(1, [item({ poiId: "a1" })]), day(2, [item({ poiId: "a2", timeSlot: "10:00" })])],
      duration: "ONE_NIGHT_TWO_DAYS",
      transport: "PUBLIC_TRANSPORT",
    });

    const warningIds = report.warnings.map((warning) => warning.id);
    expect(warningIds).toContain("meal-composition");
    expect(warningIds).toContain("lodging-missing");
  });

  it("기존 60/90분 이동 기준과 시간표 여유를 편집 상태에 적용한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "near", poiName: "출발지", timeSlot: "10:00", stayMinutes: 60, lat: 36.35, lng: 127.38 }),
          item({ poiId: "far", poiName: "먼 장소", timeSlot: "11:00", lat: 37.35, lng: 128.38 }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    const warningIds = report.warnings.map((warning) => warning.id);
    expect(warningIds).toContain("travel-burden");
    expect(warningIds).toContain("schedule-feasibility");
  });

  it("단순 운영시간 범위를 벗어난 일정은 확인 필요 advisory로 안내한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({
            poiName: "옹진 전시관",
            timeSlot: "09:00",
            stayMinutes: 60,
            operatingHours: "10:00~14:00",
          }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    const warning = report.warnings.find((candidate) => candidate.id === "operating-hours-check");
    expect(warning?.details?.[0]).toContain("운영시간 10:00~14:00");
    expect(warning?.details?.[0]).toContain("벗어날 수 있음");
  });

  it("운영시간 범위 안의 일정은 운영시간 경고를 만들지 않는다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({
            timeSlot: "10:00",
            stayMinutes: 60,
            operatingHours: "10:00~14:00",
          }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    expect(report.warnings.some((warning) => warning.id === "operating-hours-check")).toBe(false);
  });

  it("휴무일 문구는 여행일자·요일 확인 advisory로 안내하고 자동 휴무 판정은 하지 않는다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({
            poiName: "옹진 전시관",
            closedDays: "매주 월요일, 화요일",
            lclsSystm1: "LS",
            lclsSystm2: "LS02",
          }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    const warning = report.warnings.find((candidate) => candidate.id === "operating-hours-check");
    expect(warning?.message).toContain("자동 확정 판정하지 않으므로");
    expect(warning?.details?.[0]).toContain("자동 휴무 판정은 하지 않음");
    expect(warning?.details?.[0]).toContain("공식 레저 분류 수상레저스포츠");
  });

  it("예약시 운영 문구는 휴무일이 아니라 예약 운영 advisory로 안내한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({
            operatingHours: "예약시 운영",
            closedDays: "예약시 운영",
          }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    const warning = report.warnings.find((candidate) => candidate.id === "operating-hours-check");
    expect(warning?.details?.[0]).toContain("예약 운영 문구");
    expect(warning?.details?.[0]).toContain("운영 안내 예약시 운영");
    expect(warning?.details?.[0]).not.toContain("휴무일 예약시 운영");
  });
});
