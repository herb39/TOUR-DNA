import { describe, expect, it } from "vitest";
import {
  buildFestivalAnchorCourseItem,
  canApplyFestivalAnchor,
  findFestivalAnchorItems,
  insertFestivalAnchorIntoCourse,
  removeFestivalAnchorFromCourse,
  replaceFestivalAnchorInCourse,
  validateFestivalAnchorCourseDays,
  type FestivalAnchorCourseSource,
} from "@/lib/domain/festivalAnchorCourse";
import { reorderCourseItemWithinDay, type CourseDay } from "@/lib/domain/planBuilder";

function anchor(overrides: Partial<FestivalAnchorCourseSource> = {}): FestivalAnchorCourseSource {
  return {
    id: "anchor-1",
    updatedAt: "2026-08-18T01:00:00.000Z",
    source: "TOUR_API",
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
    address: "축제장",
    lat: 36.35,
    lng: 127.38,
    ...overrides,
  };
}

function day(dayIndex: number, items: CourseDay["items"] = []): CourseDay {
  return { dayIndex, items };
}

function poi(id: string, timeSlot: string) {
  return {
    order: 1,
    poiId: id,
    poiName: id,
    category: "ATTRACTION",
    timeSlot,
    stayMinutes: 60,
    travel: "이동 10분",
    lat: 36.36,
    lng: 127.39,
  };
}

describe("festivalAnchorCourse", () => {
  it("정확한 사용자 확정 시각만 코스 항목으로 직렬화한다", () => {
    const result = buildFestivalAnchorCourseItem(anchor());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.kind).toBe("FESTIVAL_ANCHOR");
    expect(result.item.poiId).toBe("festival-anchor:anchor-1");
    expect(result.item.timeSlot).toBe("15:00");
    expect(result.item.stayMinutes).toBe(120);
    expect(result.item.anchorUpdatedAt).toBe("2026-08-18T01:00:00.000Z");
  });

  it("시간대만 있거나 미확정인 Anchor는 가짜 시각을 만들지 않는다", () => {
    expect(canApplyFestivalAnchor(anchor({ timeStatus: "UNCONFIRMED", timeSlot: null, timeStart: null, timeEnd: null }))).toBe(false);
    const result = buildFestivalAnchorCourseItem(
      anchor({ timeStatus: "UNCONFIRMED", timeSlot: "AFTERNOON", timeStart: null, timeEnd: null }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("정확한 시작·종료 시각");
  });

  it("지정 일차·시각에 Anchor를 삽입하면서 기존 POI와 날짜를 보존한다", () => {
    const days = [day(1, [poi("before", "13:00"), poi("after", "18:00")]), day(2, [poi("other-day", "10:00")])];
    const result = insertFestivalAnchorIntoCourse(days, anchor(), "WALK");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days.map((d) => d.items.map((item) => item.poiId))).toEqual([
      ["before", "festival-anchor:anchor-1", "after"],
      ["other-day"],
    ]);
    expect(findFestivalAnchorItems(result.days)).toHaveLength(1);
  });

  it("중복 반영과 다른 Anchor 동시 반영을 거부한다", () => {
    const first = insertFestivalAnchorIntoCourse([day(1)], anchor(), "WALK");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(insertFestivalAnchorIntoCourse(first.days, anchor(), "WALK")).toMatchObject({ ok: false, code: "ANCHOR_EXISTS" });
    expect(insertFestivalAnchorIntoCourse(first.days, anchor({ id: "anchor-2" }), "WALK")).toMatchObject({
      ok: false,
      code: "OTHER_ANCHOR_EXISTS",
    });
  });

  it("Anchor 시각 변경은 명시적 재반영 전까지 stale이고, 재반영하면 snapshot을 교체한다", () => {
    const original = insertFestivalAnchorIntoCourse([day(1, [poi("poi-1", "10:00")])], anchor(), "WALK");
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const changed = anchor({ timeStart: "16:00", timeEnd: "18:00", updatedAt: "2026-08-18T02:00:00.000Z" });
    expect(validateFestivalAnchorCourseDays(original.days, changed).ok).toBe(false);
    const replaced = replaceFestivalAnchorInCourse(original.days, changed, "WALK");
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    const current = findFestivalAnchorItems(replaced.days)[0].item;
    expect(current.timeSlot).toBe("16:00");
    expect(current.anchorUpdatedAt).toBe("2026-08-18T02:00:00.000Z");
    expect(replaced.days[0].items.map((item) => item.poiId)).toContain("poi-1");
  });

  it("Anchor 이동은 고정하고 일반 POI 이동은 허용한다", () => {
    const inserted = insertFestivalAnchorIntoCourse([day(1, [poi("poi-1", "10:00"), poi("poi-2", "18:00")])], anchor(), "WALK");
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const before = inserted.days[0].items.map((item) => item.poiId);
    expect(reorderCourseItemWithinDay(inserted.days, 1, 1, 0, "WALK")[0].items.map((item) => item.poiId)).toEqual(before);
    const movedPoi = reorderCourseItemWithinDay(inserted.days, 1, 0, 2, "WALK");
    expect(movedPoi[0].items.map((item) => item.poiId)).toEqual(["festival-anchor:anchor-1", "poi-2", "poi-1"]);
  });

  it("좌표가 없어도 Anchor 자체는 보존하고 지정 일차가 없으면 거부한다", () => {
    const noCoords = insertFestivalAnchorIntoCourse([day(1)], anchor({ lat: null, lng: null }), "WALK");
    expect(noCoords.ok).toBe(true);
    if (noCoords.ok) expect(findFestivalAnchorItems(noCoords.days)[0].item.lat).toBeUndefined();
    expect(insertFestivalAnchorIntoCourse([day(1)], anchor({ plannedDayIndex: 2 }), "WALK")).toMatchObject({
      ok: false,
      code: "INVALID_DAY",
    });
  });

  it("코스에서만 제거하며 ProjectAnchor 입력 자체는 변경하지 않는다", () => {
    const source = anchor();
    const inserted = insertFestivalAnchorIntoCourse([day(1)], source, "WALK");
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const removed = removeFestivalAnchorFromCourse(inserted.days, source.id, "WALK");
    expect(findFestivalAnchorItems(removed)).toHaveLength(0);
    expect(source.id).toBe("anchor-1");
  });
});
