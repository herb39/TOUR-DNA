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
}

export interface CourseDay {
  dayIndex: number;
  items: CourseItem[];
}

const DAY_COUNT_BY_DURATION: Record<DurationCode, number> = {
  DAY_TRIP: 1,
  ONE_NIGHT_TWO_DAYS: 2,
  TWO_NIGHTS_THREE_DAYS: 3,
};

const TIME_SLOTS = ["10:00", "13:00", "16:00", "18:30"];

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

function describeTravel(from: PoiDetail, to: PoiDetail, transport: TransportCode): string {
  const distanceKm = haversineDistanceKm(from, to);
  if (distanceKm < 0.3) return `${TRANSPORT_LABEL[transport]} 이동 5분 이내(같은 구역)`;
  const minutes = Math.max(5, Math.round((distanceKm / AVERAGE_SPEED_KMH[transport]) * 60));
  return `이동 약 ${minutes}분(약 ${distanceKm.toFixed(1)}km, ${TRANSPORT_LABEL[transport]} 기준)`;
}

/**
 * 전략이 선택한 POI 목록을 기간에 맞춰 일자·시간대에 배치한다. 새 장소를 만들지 않는다.
 * 최근접 이웃 순서로 재배열해 하루 동선이 실제 거리 기준으로 이어지도록 하고, 구간별 이동 텍스트도
 * 직선거리(haversine) 기반 추정치로 계산한다(실제 도로/대중교통 경로와는 다를 수 있음).
 */
export function buildDraftCourse(pois: PoiDetail[], duration: DurationCode, transport: TransportCode): CourseDay[] {
  const dayCount = DAY_COUNT_BY_DURATION[duration];
  const slotsPerDay = Math.min(TIME_SLOTS.length, Math.max(1, Math.ceil(pois.length / dayCount)));
  const ordered = orderByNearestNeighbor(pois);

  const days: CourseDay[] = [];
  let poiIndex = 0;
  for (let d = 1; d <= dayCount && poiIndex < ordered.length; d++) {
    const items: CourseItem[] = [];
    for (let s = 0; s < slotsPerDay && poiIndex < ordered.length; s++, poiIndex++) {
      const poi = ordered[poiIndex];
      const prev = s === 0 ? null : ordered[poiIndex - 1];
      items.push({
        order: s + 1,
        poiId: poi.id,
        poiName: poi.name,
        category: poi.category,
        timeSlot: TIME_SLOTS[s],
        stayMinutes: 60,
        travel: prev ? describeTravel(prev, poi, transport) : "숙소/집결지에서 이동",
      });
    }
    days.push({ dayIndex: d, items });
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
