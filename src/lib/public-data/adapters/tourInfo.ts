import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_국문 관광정보 서비스_GW (TourAPI 4.0 계열, data.go.kr/data/15101578).
 * 관광지/음식점/숙박/체험 등 POI 상세정보. contentTypeId로 카테고리를 구분한다(문서 관행상 추정치,
 * 실 서비스키로 재검증 필요 — docs/public-api-status.md).
 */

const itemSchema = z.object({
  contentid: z.string().optional(),
  contenttypeid: z.string().optional(),
  title: z.string(),
  addr1: z.string().optional(),
  mapx: z.coerce.number().optional(),
  mapy: z.coerce.number().optional(),
  usetime: z.string().optional(),
  restdate: z.string().optional(),
});

export type TourInfoItem = z.infer<typeof itemSchema>;

export interface TourInfoParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  sigunguCd?: string;
}

export async function fetchTourInfo(
  params: TourInfoParams,
): Promise<NormalizedItemsResult<TourInfoItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const sigungu = params.sigunguCd ? `&sigunguCode=${encodeURIComponent(params.sigunguCd)}` : "";
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCode=${encodeURIComponent(params.areaCd)}${sigungu}&numOfRows=100&pageNo=1&MobileOS=ETC&MobileApp=TourDNA&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "TOUR_INFO" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
