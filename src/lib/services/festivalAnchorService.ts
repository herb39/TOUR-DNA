import { prisma } from "@/lib/db";
import { filterFestivalAnchorItems, getTravelMonthRange, type FestivalAnchorCandidate } from "@/lib/domain/festivalAnchor";
import { fetchFestivalInfo } from "@/lib/public-data/adapters/festival";

export type FestivalAnchorLookupStatus = "AVAILABLE" | "EMPTY" | "UNAVAILABLE" | "ERROR";

export interface FestivalAnchorLookup {
  status: FestivalAnchorLookupStatus;
  candidates: FestivalAnchorCandidate[];
  message: string;
  provenance: {
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
  };
}

function emptyProvenance(params: { regionCode: string; travelYear: number; travelMonth: number }) {
  const range = getTravelMonthRange(params.travelYear, params.travelMonth);
  return {
    provider: "한국관광공사" as const,
    dataset: "행사정보 조회(searchFestival2)" as const,
    regionCode: params.regionCode,
    travelYear: params.travelYear,
    travelMonth: params.travelMonth,
    eventStartDate: range?.start ?? null,
    eventEndDate: range?.end ?? null,
    fetchedAt: new Date().toISOString(),
    apiItemCount: 0,
    matchedItemCount: 0,
  };
}

/** 지역·여행월 기준 축제 Anchor 후보를 읽기 전용으로 조회한다. */
export async function fetchFestivalAnchorCandidates(params: {
  regionCode: string;
  travelYear: number;
  travelMonth: number;
}): Promise<FestivalAnchorLookup> {
  const baseProvenance = emptyProvenance(params);
  const range = getTravelMonthRange(params.travelYear, params.travelMonth);
  if (!range) {
    return {
      status: "UNAVAILABLE",
      candidates: [],
      message: "여행 연도·월이 올바르지 않아 축제 기간을 조회하지 못했습니다.",
      provenance: baseProvenance,
    };
  }

  if ((process.env.DATA_MODE ?? "hybrid").toLowerCase() === "snapshot") {
    return {
      status: "UNAVAILABLE",
      candidates: [],
      message: "스냅샷 모드에서는 외부 행사정보를 조회하지 않습니다.",
      provenance: baseProvenance,
    };
  }

  const region = await prisma.region.findUnique({
    where: { code: params.regionCode },
    select: { name: true, tourApiLdongRegnCd: true, tourApiLdongSignguCd: true },
  });
  if (!region?.tourApiLdongRegnCd) {
    return {
      status: "UNAVAILABLE",
      candidates: [],
      message: "이 지역의 공식 법정동 코드가 준비되지 않아 축제 후보를 조회하지 못했습니다.",
      provenance: baseProvenance,
    };
  }

  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    return {
      status: "UNAVAILABLE",
      candidates: [],
      message: "축제 원천 데이터 연결 설정이 없어 후보를 표시하지 않습니다.",
      provenance: baseProvenance,
    };
  }

  const source = await prisma.dataSource.findUnique({ where: { code: "TOUR_INFO" }, select: { baseUrl: true } });
  if (!source?.baseUrl) {
    return {
      status: "UNAVAILABLE",
      candidates: [],
      message: "축제 원천 데이터 주소가 등록되지 않아 후보를 조회하지 못했습니다.",
      provenance: baseProvenance,
    };
  }

  const response = await fetchFestivalInfo({
    serviceKey,
    baseUrl: source.baseUrl,
    eventStartDate: range.start.replaceAll("-", ""),
    eventEndDate: range.end.replaceAll("-", ""),
    lDongRegnCd: region.tourApiLdongRegnCd,
    lDongSignguCd: region.tourApiLdongSignguCd ?? undefined,
  });

  const apiItemCount = response.items.length;
  const provenance = { ...baseProvenance, apiItemCount };
  if (response.status === "ERROR") {
    return {
      status: "ERROR",
      candidates: [],
      message: "공식 축제 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
      provenance,
    };
  }

  const candidates = filterFestivalAnchorItems({
    items: response.items,
    region: { lDongRegnCd: region.tourApiLdongRegnCd, lDongSignguCd: region.tourApiLdongSignguCd },
    travelMonth: range,
  });
  const finalProvenance = { ...provenance, matchedItemCount: candidates.length };
  if (candidates.length === 0) {
    return {
      status: "EMPTY",
      candidates: [],
      message: `${region.name}의 ${params.travelYear}년 ${params.travelMonth}월과 기간이 겹치는 공식 축제가 확인되지 않았습니다.`,
      provenance: finalProvenance,
    };
  }

  return {
    status: "AVAILABLE",
    candidates,
    message: `${region.name}의 ${params.travelYear}년 ${params.travelMonth}월 행사 중 ${candidates.length}건을 확인했습니다.`,
    provenance: finalProvenance,
  };
}
