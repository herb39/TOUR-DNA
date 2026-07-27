import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_빅데이터_지역별 방문자수_GW (data.go.kr/data/15101972/openapi.do).
 * ⚠️ 확인된 결함(2026-07-27): `DataSource.baseUrl`(src/lib/fixtures/dataSources.ts)이 실제 REST
 * 게이트웨이가 아니라 공공데이터포털의 소개 페이지(HTML)를 가리키고 있다 — 그 결과 이 어댑터는 매번
 * HTML 응답을 받아 JSON 파싱에 실패한다(운영 동기화 오류 로그로 실측 확인). `fetchPublicDataJson`
 * (client.ts)이 이 실패를 `classifyNonJsonBody()`로 "HTML"로 분류해 즉시 중단(불필요한 재시도 방지)
 * 하고, 이 함수는 그 결과를 그대로 ERROR로 반환한다 — syncService.ts가 기존 SUCCESS 스냅샷(2026-07-21)을
 * 보존하므로 서비스에는 영향 없다. 실제 게이트웨이 주소는 Swagger 문서 확인 없이 추측해 넣지 않는다
 * (docs/public-api-status.md 참고).
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
