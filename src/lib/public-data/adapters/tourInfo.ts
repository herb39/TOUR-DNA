import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

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

export async function fetchTourInfo(
  params: TourInfoParams,
): Promise<NormalizedItemsResult<TourInfoItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCode: params.areaCode,
    numOfRows: "100",
    pageNo: "1",
    _type: "json",
  });
  if (params.sigunguCode) qs.set("sigunguCode", params.sigunguCode);
  if (params.contentTypeId) qs.set("contentTypeId", params.contentTypeId);

  const url = `${params.baseUrl}/areaBasedList2?${qs.toString()}`;

  const res = await fetchPublicDataJson(url, { sourceCode: "TOUR_INFO" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
