import type { DurationCode } from "./strategy";
import { getTemplateById } from "./strategyTemplates";
import {
  orderByNearestNeighbor,
  haversineDistanceKm,
  estimateTravelMinutesForDistance,
  AVERAGE_SPEED_KMH,
  classifyTravelMinutes,
  EXCESSIVE_TRAVEL_MINUTES,
  hasReasonableKoreanCoordinate,
} from "./geo";
import type { FoodSubcategory } from "./foodClassification";
import {
  classifyThemes,
  computeNationalityChecklistNotes,
  computeNationalityKpiNotes,
  computeRoleChecklistNotes,
  computeRoleKpiNotes,
  computeRoleRiskNotes,
  computeSeasonalRiskNotes,
  computeThemeChecklistNotes,
  normalizeMonth,
  normalizeNationality,
  normalizePreferredThemeList,
  normalizeRole,
  type NationalityCode,
  type UserRoleCode,
} from "./audienceContext";
import { DEFAULT_ITEM_STAY_MINUTES, recommendedPoiStayMinutes } from "./poiStayMinutes";

export { DEFAULT_ITEM_STAY_MINUTES, recommendedPoiStayMinutes } from "./poiStayMinutes";

export type TransportCode = "WALK" | "PUBLIC_TRANSPORT" | "PRIVATE_VEHICLE" | "MIXED";

/** 실행안 일정 항목의 의미. 기존 저장 데이터는 kind가 없어 일반 POI로 취급한다. */
export type CourseItemKind = "POI" | "FESTIVAL_ANCHOR";

export interface PoiDetail {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  operatingHours: string | null;
  closedDays: string | null;
  /** FOOD 카테고리일 때만 의미가 있다 — 실제 식사가 가능한 장소(일반 음식점)인지, 카페·전통찻집처럼
   * 식사 슬롯에 쓰기 어려운 곳인지(3단계 보완, TourAPI cat3 기준). 값을 아예 지정하지 않은 호출부
   * (기존 테스트 등)는 명시적으로 false가 아니므로 식사 가능으로 취급한다(하위 호환). */
  mealEligible?: boolean;
  /** FOOD일 때만 의미가 있다(3단계 mealEligible의 세부판. foodClassification.ts 기준). 값이 없으면
   * 판정 안 함(레거시/비FOOD 호출부 하위 호환). */
  foodSubcategory?: FoodSubcategory;
  /** TourAPI 신 분류체계 대/중분류(2026-08-14, POI 추천 품질 2차 고도화 — poiFit.ts의
   * classifyStructuralPoiThemes 참고). 값이 없으면(FIXTURE, 구형 데이터) poiFit.ts가 안전하게 이름
   * 키워드 판정으로 fallback한다. */
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
  curationStatus?: "UNREVIEWED" | "APPROVED" | "REJECTED" | null;
  representation?: "UNKNOWN" | "DESTINATION" | "SUPPORT" | "CONSUMPTION" | "LODGING" | null;
  /** POI 적합도 평가(poiFit.ts, P0-1)의 데이터 출처 판정에 쓴다 — Prisma PoiSourceType("API"|"FIXTURE")
   * 문자열 그대로. 값을 지정하지 않은 기존 호출부(테스트 등)는 undefined이며, 적합도 계산 쪽에서
   * 안전하게 CURATED로 취급한다(하위 호환). */
  sourceType?: string;
}

/** FOOD 항목이 실제로 왜 이 시각에 배치됐는지(5단계, 2026-07-26 강릉 사례 보완) — 장소명이나 시작
 * 시각만 보고 화면에서 추정하지 않고, 실제 배치를 결정한 scheduleDayWithMeals가 그 시점에 이미 아는
 * 정보를 그대로 실어 나른다. LUNCH/DINNER는 splitMealCandidates가 고른 실제 식사, GENERAL은 그 외
 * 일반 방문(카페/전통찻집 등 mealEligible=false FOOD 포함)이다. FOOD가 아닌 항목이나 이 필드가 추가되기
 * 전(2026-07-26 이전) 저장된 실행안에는 없을 수 있다(legacy 호환, undefined면 카테고리만 표시). */
export type MealPurpose = "LUNCH" | "DINNER" | "GENERAL";

export interface CourseItem {
  /** 없으면 기존 POI 항목으로 본다. 축제 Anchor는 일반 POI와 구분해 고정 정책을 적용한다. */
  kind?: CourseItemKind;
  order: number;
  poiId: string;
  poiName: string;
  category: string;
  timeSlot: string;
  stayMinutes: number;
  travel: string;
  /** TourAPI/DB의 운영시간·휴무일. 레거시 실행안에는 없을 수 있다. */
  operatingHours?: string | null;
  closedDays?: string | null;
  /** 이동 텍스트 재계산용 좌표. 이 필드가 추가되기 전(2026-07-21 이전) 저장된 실행안에는 없을 수 있다. */
  lat?: number;
  lng?: number;
  mealPurpose?: MealPurpose;
  /** 실시간 품질검증이 FOOD의 실제 식사 가능 여부와 TourAPI 구조 분류를 재사용할 수 있도록 보존한다. */
  mealEligible?: boolean;
  foodSubcategory?: FoodSubcategory;
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
  curationStatus?: "UNREVIEWED" | "APPROVED" | "REJECTED" | null;
  representation?: "UNKNOWN" | "DESTINATION" | "SUPPORT" | "CONSUMPTION" | "LODGING" | null;
  /** 실제 경로 API 연동(Phase 12, 2026-08-05) 이후에만 채워지는 구조화된 이동 결과 — travel(문자열
   * 라벨)은 그대로 화면에 쓰지만, 이 필드들로 그 라벨이 실제 도로/캐시/추정 중 무엇인지 구분해 보여줄
   * 수 있다. courseRouteEnrichment.ts(서비스 계층)만 채우고, planBuilder.ts의 haversine 계산
   * (estimateTravel/recomputeDayItems)은 이 필드를 전혀 건드리지 않는다 — 이 필드가 없으면(2026-08-05
   * 이전 저장분, 또는 PRIVATE_VEHICLE이 아닌 이동수단) 항상 haversine 추정치라는 뜻이다(레거시 호환). */
  travelDistanceKm?: number;
  travelMinutes?: number;
  travelSource?: "LIVE_API" | "CACHED_API" | "ESTIMATED";
  travelProvider?: "KAKAO_MOBILITY" | "HAVERSINE";
  travelCalculatedAt?: string;
  /** 축제 Anchor snapshot. ProjectAnchor와 코스 반영 상태의 정합성 확인에 사용한다. */
  anchorId?: string;
  anchorUpdatedAt?: string;
  anchorSource?: string;
  anchorSourceId?: string;
  anchorContentTypeId?: string;
  anchorAddress?: string | null;
  anchorEventStartDate?: string;
  anchorEventEndDate?: string;
  anchorPlannedDate?: string;
  anchorPlannedDayIndex?: number;
  anchorTimeStatus?: "UNCONFIRMED" | "USER_CONFIRMED";
  anchorTimeSlot?: "MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM" | null;
  anchorTimeStart?: string | null;
  anchorTimeEnd?: string | null;
}

export interface CourseDay {
  dayIndex: number;
  items: CourseItem[];
  /** 해당 날짜의 숙박 1건(있으면). 일반 items와 분리되어 날짜별 목표 개수에 포함되지 않는다.
   * 이 필드가 추가되기 전(2026-07-23 이전) 저장된 실행안에는 없을 수 있으므로 optional/nullable로 둔다. */
  lodging?: CourseItem | null;
  /** 후보 부족 안내(8단계) — 비정상적인 장거리 구간이라 다른 날짜 후보와 교환도 안 돼 코스에서
   * 제외된 POI가 있으면 그 사유를 담는다. 억지로 채우지 않은 결과를 사용자에게 투명하게 보여주기
   * 위함이다. 없으면 undefined(레거시 실행안 하위 호환). */
  notices?: string[];
}

/**
 * recomputeDayItems에 넣을 입력 하나(장소 하나) — 새로 추가하는 POI도 이 모양으로 맞추면 된다.
 * timeSlot을 넣으면 그 값을 그대로 유지하고(사용자가 이미 편집한 시간), 비워두면 자리(index) 기준
 * 기본값을 새로 계산한다(처음 추가되는 장소용).
 */
export interface CourseItemInput {
  kind?: CourseItemKind;
  poiId: string;
  poiName: string;
  category: string;
  stayMinutes: number;
  operatingHours?: string | null;
  closedDays?: string | null;
  lat?: number;
  lng?: number;
  timeSlot?: string;
  mealPurpose?: MealPurpose;
  mealEligible?: boolean;
  foodSubcategory?: FoodSubcategory;
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
  anchorId?: string;
  anchorUpdatedAt?: string;
  anchorSource?: string;
  anchorSourceId?: string;
  anchorContentTypeId?: string;
  anchorAddress?: string | null;
  anchorEventStartDate?: string;
  anchorEventEndDate?: string;
  anchorPlannedDate?: string;
  anchorPlannedDayIndex?: number;
  anchorTimeStatus?: "UNCONFIRMED" | "USER_CONFIRMED";
  anchorTimeSlot?: "MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM" | null;
  anchorTimeStart?: string | null;
  anchorTimeEnd?: string | null;
}

export const DAY_COUNT_BY_DURATION: Record<DurationCode, number> = {
  DAY_TRIP: 1,
  ONE_NIGHT_TWO_DAYS: 2,
  TWO_NIGHTS_THREE_DAYS: 3,
};

/** 숙박을 제외한 하루 목표 일정 개수(1단계에서 선택된 비숙박 POI를 이 분배대로 배치, 개선 2단계). */
export const DAILY_ITEM_TARGETS_BY_DURATION: Record<DurationCode, number[]> = {
  DAY_TRIP: [4],
  ONE_NIGHT_TWO_DAYS: [4, 3],
  TWO_NIGHTS_THREE_DAYS: [3, 5, 3],
};

/** 날짜(역할)별 기본 시간대 — 첫날은 도착을 고려해 늦게 시작, 중간 날은 가장 촘촘하게, 마지막 날은
 * 귀가를 고려해 일찍 끝난다. 숙박은 이 슬롯을 소비하지 않는다(별도 체크인 시각으로 처리). */
export const DAY_TIME_SLOTS_BY_DURATION: Record<DurationCode, string[][]> = {
  DAY_TRIP: [["10:00", "12:30", "15:00", "17:30"]],
  ONE_NIGHT_TWO_DAYS: [
    ["11:00", "13:30", "16:00", "18:30"],
    ["09:30", "12:00", "15:00"],
  ],
  TWO_NIGHTS_THREE_DAYS: [
    ["12:00", "15:00", "18:00"],
    ["09:30", "12:00", "14:30", "17:00", "19:00"],
    ["09:30", "12:00", "14:30"],
  ],
};

/** recomputeDayItems를 날짜 슬롯 지정 없이 부르는 기존 호출(편집기의 추가/삭제/재정렬)과의 하위호환용
 * 기본 시간대 — 1단계 이전부터 쓰던 값을 그대로 유지한다. */
const DEFAULT_TIME_SLOTS = ["10:00", "13:00", "16:00", "18:30"];
const DEFAULT_SLOT_STEP_MINUTES = 150;
const LODGING_CATEGORY = "LODGING";
/** 숙박 체크인 기본 시각. 그 날 마지막 일반 일정 종료 시각이 이보다 늦으면 그 이후로 늦춘다. */
const DEFAULT_LODGING_CHECKIN = "20:00";

export const FOOD_CATEGORY = "FOOD";

/** 식사 선호 시간대 정책(3단계) — FOOD 일정의 "시작 시각" 기준으로 판단한다. 영업시간·휴무일은
 * 이번 단계에서 다루지 않는다. */
export const MEAL_WINDOWS = {
  lunch: { start: "11:30", end: "13:30" },
  dinner: { start: "17:30", end: "19:30" },
} as const;

type MealName = keyof typeof MEAL_WINDOWS;

const TRANSPORT_LABEL: Record<TransportCode, string> = {
  WALK: "도보",
  PUBLIC_TRANSPORT: "대중교통",
  PRIVATE_VEHICLE: "차량",
  MIXED: "도보/대중교통 혼합",
};

function hasCoords<T extends { lat?: number; lng?: number }>(p: T): p is T & { lat: number; lng: number } {
  return hasReasonableKoreanCoordinate(p);
}

/** 좌표가 없는 POI는 원본 일정에서 보존하되, 최근접 이웃 순서에는 참여시키지 않는다. */
function orderWithReliableCoordinates<T extends { lat?: number; lng?: number }>(points: T[]): T[] {
  const located = points.filter(hasCoords);
  const unlocated = points.filter((point) => !hasCoords(point));
  return [...orderByNearestNeighbor(located), ...unlocated];
}

/** "HH:MM" → 자정 기준 분. 형식이 이상하면 null(검증 불가로 처리하고 오류로 보지 않는다). */
export function parseTimeSlotToMinutes(timeSlot: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeSlot.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 자정 기준 분 → "HH:MM"(24시 이상/이하로 넘어가면 하루 안으로 wrap). */
export function minutesToTimeSlot(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 자동 생성 일정의 시작 시각을 다음 30분 단위로 올림한다(6단계, 2026-07-26 강릉 시각 정돈 보완).
 * 이미 00분/30분이면 그대로 유지한다(내림 없음 — 이동 완료 전으로 시각을 당기지 않는다). 절대 분
 * 기준으로 동작하므로 자정을 넘는 누적값에도 그대로 적용할 수 있다(minutesToTimeSlot과 동일한 절대
 * 분 체계). scheduleDayWithMeals의 모든 배치 결정 지점(점심·저녁 도착, 관광지 큐, 식사 시간대 판단용
 * 가상 도착 시각 계산)이 이 함수 하나만 공유해 중복 구현을 피한다. */
export function ceilToNext30Minutes(absoluteMinutes: number): number {
  return Math.ceil(absoluteMinutes / 30) * 30;
}

/** 자리(0-based index)에 대한 기본 시간대. 주어진 슬롯 배열 안이면 그 값을, 넘어가면 마지막 슬롯에서
 * 일정 간격으로 이어간다. */
function defaultTimeSlotFor(index: number, timeSlots: string[]): string {
  if (index < timeSlots.length) return timeSlots[index];
  const lastKnown = parseTimeSlotToMinutes(timeSlots[timeSlots.length - 1]) ?? 0;
  return minutesToTimeSlot(lastKnown + (index - timeSlots.length + 1) * DEFAULT_SLOT_STEP_MINUTES);
}

export interface TravelEstimate {
  /** 좌표 정보가 없어 계산할 수 없으면 null. */
  minutes: number | null;
  label: string;
}

/** 두 장소 사이의 예상 이동시간(직선거리·haversine 기반 추정치, 실제 도로/대중교통 경로와 다를 수 있음). */
export function estimateTravel(
  from: { lat?: number; lng?: number },
  to: { lat?: number; lng?: number },
  transport: TransportCode,
): TravelEstimate {
  if (!hasCoords(from) || !hasCoords(to)) {
    return { minutes: null, label: "이동 시간 확인 필요(좌표 정보 없음)" };
  }
  const distanceKm = haversineDistanceKm(from, to);
  const minutes = estimateTravelMinutesForDistance(distanceKm, AVERAGE_SPEED_KMH[transport]);
  if (distanceKm < 0.3) {
    return { minutes, label: `${TRANSPORT_LABEL[transport]} 이동 5분 이내(같은 구역)` };
  }
  return { minutes, label: `이동 약 ${minutes}분(약 ${distanceKm.toFixed(1)}km, ${TRANSPORT_LABEL[transport]} 기준)` };
}

/**
 * 하루 분량 장소 목록의 순서/이동 텍스트를 다시 계산한다. 장소를 추가·삭제·다른 날짜로 이동한 뒤에는
 * 항상 이 함수로 다시 계산해야 order/travel이 서로 어긋나지 않는다. timeSlot은 이미 값이 있으면(사용자가
 * 편집했거나 기존에 있던 항목) 그대로 유지하고, 없으면(새로 추가된 항목) 자리 기준 기본값을 넣는다.
 * 하루에 담을 수 있는 장소 수는 제한하지 않는다 — 실제로 시간이 부족한지는 timeSlot과 이동시간을
 * 비교해서 판단해야 한다(estimateTravel + 화면의 실행 가능성 표시).
 */
export function recomputeDayItems(
  items: CourseItemInput[],
  transport: TransportCode,
  timeSlots: string[] = DEFAULT_TIME_SLOTS,
): CourseItem[] {
  /** 자동 배정(명시적 timeSlot이 없는) 항목이 실제로 시작 가능한 절대 분(이전 항목 종료+이동시간).
   * 명시적 timeSlot이 있는 항목을 만나면 그 값으로 갱신해, 사용자가 편집한 시각 이후의 자동 항목도
   * 그 시각을 기준으로 이어진다. */
  let cumulativeMinutes: number | null = null;

  return items.map((item, idx) => {
    const prev = idx === 0 ? null : items[idx - 1];
    const travelEstimate = prev ? estimateTravel(prev, item, transport) : null;
    const defaultMinutes = parseTimeSlotToMinutes(defaultTimeSlotFor(idx, timeSlots)) ?? 0;

    let timeSlot: string;
    if (item.kind === "FESTIVAL_ANCHOR") {
      // Anchor는 사용자가 확정한 시각을 시간 경계로 사용한다. 값이 없으면 빈 값으로 보존해
      // 임의 시각을 만들지 않고, 상위 검증/UI가 재확정을 요구하게 한다.
      timeSlot = item.timeSlot ?? "";
      cumulativeMinutes = parseTimeSlotToMinutes(timeSlot);
    } else if (item.timeSlot) {
      // 사용자가 이미 편집했거나 기존에 있던 시각은 그대로 유지한다(형식을 다시 만들지 않음).
      timeSlot = item.timeSlot;
      cumulativeMinutes = parseTimeSlotToMinutes(item.timeSlot);
    } else if (cumulativeMinutes !== null && travelEstimate?.minutes != null) {
      // P0-3(2026-07-27): 새로 추가되는 항목은 자리 기준 기본 슬롯과 "실제 이동시간을 반영한 도착
      // 시각" 중 늦은 쪽으로 배정한다 — 그렇지 않으면 이동에 오래 걸리는 후보를 골랐을 때 화면에는
      // 기본 슬롯(예: 13:00)이 그대로 남아 여유시간이 0이거나 이동시간(예: 96분)과 슬롯 간격이
      // 맞지 않는 것처럼 보였다. 이동시간이 짧으면(기본값 이내) 지금처럼 기본 슬롯을 그대로 쓴다.
      const arrivalMinutes = cumulativeMinutes + travelEstimate.minutes;
      const startMinutes = ceilToNext30Minutes(Math.max(defaultMinutes, arrivalMinutes));
      timeSlot = minutesToTimeSlot(startMinutes);
      cumulativeMinutes = startMinutes;
    } else {
      timeSlot = minutesToTimeSlot(defaultMinutes);
      cumulativeMinutes = defaultMinutes;
    }

    if (item.kind === "FESTIVAL_ANCHOR" && cumulativeMinutes === null) {
      // 시간 미확정 Anchor는 기본 슬롯으로 보정하지 않는다.
      cumulativeMinutes = null;
    } else {
      cumulativeMinutes = (cumulativeMinutes ?? defaultMinutes) + item.stayMinutes;
    }

    return {
      ...(item.kind !== undefined ? { kind: item.kind } : {}),
      order: idx + 1,
      poiId: item.poiId,
      poiName: item.poiName,
      category: item.category,
      timeSlot,
      stayMinutes: item.stayMinutes,
      travel: prev ? (travelEstimate as TravelEstimate).label : "숙소/집결지에서 이동",
      operatingHours: item.operatingHours,
      closedDays: item.closedDays,
      lat: item.lat,
      lng: item.lng,
      mealPurpose: item.mealPurpose,
      ...(item.mealEligible !== undefined ? { mealEligible: item.mealEligible } : {}),
      ...(item.foodSubcategory !== undefined ? { foodSubcategory: item.foodSubcategory } : {}),
      ...(item.lclsSystm1 !== undefined ? { lclsSystm1: item.lclsSystm1 } : {}),
      ...(item.lclsSystm2 !== undefined ? { lclsSystm2: item.lclsSystm2 } : {}),
      ...(item.anchorId !== undefined ? { anchorId: item.anchorId } : {}),
      ...(item.anchorUpdatedAt !== undefined ? { anchorUpdatedAt: item.anchorUpdatedAt } : {}),
      ...(item.anchorSource !== undefined ? { anchorSource: item.anchorSource } : {}),
      ...(item.anchorSourceId !== undefined ? { anchorSourceId: item.anchorSourceId } : {}),
      ...(item.anchorContentTypeId !== undefined ? { anchorContentTypeId: item.anchorContentTypeId } : {}),
      ...(item.anchorAddress !== undefined ? { anchorAddress: item.anchorAddress } : {}),
      ...(item.anchorEventStartDate !== undefined ? { anchorEventStartDate: item.anchorEventStartDate } : {}),
      ...(item.anchorEventEndDate !== undefined ? { anchorEventEndDate: item.anchorEventEndDate } : {}),
      ...(item.anchorPlannedDate !== undefined ? { anchorPlannedDate: item.anchorPlannedDate } : {}),
      ...(item.anchorPlannedDayIndex !== undefined ? { anchorPlannedDayIndex: item.anchorPlannedDayIndex } : {}),
      ...(item.anchorTimeStatus !== undefined ? { anchorTimeStatus: item.anchorTimeStatus } : {}),
      ...(item.anchorTimeSlot !== undefined ? { anchorTimeSlot: item.anchorTimeSlot } : {}),
      ...(item.anchorTimeStart !== undefined ? { anchorTimeStart: item.anchorTimeStart } : {}),
      ...(item.anchorTimeEnd !== undefined ? { anchorTimeEnd: item.anchorTimeEnd } : {}),
    };
  });
}

/** 일반 POI 편집 경로가 축제 Anchor(필드가 일부 손상된 경우 포함)를 삭제·이동하지 않도록 의미를 판별하는 공용 helper. */
export function isFestivalAnchorItem(item: Pick<CourseItem, "kind" | "anchorId">): boolean {
  return item.kind === "FESTIVAL_ANCHOR";
}

/** CourseItem → recomputeDayItems 입력으로 되돌린다(장소 하나를 이미 배치된 상태에서 다시 재계산에
 * 넣을 때 공용으로 쓴다 — 편집기의 재정렬/날짜 이동/추천 후보 추가가 모두 이 매핑 하나만 공유한다). */
export function courseItemToInput(item: CourseItem): CourseItemInput {
  return {
    kind: item.kind,
    poiId: item.poiId,
    poiName: item.poiName,
    category: item.category,
    stayMinutes: item.stayMinutes,
    operatingHours: item.operatingHours,
    closedDays: item.closedDays,
    lat: item.lat,
    lng: item.lng,
    timeSlot: item.timeSlot,
    mealPurpose: item.mealPurpose,
    mealEligible: item.mealEligible,
    foodSubcategory: item.foodSubcategory,
    lclsSystm1: item.lclsSystm1,
    lclsSystm2: item.lclsSystm2,
    anchorId: item.anchorId,
    anchorUpdatedAt: item.anchorUpdatedAt,
    anchorSource: item.anchorSource,
    anchorSourceId: item.anchorSourceId,
    anchorContentTypeId: item.anchorContentTypeId,
    anchorAddress: item.anchorAddress,
    anchorEventStartDate: item.anchorEventStartDate,
    anchorEventEndDate: item.anchorEventEndDate,
    anchorPlannedDate: item.anchorPlannedDate,
    anchorPlannedDayIndex: item.anchorPlannedDayIndex,
    anchorTimeStatus: item.anchorTimeStatus,
    anchorTimeSlot: item.anchorTimeSlot,
    anchorTimeStart: item.anchorTimeStart,
    anchorTimeEnd: item.anchorTimeEnd,
  };
}

/**
 * 같은 날짜 안에서 한 항목을 임의의 자리로 옮긴다(Phase B 2단계, 2026-08-16) — 위/아래 버튼(인접
 * 자리만 교환)과 Drag & Drop(임의 자리로 이동)이 최종 결과가 같아야 하므로 이 함수 하나만 공유한다.
 * fromIndex가 범위를 벗어나거나 toIndex가 같은 자리로 clamp되면(버튼이 이미 비활성화하는 경계와 동일)
 * 변경 없이 그대로 반환한다.
 */
export function reorderCourseItemWithinDay(
  days: CourseDay[],
  dayIndex: number,
  fromIndex: number,
  toIndex: number,
  transport: TransportCode,
): CourseDay[] {
  return days.map((d) => {
    if (d.dayIndex !== dayIndex) return d;
    if (fromIndex < 0 || fromIndex >= d.items.length) return d;
    const clampedTo = Math.max(0, Math.min(toIndex, d.items.length - 1));
    if (clampedTo === fromIndex) return d;
    if (isFestivalAnchorItem(d.items[fromIndex])) return d;
    const items = [...d.items];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(clampedTo, 0, moved);
    return { ...d, items: recomputeDayItems(items.map(courseItemToInput), transport) };
  });
}

/**
 * 한 항목을 다른 날짜의 임의 자리로 옮긴다(Phase B 2단계, 2026-08-16) — 날짜 select(항상 끝자리에
 * 추가)와 Drag & Drop(원하는 자리에 삽입)이 최종 결과가 같은 재계산 경로를 타도록 이 함수 하나만
 * 공유한다. 같은 날짜로 "이동"하면 reorderCourseItemWithinDay로 위임한다.
 */
export function moveCourseItemToDay(
  days: CourseDay[],
  fromDayIndex: number,
  itemIndex: number,
  toDayIndex: number,
  toIndex: number,
  transport: TransportCode,
): CourseDay[] {
  if (fromDayIndex === toDayIndex) {
    return reorderCourseItemWithinDay(days, fromDayIndex, itemIndex, toIndex, transport);
  }
  const fromDay = days.find((d) => d.dayIndex === fromDayIndex);
  const toDay = days.find((d) => d.dayIndex === toDayIndex);
  const moved = fromDay?.items[itemIndex];
  // 대상 날짜가 존재하지 않으면(예: drop 대상 id 파싱 오류) 아무 것도 바꾸지 않는다 — 잘못하면 원본
  // 날짜에서만 항목이 사라지고 어디에도 들어가지 않는 데이터 유실이 생길 수 있다.
  if (!fromDay || !toDay || !moved) return days;
  if (isFestivalAnchorItem(moved)) return days;

  return days.map((d) => {
    if (d.dayIndex === fromDayIndex) {
      return {
        ...d,
        items: recomputeDayItems(d.items.filter((_, i) => i !== itemIndex).map(courseItemToInput), transport),
      };
    }
    if (d.dayIndex === toDayIndex) {
      const items = d.items.map(courseItemToInput);
      const insertAt = Math.max(0, Math.min(toIndex, items.length));
      items.splice(insertAt, 0, courseItemToInput(moved));
      return { ...d, items: recomputeDayItems(items, transport) };
    }
    return d;
  });
}

/**
 * 아직 코스에 없는 POI(검색 결과 또는 추천 후보)를 특정 날짜의 임의 자리에 삽입한다(Phase B 2단계,
 * 2026-08-16) — "+ 장소 추가"/"이 날짜에 추가" 버튼은 항상 끝자리(index=현재 길이)를 넘겨 기존 동작을
 * 그대로 유지하고, Drag & Drop만 드롭 위치에 맞는 자리를 넘긴다.
 */
export function insertPoiIntoDay(
  days: CourseDay[],
  dayIndex: number,
  poi: Pick<
    PoiDetail,
    "id" | "name" | "category" | "lat" | "lng" | "mealEligible" | "foodSubcategory" | "lclsSystm1" | "lclsSystm2"
  > &
    Partial<Pick<PoiDetail, "operatingHours" | "closedDays">>,
  index: number,
  transport: TransportCode,
): CourseDay[] {
  return days.map((d) => {
    if (d.dayIndex !== dayIndex) return d;
    const input: CourseItemInput = {
      poiId: poi.id,
      poiName: poi.name,
      category: poi.category,
      stayMinutes: recommendedPoiStayMinutes(poi),
      operatingHours: poi.operatingHours,
      closedDays: poi.closedDays,
      lat: poi.lat,
      lng: poi.lng,
      mealEligible: poi.mealEligible,
      foodSubcategory: poi.foodSubcategory,
      lclsSystm1: poi.lclsSystm1,
      lclsSystm2: poi.lclsSystm2,
    };
    const items = d.items.map(courseItemToInput);
    const insertAt = Math.max(0, Math.min(index, items.length));
    items.splice(insertAt, 0, input);
    return { ...d, items: recomputeDayItems(items, transport) };
  });
}

export type LodgingInsertionResult =
  | { ok: true; days: CourseDay[] }
  | { ok: false; message: string };

/** 숙박 후보는 일반 items가 아닌 날짜별 lodging 슬롯에만 추가한다. 기존 슬롯·Anchor는 건드리지 않고,
 * 체크인 시각을 현재 마지막 일정과 숙소까지의 직선거리 추정으로 계산한다. */
export function insertLodgingIntoDay(
  days: CourseDay[],
  dayIndex: number,
  poi: Pick<
    PoiDetail,
    "id" | "name" | "category" | "lat" | "lng" | "mealEligible" | "foodSubcategory" | "lclsSystm1" | "lclsSystm2"
  > &
    Partial<Pick<PoiDetail, "operatingHours" | "closedDays">>,
  transport: TransportCode,
): LodgingInsertionResult {
  const target = days.find((day) => day.dayIndex === dayIndex);
  if (!target) return { ok: false, message: "숙박을 추가할 날짜를 찾을 수 없습니다." };
  if (target.lodging) return { ok: false, message: "이 날짜에는 이미 숙박이 등록되어 있습니다." };

  const lastItem = target.items[target.items.length - 1] ?? null;
  const travelEstimate = lastItem ? estimateTravel(lastItem, poi, transport) : null;
  const timeSlot = determineLodgingTimeSlot(target.items, travelEstimate?.minutes ?? null);
  if (timeSlot === null) {
    return { ok: false, message: "현재 일정 뒤에는 체크인 시각을 표시할 수 없어 숙박을 추가하지 않았습니다. 일정을 먼저 조정해주세요." };
  }

  const lodging: CourseItem = {
    order: 1,
    poiId: poi.id,
    poiName: poi.name,
    category: poi.category,
    timeSlot,
    stayMinutes: 0,
    travel: travelEstimate ? travelEstimate.label : "당일 일반 일정 이후 숙소로 이동(그날 일반 일정 없음)",
    operatingHours: poi.operatingHours,
    closedDays: poi.closedDays,
    lat: poi.lat,
    lng: poi.lng,
    mealEligible: poi.mealEligible,
    foodSubcategory: poi.foodSubcategory,
    lclsSystm1: poi.lclsSystm1,
    lclsSystm2: poi.lclsSystm2,
  };
  return {
    ok: true,
    days: days.map((day) => (day.dayIndex === dayIndex ? { ...day, lodging } : day)),
  };
}

/** 3번째 인자(timeSlots)를 생략한 기존 호출(편집기의 추가/삭제/재정렬)은 계속 DEFAULT_TIME_SLOTS를
 * 써서 동작이 바뀌지 않는다. buildDraftCourse만 날짜별 슬롯을 명시적으로 넘긴다. */

/** 목표(targets)보다 총량(total)이 적을 때: 각 날짜에 최소 1개를 먼저 배정한 뒤, 아직 목표에 못 미친
 * 날짜부터 순서대로 남는 POI를 채운다(앞 날짜만 목표까지 채우고 뒷 날짜를 비우지 않기 위함).
 * 총량이 목표 이상일 때: 정확히 targets대로 채우고, 초과분은 중간 날짜부터 우선 배정한다(이번 정책상
 * selectPois가 이미 목표 이내로 제한하므로 흔치 않지만, buildDraftCourse가 더 많은 POI를 단독으로
 * 받는 경우에도 하나도 버리지 않기 위한 방어적 처리). */
function distributeDailyCounts(total: number, targets: number[]): number[] {
  const targetSum = targets.reduce((a, b) => a + b, 0);

  if (total >= targetSum) {
    const counts = [...targets];
    let remaining = total - targetSum;
    if (remaining > 0) {
      const order = middleFirstDayOrder(targets.length);
      let cursor = 0;
      while (remaining > 0) {
        counts[order[cursor % order.length]] += 1;
        remaining--;
        cursor++;
      }
    }
    return counts;
  }

  const counts = new Array(targets.length).fill(0);
  let remaining = total;
  for (let d = 0; d < targets.length && remaining > 0; d++) {
    counts[d] = 1;
    remaining--;
  }
  while (remaining > 0) {
    let progressed = false;
    for (let d = 0; d < targets.length && remaining > 0; d++) {
      if (counts[d] < targets[d]) {
        counts[d] += 1;
        remaining--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return counts;
}

/** 가운데 날짜부터 시작해 바깥쪽으로 확장하는 순서(같은 거리면 앞 날짜 우선). */
function middleFirstDayOrder(dayCount: number): number[] {
  const center = (dayCount - 1) / 2;
  return Array.from({ length: dayCount }, (_, i) => i).sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b,
  );
}

/** 숙박 체크인 시각: 그 날 일반 일정이 없으면 기본값을 그대로 쓴다. 있으면 "마지막 일정 시작 +
 * 체류시간 + 숙소까지 이동시간"(이동시간은 estimateTravel의 숫자 결과를 그대로 받아 재계산하지 않음)과
 * 기본값 중 늦은 쪽을 쓴다. travelMinutesToLodging이 null(좌표 없음 등 계산 불가)이면 이동시간 없이
 * 기존과 같은 방식(종료 시각만)으로 판단한다.
 * 그 값이 하루 표시 범위(0~1439분)를 넘으면 실제 도착 시각을 "HH:MM" 하나로 정확히 표현할 수 없다 —
 * 이때 23:59 같은 값을 실제 도착 시각인 것처럼 지어내면 오히려 거짓 정보가 되므로, null을 반환해
 * 호출부(buildDraftCourse)가 그 날짜의 숙박 카드를 생성하지 않도록 한다(안전한 생략 — 전체 시간
 * 모델을 재설계하지 않는 이번 범위에서 택할 수 있는 가장 정직한 처리). */
function determineLodgingTimeSlot(dayItems: CourseItem[], travelMinutesToLodging: number | null): string | null {
  if (dayItems.length === 0) return DEFAULT_LODGING_CHECKIN;
  const last = dayItems[dayItems.length - 1];
  const lastStart = parseTimeSlotToMinutes(last.timeSlot);
  if (lastStart === null) return DEFAULT_LODGING_CHECKIN;
  const lastEndMinutes = lastStart + last.stayMinutes;
  const arrivalMinutes = lastEndMinutes + (travelMinutesToLodging ?? 0);
  const defaultMinutes = parseTimeSlotToMinutes(DEFAULT_LODGING_CHECKIN) ?? 20 * 60;
  const desiredMinutes = Math.max(arrivalMinutes, defaultMinutes);
  if (desiredMinutes > END_OF_DISPLAY_DAY_MINUTES) return null;
  return minutesToTimeSlot(desiredMinutes);
}

function isFoodPoi(poi: { category: string }): boolean {
  return poi.category === FOOD_CATEGORY;
}

/** 점심·저녁 후보로 쓸 수 있는 FOOD인지 — FOOD 카테고리이면서 mealEligible이 명시적으로 false가
 * 아닌 경우(3단계 보완: 카페/전통찻집처럼 식사가 어려운 곳은 poiDetails.ts에서 mealEligible=false로
 * 내려온다). 이 값이 아예 없는 호출부(기존 테스트 등)는 하위 호환을 위해 식사 가능으로 취급한다. */
function isMealEligiblePoi(poi: PoiDetail): boolean {
  return isFoodPoi(poi) && poi.mealEligible !== false;
}

/** 화면에 보여줄 FOOD 항목의 목적 라벨. 장소명이나 시작 시각으로 추정하지 않고, 실제 배치 시점에
 * scheduleDayWithMeals가 결정한 mealPurpose(있으면)만 근거로 쓴다 — FOOD가 아니거나 mealPurpose가
 * 없는 legacy 항목은 카테고리만 그대로 반환한다(크래시 없이 안전한 기본값). */
export function describeCourseItemPurpose(item: { category: string; mealPurpose?: MealPurpose }): string {
  if (item.category !== FOOD_CATEGORY) return item.category;
  if (item.mealPurpose === "LUNCH") return `${item.category} · 점심`;
  if (item.mealPurpose === "DINNER") return `${item.category} · 저녁`;
  if (item.mealPurpose === "GENERAL") return `${item.category} · 카페/일반 방문`;
  return item.category;
}

/** 그 날 첫 배치(prevPoi=null)는 이동시간을 0으로 본다 — 기존 관례상 하루의 첫 일정이 "숙소/집결지에서
 * 이동"으로 고정 표기되는 것과 같은 취급이다. 좌표가 없어 계산 불가하면(estimateTravel이 null 반환)도 0. */
function travelMinutesFrom(prevPoi: PoiDetail | null, to: PoiDetail, transport: TransportCode): number {
  if (!prevPoi) return 0;
  return estimateTravel(prevPoi, to, transport).minutes ?? 0;
}

/** 하루를 "HH:MM"(0~1439분)으로 표시하는 기존 모델을 재설계하지 않는 이번 단계에서, 24시간을 넘는
 * 절대 분을 그대로 minutesToTimeSlot에 넘기면 자정을 지나 더 이른 시각처럼 보이는 값으로 wrap된다.
 * 여러 항목이 이 상황을 만나면 전부 자정 근처로 눌려 서로 겹치거나 체류시간 역행이 생길 수 있으므로,
 * 값을 뭉개는 대신 "그 날짜에는 더 이상 배치하지 않는다"로 처리한다(fitsWithinDisplayableDay). */
const END_OF_DISPLAY_DAY_MINUTES = 24 * 60 - 1;

/** 이 절대 시작 분(+체류시간)이 하루 표시 범위(0~1439분) 안에 들어오는지 판단한다. */
function fitsWithinDisplayableDay(startMinutesAbsolute: number, stayMinutes = DEFAULT_ITEM_STAY_MINUTES): boolean {
  return startMinutesAbsolute >= 0 && startMinutesAbsolute + stayMinutes <= END_OF_DISPLAY_DAY_MINUTES;
}

/** 그 식사 시간대가 이 날짜의 유효 일정 범위(날짜별 고정 슬롯의 마지막 값 = 그 날의 종료 기준) 안에
 * 있는지 판단한다. 새로운 하드코딩 없이 기존 DAY_TIME_SLOTS_BY_DURATION 정책을 재사용한다. */
function isMealWindowReachableForDay(meal: MealName, dayEndTimeSlot: string): boolean {
  const dayEndMinutes = parseTimeSlotToMinutes(dayEndTimeSlot) ?? 0;
  const mealStartMinutes = parseTimeSlotToMinutes(MEAL_WINDOWS[meal].start) ?? 0;
  return dayEndMinutes >= mealStartMinutes;
}

/** 하루 POI 중 "식사 가능한"(meal-eligible) FOOD만 골라 점심·저녁 후보로 나눈다(3단계 보완).
 * - meal-eligible 1개: 점심 후보로 둔다. "점심에 실제로 도달 가능한지"는 여기서 미리 정적으로 판단하지
 *   않고, 2개 이상일 때와 동일하게 scheduleDayWithMeals의 shouldPlaceMealNow/computeMealArrivalMinutes가
 *   그 시점의 실제 시각·이동시간을 반영해 동적으로 판단한다(로직 중복 없음). 현재 모든 DurationCode의
 *   날짜 시작 슬롯이 점심 시간대 전이라 "점심 이후 시작"은 실제로 발생하지 않는다 — 발생하지 않는
 *   분기를 별도로 만들지 않는다.
 * - meal-eligible 2개 이상: 첫 번째는 점심, 두 번째는 저녁 — 단, 그 날짜가 저녁 시간대까지 이어지지
 *   않으면 저녁 후보는 배치하지 않는다(짧은 일정에 억지로 17:30 저녁을 만들지 않기 위함).
 * - meal-eligible 3개 이상: 세 번째부터는 이번 단계에서 다루지 않는다 — 관광지 취급 큐에도 넣지 않고
 *   그대로 제외한다(관광지처럼 배치되는 것을 막기 위함).
 * - 카페/전통찻집 등 식사 불가로 확인된 FOOD(mealEligible===false, 3단계 보완)는 점심·저녁 후보에서는
 *   제외하지만 삭제하지 않는다 — rest(일반 방문 후보)에 그대로 남아 관광지와 동일한 기준으로 시간이
 *   배치된다. */
function splitMealCandidates(
  dayPois: PoiDetail[],
  dayEndTimeSlot: string,
): {
  lunch: PoiDetail | null;
  dinner: PoiDetail | null;
  rest: PoiDetail[];
} {
  const mealEligiblePois = dayPois.filter(isMealEligiblePoi);
  const rest = dayPois.filter((p) => !isMealEligiblePoi(p));

  const lunch = mealEligiblePois[0] ?? null;
  const dinner =
    mealEligiblePois.length >= 2 && isMealWindowReachableForDay("dinner", dayEndTimeSlot) ? mealEligiblePois[1] : null;
  return { lunch, dinner, rest };
}

/** 관광지를 하나 더 배치한 뒤 이 식사 장소로 이동한다면, 식사 시간대 종료 시각을 넘겨버리는지 판단한다
 * (원래 요구사항의 "관광지를 하나 더 배치하면 식사 시간대를 명백히 놓치는 상황"에 대응). 실제 배치되는
 * 시각은 30분 단위로 올림되므로(6단계), 이 가상 시나리오도 그 관광지·식사 각각의 실제 배치 시각을
 * 그대로 반영해 판단해야 한다 — 반올림 전 시각으로만 판단하면 실제로는 시간대를 놓치는데도 놓치지
 * 않는다고 잘못 판단할 수 있다. */
function wouldMissMealWindowIfSightPlacedFirst(
  clockMinutes: number,
  prevPoi: PoiDetail | null,
  nextSight: PoiDetail,
  mealPoi: PoiDetail,
  meal: MealName,
  transport: TransportCode,
): boolean {
  const windowEnd = parseTimeSlotToMinutes(MEAL_WINDOWS[meal].end) ?? 0;
  const sightStart = ceilToNext30Minutes(clockMinutes + travelMinutesFrom(prevPoi, nextSight, transport));
  const afterSightClock = sightStart + recommendedPoiStayMinutes(nextSight);
  const mealArrivalAfterSight = ceilToNext30Minutes(afterSightClock + travelMinutesFrom(nextSight, mealPoi, transport));
  return mealArrivalAfterSight > windowEnd;
}

/** 지금 이 식사를 배치해야 하는지 판단한다: 이미 그 식사 시간대에 도달했다면 더 미루지 않고 지금
 * 배치하고, 아직 시간대 전이라도 관광지를 하나 더 넣으면 시간대를 놓치는 상황이면 지금 배치한다.
 * 그 외에는(아직 여유가 있으면) 관광지를 먼저 넣을 수 있도록 false를 반환한다. */
function shouldPlaceMealNow(
  clockMinutes: number,
  prevPoi: PoiDetail | null,
  mealPoi: PoiDetail,
  meal: MealName,
  nextSight: PoiDetail | undefined,
  transport: TransportCode,
): boolean {
  const windowStart = parseTimeSlotToMinutes(MEAL_WINDOWS[meal].start) ?? 0;
  if (clockMinutes >= windowStart) return true;
  if (!nextSight) return true;
  return wouldMissMealWindowIfSightPlacedFirst(clockMinutes, prevPoi, nextSight, mealPoi, meal, transport);
}

/** 식사 하나를 배치할 절대 시각(분): 자연스러운 도착 시각(이전 일정 종료 + 이동시간)과 식사 시간대
 * 시작 중 늦은 쪽을 쓴다. 너무 일찍 도착하면 별도 "대기" 일정 없이 시간대 시작 시각으로 맞추고, 이미
 * 자연스러운 도착이 시간대보다 늦었다면 그 도착 시각을 그대로 쓴다(역행 방지, 강제 충족보다
 * 시간 유효성을 우선한다). 마지막으로 30분 단위로 올림한다(6단계) — MEAL_WINDOWS의 시작 시각은 이미
 * 30분 단위라 자연스러운 도착이 그보다 늦을 때만 실제로 값이 바뀐다. 이 반환값을 그대로 배치
 * 가능 여부 판단(fitsWithinDisplayableDay)과 실제 배치(place) 양쪽에 써서 판단·배치가 항상 일치하게
 * 한다. 문자열 변환·자정 방어는 호출부(place)에서 한 곳에만 둔다. */
function computeMealArrivalMinutes(
  clockMinutes: number,
  prevPoi: PoiDetail | null,
  mealPoi: PoiDetail,
  meal: MealName,
  transport: TransportCode,
): number {
  const windowStart = parseTimeSlotToMinutes(MEAL_WINDOWS[meal].start) ?? 0;
  const arrivalMinutes = clockMinutes + travelMinutesFrom(prevPoi, mealPoi, transport);
  return ceilToNext30Minutes(Math.max(arrivalMinutes, windowStart));
}

/**
 * FOOD가 포함된 날짜 전용 배치(3단계). 점심·저녁 후보를 시간대에 맞는 자연스러운 위치에 끼워 넣고,
 * 나머지 관광 일정은 이전 일정 종료 시각 + 실제 이동시간을 반영한 시각으로 채운다. 매 배치마다
 * 시계(clockMinutes)를 앞으로만 진행시키므로 역행·중복은 발생하지 않는다. FOOD가 없는 날짜는 이
 * 함수를 아예 타지 않고 기존 방식(날짜별 고정 슬롯)을 그대로 쓴다.
 */
/** 하루 스케줄 결과 항목 하나 — purpose는 scheduleDayWithMeals가 그 자리에서 실제로 결정한 배치 목적
 * 그대로다(5단계, UI 목적 라벨용으로 나중에 다시 추정하지 않는다). */
interface ScheduledItem {
  poi: PoiDetail;
  timeSlot: string;
  purpose: MealPurpose;
}

function scheduleDayWithMeals(
  dayPois: PoiDetail[],
  dayStartTimeSlot: string,
  dayEndTimeSlot: string,
  transport: TransportCode,
): ScheduledItem[] {
  const { lunch, dinner, rest } = splitMealCandidates(dayPois, dayEndTimeSlot);
  const remainingSights = [...rest];
  const scheduled: ScheduledItem[] = [];

  let clockMinutes = parseTimeSlotToMinutes(dayStartTimeSlot) ?? 0;
  let prevPoi: PoiDetail | null = null;
  let lunchPending = lunch;
  let dinnerPending = dinner;

  // startMinutesAbsolute는 항상 "누적 절대 분"이다 — 표시용 wrap(minutesToTimeSlot)은 여기서 한 번만
  // 적용하고, clockMinutes는 그 wrap 이전의 절대 분을 그대로 이어받는다(문자열을 다시 파싱해 되먹이면
  // 자정을 넘긴 경과 시간 정보가 사라져 다음 항목이 더 이른 시각으로 계산되는 역행 버그가 생긴다).
  // purpose는 이 시점에 실제로 결정된 배치 목적을 그대로 실어 나른다(5단계, UI 목적 라벨용) — 나중에
  // 시각/카테고리로 다시 추정하지 않는다.
  const place = (poi: PoiDetail, startMinutesAbsolute: number, purpose: MealPurpose) => {
    scheduled.push({ poi, timeSlot: minutesToTimeSlot(startMinutesAbsolute), purpose });
    clockMinutes = startMinutesAbsolute + recommendedPoiStayMinutes(poi);
    prevPoi = poi;
  };

  // 하루 표시 범위(0~1439분)를 넘는 후보는 23:59로 뭉개지 않는다 — 그렇게 하면 여러 후보가 같은
  // 자정 근처 시각으로 겹치거나 체류시간이 역행할 수 있다. 그렇다고 "첫 번째로 걸린 후보 하나 때문에
  // 나머지 후보 전체를 포기"하지도 않는다 — 후보마다 이동시간·체류시간이 달라 못 들어가는 후보 바로
  // 다음 후보는 들어갈 수도 있기 때문이다. 못 들어가는 후보만 그 자리에서 영구히 제외하고(다시
  // 큐잉하지 않음 — 시간은 앞으로만 가므로 나중에 다시 시도해도 어차피 못 들어간다), 나머지로 계속
  // 진행하다가 정말로 아무것도 더 넣을 수 없을 때만(모든 후보를 다 훑었는데 하나도 못 넣었을 때)
  // 이 날짜의 배치를 끝낸다.
  while (remainingSights.length > 0 || lunchPending || dinnerPending) {
    let placedSomething = false;

    if (lunchPending && shouldPlaceMealNow(clockMinutes, prevPoi, lunchPending, "lunch", remainingSights[0], transport)) {
      const arrival = computeMealArrivalMinutes(clockMinutes, prevPoi, lunchPending, "lunch", transport);
      if (fitsWithinDisplayableDay(arrival, recommendedPoiStayMinutes(lunchPending))) {
        place(lunchPending, arrival, "LUNCH");
        placedSomething = true;
      }
      lunchPending = null; // 배치했든 하루 범위를 넘어 제외했든, 이 후보는 다시 검토하지 않는다.
    }

    if (!placedSomething && dinnerPending && shouldPlaceMealNow(clockMinutes, prevPoi, dinnerPending, "dinner", remainingSights[0], transport)) {
      const arrival = computeMealArrivalMinutes(clockMinutes, prevPoi, dinnerPending, "dinner", transport);
      if (fitsWithinDisplayableDay(arrival, recommendedPoiStayMinutes(dinnerPending))) {
        place(dinnerPending, arrival, "DINNER");
        placedSomething = true;
      }
      dinnerPending = null;
    }

    if (!placedSomething) {
      // 연속 FOOD 방지(5단계, 2026-07-26 강릉 사례 보완 + 이번 단계 일반화): 원래는 "카페 등 비식사
      // FOOD가 실제 식사 바로 앞/뒤에 붙지 않게"만 막았는데, 세 번째 이상의 식사 가능 FOOD(예: 두 번째
      // 식당)가 splitMealCandidates에서 점심/저녁으로 뽑히지 못하고 그대로 rest 큐에 남으면 이 방지
      // 로직을 타지 않아 식당→식당, 카페→카페처럼 "같은 FOOD 카테고리가 연속 배치"되는 문제가 실제
      // 운영에서 확인됐다(2026-07-27 강릉/경주 사례). 그래서 판단 기준을 "지금 방금 식사를 마쳤는지"에서
      // "직전 장소가 FOOD 카테고리인지"로, 배치를 미루는 대상도 "비식사 FOOD만"에서 "FOOD 카테고리
      // 전체"로 넓힌다 — 식사가 남아있거나(mealPending) 직전 장소가 어떤 FOOD든(식당·카페 구분 없이)
      // 바로 다음에 FOOD를 또 붙이지 않도록, 대체 가능한(FOOD가 아닌) 후보가 큐에 남아있는 동안은 그
      // 후보를 먼저 시도한다. 대체 후보가 전혀 없으면(FOOD뿐이면) 평소처럼 그대로 배치한다 — 방문
      // 자체를 생략하지는 않는다(코스가 FOOD로만 채워지는 것보다는 낫지만, 후보가 그것뿐이면 억지로
      // 빼지 않는다는 기존 원칙 유지).
      const mealPending = Boolean(lunchPending) || Boolean(dinnerPending);
      const justHadFood = prevPoi !== null && isFoodPoi(prevPoi);
      const avoidFoodAdjacencyNow = mealPending || justHadFood;
      const hasNonFoodAlternative = avoidFoodAdjacencyNow && remainingSights.some((p) => !isFoodPoi(p));

      let deferredFood: PoiDetail | null = null;

      // 관광지 큐를 순서대로 훑어 "지금 배치해도 하루 범위를 넘지 않는" 첫 후보를 찾는다. 그 전에
      // 넘는 후보를 만나면 큐에서 제거(제외)하고 다음 후보를 계속 확인한다 — 앞 후보 하나 때문에
      // 뒤의 짧고 가까운 후보까지 통째로 포기하지 않는다.
      while (remainingSights.length > 0) {
        const candidate = remainingSights[0];
        // 30분 단위로 올림한 시각을 기준으로 배치 가능 여부를 판단한다(6단계) — 원시 도착 시각이
        // 하루 범위 안에 들어와도 올림 후에는 넘길 수 있으므로, 반드시 올림한 값으로 검증해야 한다.
        const start = ceilToNext30Minutes(clockMinutes + travelMinutesFrom(prevPoi, candidate, transport));
        if (!fitsWithinDisplayableDay(start, recommendedPoiStayMinutes(candidate))) {
          remainingSights.shift(); // 이 후보는 제외한다(재큐잉하지 않음) — 계속 다음 후보를 확인한다.
          continue;
        }
        if (hasNonFoodAlternative && !deferredFood && isFoodPoi(candidate)) {
          // 대체 가능한 비-FOOD 후보가 남아있으니, 이 FOOD는 잠시 미루고 그 후보를 먼저 찾는다.
          deferredFood = remainingSights.shift() ?? null;
          continue;
        }
        remainingSights.shift();
        place(candidate, start, "GENERAL");
        placedSomething = true;
        break;
      }

      if (deferredFood) {
        if (placedSomething) {
          remainingSights.unshift(deferredFood); // 다음 기회에 다시 시도한다(삭제하지 않음).
        } else {
          // 대체 후보가 없었다 — 미뤄뒀던 FOOD를 그대로 배치한다(생략하지 않음, 기존 정책 유지).
          const start = ceilToNext30Minutes(clockMinutes + travelMinutesFrom(prevPoi, deferredFood, transport));
          if (fitsWithinDisplayableDay(start, recommendedPoiStayMinutes(deferredFood))) {
            place(deferredFood, start, "GENERAL");
            placedSomething = true;
          }
        }
      }
    }

    // 참고: remainingSights가 비면 shouldPlaceMealNow(nextSight===undefined)가 항상 true를 반환하므로,
    // 아직 남은 lunchPending/dinnerPending은 다음 반복에서 위쪽 두 분기가 자연스럽게 처리한다 —
    // 별도의 "관광지 소진 후 식사만 남음" 방어 분기를 중복으로 둘 필요가 없다. 매 반복은 후보를 하나
    // 배치하거나(placedSomething) 최소 하나를 영구 제외/드롭하므로(remainingSights가 줄거나
    // lunchPending/dinnerPending이 null이 됨) 전체 루프는 유한 횟수 안에 종료한다(무한 루프 없음).
  }

  return scheduled;
}

/**
 * 전략이 선택한 POI 목록을 기간에 맞춰 일자·시간대에 배치한다. 새 장소를 만들지 않는다.
 * 숙박(LODGING)은 먼저 분리해 박수만큼만(마지막 날 제외) 날짜별 lodging으로 배치하고, 남은 비숙박
 * POI만 최근접 이웃 순서로 재배열해 하루 동선이 실제 거리 기준으로 이어지도록 한 뒤 날짜별 목표
 * 개수(DAILY_ITEM_TARGETS_BY_DURATION)에 맞춰 나눈다. 구간별 이동 텍스트도 직선거리(haversine)
 * 기반 추정치로 계산한다(실제 도로/대중교통 경로와는 다를 수 있음).
 */
/** 한 날짜의 dayPois를 스케줄링한다(hasFood이면 scheduleDayWithMeals, 아니면 기존 고정 슬롯 방식이므로
 * null). 날짜별 식사 보장 재시도(아래 repairMealCoverage)에서도 같은 함수를 그대로 재사용해, 시간·이동
 * 조건 판단 로직(scheduleDayWithMeals 내부)을 중복 구현하지 않는다. */
function scheduleDayPois(
  dayPois: PoiDetail[],
  slotsForDay: string[],
  transport: TransportCode,
): ScheduledItem[] | null {
  if (!dayPois.some(isFoodPoi)) return null;
  return scheduleDayWithMeals(
    dayPois,
    slotsForDay[0] ?? DEFAULT_TIME_SLOTS[0],
    slotsForDay[slotsForDay.length - 1] ?? DEFAULT_TIME_SLOTS[DEFAULT_TIME_SLOTS.length - 1],
    transport,
  );
}

/** 그 날짜의 최종 스케줄 결과에 점심/저녁 FOOD가 실제로(시간대 안에) 배치됐는지 확인한다. */
function mealSlotStatus(scheduled: ScheduledItem[] | null): { hasLunch: boolean; hasDinner: boolean } {
  if (!scheduled) return { hasLunch: false, hasDinner: false };
  const lunchStart = parseTimeSlotToMinutes(MEAL_WINDOWS.lunch.start) ?? 0;
  const lunchEnd = parseTimeSlotToMinutes(MEAL_WINDOWS.lunch.end) ?? 0;
  const dinnerStart = parseTimeSlotToMinutes(MEAL_WINDOWS.dinner.start) ?? 0;
  const dinnerEnd = parseTimeSlotToMinutes(MEAL_WINDOWS.dinner.end) ?? 0;
  let hasLunch = false;
  let hasDinner = false;
  for (const s of scheduled) {
    if (!isFoodPoi(s.poi)) continue;
    const m = parseTimeSlotToMinutes(s.timeSlot) ?? -1;
    if (m >= lunchStart && m <= lunchEnd) hasLunch = true;
    if (m >= dinnerStart && m <= dinnerEnd) hasDinner = true;
  }
  return { hasLunch, hasDinner };
}

/** dayPois[index]가 같은 날짜의 다른 항목들 중 EXCESSIVE(90분 이상)가 아닌("가까운") 항목이 몇
 * 개인지 센다 — 이상치 판정의 기준이다(가까운 동료가 적을수록 더 고립된 항목). */
function closeCompanionCount(dayPois: PoiDetail[], index: number, transport: TransportCode): number {
  let count = 0;
  for (let k = 0; k < dayPois.length; k++) {
    if (k === index) continue;
    const minutes = estimateTravel(dayPois[index], dayPois[k], transport).minutes;
    if (minutes !== null && classifyTravelMinutes(minutes) !== "EXCESSIVE") count++;
  }
  return count;
}

/** 그 날짜의 인접 구간(최근접 이웃 정렬 순서 기준) 중 EXCESSIVE(90분 이상)인 것을 찾아, 그 중 이동
 * 시간이 가장 큰 구간의 두 항목 중 "더 고립된 쪽"의 인덱스를 반환한다. 단순히 인접 쌍의 뒤쪽 항목을
 * 무조건 지목하면(이상치가 정렬 시작점이 돼 그 다음 정상 항목이 걸리는 경우) 엉뚱한 항목이 지목될 수
 * 있다 — 그래서 두 항목 각각이 "같은 날짜의 다른 항목과 얼마나 가까운 동료를 더 가지고 있는지"
 * (closeCompanionCount)를 비교해, 동료가 더 적은(=더 고립된) 쪽을 이상치로 본다. 두 항목의 동료 수가
 * 같으면(예: 서로 다른 두 하위 클러스터가 한 날짜에 섞여 그 경계에서 만난 경우) 기존 관례대로 뒤쪽
 * 항목을 지목한다 — 결정론적이고, 어느 한쪽을 골라도 그 경계의 EXCESSIVE 인접은 해소된다. */
function findWorstExcessiveAdjacency(dayPois: PoiDetail[], transport: TransportCode): { index: number; minutes: number } | null {
  let worst: { index: number; minutes: number } | null = null;
  for (let i = 1; i < dayPois.length; i++) {
    const travel = estimateTravel(dayPois[i - 1], dayPois[i], transport);
    if (classifyTravelMinutes(travel.minutes) !== "EXCESSIVE" || travel.minutes === null) continue;

    const prevCompanions = closeCompanionCount(dayPois, i - 1, transport);
    const curCompanions = closeCompanionCount(dayPois, i, transport);
    const targetIndex = prevCompanions < curCompanions ? i - 1 : i;

    if (!worst || travel.minutes > worst.minutes) worst = { index: targetIndex, minutes: travel.minutes };
  }
  return worst;
}

/** outlierPoi를 다른 날짜로 옮긴다면, 그 날짜의 어떤 기존 항목과도 EXCESSIVE 없이 이어질 수 있는지
 * 확인해 가장 잘 맞는(가장 가까운) 날짜를 찾는다(2단계: "다음 날 배정"). 굳이 그 날짜의 다른 항목과
 * 자리를 맞바꾸지 않는다 — outlierPoi는 원래 자기 날짜에서 자리가 남기 때문에 제외되는 것이 아니라
 * 위치가 안 맞아서 제외되는 것이므로, 대상 날짜에 그냥 추가하는 것으로 충분하다(더 단순하고, 대상
 * 날짜의 기존 항목을 불필요하게 다른 곳으로 밀어내지 않는다). 좌표가 없어 판단 불가능하면 스킵한다
 * (안전하게 제외, 억지로 옮기지 않음). 동률이면 스캔 순서(날짜 순)로 정한다 — 결정론적. */
function findBestDayForOutlier(
  dayPoisList: PoiDetail[][],
  excludeDay: number,
  outlierPoi: PoiDetail,
  transport: TransportCode,
): number | null {
  if (!hasCoords(outlierPoi)) return null;
  let best: { dayIndex: number; minutes: number } | null = null;
  for (let d = 0; d < dayPoisList.length; d++) {
    if (d === excludeDay || dayPoisList[d].length === 0) continue;
    let nearestInDay: number | null = null;
    for (const candidate of dayPoisList[d]) {
      const minutes = estimateTravel(outlierPoi, candidate, transport).minutes;
      if (minutes !== null && (nearestInDay === null || minutes < nearestInDay)) nearestInDay = minutes;
    }
    if (nearestInDay !== null && classifyTravelMinutes(nearestInDay) !== "EXCESSIVE") {
      if (!best || nearestInDay < best.minutes) best = { dayIndex: d, minutes: nearestInDay };
    }
  }
  return best?.dayIndex ?? null;
}

const TRAVEL_REPAIR_MAX_PASSES = 2;

/**
 * 스케줄링 이후(3단계, 점심·저녁 시간대 배치) 재도입된 장거리 구간 정리(2026-08-14, 경주 실 운영
 * 재현: 106분 구간이 그대로 남는 문제 수정). `repairExcessiveTravelSegments`(2단계)는 `scheduleDayPois`
 * (3단계, FOOD를 점심/저녁 시간대로 옮겨 배치)가 실행되기 **전**의 순서(최근접 이웃 순서)만 검사한다 —
 * scheduleDayPois가 FOOD를 시간대에 맞춰 재배치하면서 2단계가 확인하지 않은 새 인접 쌍이 생길 수 있고,
 * 그 결과 90분 이상인 구간이 최종 화면에 그대로 노출되는 경우가 실제로 확인됐다(경주 문화·역사 실행안,
 * 황남밀면→감포공설시장 106분 구간). scheduleDayPois는 FOOD 시간대 제약이 있어 임의로 순서를 다시
 * 섞을 수 없으므로, 여기서는 "그 날짜의 최종 순서에서 정말 EXCESSIVE 구간이 남았는지"만 다시 확인해
 * 있으면 findWorstExcessiveAdjacency와 동일한 기준으로 그 POI를 원본 dayPois에서 제외하고
 * scheduleDayPois를 다시 실행한다(다른 접근 없음 — 옮기지 않고 제외만 한다, "안전한 생략" 원칙 유지).
 * 최대 dayPois.length번만 반복해(무한 루프 방지) 남을 수 있는 이상치를 전부 제거한다.
 *
 * FOOD는 제외 대상에서 제외한다(2026-08-14) — scheduleDayWithMeals가 FOOD를 점심/저녁 "시간대"에
 * 맞추려고 지리적 순서와 다르게 배치할 수 있는데, 그 결과로 생긴 인접 구간의 이상치가 하필 FOOD 쪽으로
 * 지목되면 이 함수가 식사 자리를 지워버려 "날짜별 식사 보장"(4단계, repairMealCoverage)이 되돌릴 수
 * 없는 손실이 생긴다(단일 날짜 코스에서는 다른 날짜에서 가져올 식사도 없다 — 자정 wrap 방어 테스트로
 * 재현). FOOD가 지목되면 그 날짜는 더 손대지 않고 다음 날짜로 넘어간다 — 실제 관광지 쪽 이상치만
 * 안전하게 제거한다.
 */
function repairExcessiveTravelAfterScheduling(
  dayPoisList: PoiDetail[][],
  scheduledList: (ScheduledItem[] | null)[],
  daySlotsForDayList: string[][],
  transport: TransportCode,
  noticesByDay: string[][],
): void {
  for (let d = 0; d < dayPoisList.length; d++) {
    if (!scheduledList[d]) continue; // FOOD가 없는 날짜는 scheduleDayPois가 순서를 바꾸지 않는다.
    for (let guard = 0; guard < dayPoisList[d].length; guard++) {
      const finalOrder = (scheduledList[d] ?? []).map((s) => s.poi);
      const outlier = findWorstExcessiveAdjacency(finalOrder, transport);
      if (!outlier) break;

      const removedPoi = finalOrder[outlier.index];
      if (isFoodPoi(removedPoi) || removedPoi.category === LODGING_CATEGORY) break;
      dayPoisList[d] = dayPoisList[d].filter((p) => p.id !== removedPoi.id);
      noticesByDay[d].push(
        `${removedPoi.name}은(는) 시간대 배치 이후 인근 다른 장소와의 이동 거리가 지나치게 멀어(약 ${outlier.minutes}분, 기준 ${EXCESSIVE_TRAVEL_MINUTES}분) 코스에서 제외되었습니다.`,
      );
      scheduledList[d] = scheduleDayPois(dayPoisList[d], daySlotsForDayList[d], transport);
    }
  }
}

/**
 * 장거리 구간 처리(2단계, 2026-07-27 경주 87분·127분 이동 재현 보완). 지금까지는 이동시간이 아무리
 * 길어도 nearest-neighbor 순서를 그대로 받아들여 시각표만 뒤로 미뤘다(선택된 POI 자체는 그대로 유지) —
 * 그 결과 "동선상 실제로는 다른 지역에 있는 장소"가 하루 코스에 그대로 남아 실행 불가능한 이동을
 * 만들어냈다. 여기서는 그 날짜 안의 인접 구간(최근접 이웃 순서 기준)이 EXCESSIVE_TRAVEL_MINUTES(90분)
 * 이상이면(findWorstExcessiveAdjacency가 그 중 더 고립된 쪽을 지목):
 *   1) 다른 날짜 중 이 후보를 받아도 그 날짜의 기존 항목과 EXCESSIVE 없이 이어지는 날짜가 있으면
 *      그 날짜로 옮긴다(요구사항의 "가까운 대체 후보 탐색"과 "다음 날 배정"을 동시에 만족). 옮긴 뒤
 *      두 날짜 모두 다시 최근접 이웃 순서로 정렬해 동선을 자연스럽게 되돌린다.
 *   2) 옮길 수 있는 날짜가 전혀 없으면(고립된 장거리 후보) 그 POI를 코스에서 제외한다 — 부족해도
 *      억지로 다시 채우지 않는다(기존 "안전한 생략" 원칙과 동일).
 * 최대 TRAVEL_REPAIR_MAX_PASSES번만 반복해(무한 루프 방지, 각 패스 O(일수×POI수²) 이내로 유한하게
 * 종료) 남은 이상치는 마지막에 한 번에 제외 처리한다. 반환값은 날짜별 제외 사유 안내문(8단계 후보
 * 부족 안내에 그대로 쓴다).
 */
function repairExcessiveTravelSegments(dayPoisList: PoiDetail[][], transport: TransportCode): string[][] {
  const dayCount = dayPoisList.length;

  for (let pass = 0; pass < TRAVEL_REPAIR_MAX_PASSES; pass++) {
    let changedInPass = false;
    for (let d = 0; d < dayCount; d++) {
      const outlier = findWorstExcessiveAdjacency(dayPoisList[d], transport);
      if (!outlier) continue;

      const outlierPoi = dayPoisList[d][outlier.index];
      const destDay = findBestDayForOutlier(dayPoisList, d, outlierPoi, transport);
      if (destDay === null) continue;

      dayPoisList[d].splice(outlier.index, 1);
      dayPoisList[destDay].push(outlierPoi);
      dayPoisList[d] = orderWithReliableCoordinates(dayPoisList[d]);
      dayPoisList[destDay] = orderWithReliableCoordinates(dayPoisList[destDay]);
      changedInPass = true;
    }
    if (!changedInPass) break;
  }

  const noticesByDay: string[][] = dayPoisList.map(() => []);
  for (let d = 0; d < dayCount; d++) {
    let outlier = findWorstExcessiveAdjacency(dayPoisList[d], transport);
    while (outlier) {
      const removed = dayPoisList[d][outlier.index];
      dayPoisList[d].splice(outlier.index, 1);
      noticesByDay[d].push(
        `${removed.name}은(는) 인근 다른 장소와의 이동 거리가 지나치게 멀어(약 ${outlier.minutes}분, 기준 ${EXCESSIVE_TRAVEL_MINUTES}분) 대체 후보를 찾지 못해 코스에서 제외되었습니다.`,
      );
      outlier = findWorstExcessiveAdjacency(dayPoisList[d], transport);
    }
  }
  return noticesByDay;
}

/**
 * 날짜별 식사 보장(4단계, 2026-07-24 통영 재발 보완). 최근접 이웃 정렬 + 날짜별 개수 분배는 순전히
 * 지리적 우연으로 식사 가능 FOOD를 특정 날짜에 몰아줄 수 있다 — 그 결과 다른 날짜에는 점심조차 없는
 * 상황이 나온다(FOOD "공급"과 날짜별 "보장"은 별개 문제). 이 함수는 1차 스케줄링 결과(dayPoisList/
 * scheduledList)를 그대로 둔 채, 점심(항상 필요) 또는 저녁(그 날짜가 저녁 시간대까지 이어질 때만)이
 * 빠진 날짜가 있으면 — 다른 날짜에서 이미 "배정됐지만 최종적으로 쓰이지 않은"(그 날짜의 3번째 이상이라
 * 제외됐거나, 시간·이동 조건에 안 맞아 제외된) 식사 가능 FOOD를 찾아 옮겨 다시 시도한다. 실제로 그
 * 날짜에서 재스케줄했을 때 정말 배치되는 경우에만 채택한다(무조건 우겨넣지 않음 — 안전한 생략 정책
 * 유지). scheduleDayWithMeals 등 기존 시간 로직은 그대로 재사용할 뿐 전혀 수정하지 않는다.
 */
function repairMealCoverage(
  dayPoisList: PoiDetail[][],
  scheduledList: (ScheduledItem[] | null)[],
  daySlotsForDayList: string[][],
  transport: TransportCode,
): void {
  const dayCount = dayPoisList.length;
  const dinnerReachableByDay = daySlotsForDayList.map((slots) => {
    const end = slots[slots.length - 1] ?? DEFAULT_TIME_SLOTS[DEFAULT_TIME_SLOTS.length - 1];
    return isMealWindowReachableForDay("dinner", end);
  });

  const usedIdsByDay = (d: number): Set<string> => new Set((scheduledList[d] ?? []).map((s) => s.poi.id));
  const claimed = new Set<string>(); // 이미 다른 날짜로 옮겨진 후보(재중복 배정 방지).

  const unusedMealCandidatesExcluding = (excludeDay: number): PoiDetail[] => {
    const result: PoiDetail[] = [];
    for (let d = 0; d < dayCount; d++) {
      if (d === excludeDay) continue;
      const used = usedIdsByDay(d);
      for (const p of dayPoisList[d]) {
        if (isMealEligiblePoi(p) && !used.has(p.id) && !claimed.has(p.id)) result.push(p);
      }
    }
    return result;
  };

  for (let d = 0; d < dayCount; d++) {
    let { hasLunch, hasDinner } = mealSlotStatus(scheduledList[d]);
    let remainingNeeds = (hasLunch ? 0 : 1) + (dinnerReachableByDay[d] && !hasDinner ? 1 : 0);
    if (remainingNeeds === 0) continue;

    const slotsForDay = daySlotsForDayList[d];
    const dayStartMinutes = parseTimeSlotToMinutes(slotsForDay[0] ?? DEFAULT_TIME_SLOTS[0]) ?? 0;
    const dayEndMinutes =
      parseTimeSlotToMinutes(slotsForDay[slotsForDay.length - 1] ?? DEFAULT_TIME_SLOTS[DEFAULT_TIME_SLOTS.length - 1]) ?? 0;
    // 그 날짜의 실제 시간 예산(분) — 재시도 후보가 실제로 그 날짜 안에서 도달 가능한지 판단하는 기준으로
    // 쓴다. scheduleDayWithMeals는 하루 첫 배치(prevPoi=null)의 이동시간을 0으로 보는 기존 규칙이 있어,
    // 후보를 그대로 넣어 재스케줄만 해보면 아무리 멀어도 "첫 자리"로 들어가 버릴 수 있다(실제로는 도달
    // 불가능한 거리인데도) — 그래서 재스케줄 성공 여부만으로 판단하지 않고, 이 날짜의 실제 POI와 후보
    // 사이의 이동시간이 하루 예산 안에 드는지 먼저 확인한다.
    const dayBudgetMinutes = Math.max(0, dayEndMinutes - dayStartMinutes);

    while (remainingNeeds > 0) {
      const candidates = unusedMealCandidatesExcluding(d);
      if (candidates.length === 0) break;

      const dayRefPoints = dayPoisList[d].filter(hasCoords);
      const nearestRefDistanceKm = (p: PoiDetail): number => {
        if (!hasCoords(p) || dayRefPoints.length === 0) return Number.POSITIVE_INFINITY;
        return Math.min(...dayRefPoints.map((r) => haversineDistanceKm(r, p)));
      };
      candidates.sort((a, b) => nearestRefDistanceKm(a) - nearestRefDistanceKm(b));

      let accepted = false;
      for (const candidate of candidates) {
        if (dayRefPoints.length > 0 && hasCoords(candidate)) {
          const nearestRef = dayRefPoints.reduce((best, p) =>
            haversineDistanceKm(p, candidate) < haversineDistanceKm(best, candidate) ? p : best,
          );
          const travel = estimateTravel(nearestRef, candidate, transport);
          if (travel.minutes === null || travel.minutes > dayBudgetMinutes) continue; // 실제 이동시간이 그 날짜 예산을 넘으면 시도조차 하지 않는다.
        }

        const trialDayPois = [...dayPoisList[d], candidate];
        const trialScheduled = scheduleDayPois(trialDayPois, slotsForDay, transport);
        if (!trialScheduled?.some((s) => s.poi.id === candidate.id)) continue; // 실제로 배치되지 못하면 채택하지 않는다.

        dayPoisList[d] = trialDayPois;
        scheduledList[d] = trialScheduled;
        claimed.add(candidate.id);
        accepted = true;
        break;
      }
      if (!accepted) break;

      const status = mealSlotStatus(scheduledList[d]);
      hasLunch = status.hasLunch;
      hasDinner = status.hasDinner;
      remainingNeeds = (hasLunch ? 0 : 1) + (dinnerReachableByDay[d] && !hasDinner ? 1 : 0);
    }
  }
}

export function buildDraftCourse(pois: PoiDetail[], duration: DurationCode, transport: TransportCode): CourseDay[] {
  const dayCount = DAY_COUNT_BY_DURATION[duration];
  const nights = dayCount - 1;
  const dailyTargets = DAILY_ITEM_TARGETS_BY_DURATION[duration];
  const daySlots = DAY_TIME_SLOTS_BY_DURATION[duration];

  // 숙박 후보가 박수보다 많아도(예: buildDraftCourse가 selectPois 정책과 무관하게 단독 호출된 경우)
  // 박수만큼만 쓰고, 남는 숙박 후보는 일반 일정에 넣지 않는다(가짜 배치 방지, 입력 순서 그대로 결정론적으로 앞에서부터 사용).
  const lodgingCandidates = pois.filter((p) => p.category === LODGING_CATEGORY);
  const nonLodgingPois = pois.filter((p) => p.category !== LODGING_CATEGORY);
  const selectedLodging = lodgingCandidates.slice(0, nights);

  const ordered = orderWithReliableCoordinates(nonLodgingPois);
  const counts = distributeDailyCounts(ordered.length, dailyTargets);

  const daySlotsForDayList: string[][] = [];
  const dayPoisList: PoiDetail[][] = [];
  {
    let poiIndex = 0;
    for (let d = 0; d < dayCount; d++) {
      const count = counts[d] ?? 0;
      dayPoisList.push(ordered.slice(poiIndex, poiIndex + count));
      poiIndex += count;
      daySlotsForDayList.push(daySlots[d] ?? DEFAULT_TIME_SLOTS);
    }
  }

  // 장거리 구간 처리(2단계) — 하루 안의 인접 구간이 비정상적으로 멀면(EXCESSIVE_TRAVEL_MINUTES 이상)
  // 다른 날짜의 더 가까운 후보와 교환하고, 교환할 후보가 없으면 코스에서 제외한다. 뒤이은 식사 배치·
  // 최근접 순서 재계산이 이미 정리된 dayPoisList를 그대로 이어받도록 스케줄링보다 먼저 실행한다.
  const travelNoticesByDay = repairExcessiveTravelSegments(dayPoisList, transport);

  // FOOD가 있는 날짜만 점심·저녁 시간대를 고려한 배치(3단계)를 적용한다. FOOD가 없으면 기존 방식
  // (날짜별 고정 슬롯 + 최근접 이웃 순서)을 그대로 쓴다 — 회귀 없이 이번 개선을 독립적으로 적용하기 위함.
  const scheduledList = dayPoisList.map((dayPois, d) => scheduleDayPois(dayPois, daySlotsForDayList[d], transport));

  // 스케줄링 이후 재도입된 장거리 구간 정리(2026-08-14) — scheduleDayPois가 FOOD를 시간대에 맞춰
  // 재배치하면서 2단계(repairExcessiveTravelSegments)가 미리 확인하지 않은 새 EXCESSIVE 인접 쌍이
  // 생길 수 있다. 위 travelNoticesByDay를 그대로 이어써서 안내문을 한 곳에 모은다.
  repairExcessiveTravelAfterScheduling(dayPoisList, scheduledList, daySlotsForDayList, transport, travelNoticesByDay);

  // 날짜별 식사 보장(4단계) — 위 1차 결과만으로 점심(그리고 그 날짜가 저녁까지 이어지면 저녁)이 빠진
  // 날짜가 있으면, 다른 날짜에서 쓰이지 않은 식사 가능 FOOD를 옮겨 다시 시도한다.
  repairMealCoverage(dayPoisList, scheduledList, daySlotsForDayList, transport);

  const days: CourseDay[] = [];
  for (let d = 0; d < dayCount; d++) {
    const dayPois = dayPoisList[d];
    const daySlotsForDay = daySlotsForDayList[d];
    const scheduled = scheduledList[d];
    const finalOrderedPois = scheduled ? scheduled.map((s) => s.poi) : dayPois;
    const itemInputs: CourseItemInput[] = scheduled
      ? scheduled.map(({ poi, timeSlot, purpose }) => ({
          poiId: poi.id,
          poiName: poi.name,
          category: poi.category,
          stayMinutes: recommendedPoiStayMinutes(poi),
          operatingHours: poi.operatingHours,
          closedDays: poi.closedDays,
          lat: poi.lat,
          lng: poi.lng,
          timeSlot,
          mealPurpose: purpose,
          mealEligible: poi.mealEligible,
          foodSubcategory: poi.foodSubcategory,
          lclsSystm1: poi.lclsSystm1,
          lclsSystm2: poi.lclsSystm2,
        }))
      : dayPois.map((p) => ({
          poiId: p.id,
          poiName: p.name,
          category: p.category,
          stayMinutes: recommendedPoiStayMinutes(p),
          operatingHours: p.operatingHours,
          closedDays: p.closedDays,
          lat: p.lat,
          lng: p.lng,
          mealEligible: p.mealEligible,
          foodSubcategory: p.foodSubcategory,
          lclsSystm1: p.lclsSystm1,
          lclsSystm2: p.lclsSystm2,
        }));

    const items = recomputeDayItems(itemInputs, transport, daySlotsForDay);

    const lodgingPoi = selectedLodging[d];
    let lodging: CourseItem | null = null;
    if (lodgingPoi) {
      const lastDayPoi = finalOrderedPois[finalOrderedPois.length - 1];
      // 이동시간은 여기서 한 번만 계산해 라벨(travel)과 체크인 시각 계산에 그대로 재사용한다
      // (표시용 문자열을 다시 파싱하지 않는다).
      const travelEstimate = lastDayPoi ? estimateTravel(lastDayPoi, lodgingPoi, transport) : null;
      const travel = travelEstimate ? travelEstimate.label : "당일 마지막 일정 이후 숙소로 이동(그날 일반 일정 없음)";
      const checkinTimeSlot = determineLodgingTimeSlot(items, travelEstimate?.minutes ?? null);
      // checkinTimeSlot이 null이면 실제 도착 시각을 하루 표시 범위 안에서 표현할 수 없다는 뜻이다 —
      // 잘못된 시각을 지어내는 대신 그 날짜의 숙박 카드 자체를 생성하지 않는다(안전한 생략).
      if (checkinTimeSlot !== null) {
        lodging = {
          order: 1,
          poiId: lodgingPoi.id,
          poiName: lodgingPoi.name,
          category: lodgingPoi.category,
          timeSlot: checkinTimeSlot,
          stayMinutes: 0,
          travel,
          lat: lodgingPoi.lat,
          lng: lodgingPoi.lng,
          mealEligible: lodgingPoi.mealEligible,
          foodSubcategory: lodgingPoi.foodSubcategory,
          lclsSystm1: lodgingPoi.lclsSystm1,
          lclsSystm2: lodgingPoi.lclsSystm2,
        };
      }
    }

    const notices = travelNoticesByDay[d];
    days.push({ dayIndex: d + 1, items, lodging, ...(notices.length > 0 ? { notices } : {}) });
  }
  return days;
}

/**
 * Phase 4: 실행안(체크리스트/KPI/위험요인)에 역할·국적·테마·여행월을 반영하기 위한 입력. 값이 저장돼
 *있지 않거나(레거시 프로젝트) 알 수 없는 값이면 각 필드가 담당하는 항목만 조용히 생략한다(12절
 * 하위 호환 — 런타임 오류 없이 기존 동작 그대로 유지).
 */
export interface AudiencePlanContext {
  role?: unknown;
  nationality?: unknown;
  travelMonth?: unknown;
  preferredThemes?: unknown;
}

interface NormalizedAudienceContext {
  role: UserRoleCode | undefined;
  nationality: NationalityCode | undefined;
  travelMonth: number | undefined;
  themeCategories: ReturnType<typeof classifyThemes>;
}

function normalizeAudienceContext(context: AudiencePlanContext | undefined): NormalizedAudienceContext {
  return {
    role: normalizeRole(context?.role),
    nationality: normalizeNationality(context?.nationality),
    travelMonth: normalizeMonth(context?.travelMonth),
    themeCategories: classifyThemes(normalizePreferredThemeList(context?.preferredThemes)),
  };
}

export function buildOperationChecklist(templateId: string, context?: AudiencePlanContext): string[] {
  const template = getTemplateById(templateId);
  const { role, nationality, themeCategories } = normalizeAudienceContext(context);
  return [
    "출발 3일 전 예약 인원 최종 확정",
    "코스 내 정기 휴무일 재확인",
    "우천/혹서·혹한 시 대체 동선 사전 확보",
    "이동 수단 배차/교통 정보 최신본 확인",
    ...template.riskTemplates.map((r) => `위험 요인 점검: ${r}`),
    ...computeRoleChecklistNotes(role),
    ...computeNationalityChecklistNotes(nationality),
    ...computeThemeChecklistNotes(themeCategories, template),
  ];
}

export function buildKpis(templateId: string, context?: AudiencePlanContext): { name: string; method: string }[] {
  const template = getTemplateById(templateId);
  const { role, nationality } = normalizeAudienceContext(context);
  return [...template.kpiTemplates, ...computeRoleKpiNotes(role), ...computeNationalityKpiNotes(nationality)];
}

export function buildRisks(templateId: string, context?: AudiencePlanContext): { risk: string; mitigation: string }[] {
  const template = getTemplateById(templateId);
  const { role, travelMonth } = normalizeAudienceContext(context);
  const baseRisks = template.riskTemplates.map((risk) => ({
    risk,
    mitigation: "현장 운영 담당자가 사전 확인 후 대체 동선/일정을 준비한다.",
  }));
  const seasonalRisks = computeSeasonalRiskNotes(travelMonth, template).map((risk) => ({
    risk,
    mitigation: "현장 운영 담당자가 사전 확인 후 대체 동선/일정을 준비한다.",
  }));
  return [...baseRisks, ...seasonalRisks, ...computeRoleRiskNotes(role)];
}
