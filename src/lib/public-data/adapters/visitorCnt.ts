import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

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

type AdapterResult =
  | (NormalizedItemsResult<VisitorCntItem> & { raw: unknown })
  | { status: "ERROR"; items: []; resultCode: string; resultMsg: string; raw: unknown };

export async function fetchVisitorCnt(params: VisitorCntParams): Promise<AdapterResult> {
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCd=${encodeURIComponent(params.areaCd)}&baseYm=${encodeURIComponent(params.baseYm)}&numOfRows=100&pageNo=1&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "VISITOR_CNT" });
  if (!res.ok) {
    // 네트워크/timeout 등으로 실제 응답 본문 자체가 없다 — raw는 null(지어내지 않음).
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown", raw: null };
  }
  try {
    const parsed = parsePublicDataEnvelope(itemSchema, res.data);
    return { ...parsed, raw: res.data };
  } catch {
    const meta = extractResultMeta(res.data);
    return {
      status: "ERROR",
      items: [],
      resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
      resultMsg: meta.resultMsg ?? "응답 구조가 예상과 달라 파싱하지 못함",
      raw: res.data,
    };
  }
}
