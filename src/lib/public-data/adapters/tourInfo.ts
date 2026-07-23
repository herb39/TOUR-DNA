import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_국문 관광정보 서비스_GW (KorService2, TourAPI 4.0 계열).
 * 실 서비스키로 확인된 사항(2026-07-21):
 * - base: https://apis.data.go.kr/B551011/KorService2
 * - 지역기반 목록 조회: /areaBasedList2 (실제 데이터 확인됨 — 대전 유성구 "갑천" 등)
 * - areaCode는 구식 TourAPI 코드(1~39, 대전=3/충북=33/강원=32 확인)로, AreaTarDemDsService 등의
 *   통계청 코드와는 다른 체계다(Region.tourApiAreaCode에 별도 저장).
 * - contentTypeId(공식 문서 기준): 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠,
 *   32=숙박, 38=쇼핑, 39=음식점.
 */

const itemSchema = z.object({
  contentid: z.string().optional(),
  contenttypeid: z.string().optional(),
  title: z.string(),
  addr1: z.string().optional(),
  areacode: z.string().optional(),
  sigungucode: z.string().optional(),
  mapx: z.coerce.number().optional(),
  mapy: z.coerce.number().optional(),
  tel: z.string().optional(),
});

export type TourInfoItem = z.infer<typeof itemSchema>;

export const CONTENT_TYPE_ID = {
  ATTRACTION: "12",
  CULTURE: "14",
  FESTIVAL: "15",
  COURSE: "25",
  LEISURE_SPORTS: "28",
  LODGING: "32",
  SHOPPING: "38",
  FOOD: "39",
} as const;

/**
 * contentTypeId → PoiCategory(schema.prisma) 매핑. "여행코스"(25)는 개별 장소가 아니라 여러 장소를
 * 묶은 코스라서 POI로 upsert하지 않는다(null 반환).
 */
export function mapContentTypeToPoiCategory(
  contentTypeId: string | undefined,
): "ATTRACTION" | "FOOD" | "LODGING" | "EXPERIENCE" | "FESTIVAL" | "SHOPPING" | null {
  switch (contentTypeId) {
    case CONTENT_TYPE_ID.ATTRACTION:
    case CONTENT_TYPE_ID.CULTURE:
      return "ATTRACTION";
    case CONTENT_TYPE_ID.FESTIVAL:
      return "FESTIVAL";
    case CONTENT_TYPE_ID.LEISURE_SPORTS:
      return "EXPERIENCE";
    case CONTENT_TYPE_ID.LODGING:
      return "LODGING";
    case CONTENT_TYPE_ID.SHOPPING:
      return "SHOPPING";
    case CONTENT_TYPE_ID.FOOD:
      return "FOOD";
    default:
      return null;
  }
}

export interface TourInfoParams {
  serviceKey: string;
  baseUrl: string;
  /** 구식 TourAPI areaCode(1~39). Region.tourApiAreaCode. */
  areaCode: string;
  sigunguCode?: string;
  contentTypeId?: string;
}

const ROWS_PER_PAGE = 1000;
// areaCode는 시/도 단위라 한 페이지(1000건)로는 전체를 못 덮는 도가 많다(예: 강원 3,198건). 이후 주소
// 기반으로 시/군/구 단위까지 걸러내야 하므로, 몇 페이지 더 가져와 필터링 후 남는 양을 확보한다.
const MAX_PAGES = 5;

function buildUrl(baseUrl: string, params: TourInfoParams, pageNo: number): string {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCode: params.areaCode,
    numOfRows: String(ROWS_PER_PAGE),
    pageNo: String(pageNo),
    _type: "json",
  });
  if (params.sigunguCode) qs.set("sigunguCode", params.sigunguCode);
  if (params.contentTypeId) qs.set("contentTypeId", params.contentTypeId);
  return `${baseUrl}/areaBasedList2?${qs.toString()}`;
}

/** 실제로 받은 페이지 원본 응답들(있는 만큼만 — 지어내지 않음). */
export interface TourInfoRaw {
  pages: unknown[];
}

type AdapterResult =
  | (NormalizedItemsResult<TourInfoItem> & { raw: TourInfoRaw })
  | { status: "ERROR"; items: []; resultCode: string; resultMsg: string; raw: TourInfoRaw };

export async function fetchTourInfo(params: TourInfoParams): Promise<AdapterResult> {
  const firstRes = await fetchPublicDataJson(buildUrl(params.baseUrl, params, 1), { sourceCode: "TOUR_INFO" });
  if (!firstRes.ok) {
    // 네트워크/timeout 등으로 실제 응답 본문 자체가 없다 — raw.pages는 빈 배열(지어내지 않음).
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: firstRes.errorMessage ?? "unknown", raw: { pages: [] } };
  }

  const rawPages: unknown[] = [firstRes.data];
  let first: NormalizedItemsResult<TourInfoItem>;
  try {
    first = parsePublicDataEnvelope(itemSchema, firstRes.data);
  } catch {
    const meta = extractResultMeta(firstRes.data);
    return {
      status: "ERROR",
      items: [],
      resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
      resultMsg: meta.resultMsg ?? "응답 구조가 예상과 달라 파싱하지 못함",
      raw: { pages: rawPages },
    };
  }
  const items = [...first.items];

  const totalCount =
    (firstRes.data as { response?: { body?: { totalCount?: number } } })?.response?.body?.totalCount ?? items.length;
  const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / ROWS_PER_PAGE));
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const res = await fetchPublicDataJson(buildUrl(params.baseUrl, params, pageNo), { sourceCode: "TOUR_INFO" });
    if (!res.ok) break;
    rawPages.push(res.data);
    try {
      items.push(...parsePublicDataEnvelope(itemSchema, res.data).items);
    } catch {
      break;
    }
  }

  return {
    status: items.length === 0 ? "EMPTY" : "SUCCESS",
    items,
    resultCode: first.resultCode,
    resultMsg: first.resultMsg,
    raw: { pages: rawPages },
  };
}
