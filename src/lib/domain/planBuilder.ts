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

/** 처음 생성할 때 기본으로 쓰는 시간대. 그 이후 자리(4번째 이후)는 DEFAULT_SLOT_STEP_MINUTES 간격으로 이어간다. */
const TIME_SLOTS = ["10:00", "13:00", "16:00", "18:30"];
const DEFAULT_SLOT_STEP_MINUTES = 150;

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

/** 자리(0-based index)에 대한 기본 시간대. 앞 4자리는 고정 슬롯, 그 이후는 일정 간격으로 이어간다. */
function defaultTimeSlotFor(index: number): string {
  if (index < TIME_SLOTS.length) return TIME_SLOTS[index];
  const lastKnown = parseTimeSlotToMinutes(TIME_SLOTS[TIME_SLOTS.length - 1]) ?? 0;
  return minutesToTimeSlot(lastKnown + (index - TIME_SLOTS.length + 1) * DEFAULT_SLOT_STEP_MINUTES);
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
export function recomputeDayItems(items: CourseItemInput[], transport: TransportCode): CourseItem[] {
  return items.map((item, idx) => {
    const prev = idx === 0 ? null : items[idx - 1];
    return {
      order: idx + 1,
      poiId: item.poiId,
      poiName: item.poiName,
      category: item.category,
      timeSlot: item.timeSlot ?? defaultTimeSlotFor(idx),
      stayMinutes: item.stayMinutes,
      travel: prev ? estimateTravel(prev, item, transport).label : "숙소/집결지에서 이동",
      lat: item.lat,
      lng: item.lng,
    };
  });
}

/**
 * 전략이 선택한 POI 목록을 기간에 맞춰 일자·시간대에 배치한다. 새 장소를 만들지 않는다.
 * 최근접 이웃 순서로 재배열해 하루 동선이 실제 거리 기준으로 이어지도록 하고, 구간별 이동 텍스트도
 * 직선거리(haversine) 기반 추정치로 계산한다(실제 도로/대중교통 경로와는 다를 수 있음).
 */
export function buildDraftCourse(pois: PoiDetail[], duration: DurationCode, transport: TransportCode): CourseDay[] {
  const dayCount = DAY_COUNT_BY_DURATION[duration];
  const slotsPerDay = Math.max(1, Math.ceil(pois.length / dayCount));
  const ordered = orderByNearestNeighbor(pois);

  const days: CourseDay[] = [];
  let poiIndex = 0;
  for (let d = 1; d <= dayCount && poiIndex < ordered.length; d++) {
    const dayPois = ordered.slice(poiIndex, poiIndex + slotsPerDay);
    poiIndex += dayPois.length;
    days.push({
      dayIndex: d,
      items: recomputeDayItems(
        dayPois.map((p) => ({ poiId: p.id, poiName: p.name, category: p.category, stayMinutes: 60, lat: p.lat, lng: p.lng })),
        transport,
      ),
    });
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
