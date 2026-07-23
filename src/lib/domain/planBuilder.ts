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
 * 기존과 같은 방식(종료 시각만)으로 판단한다. */
function determineLodgingTimeSlot(dayItems: CourseItem[], travelMinutesToLodging: number | null): string {
  if (dayItems.length === 0) return DEFAULT_LODGING_CHECKIN;
  const last = dayItems[dayItems.length - 1];
  const lastStart = parseTimeSlotToMinutes(last.timeSlot);
  if (lastStart === null) return DEFAULT_LODGING_CHECKIN;
  const arrivalMinutes = lastStart + last.stayMinutes + (travelMinutesToLodging ?? 0);
  const defaultMinutes = parseTimeSlotToMinutes(DEFAULT_LODGING_CHECKIN) ?? 20 * 60;
  return arrivalMinutes > defaultMinutes ? minutesToTimeSlot(arrivalMinutes) : DEFAULT_LODGING_CHECKIN;
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

    const items = recomputeDayItems(
      dayPois.map((p) => ({ poiId: p.id, poiName: p.name, category: p.category, stayMinutes: 60, lat: p.lat, lng: p.lng })),
      transport,
      daySlots[d] ?? DEFAULT_TIME_SLOTS,
    );

    const lodgingPoi = selectedLodging[d];
    let lodging: CourseItem | null = null;
    if (lodgingPoi) {
      const lastDayPoi = dayPois[dayPois.length - 1];
      // 이동시간은 여기서 한 번만 계산해 라벨(travel)과 체크인 시각 계산에 그대로 재사용한다
      // (표시용 문자열을 다시 파싱하지 않는다).
      const travelEstimate = lastDayPoi ? estimateTravel(lastDayPoi, lodgingPoi, transport) : null;
      const travel = travelEstimate ? travelEstimate.label : "당일 마지막 일정 이후 숙소로 이동(그날 일반 일정 없음)";
      lodging = {
        order: 1,
        poiId: lodgingPoi.id,
        poiName: lodgingPoi.name,
        category: lodgingPoi.category,
        timeSlot: determineLodgingTimeSlot(items, travelEstimate?.minutes ?? null),
        stayMinutes: 0,
        travel,
        lat: lodgingPoi.lat,
        lng: lodgingPoi.lng,
      };
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
