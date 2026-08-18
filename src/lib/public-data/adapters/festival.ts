import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사 국문 관광정보 서비스의 행사정보 조회(searchFestival2) 원본 항목.
 * 지역기반 목록(areaBasedList2)은 날짜를 제공하지 않으므로, 축제·이벤트 Anchor 판정은 이
 * 행사 전용 조회 결과만 사용한다. API 원본 필드명은 TourAPI 규격을 그대로 보존한다.
 */
const coordinateSchema = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === "" || value === "null") return undefined;
    const numberValue = typeof value === "string" ? Number(value) : value;
    return typeof numberValue === "number" && Number.isFinite(numberValue) ? numberValue : undefined;
  }, z.number().optional())
  .optional();

const itemSchema = z.object({
  contentid: z.string().optional(),
  contenttypeid: z.string().optional(),
  title: z.string().optional(),
  addr1: z.string().optional(),
  addr2: z.string().optional(),
  eventstartdate: z.string().optional(),
  eventenddate: z.string().optional(),
  mapx: coordinateSchema,
  mapy: coordinateSchema,
  tel: z.string().optional(),
  firstimage: z.string().optional(),
  firstimage2: z.string().optional(),
  areacode: z.string().optional(),
  sigungucode: z.string().optional(),
  lDongRegnCd: z.string().optional(),
  lDongSignguCd: z.string().optional(),
  lclsSystm1: z.string().optional(),
  lclsSystm2: z.string().optional(),
  lclsSystm3: z.string().optional(),
});

export type FestivalItem = z.infer<typeof itemSchema>;

export interface FestivalSearchParams {
  serviceKey: string;
  baseUrl: string;
  eventStartDate: string;
  eventEndDate: string;
  lDongRegnCd: string;
  lDongSignguCd?: string;
}

const ROWS_PER_PAGE = 100;
const MAX_PAGES = 5;

function buildUrl(params: FestivalSearchParams, pageNo: number): string {
  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    eventStartDate: params.eventStartDate,
    eventEndDate: params.eventEndDate,
    lDongRegnCd: params.lDongRegnCd,
    numOfRows: String(ROWS_PER_PAGE),
    pageNo: String(pageNo),
    _type: "json",
  });
  if (params.lDongSignguCd) query.set("lDongSignguCd", params.lDongSignguCd);
  return `${params.baseUrl}/searchFestival2?${query.toString()}`;
}

export type FestivalSearchResult =
  | (NormalizedItemsResult<FestivalItem> & { pagesFetched: number })
  | { status: "ERROR"; items: []; resultCode: string; resultMsg: string; pagesFetched: number };

/** 행사 기간·법정동 조건으로 TourAPI 행사정보를 조회한다. DB에는 아무것도 쓰지 않는다. */
export async function fetchFestivalInfo(params: FestivalSearchParams): Promise<FestivalSearchResult> {
  const firstResponse = await fetchPublicDataJson(buildUrl(params, 1), { sourceCode: "TOUR_FESTIVAL" });
  if (!firstResponse.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: firstResponse.errorMessage ?? "행사정보 API 응답을 받지 못했습니다.",
      pagesFetched: 0,
    };
  }

  let first: NormalizedItemsResult<FestivalItem>;
  try {
    first = parsePublicDataEnvelope(itemSchema, firstResponse.data);
  } catch {
    const meta = extractResultMeta(firstResponse.data);
    return {
      status: "ERROR",
      items: [],
      resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
      resultMsg: meta.resultMsg ?? "행사정보 API 응답 구조를 해석하지 못했습니다.",
      pagesFetched: 1,
    };
  }

  if (first.status === "ERROR") {
    return { ...first, pagesFetched: 1 };
  }

  const items = [...first.items];
  const totalPages = Math.min(MAX_PAGES, Math.ceil((first.totalCount ?? items.length) / ROWS_PER_PAGE));
  let pagesFetched = 1;

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const response = await fetchPublicDataJson(buildUrl(params, pageNo), { sourceCode: "TOUR_FESTIVAL" });
    if (!response.ok) break;
    pagesFetched++;
    try {
      const page = parsePublicDataEnvelope(itemSchema, response.data);
      if (page.status === "ERROR") break;
      items.push(...page.items);
    } catch {
      break;
    }
  }

  return {
    status: items.length > 0 ? "SUCCESS" : "EMPTY",
    items,
    resultCode: first.resultCode,
    resultMsg: first.resultMsg,
    totalCount: first.totalCount,
    pagesFetched,
  };
}
