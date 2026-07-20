import type { DurationCode } from "./strategy";
import { getTemplateById } from "./strategyTemplates";

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

/** 전략이 선택한 POI 목록을 기간에 맞춰 결정론적으로 일자·시간대에 배치한다. 새 장소를 만들지 않는다. */
export function buildDraftCourse(pois: PoiDetail[], duration: DurationCode): CourseDay[] {
  const dayCount = DAY_COUNT_BY_DURATION[duration];
  const slotsPerDay = Math.min(TIME_SLOTS.length, Math.max(1, Math.ceil(pois.length / dayCount)));

  const days: CourseDay[] = [];
  let poiIndex = 0;
  for (let d = 1; d <= dayCount && poiIndex < pois.length; d++) {
    const items: CourseItem[] = [];
    for (let s = 0; s < slotsPerDay && poiIndex < pois.length; s++, poiIndex++) {
      const poi = pois[poiIndex];
      items.push({
        order: s + 1,
        poiId: poi.id,
        poiName: poi.name,
        category: poi.category,
        timeSlot: TIME_SLOTS[s],
        stayMinutes: 60,
        travel: s === 0 ? "숙소/집결지에서 이동" : "이동 15~20분(도보 또는 대중교통, 실제 경로 확인 필요)",
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
