import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 다양성 서비스 (AreaTarDivService).
 * 실 서비스키로 확인된 사항(2026-07-21):
 * - base: https://apis.data.go.kr/B551011/AreaTarDivService
 * - 오퍼레이션 3종: /areaTouDivList(관광객 다양성, 데이터 확인됨) / /areaExpDivList(관광 소비 다양성) /
 *   /areaIntlDivList(국제적 다양성) — 뒤 두 개는 실제 코드 파라미터 없이 호출은 성공(0건)하나 세부 코드
 *   파라미터명은 아직 미확인(`touDivIxCd`를 붙이면 `INVALID_REQUEST_PARAMETER_ERROR(touDivIxCd)` 발생 —
 *   즉 이 두 오퍼레이션은 다른 이름의 코드 파라미터를 쓴다).
 * - 필수 파라미터: serviceKey, MobileOS, MobileApp, areaCd(시도 2자리), signguCd(시군구 5자리), baseYm.
 * - areaTouDivList의 touDivIxCd: 연령대 등 세부 유형별 코드(예: "3103"="30대 방문객수" 확인됨). 전체
 *   코드 목록은 Swagger UI 확인 필요 — 현재는 확인된 "3103"만 기본값으로 사용한다.
 * - 에러 응답은 성공 응답과 다른 최상위 구조(`{resultCode, resultMsg}`, response 래퍼 없음)로 온다 —
 *   오퍼레이션별로 개별 파싱해 하나가 실패해도 나머지는 반영되도록 처리한다.
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  signguCd: z.string().nullable().optional(),
  baseYm: z.string(),
  touDivIxCd: z.string().optional(),
  touDivIxNm: z.string().optional(),
  touDivIxVal: z.coerce.number().optional(),
});

export type TouDivIxItem = z.infer<typeof itemSchema>;

export interface TouDivIxParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  signguCd: string;
  baseYm: string;
  /** areaTouDivList 전용. 확인된 기본값 "3103"(30대 방문객수). */
  touDivIxCd?: string;
}

interface OperationSpec {
  path: string;
  /** 이 오퍼레이션에 코드 파라미터(touDivIxCd)를 붙일지 여부. */
  useCode: boolean;
}

const OPERATIONS: OperationSpec[] = [
  { path: "areaTouDivList", useCode: true },
  { path: "areaExpDivList", useCode: false },
  { path: "areaIntlDivList", useCode: false },
];

function buildUrl(baseUrl: string, spec: OperationSpec, params: TouDivIxParams): string {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd: params.areaCd,
    signguCd: params.signguCd,
    baseYm: params.baseYm,
    numOfRows: "100",
    pageNo: "1",
    _type: "json",
  });
  if (spec.useCode) qs.set("touDivIxCd", params.touDivIxCd ?? "3103");
  return `${baseUrl}/${spec.path}?${qs.toString()}`;
}

export async function fetchTouDivIx(
  params: TouDivIxParams,
): Promise<NormalizedItemsResult<TouDivIxItem> | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string }> {
  const results = await Promise.all(
    OPERATIONS.map((spec) => fetchPublicDataJson(buildUrl(params.baseUrl, spec, params), { sourceCode: `TOU_DIV_IX:${spec.path}` })),
  );

  const items: TouDivIxItem[] = [];
  let resultCode = "0000";
  let resultMsg = "OK";
  let anyOk = false;

  for (const res of results) {
    if (!res.ok) continue;
    try {
      const parsed = parsePublicDataEnvelope(itemSchema, res.data);
      items.push(...parsed.items);
      resultCode = parsed.resultCode;
      resultMsg = parsed.resultMsg;
      anyOk = true;
    } catch {
      // 개별 오퍼레이션 응답이 예상 스키마와 다르면(예: 파라미터 에러의 다른 응답 구조) 이 오퍼레이션만 건너뛴다.
      continue;
    }
  }

  if (!anyOk) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: "모든 오퍼레이션 호출/파싱 실패" };
  }

  return { status: items.length === 0 ? "EMPTY" : "SUCCESS", items, resultCode, resultMsg };
}
