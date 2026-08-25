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
  it("반려동물 조건은 일반 POI만 대상으로 INFO advisory를 추가하고 Anchor는 제외한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "confirmed" }),
          item({ poiId: "conditional", lat: 36.36, lng: 127.39 }),
          item({
            poiId: "anchor",
            poiName: "축제",
            kind: "FESTIVAL_ANCHOR",
            lat: 36.37,
            lng: 127.4,
          }),
        ], item({ poiId: "unknown-lodging", category: "LODGING", lat: 36.38, lng: 127.41 })),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
      petConditionActive: true,
      petEvidenceByPoiId: {
        confirmed: {
          status: "CONFIRMED",
          label: "공식 동반 정보 확인",
          detailLines: [],
          sourceLabel: "공식",
          fetchedAtLabel: "2026.08.19",
          scope: "ALL",
        },
        conditional: {
          status: "CONDITIONAL",
          label: "조건부 동반",
          detailLines: [],
          sourceLabel: "공식",
          fetchedAtLabel: "2026.08.19",
          scope: "PARTIAL",
        },
      },
    });

    const warning = report.warnings.find((candidate) => candidate.id === "pet-evidence-summary");
    expect(warning?.severity).toBe("INFO");
    expect(warning?.message).toContain("확인된 장소 1곳, 조건부 1곳, 미확인 1곳");
    expect(warning?.message).not.toContain("축제");
  });

  it("반려동물 조건이 없으면 PET advisory를 만들지 않는다", () => {
    const report = computeCourseQuality({
      days: [day(1, [item()])],
      duration: "DAY_TRIP",
      transport: "WALK",
      petConditionActive: false,
    });

    expect(report.warnings.some((warning) => warning.id === "pet-evidence-summary")).toBe(false);
  });

  it("무장애 조건은 코스 장소의 공식 정보 coverage만 INFO advisory로 안내하고 Anchor는 제외한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "available" }),
          item({ poiId: "unknown", lat: 36.36, lng: 127.39 }),
          item({ poiId: "anchor", kind: "FESTIVAL_ANCHOR", lat: 36.37, lng: 127.4 }),
        ], item({ poiId: "lodging", category: "LODGING", lat: 36.38, lng: 127.41 })),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
      accessibilityConditionActive: true,
      accessibilityEvidenceByPoiId: {
        available: {
          status: "OFFICIAL_INFO_AVAILABLE",
          label: "공식 접근성 정보",
          dimensions: [],
          sourceLabel: "공식",
          fetchedAtLabel: "2026.08.25",
          hasMeaningfulDimensions: true,
        },
      },
    });

    const advisory = report.warnings.find((warning) => warning.id === "accessibility-evidence-summary");
    expect(advisory?.severity).toBe("INFO");
    expect(advisory?.message).toContain("코스 3곳 중 1곳");
    expect(advisory?.message).not.toContain("불가");
  });

  it("무장애 조건이 없으면 ACCESSIBILITY advisory를 만들지 않는다", () => {
    const report = computeCourseQuality({
      days: [day(1, [item()])],
      duration: "DAY_TRIP",
      transport: "WALK",
      accessibilityConditionActive: false,
    });

    expect(report.warnings.some((warning) => warning.id === "accessibility-evidence-summary")).toBe(false);
  });

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

  it("국내 범위 밖 좌표는 동일시설 중복의 공간 근거로 사용하지 않는다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "bad-1", category: "SHOPPING", lat: 19.69442748, lng: 117.9925662504 }),
          item({ poiId: "bad-2", category: "SHOPPING", lat: 19.69442748, lng: 117.9925662504 }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    expect(report.warnings.some((warning) => warning.id === "shopping-duplicate")).toBe(false);
  });

  it("국내 범위 밖 좌표가 있어도 저장된 이동시간을 품질 경고에 재사용하지 않는다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({ poiId: "bad-1", lat: 19.69442748, lng: 117.9925662504 }),
          item({ poiId: "bad-2", lat: 19.69442748, lng: 117.9925662504, travelMinutes: 240, travelSource: "LIVE_API" }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    expect(report.warnings.some((warning) => warning.id === "travel-burden")).toBe(false);
    expect(report.warnings.some((warning) => warning.id === "schedule-feasibility")).toBe(false);
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

  it("요일별·복수 시간대 운영시간은 자동 판정하지 않고 확인 advisory로 안내한다", () => {
    const report = computeCourseQuality({
      days: [
        day(1, [
          item({
            poiName: "문화예술회관",
            timeSlot: "10:00",
            stayMinutes: 60,
            operatingHours: "평일 10:00~18:00, 주말 10:00~20:00",
          }),
          item({
            poiName: "분할 운영 전시관",
            timeSlot: "12:30",
            stayMinutes: 60,
            operatingHours: "09:00~12:00, 13:00~18:00",
          }),
        ]),
      ],
      duration: "DAY_TRIP",
      transport: "WALK",
    });

    const warning = report.warnings.find((candidate) => candidate.id === "operating-hours-check");
    expect(warning?.details?.filter((detail) => detail.includes("자동 판정하지 않음"))).toHaveLength(2);
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
