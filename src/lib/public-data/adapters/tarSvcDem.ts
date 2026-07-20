import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 수요 강도 서비스 (AreaTarDemDsService).
 * 실 서비스키로 검증된 사항(2026-07-21):
 * - base: https://apis.data.go.kr/B551011/AreaTarDemDsService
 * - 체류 강도: /areaTarSjrnDsList (확인됨)
 * - 소비 강도: /areaTarExpDsList (확인됨)
 * - 수요 강도(tarSvcDemIxVal) 오퍼레이션명은 아직 미확인 — docs/public-api-status.md 참고.
 * - 필수 파라미터: serviceKey, MobileOS, MobileApp, areaCd, baseYm. JSON 응답은 _type=json 필요(기본 XML).
 * - areaCd는 통계청 행정표준코드 2자리 시도코드로 보인다(서울=11 확인). 시군구 단위 코드는 미확인.
 * - 지금까지 테스트한 모든 areaCd/baseYm 조합에서 totalCount=0 (resultCode는 0000/OK 정상) —
 *   해당 데이터셋에 아직 실제 데이터가 채워지지 않았을 가능성이 있다.
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

type AdapterResult =
  | NormalizedItemsResult<TarSvcDemItem>
  | { status: "ERROR"; items: []; resultCode: "NETWORK_ERROR"; resultMsg: string };

function buildUrl(baseUrl: string, operation: string, params: TarSvcDemParams): string {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd: params.areaCd,
    baseYm: params.baseYm,
    numOfRows: "100",
    pageNo: "1",
    _type: "json",
  });
  return `${baseUrl}/${operation}?${qs.toString()}`;
}

export async function fetchTarSvcDem(params: TarSvcDemParams): Promise<AdapterResult> {
  const [stayRes, spendRes] = await Promise.all([
    fetchPublicDataJson(buildUrl(params.baseUrl, "areaTarSjrnDsList", params), { sourceCode: "TAR_SVC_DEM:STAY" }),
    fetchPublicDataJson(buildUrl(params.baseUrl, "areaTarExpDsList", params), { sourceCode: "TAR_SVC_DEM:SPEND" }),
  ]);

  if (!stayRes.ok && !spendRes.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: stayRes.errorMessage ?? spendRes.errorMessage ?? "unknown",
    };
  }

  const items: TarSvcDemItem[] = [];
  let resultCode = "0000";
  let resultMsg = "OK";

  if (stayRes.ok) {
    const parsed = parsePublicDataEnvelope(itemSchema, stayRes.data);
    items.push(...parsed.items);
    resultCode = parsed.resultCode;
    resultMsg = parsed.resultMsg;
  }
  if (spendRes.ok) {
    const parsed = parsePublicDataEnvelope(itemSchema, spendRes.data);
    items.push(...parsed.items);
  }

  return { status: items.length === 0 ? "EMPTY" : "SUCCESS", items, resultCode, resultMsg };
}
