import type { DurationCode } from "./strategy";
import { getTemplateById } from "./strategyTemplates";
import { orderByNearestNeighbor, haversineDistanceKm } from "./geo";

export type TransportCode = "WALK" | "PUBLIC_TRANSPORT" | "PRIVATE_VEHICLE" | "MIXED";

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
}

export interface CourseItem {
  order: number;
  poiId: string;
  poiName: string;
  category: string;
  timeSlot: string;
  stayMinutes: number;
  travel: string;
  /** 이동 텍스트 재계산용 좌표. 이 필드가 추가되기 전(2026-07-21 이전) 저장된 실행안에는 없을 수 있다. */
  lat?: number;
  lng?: number;
}

export interface CourseDay {
  dayIndex: number;
  items: CourseItem[];
  /** 해당 날짜의 숙박 1건(있으면). 일반 items와 분리되어 날짜별 목표 개수에 포함되지 않는다.
   * 이 필드가 추가되기 전(2026-07-23 이전) 저장된 실행안에는 없을 수 있으므로 optional/nullable로 둔다. */
  lodging?: CourseItem | null;
}

/**
 * recomputeDayItems에 넣을 입력 하나(장소 하나) — 새로 추가하는 POI도 이 모양으로 맞추면 된다.
 * timeSlot을 넣으면 그 값을 그대로 유지하고(사용자가 이미 편집한 시간), 비워두면 자리(index) 기준
 * 기본값을 새로 계산한다(처음 추가되는 장소용).
 */
export interface CourseItemInput {
  poiId: string;
  poiName: string;
  category: string;
  stayMinutes: number;
  lat?: number;
  lng?: number;
  timeSlot?: string;
}

const DAY_COUNT_BY_DURATION: Record<DurationCode, number> = {
  DAY_TRIP: 1,
  ONE_NIGHT_TWO_DAYS: 2,
  TWO_NIGHTS_THREE_DAYS: 3,
};

/** 숙박을 제외한 하루 목표 일정 개수(1단계에서 선택된 비숙박 POI를 이 분배대로 배치, 개선 2단계). */
const DAILY_ITEM_TARGETS_BY_DURATION: Record<DurationCode, number[]> = {
  DAY_TRIP: [4],
  ONE_NIGHT_TWO_DAYS: [4, 3],
  TWO_NIGHTS_THREE_DAYS: [3, 5, 3],
};

/** 날짜(역할)별 기본 시간대 — 첫날은 도착을 고려해 늦게 시작, 중간 날은 가장 촘촘하게, 마지막 날은
 * 귀가를 고려해 일찍 끝난다. 숙박은 이 슬롯을 소비하지 않는다(별도 체크인 시각으로 처리). */
const DAY_TIME_SLOTS_BY_DURATION: Record<DurationCode, string[][]> = {
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

const FOOD_CATEGORY = "FOOD";
/** 새로 생성하는 일반 일정의 기본 체류시간(분). buildDraftCourse 전체에서 공용으로 쓴다(3단계에서 상수화). */
const DEFAULT_ITEM_STAY_MINUTES = 60;

/** 식사 선호 시간대 정책(3단계) — FOOD 일정의 "시작 시각" 기준으로 판단한다. 영업시간·휴무일은
 * 이번 단계에서 다루지 않는다. */
const MEAL_WINDOWS = {
  lunch: { start: "11:30", end: "13:30" },
  dinner: { start: "17:30", end: "19:30" },
} as const;

type MealName = keyof typeof MEAL_WINDOWS;

const AVERAGE_SPEED_KMH: Record<TransportCode, number> = {
  WALK: 4,
  PUBLIC_TRANSPORT: 18,
  PRIVATE_VEHICLE: 28,
  MIXED: 15,
};

const TRANSPORT_LABEL: Record<TransportCode, string> = {
  WALK: "도보",
  PUBLIC_TRANSPORT: "대중교통",
  PRIVATE_VEHICLE: "차량",
  MIXED: "도보/대중교통 혼합",
};

function hasCoords(p: { lat?: number; lng?: number }): p is { lat: number; lng: number } {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
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
  if (distanceKm < 0.3) {
    return { minutes: 5, label: `${TRANSPORT_LABEL[transport]} 이동 5분 이내(같은 구역)` };
  }
  const minutes = Math.max(5, Math.round((distanceKm / AVERAGE_SPEED_KMH[transport]) * 60));
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
  return items.map((item, idx) => {
    const prev = idx === 0 ? null : items[idx - 1];
    return {
      order: idx + 1,
      poiId: item.poiId,
      poiName: item.poiName,
      category: item.category,
      timeSlot: item.timeSlot ?? defaultTimeSlotFor(idx, timeSlots),
      stayMinutes: item.stayMinutes,
      travel: prev ? estimateTravel(prev, item, transport).label : "숙소/집결지에서 이동",
      lat: item.lat,
      lng: item.lng,
    };
  });
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
function fitsWithinDisplayableDay(startMinutesAbsolute: number): boolean {
  return startMinutesAbsolute >= 0 && startMinutesAbsolute + DEFAULT_ITEM_STAY_MINUTES <= END_OF_DISPLAY_DAY_MINUTES;
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
 * (원래 요구사항의 "관광지를 하나 더 배치하면 식사 시간대를 명백히 놓치는 상황"에 대응). */
function wouldMissMealWindowIfSightPlacedFirst(
  clockMinutes: number,
  prevPoi: PoiDetail | null,
  nextSight: PoiDetail,
  mealPoi: PoiDetail,
  meal: MealName,
  transport: TransportCode,
): boolean {
  const windowEnd = parseTimeSlotToMinutes(MEAL_WINDOWS[meal].end) ?? 0;
  const afterSightClock = clockMinutes + travelMinutesFrom(prevPoi, nextSight, transport) + DEFAULT_ITEM_STAY_MINUTES;
  const mealArrivalAfterSight = afterSightClock + travelMinutesFrom(nextSight, mealPoi, transport);
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
 * 시간 유효성을 우선한다). 문자열 변환·자정 방어는 호출부(place)에서 한 곳에만 둔다. */
function computeMealArrivalMinutes(
  clockMinutes: number,
  prevPoi: PoiDetail | null,
  mealPoi: PoiDetail,
  meal: MealName,
  transport: TransportCode,
): number {
  const windowStart = parseTimeSlotToMinutes(MEAL_WINDOWS[meal].start) ?? 0;
  const arrivalMinutes = clockMinutes + travelMinutesFrom(prevPoi, mealPoi, transport);
  return Math.max(arrivalMinutes, windowStart);
}

/**
 * FOOD가 포함된 날짜 전용 배치(3단계). 점심·저녁 후보를 시간대에 맞는 자연스러운 위치에 끼워 넣고,
 * 나머지 관광 일정은 이전 일정 종료 시각 + 실제 이동시간을 반영한 시각으로 채운다. 매 배치마다
 * 시계(clockMinutes)를 앞으로만 진행시키므로 역행·중복은 발생하지 않는다. FOOD가 없는 날짜는 이
 * 함수를 아예 타지 않고 기존 방식(날짜별 고정 슬롯)을 그대로 쓴다.
 */
function scheduleDayWithMeals(
  dayPois: PoiDetail[],
  dayStartTimeSlot: string,
  dayEndTimeSlot: string,
  transport: TransportCode,
): { poi: PoiDetail; timeSlot: string }[] {
  const { lunch, dinner, rest } = splitMealCandidates(dayPois, dayEndTimeSlot);
  const remainingSights = [...rest];
  const scheduled: { poi: PoiDetail; timeSlot: string }[] = [];

  let clockMinutes = parseTimeSlotToMinutes(dayStartTimeSlot) ?? 0;
  let prevPoi: PoiDetail | null = null;
  let lunchPending = lunch;
  let dinnerPending = dinner;

  // startMinutesAbsolute는 항상 "누적 절대 분"이다 — 표시용 wrap(minutesToTimeSlot)은 여기서 한 번만
  // 적용하고, clockMinutes는 그 wrap 이전의 절대 분을 그대로 이어받는다(문자열을 다시 파싱해 되먹이면
  // 자정을 넘긴 경과 시간 정보가 사라져 다음 항목이 더 이른 시각으로 계산되는 역행 버그가 생긴다).
  const place = (poi: PoiDetail, startMinutesAbsolute: number) => {
    scheduled.push({ poi, timeSlot: minutesToTimeSlot(startMinutesAbsolute) });
    clockMinutes = startMinutesAbsolute + DEFAULT_ITEM_STAY_MINUTES;
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
      if (fitsWithinDisplayableDay(arrival)) {
        place(lunchPending, arrival);
        placedSomething = true;
      }
      lunchPending = null; // 배치했든 하루 범위를 넘어 제외했든, 이 후보는 다시 검토하지 않는다.
    }

    if (!placedSomething && dinnerPending && shouldPlaceMealNow(clockMinutes, prevPoi, dinnerPending, "dinner", remainingSights[0], transport)) {
      const arrival = computeMealArrivalMinutes(clockMinutes, prevPoi, dinnerPending, "dinner", transport);
      if (fitsWithinDisplayableDay(arrival)) {
        place(dinnerPending, arrival);
        placedSomething = true;
      }
      dinnerPending = null;
    }

    if (!placedSomething) {
      // 관광지 큐를 순서대로 훑어 "지금 배치해도 하루 범위를 넘지 않는" 첫 후보를 찾는다. 그 전에
      // 넘는 후보를 만나면 큐에서 제거(제외)하고 다음 후보를 계속 확인한다 — 앞 후보 하나 때문에
      // 뒤의 짧고 가까운 후보까지 통째로 포기하지 않는다.
      while (remainingSights.length > 0) {
        const candidate = remainingSights[0];
        const start = clockMinutes + travelMinutesFrom(prevPoi, candidate, transport);
        remainingSights.shift();
        if (fitsWithinDisplayableDay(start)) {
          place(candidate, start);
          placedSomething = true;
          break;
        }
        // 이 후보는 제외한다(재큐잉하지 않음) — 계속 다음 후보를 확인한다.
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

  const ordered = orderByNearestNeighbor(nonLodgingPois);
  const counts = distributeDailyCounts(ordered.length, dailyTargets);

  const days: CourseDay[] = [];
  let poiIndex = 0;
  for (let d = 0; d < dayCount; d++) {
    const count = counts[d] ?? 0;
    const dayPois = ordered.slice(poiIndex, poiIndex + count);
    poiIndex += dayPois.length;

    const daySlotsForDay = daySlots[d] ?? DEFAULT_TIME_SLOTS;
    // FOOD가 있는 날짜만 점심·저녁 시간대를 고려한 배치(3단계)를 적용한다. FOOD가 없으면 기존 방식
    // (날짜별 고정 슬롯 + 최근접 이웃 순서)을 그대로 쓴다 — 회귀 없이 이번 개선을 독립적으로 적용하기 위함.
    const hasFood = dayPois.some(isFoodPoi);
    const scheduled = hasFood
      ? scheduleDayWithMeals(
          dayPois,
          daySlotsForDay[0] ?? DEFAULT_TIME_SLOTS[0],
          daySlotsForDay[daySlotsForDay.length - 1] ?? DEFAULT_TIME_SLOTS[DEFAULT_TIME_SLOTS.length - 1],
          transport,
        )
      : null;
    const finalOrderedPois = scheduled ? scheduled.map((s) => s.poi) : dayPois;
    const itemInputs: CourseItemInput[] = scheduled
      ? scheduled.map(({ poi, timeSlot }) => ({
          poiId: poi.id,
          poiName: poi.name,
          category: poi.category,
          stayMinutes: DEFAULT_ITEM_STAY_MINUTES,
          lat: poi.lat,
          lng: poi.lng,
          timeSlot,
        }))
      : dayPois.map((p) => ({
          poiId: p.id,
          poiName: p.name,
          category: p.category,
          stayMinutes: DEFAULT_ITEM_STAY_MINUTES,
          lat: p.lat,
          lng: p.lng,
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
        };
      }
    }

    days.push({ dayIndex: d + 1, items, lodging });
  }
  return days;
}

export function buildOperationChecklist(templateId: string): string[] {
  const template = getTemplateById(templateId);
  return [
    "출발 3일 전 예약 인원 최종 확정",
    "코스 내 정기 휴무일 재확인",
    "우천/혹서·혹한 시 대체 동선 사전 확보",
    "이동 수단 배차/교통 정보 최신본 확인",
    ...template.riskTemplates.map((r) => `위험 요인 점검: ${r}`),
  ];
}

export function buildKpis(templateId: string): { name: string; method: string }[] {
  return getTemplateById(templateId).kpiTemplates;
}

export function buildRisks(templateId: string): { risk: string; mitigation: string }[] {
  return getTemplateById(templateId).riskTemplates.map((risk) => ({
    risk,
    mitigation: "현장 운영 담당자가 사전 확인 후 대체 동선/일정을 준비한다.",
  }));
}
