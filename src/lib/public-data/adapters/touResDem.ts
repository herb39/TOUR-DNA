import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 자원 수요 (data.go.kr/data/15152138/openapi.do).
 * ⚠️ 미확인 사항: docs/public-api-status.md 참고.
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  baseYm: z.string(),
  touResDemIxVal: z.coerce.number().optional(),
});

export type TouResDemItem = z.infer<typeof itemSchema>;

export interface TouResDemParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  baseYm: string;
}

export async function fetchTouResDem(
  params: TouResDemParams,
): Promise<NormalizedItemsResult<TouResDemItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCd=${encodeURIComponent(params.areaCd)}&baseYm=${encodeURIComponent(params.baseYm)}&numOfRows=100&pageNo=1&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "TOU_RES_DEM" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
