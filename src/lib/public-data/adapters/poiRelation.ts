import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 기초지자체 중심 관광지 및 연관 관광지.
 * ⚠️ 정식 서비스명, data.go.kr 페이지, baseUrl이 모두 미확인 상태다(docs/public-api-status.md).
 * DataSource.baseUrl이 "미확인"인 동안에는 sync 단계에서 이 어댑터 호출을 건너뛴다.
 */

const itemSchema = z.object({
  centerContentId: z.string().optional(),
  relatedContentId: z.string().optional(),
  relationType: z.string().optional(),
  distance: z.coerce.number().optional(),
});

export type PoiRelationItem = z.infer<typeof itemSchema>;

export interface PoiRelationParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
}

export async function fetchPoiRelation(
  params: PoiRelationParams,
): Promise<NormalizedItemsResult<PoiRelationItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  if (params.baseUrl === "미확인" || !params.baseUrl) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: "baseUrl 미확인 — 실 서비스키/문서 확인 필요" };
  }
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCd=${encodeURIComponent(params.areaCd)}&numOfRows=100&pageNo=1&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "POI_RELATION" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
