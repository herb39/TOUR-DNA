export interface FestivalAnchorSourceItem {
  contentid?: string;
  contenttypeid?: string;
  title?: string;
  addr1?: string;
  eventstartdate?: string;
  eventenddate?: string;
  mapx?: number;
  mapy?: number;
  tel?: string;
  firstimage?: string;
  firstimage2?: string;
  lDongRegnCd?: string;
  lDongSignguCd?: string;
}

export interface FestivalAnchorCandidate {
  id: string;
  externalId: string;
  name: string;
  startDate: string;
  endDate: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  telephone: string | null;
  imageUrl: string | null;
  sourceLabel: "한국관광공사 TourAPI 행사정보";
}

export interface TravelMonthRange {
  start: string;
  end: string;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** YYYYMMDD만 인정한다. API의 빈 값·잘못된 날짜를 화면 후보로 만들지 않는다. */
export function normalizeFestivalDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  return isValidDateParts(year, month, day) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : null;
}

export function getTravelMonthRange(year: number, month: number): TravelMonthRange | null {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`,
    end: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`,
  };
}

/** 여행월과 행사 기간이 하루라도 겹치면 후보로 인정한다(양 끝 날짜 포함). */
export function overlapsTravelMonth(
  startDate: string,
  endDate: string,
  travelMonth: TravelMonthRange,
): boolean {
  return startDate <= travelMonth.end && endDate >= travelMonth.start;
}

function candidateId(externalId: string): string {
  return `tourapi-festival-${externalId}`;
}

/** 법정동 시도·시군구 코드를 모두 확인해 인접 지역 행사 혼입을 막는다. */
export function matchesFestivalRegion(
  item: FestivalAnchorSourceItem,
  region: { lDongRegnCd: string; lDongSignguCd?: string | null },
): boolean {
  if (item.lDongRegnCd !== region.lDongRegnCd) return false;
  return !region.lDongSignguCd || item.lDongSignguCd === region.lDongSignguCd;
}

export function filterFestivalAnchorItems(params: {
  items: FestivalAnchorSourceItem[];
  region: { lDongRegnCd: string; lDongSignguCd?: string | null };
  travelMonth: TravelMonthRange;
}): FestivalAnchorCandidate[] {
  const sorted = [...params.items].sort((a, b) =>
    `${a.eventstartdate ?? ""}|${a.eventenddate ?? ""}|${a.title ?? ""}`.localeCompare(
      `${b.eventstartdate ?? ""}|${b.eventenddate ?? ""}|${b.title ?? ""}`,
    ),
  );
  const byId = new Map<string, FestivalAnchorCandidate>();

  for (const item of sorted) {
    if (item.contenttypeid && item.contenttypeid !== "15") continue;
    if (!item.contentid || !item.title || !matchesFestivalRegion(item, params.region)) continue;
    const startDate = normalizeFestivalDate(item.eventstartdate);
    const endDate = normalizeFestivalDate(item.eventenddate);
    if (!startDate || !endDate || startDate > endDate || !overlapsTravelMonth(startDate, endDate, params.travelMonth)) {
      continue;
    }
    if (byId.has(item.contentid)) continue;
    byId.set(item.contentid, {
      id: candidateId(item.contentid),
      externalId: item.contentid,
      name: item.title,
      startDate,
      endDate,
      address: item.addr1?.trim() || null,
      lat: typeof item.mapy === "number" && Number.isFinite(item.mapy) ? item.mapy : null,
      lng: typeof item.mapx === "number" && Number.isFinite(item.mapx) ? item.mapx : null,
      telephone: item.tel?.trim() || null,
      imageUrl: item.firstimage?.trim() || item.firstimage2?.trim() || null,
      sourceLabel: "한국관광공사 TourAPI 행사정보",
    });
  }

  return [...byId.values()].sort((a, b) => `${a.startDate}|${a.name}`.localeCompare(`${b.startDate}|${b.name}`));
}
