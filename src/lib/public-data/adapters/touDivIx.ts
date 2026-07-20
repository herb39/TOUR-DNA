import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 다양성 (data.go.kr/data/15151365/openapi.do).
 * ⚠️ 미확인 사항: docs/public-api-status.md 참고.
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  baseYm: z.string(),
  touDivIxCd: z.string().optional(),
  touDivIxVal: z.coerce.number().optional(),
});

export type TouDivIxItem = z.infer<typeof itemSchema>;

export interface TouDivIxParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  baseYm: string;
}

export async function fetchTouDivIx(
  params: TouDivIxParams,
): Promise<NormalizedItemsResult<TouDivIxItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCd=${encodeURIComponent(params.areaCd)}&baseYm=${encodeURIComponent(params.baseYm)}&numOfRows=100&pageNo=1&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "TOU_DIV_IX" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
