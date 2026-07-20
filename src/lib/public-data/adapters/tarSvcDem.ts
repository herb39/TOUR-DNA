import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 수요 강도 (data.go.kr/data/15151868/openapi.do).
 *
 * ⚠️ 미확인 사항 (docs/public-api-status.md 참고): 정확한 오퍼레이션 경로, `tarSvcDemIxCd`/`tarSvcDemIxVal`
 * 등 필드명은 실 서비스키 발급 전까지 검증되지 않은 후보값이다. 실제 응답 구조가 다르면 이 파일의
 * itemSchema와 요청 파라미터만 수정하면 된다 (도메인 엔진은 이 값에 의존하지 않는다).
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  baseYm: z.string(),
  tarSvcDemIxCd: z.string().optional(),
  tarSvcDemIxVal: z.coerce.number().optional(),
  tarSjrnDsIxCd: z.string().optional(),
  tarSjrnDsIxVal: z.coerce.number().optional(),
  tarExpDsIxCd: z.string().optional(),
  tarExpDsIxVal: z.coerce.number().optional(),
});

export type TarSvcDemItem = z.infer<typeof itemSchema>;

export interface TarSvcDemParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  baseYm: string;
}

export async function fetchTarSvcDem(
  params: TarSvcDemParams,
): Promise<NormalizedItemsResult<TarSvcDemItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const url = `${params.baseUrl}?serviceKey=${encodeURIComponent(params.serviceKey)}&areaCd=${encodeURIComponent(params.areaCd)}&baseYm=${encodeURIComponent(params.baseYm)}&numOfRows=100&pageNo=1&_type=json`;

  const res = await fetchPublicDataJson(url, { sourceCode: "TAR_SVC_DEM" });
  if (!res.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown" };
  }
  return parsePublicDataEnvelope(itemSchema, res.data);
}
