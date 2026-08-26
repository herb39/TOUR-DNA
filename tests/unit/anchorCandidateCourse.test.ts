import { describe, expect, it } from "vitest";
import { insertLodgingIntoDay, type CourseDay } from "@/lib/domain/planBuilder";
import { insertPoiAroundFestivalAnchor, insertFestivalAnchorIntoCourse, type FestivalAnchorCourseSource } from "@/lib/domain/festivalAnchorCourse";

const source: FestivalAnchorCourseSource = {
  id: "anchor-1",
  updatedAt: "2026-08-18T01:00:00.000Z",
  source: "TOUR_API_FESTIVAL",
  sourceId: "festival-1",
  contentTypeId: "15",
  name: "지역 축제",
  eventStartDate: "2026-10-10",
  eventEndDate: "2026-10-10",
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
};

function daysWithAnchor(): CourseDay[] {
  const result = insertFestivalAnchorIntoCourse([{ dayIndex: 1, items: [] }], source, "WALK");
  if (!result.ok) throw new Error(result.message);
  return result.days;
}

describe("Anchor 연계 일정 삽입", () => {
  it("행사 전·후 삽입은 Anchor 순서와 확정 시각을 보존한다", () => {
    const before = insertPoiAroundFestivalAnchor(
      daysWithAnchor(),
      source.id,
      { poiId: "pre", poiName: "행사 전 명소", category: "ATTRACTION", lat: 36.351, lng: 127.381 },
      "BEFORE_ANCHOR",
      "WALK",
    );
    const after = insertPoiAroundFestivalAnchor(
      before,
      source.id,
      { poiId: "post", poiName: "행사 후 명소", category: "ATTRACTION", lat: 36.351, lng: 127.381 },
      "AFTER_ANCHOR",
      "WALK",
    );
    expect(after[0].items.map((item) => item.poiId)).toEqual(["pre", "festival-anchor:anchor-1", "post"]);
    expect(after[0].items[0].stayMinutes).toBe(90);
    expect(after[0].items[1].timeSlot).toBe("15:00");
    expect(after[0].items[1].stayMinutes).toBe(120);
    expect(after[0].items[2].stayMinutes).toBe(90);
  });

  it("숙박 후보는 일반 items가 아니라 lodging 슬롯에 추가한다", () => {
    const result = insertLodgingIntoDay(
      daysWithAnchor(),
      1,
      { id: "stay", name: "지역 숙소", category: "LODGING", lat: 36.36, lng: 127.39 },
      "WALK",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days[0].items).toHaveLength(1);
    expect(result.days[0].lodging?.poiId).toBe("stay");
    expect(result.days[0].lodging?.stayMinutes).toBe(0);
  });
});
