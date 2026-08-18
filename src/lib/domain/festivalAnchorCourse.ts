import {
  courseItemToInput,
  estimateTravel,
  isFestivalAnchorItem,
  minutesToTimeSlot,
  parseTimeSlotToMinutes,
  recomputeDayItems,
  type CourseDay,
  type CourseItem,
  type CourseItemInput,
  type TransportCode,
} from "./planBuilder";

/** ProjectAnchor를 domain에서 직접 import하지 않기 위한 최소 입력 계약. */
export interface FestivalAnchorCourseSource {
  id: string;
  updatedAt: string;
  source: string;
  sourceId: string;
  contentTypeId: string;
  name: string;
  eventStartDate: string;
  eventEndDate: string;
  plannedDate: string;
  plannedDayIndex: number;
  timeStatus: "UNCONFIRMED" | "USER_CONFIRMED";
  timeSlot: "MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM" | null;
  timeStart: string | null;
  timeEnd: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  regionCode?: string;
}

export type FestivalAnchorCourseMutationResult =
  | { ok: true; days: CourseDay[] }
  | {
      ok: false;
      code: "TIME_REQUIRED" | "INVALID_DAY" | "ANCHOR_EXISTS" | "OTHER_ANCHOR_EXISTS" | "ANCHOR_NOT_FOUND" | "INVALID_ITEM";
      message: string;
    };

export interface FestivalAnchorCourseValidationResult {
  ok: boolean;
  message?: string;
}

function exactTimeToMinutes(value: string | null): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const minutes = parseTimeSlotToMinutes(value);
  return minutes !== null && minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

function anchorDurationMinutes(anchor: FestivalAnchorCourseSource): number | null {
  if (anchor.timeStatus !== "USER_CONFIRMED" || anchor.timeSlot !== "CUSTOM") return null;
  const start = exactTimeToMinutes(anchor.timeStart);
  const end = exactTimeToMinutes(anchor.timeEnd);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

export function festivalAnchorCoursePoiId(anchorId: string): string {
  return `festival-anchor:${anchorId}`;
}

/** 코스에 반영할 수 있는 것은 사용자가 시작·종료 시각을 직접 확정한 Anchor뿐이다. */
export function canApplyFestivalAnchor(anchor: FestivalAnchorCourseSource): boolean {
  return anchorDurationMinutes(anchor) !== null;
}

export function buildFestivalAnchorCourseItem(
  anchor: FestivalAnchorCourseSource,
): { ok: true; item: CourseItem } | { ok: false; message: string } {
  const duration = anchorDurationMinutes(anchor);
  const start = exactTimeToMinutes(anchor.timeStart);
  if (duration === null || start === null) {
    return {
      ok: false,
      message: "시간대만 지정되었거나 공식 시각이 미확정인 Anchor는 코스 반영 전에 정확한 시작·종료 시각을 확정해주세요.",
    };
  }

  return {
    ok: true,
    item: {
      kind: "FESTIVAL_ANCHOR",
      order: 0,
      poiId: festivalAnchorCoursePoiId(anchor.id),
      poiName: anchor.name,
      category: "FESTIVAL",
      timeSlot: minutesToTimeSlot(start),
      stayMinutes: duration,
      travel: "축제 Anchor",
      lat: anchor.lat ?? undefined,
      lng: anchor.lng ?? undefined,
      anchorId: anchor.id,
      anchorUpdatedAt: anchor.updatedAt,
      anchorSource: anchor.source,
      anchorSourceId: anchor.sourceId,
      anchorContentTypeId: anchor.contentTypeId,
      anchorAddress: anchor.address,
      anchorEventStartDate: anchor.eventStartDate,
      anchorEventEndDate: anchor.eventEndDate,
      anchorPlannedDate: anchor.plannedDate,
      anchorPlannedDayIndex: anchor.plannedDayIndex,
      anchorTimeStatus: anchor.timeStatus,
      anchorTimeSlot: anchor.timeSlot,
      anchorTimeStart: anchor.timeStart,
      anchorTimeEnd: anchor.timeEnd,
    },
  };
}

export function findFestivalAnchorItems(days: CourseDay[]): { dayIndex: number; index: number; item: CourseItem }[] {
  const result: { dayIndex: number; index: number; item: CourseItem }[] = [];
  for (const day of days) {
    day.items.forEach((item, index) => {
      if (isFestivalAnchorItem(item)) result.push({ dayIndex: day.dayIndex, index, item });
    });
  }
  return result;
}

function recomputeItems(items: CourseItem[], transport: TransportCode): CourseItem[] {
  return recomputeDayItems(items.map(courseItemToInput), transport);
}

function insertItemInDay(day: CourseDay, item: CourseItem, transport: TransportCode): CourseDay {
  const anchorStart = parseTimeSlotToMinutes(item.timeSlot) ?? Number.MAX_SAFE_INTEGER;
  const insertAt = day.items.findIndex((existing) => {
    const start = parseTimeSlotToMinutes(existing.timeSlot);
    return start !== null && start >= anchorStart;
  });
  const items = [...day.items];
  items.splice(insertAt === -1 ? items.length : insertAt, 0, item);
  return { ...day, items: recomputeItems(items, transport) };
}

/** 지정된 일차·확정 시각에만 Anchor를 삽입하며, 기존 POI는 삭제하지 않는다. */
export function insertFestivalAnchorIntoCourse(
  days: CourseDay[],
  anchor: FestivalAnchorCourseSource,
  transport: TransportCode,
): FestivalAnchorCourseMutationResult {
  const built = buildFestivalAnchorCourseItem(anchor);
  if (!built.ok) return { ok: false, code: "TIME_REQUIRED", message: built.message };

  const existing = findFestivalAnchorItems(days);
  if (existing.some(({ item }) => item.anchorId === anchor.id)) {
    return { ok: false, code: "ANCHOR_EXISTS", message: "이 Anchor는 이미 코스에 반영되어 있습니다." };
  }
  if (existing.length > 0) {
    return {
      ok: false,
      code: "OTHER_ANCHOR_EXISTS",
      message: "기존 축제 Anchor가 코스에 남아 있습니다. 기존 Anchor를 코스에서만 제거한 뒤 다시 반영해주세요.",
    };
  }

  const targetDay = days.find((day) => day.dayIndex === anchor.plannedDayIndex);
  if (!targetDay) {
    return { ok: false, code: "INVALID_DAY", message: "Anchor의 연계 일차가 현재 코스 기간에 없습니다. Anchor를 다시 확정해주세요." };
  }

  return {
    ok: true,
    days: days.map((day) => (day.dayIndex === targetDay.dayIndex ? insertItemInDay(day, built.item, transport) : day)),
  };
}

/** 같은 Anchor의 날짜·시각을 바꾼 뒤 사용자가 다시 반영할 때만 기존 Anchor snapshot을 교체한다. */
export function replaceFestivalAnchorInCourse(
  days: CourseDay[],
  anchor: FestivalAnchorCourseSource,
  transport: TransportCode,
): FestivalAnchorCourseMutationResult {
  const existing = findFestivalAnchorItems(days);
  if (existing.length === 0) return { ok: false, code: "ANCHOR_NOT_FOUND", message: "코스에 기존 Anchor가 없습니다." };
  if (existing.some(({ item }) => item.anchorId !== anchor.id)) {
    return { ok: false, code: "OTHER_ANCHOR_EXISTS", message: "다른 축제 Anchor가 코스에 남아 있어 먼저 제거해야 합니다." };
  }

  const withoutAnchor = days.map((day) => {
    const items = day.items.filter((item) => !isFestivalAnchorItem(item));
    return items.length === day.items.length ? day : { ...day, items: recomputeItems(items, transport) };
  });
  return insertFestivalAnchorIntoCourse(withoutAnchor, anchor, transport);
}

/** 코스에서만 Anchor를 제거한다. ProjectAnchor 확정 자체는 변경하지 않는다. */
export function removeFestivalAnchorFromCourse(
  days: CourseDay[],
  anchorId: string,
  transport: TransportCode,
): CourseDay[] {
  return days.map((day) => {
    const items = day.items.filter((item) => !(isFestivalAnchorItem(item) && item.anchorId === anchorId));
    return items.length === day.items.length ? day : { ...day, items: recomputeItems(items, transport) };
  });
}

export type FestivalAnchorRelatedPosition = "BEFORE_ANCHOR" | "AFTER_ANCHOR";

/** Anchor를 기준으로 앞·뒤에 POI를 삽입한다. Anchor의 명시 시각은 recomputeDayItems가 그대로
 * 보존하므로 사용자가 확정한 행사 시각을 자동으로 밀거나 다시 계획하지 않는다. */
export function insertPoiAroundFestivalAnchor(
  days: CourseDay[],
  anchorId: string,
  poi: Pick<
    CourseItem,
    "poiId" | "poiName" | "category" | "lat" | "lng" | "operatingHours" | "closedDays" | "mealEligible" | "foodSubcategory" | "lclsSystm1" | "lclsSystm2"
  >,
  position: FestivalAnchorRelatedPosition,
  transport: TransportCode,
): CourseDay[] {
  return days.map((day) => {
    const anchorIndex = day.items.findIndex((item) => item.kind === "FESTIVAL_ANCHOR" && item.anchorId === anchorId);
    if (anchorIndex === -1) return day;
    const input: CourseItemInput = {
      poiId: poi.poiId,
      poiName: poi.poiName,
      category: poi.category,
      stayMinutes: 60,
      operatingHours: poi.operatingHours,
      closedDays: poi.closedDays,
      lat: poi.lat,
      lng: poi.lng,
      mealEligible: poi.mealEligible,
      foodSubcategory: poi.foodSubcategory,
      lclsSystm1: poi.lclsSystm1,
      lclsSystm2: poi.lclsSystm2,
    };
    if (position === "BEFORE_ANCHOR") {
      const anchorItem = day.items[anchorIndex];
      const anchorStart = parseTimeSlotToMinutes(anchorItem.timeSlot);
      if (anchorStart !== null) {
        const travelMinutes = estimateTravel(input, anchorItem, transport).minutes ?? 0;
        const desiredStart = Math.max(0, anchorStart - 60 - travelMinutes);
        input.timeSlot = minutesToTimeSlot(Math.floor(desiredStart / 30) * 30);
      }
    }
    const items = day.items.map(courseItemToInput);
    items.splice(position === "BEFORE_ANCHOR" ? anchorIndex : anchorIndex + 1, 0, input);
    return { ...day, items: recomputeDayItems(items, transport) };
  });
}

/** 저장 시 현재 ProjectAnchor snapshot과 코스 항목이 같은지 확인한다. */
export function validateFestivalAnchorCourseDays(
  days: CourseDay[],
  anchor: FestivalAnchorCourseSource,
): FestivalAnchorCourseValidationResult {
  const items = findFestivalAnchorItems(days);
  if (items.length === 0) return { ok: true };
  if (items.length > 1) return { ok: false, message: "같은 코스에는 축제 Anchor를 하나만 반영할 수 있습니다." };

  const built = buildFestivalAnchorCourseItem(anchor);
  if (!built.ok) return { ok: false, message: built.message };
  const current = items[0];
  const expected = built.item;
  const matches =
    current.item.anchorId === expected.anchorId &&
    current.item.anchorUpdatedAt === expected.anchorUpdatedAt &&
    current.item.anchorSource === expected.anchorSource &&
    current.item.anchorSourceId === expected.anchorSourceId &&
    current.item.anchorContentTypeId === expected.anchorContentTypeId &&
    current.item.anchorAddress === expected.anchorAddress &&
    current.item.poiName === expected.poiName &&
    current.item.anchorEventStartDate === expected.anchorEventStartDate &&
    current.item.anchorEventEndDate === expected.anchorEventEndDate &&
    current.item.anchorPlannedDate === expected.anchorPlannedDate &&
    current.item.anchorPlannedDayIndex === expected.anchorPlannedDayIndex &&
    current.item.anchorTimeStatus === expected.anchorTimeStatus &&
    current.item.anchorTimeSlot === expected.anchorTimeSlot &&
    current.item.anchorTimeStart === expected.anchorTimeStart &&
    current.item.anchorTimeEnd === expected.anchorTimeEnd &&
    current.item.poiId === expected.poiId &&
    current.dayIndex === anchor.plannedDayIndex &&
    current.item.timeSlot === expected.timeSlot &&
    current.item.stayMinutes === expected.stayMinutes;
  return matches
    ? { ok: true }
    : { ok: false, message: "ProjectAnchor 설정이 변경되었습니다. 코스에서 Anchor를 다시 반영한 뒤 저장해주세요." };
}

export function formatFestivalAnchorCourseTime(item: Pick<CourseItem, "anchorTimeStart" | "anchorTimeEnd">): string {
  if (item.anchorTimeStart && item.anchorTimeEnd) return `${item.anchorTimeStart}~${item.anchorTimeEnd}`;
  return "시간 미확정";
}
