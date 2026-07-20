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
 * - 필수 파라미터: serviceKey, MobileOS, MobileApp, areaCd, signguCd, baseYm. JSON은 _type=json 필요(기본 XML).
 * - areaCd/signguCd는 통계청 행정표준코드 체계로 확인됨(AreaTarDivService와 동일 체계, 서울=11/구로구=11530 확인).
 * - ⚠️ areaCd+signguCd+baseYm 조합(대전 유성구 등 다수 시도)에서도 totalCount=0 (resultCode는 0000/OK 정상) —
 *   같은 계열의 AreaTarDivService는 정상적으로 데이터가 나오는 것과 대조적. 이 데이터셋 자체가 아직
 *   비어있거나 우리가 모르는 추가 파라미터가 필요할 수 있다(docs/public-api-status.md).
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  signguCd: z.string().nullable().optional(),
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
  signguCd: string;
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
    signguCd: params.signguCd,
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
    try {
      const parsed = parsePublicDataEnvelope(itemSchema, stayRes.data);
      items.push(...parsed.items);
      resultCode = parsed.resultCode;
      resultMsg = parsed.resultMsg;
    } catch {
      // 예상과 다른 응답 구조(예: 파라미터 에러)면 이 오퍼레이션만 건너뛴다.
    }
  }
  if (spendRes.ok) {
    try {
      const parsed = parsePublicDataEnvelope(itemSchema, spendRes.data);
      items.push(...parsed.items);
    } catch {
      // 위와 동일
    }
  }

  return { status: items.length === 0 ? "EMPTY" : "SUCCESS", items, resultCode, resultMsg };
}
