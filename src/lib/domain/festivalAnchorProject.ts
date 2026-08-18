import type { FestivalAnchorCandidate } from "./festivalAnchor";
import { getTravelMonthRange } from "./festivalAnchor";

export const FESTIVAL_ANCHOR_SOURCE = "TOUR_API_FESTIVAL" as const;

export const FESTIVAL_ANCHOR_TIME_STATUS_CODES = ["UNCONFIRMED", "USER_CONFIRMED"] as const;
export type FestivalAnchorTimeStatus = (typeof FESTIVAL_ANCHOR_TIME_STATUS_CODES)[number];

export const FESTIVAL_ANCHOR_TIME_SLOT_CODES = ["MORNING", "AFTERNOON", "EVENING", "CUSTOM"] as const;
export type FestivalAnchorTimeSlot = (typeof FESTIVAL_ANCHOR_TIME_SLOT_CODES)[number];

export interface FestivalAnchorActionState {
  success: boolean;
  message?: string;
}

export interface FestivalAnchorProvenance {
  provider: "한국관광공사";
  dataset: "행사정보 조회(searchFestival2)";
  regionCode: string;
  travelYear: number;
  travelMonth: number;
  eventStartDate: string | null;
  eventEndDate: string | null;
  fetchedAt: string;
  apiItemCount: number;
  matchedItemCount: number;
  officialRegionCode?: string | null;
  officialSigunguCode?: string | null;
}

export interface FestivalAnchorConfirmationInput {
  candidateId: string;
  plannedDate: string;
  plannedDayIndex: string | number;
  timeStatus: string;
  timeSlot?: string | null;
  timeStart?: string | null;
  timeEnd?: string | null;
}

export interface FestivalAnchorConfirmation {
  source: typeof FESTIVAL_ANCHOR_SOURCE;
  sourceId: string;
  contentTypeId: string;
  name: string;
  eventStartDate: string;
  eventEndDate: string;
  plannedDate: string;
  plannedDayIndex: number;
  timeStatus: FestivalAnchorTimeStatus;
  timeSlot: FestivalAnchorTimeSlot | null;
  timeStart: string | null;
  timeEnd: string | null;
  regionCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  sourceSnapshot: {
    source: typeof FESTIVAL_ANCHOR_SOURCE;
    sourceId: string;
    contentTypeId: string;
    name: string;
    eventStartDate: string;
    eventEndDate: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  provenance: FestivalAnchorProvenance;
}

export interface FestivalAnchorValidationError {
  ok: false;
  message: string;
}

export interface FestivalAnchorValidationSuccess {
  ok: true;
  value: FestivalAnchorConfirmation;
}

export type FestivalAnchorValidationResult = FestivalAnchorValidationError | FestivalAnchorValidationSuccess;

const DAY_COUNT_BY_DURATION: Record<string, number> = {
  DAY_TRIP: 1,
  ONE_NIGHT_TWO_DAYS: 2,
  TWO_NIGHTS_THREE_DAYS: 3,
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTime(value: string | null | undefined): value is string {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function getFestivalAnchorDayCount(duration: string): number | null {
  return DAY_COUNT_BY_DURATION[duration] ?? null;
}

/** 행사 기간과 여행월의 교집합 날짜만 반환한다. 시작일을 추정하지 않으므로 빈 선택지를 만들 수 있다. */
export function getFestivalAnchorPlannedDates(params: {
  eventStartDate: string;
  eventEndDate: string;
  travelYear: number;
  travelMonth: number;
}): string[] {
  const month = getTravelMonthRange(params.travelYear, params.travelMonth);
  if (!month || !isIsoDate(params.eventStartDate) || !isIsoDate(params.eventEndDate)) return [];

  const start = new Date(`${params.eventStartDate < month.start ? month.start : params.eventStartDate}T00:00:00.000Z`);
  const endValue = params.eventEndDate > month.end ? month.end : params.eventEndDate;
  const end = new Date(`${endValue}T00:00:00.000Z`);
  if (start > end) return [];

  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function validateTimeSelection(input: FestivalAnchorConfirmationInput):
  | { ok: true; timeStatus: FestivalAnchorTimeStatus; timeSlot: FestivalAnchorTimeSlot | null; timeStart: string | null; timeEnd: string | null }
  | FestivalAnchorValidationError {
  if (!FESTIVAL_ANCHOR_TIME_STATUS_CODES.includes(input.timeStatus as FestivalAnchorTimeStatus)) {
    return { ok: false, message: "행사 시간 조건을 명시적으로 선택해주세요." };
  }

  if (input.timeStatus === "UNCONFIRMED") {
    return { ok: true, timeStatus: "UNCONFIRMED", timeSlot: null, timeStart: null, timeEnd: null };
  }

  if (!FESTIVAL_ANCHOR_TIME_SLOT_CODES.includes(input.timeSlot as FestivalAnchorTimeSlot)) {
    return { ok: false, message: "확정할 시간대 조건을 선택해주세요." };
  }
  const timeSlot = input.timeSlot as FestivalAnchorTimeSlot;
  if (timeSlot !== "CUSTOM") {
    return { ok: true, timeStatus: "USER_CONFIRMED", timeSlot, timeStart: null, timeEnd: null };
  }
  if (!isTime(input.timeStart) || !isTime(input.timeEnd) || input.timeStart >= input.timeEnd) {
    return { ok: false, message: "직접 입력 시간은 HH:mm 형식으로 시작·종료 시각을 올바르게 입력해주세요." };
  }
  return { ok: true, timeStatus: "USER_CONFIRMED", timeSlot, timeStart: input.timeStart, timeEnd: input.timeEnd };
}

/** 서버가 다시 조회한 공식 후보와 사용자가 명시한 날짜·일차·시간 조건을 하나의 확정 스냅샷으로 만든다. */
export function buildFestivalAnchorConfirmation(params: {
  candidate: FestivalAnchorCandidate;
  input: FestivalAnchorConfirmationInput;
  regionCode: string;
  travelYear: number;
  travelMonth: number;
  duration: string;
  provenance: FestivalAnchorProvenance;
}): FestivalAnchorValidationResult {
  const plannedDates = getFestivalAnchorPlannedDates({
    eventStartDate: params.candidate.startDate,
    eventEndDate: params.candidate.endDate,
    travelYear: params.travelYear,
    travelMonth: params.travelMonth,
  });
  if (!plannedDates.includes(params.input.plannedDate)) {
    return { ok: false, message: "연계 날짜는 행사 기간과 여행월이 겹치는 날짜 중에서 선택해주세요." };
  }

  const dayCount = getFestivalAnchorDayCount(params.duration);
  const plannedDayIndex = Number(params.input.plannedDayIndex);
  if (!dayCount || !Number.isInteger(plannedDayIndex) || plannedDayIndex < 1 || plannedDayIndex > dayCount) {
    return { ok: false, message: "여행 기간에 맞는 연계 일차를 명시해주세요." };
  }

  const time = validateTimeSelection(params.input);
  if (!time.ok) return time;

  return {
    ok: true,
    value: {
      source: FESTIVAL_ANCHOR_SOURCE,
      sourceId: params.candidate.externalId,
      contentTypeId: params.candidate.contentTypeId,
      name: params.candidate.name,
      eventStartDate: params.candidate.startDate,
      eventEndDate: params.candidate.endDate,
      plannedDate: params.input.plannedDate,
      plannedDayIndex,
      timeStatus: time.timeStatus,
      timeSlot: time.timeSlot,
      timeStart: time.timeStart,
      timeEnd: time.timeEnd,
      regionCode: params.regionCode,
      address: params.candidate.address,
      lat: params.candidate.lat,
      lng: params.candidate.lng,
      sourceSnapshot: {
        source: FESTIVAL_ANCHOR_SOURCE,
        sourceId: params.candidate.externalId,
        contentTypeId: params.candidate.contentTypeId,
        name: params.candidate.name,
        eventStartDate: params.candidate.startDate,
        eventEndDate: params.candidate.endDate,
        address: params.candidate.address,
        lat: params.candidate.lat,
        lng: params.candidate.lng,
      },
      provenance: params.provenance,
    },
  };
}
