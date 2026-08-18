import { describe, expect, it, vi } from "vitest";
import type { PoiLike } from "@/lib/domain/strategy";
import type { CourseDay } from "@/lib/domain/planBuilder";
import { insertFestivalAnchorIntoCourse, type FestivalAnchorCourseSource } from "@/lib/domain/festivalAnchorCourse";

const fetchPoisByCategoryMock = vi.fn();
vi.mock("@/lib/services/fetchPoisByCategory", () => ({
  fetchPoisByCategory: (...args: unknown[]) => fetchPoisByCategoryMock(...args),
}));

import { buildAnchorCandidateSuggestions } from "@/lib/services/anchorCandidateService";

function anchor(overrides: Partial<FestivalAnchorCourseSource> = {}): FestivalAnchorCourseSource {
  return {
    id: "anchor-1",
    updatedAt: "2026-08-18T01:00:00.000Z",
    source: "TOUR_API_FESTIVAL",
    sourceId: "festival-1",
    contentTypeId: "15",
    name: "지역 축제",
    eventStartDate: "2026-10-10",
    eventEndDate: "2026-10-12",
    plannedDate: "2026-10-10",
    plannedDayIndex: 1,
    timeStatus: "USER_CONFIRMED",
    timeSlot: "CUSTOM",
    timeStart: "15:00",
    timeEnd: "17:00",
    regionCode: "REGION_1",
    address: "축제장",
    lat: 36.35,
    lng: 127.38,
    ...overrides,
  };
}

function poi(id: string, name: string, category: PoiLike["category"], extra: Partial<PoiLike> = {}): PoiLike {
  return { id, name, category, lat: 36.351, lng: 127.381, ...extra };
}

function courseWithAnchor(source = anchor()): CourseDay[] {
  const built = insertFestivalAnchorIntoCourse([{ dayIndex: 1, items: [] }], source, "WALK");
  if (!built.ok) throw new Error(built.message);
  return built.days;
}

describe("anchorCandidateService", () => {
  it("현재 코스의 동일 Anchor를 기준으로 역할별 후보를 거리순으로 만든다", async () => {
    fetchPoisByCategoryMock.mockResolvedValue({
      ATTRACTION: [
        poi("far", "먼 역사유적", "ATTRACTION", { lat: 36.5, lng: 127.5, lclsSystm1: "HS" }),
        poi("near", "가까운 역사유적", "ATTRACTION", { lclsSystm1: "HS" }),
      ],
      FOOD: [poi("food", "축제장 식당", "FOOD", { mealEligible: true })],
      LODGING: [poi("stay", "지역 숙소", "LODGING")],
    });

    const result = await buildAnchorCandidateSuggestions({
      anchor: anchor(),
      days: courseWithAnchor(),
      templateId: "CULTURE_HISTORY",
      regionCode: "REGION_1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      duration: "ONE_NIGHT_TWO_DAYS",
      existingPoiIds: [],
    });

    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    expect(result.groups.PRE_EVENT[0]?.id).toBe("near");
    expect(result.groups.MEAL[0]?.role).toBe("MEAL");
    expect(result.groups.STAY[0]?.role).toBe("STAY");
    expect(result.groups.PRE_EVENT[0]?.distanceMethod).toBe("HAVERSINE");
    expect(new Set(Object.values(result.groups).flat().map((candidate) => candidate.id)).size).toBe(
      Object.values(result.groups).flat().length,
    );
    expect(fetchPoisByCategoryMock).toHaveBeenCalledTimes(1);
  });

  it("Anchor가 코스에 없으면 후보 조회를 하지 않는다", async () => {
    fetchPoisByCategoryMock.mockReset();
    const result = await buildAnchorCandidateSuggestions({
      anchor: anchor(),
      days: [{ dayIndex: 1, items: [] }],
      templateId: "CULTURE_HISTORY",
      regionCode: "REGION_1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      duration: "DAY_TRIP",
      existingPoiIds: [],
    });
    expect(result.status).toBe("NOT_READY");
    expect(fetchPoisByCategoryMock).not.toHaveBeenCalled();
  });

  it("Anchor snapshot이 stale이면 후보를 숨긴다", async () => {
    fetchPoisByCategoryMock.mockReset();
    fetchPoisByCategoryMock.mockResolvedValue({});
    const originalDays = courseWithAnchor();
    const changed = anchor({ updatedAt: "2026-08-18T02:00:00.000Z", timeStart: "16:00", timeEnd: "18:00" });
    const result = await buildAnchorCandidateSuggestions({
      anchor: changed,
      days: originalDays,
      templateId: "CULTURE_HISTORY",
      regionCode: "REGION_1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      duration: "DAY_TRIP",
      existingPoiIds: [],
    });
    expect(result.status).toBe("STALE");
    expect(fetchPoisByCategoryMock).not.toHaveBeenCalled();
  });

  it("현재 코스 POI와 무박 숙박을 후보에서 제외한다", async () => {
    fetchPoisByCategoryMock.mockResolvedValue({
      ATTRACTION: [poi("already", "이미 일정에 있는 역사유적", "ATTRACTION", { lclsSystm1: "HS" })],
      LODGING: [poi("stay", "지역 숙소", "LODGING")],
    });
    const result = await buildAnchorCandidateSuggestions({
      anchor: anchor(),
      days: courseWithAnchor(),
      templateId: "CULTURE_HISTORY",
      regionCode: "REGION_1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      duration: "DAY_TRIP",
      existingPoiIds: ["already"],
    });
    expect(result.status).toBe("EMPTY");
    if (result.status !== "EMPTY") return;
    expect(result.total).toBe(0);
  });

  it("정확한 시각이 없는 Anchor는 임의 후보를 만들지 않는다", async () => {
    fetchPoisByCategoryMock.mockReset();
    const result = await buildAnchorCandidateSuggestions({
      anchor: anchor({ timeStatus: "UNCONFIRMED", timeSlot: "AFTERNOON", timeStart: null, timeEnd: null }),
      days: [],
      templateId: "CULTURE_HISTORY",
      regionCode: "REGION_1",
      travelMonth: 10,
      preferredThemes: ["문화", "역사"],
      duration: "DAY_TRIP",
      existingPoiIds: [],
    });
    expect(result.status).toBe("NOT_READY");
    expect(fetchPoisByCategoryMock).not.toHaveBeenCalled();
  });
});
