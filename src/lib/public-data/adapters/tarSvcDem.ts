import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_지역별 관광 수요 강도 서비스 (AreaTarDemDsService).
 * 실 서비스키로 검증된 사항(2026-07-21):
 * - base: https://apis.data.go.kr/B551011/AreaTarDemDsService
 * - 체류 강도: /areaTarSjrnDsList — 다양성 API와 마찬가지로 코드 파라미터(tarSjrnDsIxCd)가 필수였다.
 *   `tarSjrnDsIxCd=2103`="1박 방문자수"로 확인(대전 유성구/제천/양양 3개 지역 전부 실제 값 확인).
 * - 소비 강도: /areaTarExpDsList — `tarExpDsIxCd=2201`="외지인 소비액"로 확인(3개 지역 전부 실제 값 확인).
 * - Swagger UI로 확인 결과(2026-07-21) 이 서비스에 등록된 오퍼레이션은 위 2개(체류/소비)가 전부다.
 *   "지역별 관광 수요 강도"라는 서비스명과 달리 이 서비스에는 별도의 범용 수요(Demand) 오퍼레이션이
 *   없다. `tarSvcDemIxVal`(METRIC_CODES.DEMAND_SERVICE)은 이후 확인 결과 이 서비스가 아니라
 *   AreaTarResDemService(TOU_RES_DEM, touResDem.ts)의 `/areaTarSvcDemList` 오퍼레이션에 있었다.
 * - 필수 파라미터: serviceKey, MobileOS, MobileApp, areaCd, signguCd, baseYm, (오퍼레이션별 코드 파라미터).
 *   JSON은 _type=json 필요(기본 XML).
 * - areaCd/signguCd는 통계청 행정표준코드 체계로 확인됨(AreaTarDivService와 동일 체계, 서울=11/구로구=11530 확인).
 * - 이전에 "totalCount=0"이었던 원인은 다양성 API와 동일하게 코드 파라미터 누락이었다(2026-07-21 확인).
 */

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  signguCd: z.string().nullable().optional(),
  baseYm: z.string(),
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

// 확인된 코드값: 2103="1박 방문자수"(체류 강도 프록시), 2201="외지인 소비액"(소비 강도 프록시).
const TAR_SJRN_DS_IX_CD = "2103";
const TAR_EXP_DS_IX_CD = "2201";

function buildUrl(
  baseUrl: string,
  operation: string,
  params: TarSvcDemParams,
  extra: Record<string, string>,
): string {
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
    ...extra,
  });
  return `${baseUrl}/${operation}?${qs.toString()}`;
}

export async function fetchTarSvcDem(params: TarSvcDemParams): Promise<AdapterResult> {
  const [stayRes, spendRes] = await Promise.all([
    fetchPublicDataJson(buildUrl(params.baseUrl, "areaTarSjrnDsList", params, { tarSjrnDsIxCd: TAR_SJRN_DS_IX_CD }), {
      sourceCode: "TAR_SVC_DEM:STAY",
    }),
    fetchPublicDataJson(buildUrl(params.baseUrl, "areaTarExpDsList", params, { tarExpDsIxCd: TAR_EXP_DS_IX_CD }), {
      sourceCode: "TAR_SVC_DEM:SPEND",
    }),
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
