import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_빅데이터_지역별 방문자수_GW (data.go.kr/data/15101972/openapi.do).
 * ⚠️ 미확인 사항: docs/public-api-status.md 참고.
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  baseYm: z.string(),
  touDownNum: z.coerce.number().optional(),
  visitorCnt: z.coerce.number().optional(),
});

export type VisitorCntItem = z.infer<typeof itemSchema>;

export interface VisitorCntParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  baseYm: string;
}

export async function fetchVisitorCnt(
  params: VisitorCntParams,
): Promise<NormalizedItemsResult<VisitorCntItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCd=${encodeURIComponent(params.areaCd)}&baseYm=${encodeURIComponent(params.baseYm)}&numOfRows=100&pageNo=1&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "VISITOR_CNT" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
