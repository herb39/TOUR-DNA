import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 자원 수요 (AreaTarResDemService).
 * 실 서비스키로 확인된 사항(2026-07-21, 사용자 제공 예시로 검증):
 * - base: https://apis.data.go.kr/B551011/AreaTarResDemService
 * - /areaTarSvcDemList(관광 서비스 수요): tarSvcDemIxCd 파라미터 필요. 확인된 코드 "1101"="레포츠여행유형
 *   SNS언급량". 대전 유성구/제천/양양 3개 지역 전부 실제 값 확인.
 *   ⚠️ 이 필드(tarSvcDemIxVal)가 METRIC_CODES.DEMAND_SERVICE의 진짜 출처였다 — 예전에는
 *   AreaTarDemDsService(체류/소비 강도 서비스) 쪽에서 찾고 있었는데, 실제로는 이 서비스(자원 수요
 *   서비스) 소속이었다. syncService.ts에서 이 값을 METRIC_CODES.DEMAND_SERVICE로 저장한다.
 * - /areaCulResDemList(문화 자원 수요): 코드 파라미터명은 `culResDemIxCd`로 확인됨(다른 이름을 쓰면
 *   INVALID_REQUEST_PARAMETER_ERROR 발생, `culResDemIxCd`는 에러 없이 수락됨). 하지만 유효한 코드값을
 *   찾지 못했다(1101, 1102~1110 등 다수 시도, 전부 0건) — Swagger UI로 전체 코드 목록 확인 필요.
 *   METRIC_CODES.DEMAND_RESOURCE(touResDemIxVal)의 실제 출처일 가능성이 높지만, 유효 코드 확인
 *   전까지는 호출하지 않는다(추측성 호출은 하지 않음).
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  signguCd: z.string().nullable().optional(),
  baseYm: z.string(),
  tarSvcDemIxCd: z.string().optional(),
  tarSvcDemIxVal: z.coerce.number().optional(),
});

export type TouResDemItem = z.infer<typeof itemSchema>;

export interface TouResDemParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  signguCd: string;
  baseYm: string;
}

const TAR_SVC_DEM_IX_CD = "1101";

type AdapterResult =
  | (NormalizedItemsResult<TouResDemItem> & { raw: unknown })
  | { status: "ERROR"; items: []; resultCode: string; resultMsg: string; raw: unknown };

export async function fetchTouResDem(params: TouResDemParams): Promise<AdapterResult> {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd: params.areaCd,
    signguCd: params.signguCd,
    baseYm: params.baseYm,
    tarSvcDemIxCd: TAR_SVC_DEM_IX_CD,
    numOfRows: "10",
    pageNo: "1",
    _type: "json",
  });
  const url = `${params.baseUrl}/areaTarSvcDemList?${qs.toString()}`;

  const res = await fetchPublicDataJson(url, { sourceCode: "TOU_RES_DEM:SVC" });
  if (!res.ok) {
    // 네트워크/timeout 등으로 실제 응답 본문 자체가 없다 — raw는 null(지어내지 않음).
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown", raw: null };
  }
  // 실제 본문은 받았다(res.ok) — 표준 envelope과 다른 구조(예: response 래퍼 없는 에러 응답)일 수 있으므로
  // 파싱 실패를 크래시로 두지 않고, 그 안에 실제로 있는 resultCode/resultMsg만 읽어 ERROR로 처리한다.
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
