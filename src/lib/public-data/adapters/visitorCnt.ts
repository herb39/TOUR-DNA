import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope } from "../types";

/**
 * 한국관광공사_빅데이터 지역별 방문자수(DataLabService). 2026-07-28 신규 API 구조로 전면 재작성 —
 * 이전 baseUrl(data.go.kr 소개 페이지, HTML)이 실제 REST 게이트웨이가 아니었던 문제(docs/public-api-status.md
 * §5-A)를 해결하고, 실제 API 명세에 맞춰 어댑터를 다시 작성한다.
 *
 * - base: https://apis.data.go.kr/B551011/DataLabService
 * - 시군구 분석: GET /locgoRegnVisitrDDList (signguCode)
 * - 광역시도 분석: GET /metcoRegnVisitrDDList (areaCode)
 * - 공통 파라미터: serviceKey, numOfRows, pageNo, MobileOS=ETC, MobileApp=TOUR_DNA, startYmd, endYmd, _type=json.
 * - 이 API에는 지역 필터 파라미터가 없다 — 전국 응답을 일자별로 받아 signguCode/areaCode로 직접 매핑한다.
 * - touDivCd: 1=현지인, 2=외지인, 3=외국인. VISITOR_CNT(METRIC_CODES.VISITOR_CNT)는 외지인+외국인 합계로
 *   정의한다(방문자수 목적상 "그 지역 밖에서 온 사람"). 현지인 합계는 버리지 않고 VISITOR_CNT_LOCAL로
 *   별도 저장한다.
 * - touNum은 소수로 올 수 있어(빅데이터 추정치) 정수로 반올림하지 않고 number 그대로 합산한다.
 * - 월간 수치는 월간 순방문자수가 아니라 baseYmd(일자)별 값의 월간 합계다 — 같은 사람이 여러 날
 *   방문하면 중복 합산된다. 이는 원본 API 자체의 산출 방식이며 이 어댑터가 만들어내는 근사가 아니다.
 * - 광역시도 분석은 시군구 값을 합산하지 않고 metcoRegnVisitrDDList를 별도로 직접 호출한다(기초/광역
 *   집계 방식이 자체적으로 다를 수 있어, 우리가 합산으로 재구성하면 원본과 어긋날 수 있기 때문).
 */

const TOU_DIV_CD = { LOCAL: "1", OTHER_DOMESTIC: "2", FOREIGN: "3" } as const;

const locgoItemSchema = z.object({
  signguCode: z.string(),
  signguNm: z.string().optional(),
  daywkDivCd: z.string().optional(),
  daywkDivNm: z.string().optional(),
  touDivCd: z.string(),
  touDivNm: z.string().optional(),
  touNum: z.coerce.number(),
  baseYmd: z.string(),
});

const metcoItemSchema = z.object({
  areaCode: z.string(),
  areaNm: z.string().optional(),
  daywkDivCd: z.string().optional(),
  daywkDivNm: z.string().optional(),
  touDivCd: z.string(),
  touDivNm: z.string().optional(),
  touNum: z.coerce.number(),
  baseYmd: z.string(),
});

export type LocgoVisitrItem = z.infer<typeof locgoItemSchema>;
export type MetcoVisitrItem = z.infer<typeof metcoItemSchema>;

/** 지역 코드 하나(signguCode 또는 areaCode)로 집계한 방문자수. */
export interface VisitorAggregate {
  code: string;
  name: string | null;
  localNum: number;
  otherDomesticNum: number;
  foreignNum: number;
  /** 외지인 + 외국인. METRIC_CODES.VISITOR_CNT의 원값. */
  visitorCnt: number;
  /** 이 코드에 해당하는 실제 원본 응답 행(가공 없이 그대로) — DataSnapshot.rawPayload에 지역별로 저장한다. */
  rawItems: Array<Record<string, unknown>>;
}

export type VisitorCntFetchResult =
  | {
      status: "SUCCESS" | "EMPTY";
      byCode: Map<string, VisitorAggregate>;
      resultCode: string;
      resultMsg: string;
      /** 실제로 받은 페이지 원문들(있는 경우만) — 지역별 DataSnapshot 저장 시 해당 지역 행만 추려 쓴다. */
      rawPages: unknown[];
    }
  | { status: "ERROR"; byCode: null; resultCode: string; resultMsg: string; rawPages: unknown[] };

export interface VisitorCntParams {
  serviceKey: string;
  baseUrl: string;
  /** YYYYMM. 해당 월의 1일~말일로 startYmd/endYmd를 계산한다. */
  baseYm: string;
}

const NUM_OF_ROWS = 1000;
/** 페이지네이션 버그(예: totalCount 오응답)로 무한 루프에 빠지지 않기 위한 방어적 상한. */
const MAX_PAGES = 500;

export function monthToYmdRange(baseYm: string): { startYmd: string; endYmd: string } {
  const year = Number(baseYm.slice(0, 4));
  const month = Number(baseYm.slice(4, 6));
  const lastDay = new Date(year, month, 0).getDate();
  return { startYmd: `${baseYm}01`, endYmd: `${baseYm}${String(lastDay).padStart(2, "0")}` };
}

function buildUrl(
  baseUrl: string,
  operation: string,
  params: VisitorCntParams,
  pageNo: number,
): string {
  const { startYmd, endYmd } = monthToYmdRange(params.baseYm);
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TOUR_DNA",
    startYmd,
    endYmd,
    numOfRows: String(NUM_OF_ROWS),
    pageNo: String(pageNo),
    _type: "json",
  });
  return `${baseUrl}/${operation}?${qs.toString()}`;
}

function aggregate<T extends { touDivCd: string; touNum: number }>(
  items: T[],
  codeOf: (item: T) => string,
  nameOf: (item: T) => string | undefined,
): Map<string, VisitorAggregate> {
  const byCode = new Map<string, VisitorAggregate>();
  for (const item of items) {
    const code = codeOf(item);
    let agg = byCode.get(code);
    if (!agg) {
      agg = { code, name: nameOf(item) ?? null, localNum: 0, otherDomesticNum: 0, foreignNum: 0, visitorCnt: 0, rawItems: [] };
      byCode.set(code, agg);
    }
    if (agg.name === null) {
      const name = nameOf(item);
      if (name) agg.name = name;
    }
    if (item.touDivCd === TOU_DIV_CD.LOCAL) agg.localNum += item.touNum;
    else if (item.touDivCd === TOU_DIV_CD.OTHER_DOMESTIC) agg.otherDomesticNum += item.touNum;
    else if (item.touDivCd === TOU_DIV_CD.FOREIGN) agg.foreignNum += item.touNum;
    agg.rawItems.push(item as unknown as Record<string, unknown>);
  }
  for (const agg of byCode.values()) {
    agg.visitorCnt = agg.otherDomesticNum + agg.foreignNum;
  }
  return byCode;
}

/**
 * 전국 응답을 첫 페이지부터 totalCount/numOfRows 기준으로 모든 페이지를 조회한다. 중간 페이지 하나라도
 * 실패하면(네트워크 오류·파싱 실패) 이미 받은 페이지가 있어도 전체를 ERROR로 취급한다 — 불완전한 월간
 * 합계를 SUCCESS로 잘못 기록해 기존 정상 스냅샷을 덮어쓰는 것을 막기 위해서다.
 */
async function fetchAllPages<T>(
  operation: string,
  params: VisitorCntParams,
  schema: z.ZodType<T>,
  sourceCode: string,
): Promise<
  | { status: "SUCCESS" | "EMPTY"; items: T[]; resultCode: string; resultMsg: string; rawPages: unknown[] }
  | { status: "ERROR"; items: []; resultCode: string; resultMsg: string; rawPages: unknown[] }
> {
  const firstRes = await fetchPublicDataJson(buildUrl(params.baseUrl, operation, params, 1), { sourceCode });
  if (!firstRes.ok) {
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: firstRes.errorMessage ?? "unknown", rawPages: [] };
  }

  let firstParsed;
  try {
    firstParsed = parsePublicDataEnvelope(schema, firstRes.data);
  } catch {
    const meta = extractResultMeta(firstRes.data);
    return {
      status: "ERROR",
      items: [],
      resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
      resultMsg: meta.resultMsg ?? "응답 구조가 예상과 달라 파싱하지 못함",
      rawPages: [firstRes.data],
    };
  }

  const rawPages: unknown[] = [firstRes.data];
  if (firstParsed.status === "ERROR" || firstParsed.status === "EMPTY") {
    return { status: firstParsed.status, items: [], resultCode: firstParsed.resultCode, resultMsg: firstParsed.resultMsg, rawPages };
  }

  const items = [...firstParsed.items];
  const requiredPages = Math.max(1, Math.ceil((firstParsed.totalCount ?? 0) / NUM_OF_ROWS));
  if (requiredPages > MAX_PAGES) {
    // MAX_PAGES까지만 받고 SUCCESS로 반환하면 나머지 페이지의 데이터가 빠진 채 "완전한 응답"인 것처럼
    // 보일 수 있다 — 부분 합계를 SUCCESS로 잘못 저장하지 않도록 명확한 ERROR로 처리한다.
    return {
      status: "ERROR",
      items: [],
      resultCode: "TOO_MANY_PAGES",
      resultMsg: `totalCount=${firstParsed.totalCount ?? 0}건은 페이지 ${requiredPages}개가 필요해 안전 상한(${MAX_PAGES})을 초과함 — 부분 데이터를 저장하지 않기 위해 중단`,
      rawPages: [firstRes.data],
    };
  }
  const totalPages = requiredPages;

  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const res = await fetchPublicDataJson(buildUrl(params.baseUrl, operation, params, pageNo), { sourceCode });
    if (!res.ok) {
      return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: res.errorMessage ?? "unknown", rawPages };
    }
    try {
      const parsed = parsePublicDataEnvelope(schema, res.data);
      rawPages.push(res.data);
      if (parsed.status === "ERROR") {
        return { status: "ERROR", items: [], resultCode: parsed.resultCode, resultMsg: parsed.resultMsg, rawPages };
      }
      items.push(...parsed.items);
    } catch {
      const meta = extractResultMeta(res.data);
      rawPages.push(res.data);
      return {
        status: "ERROR",
        items: [],
        resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
        resultMsg: meta.resultMsg ?? "응답 구조가 예상과 달라 파싱하지 못함",
        rawPages,
      };
    }
  }

  return { status: "SUCCESS", items, resultCode: firstParsed.resultCode, resultMsg: firstParsed.resultMsg, rawPages };
}

/** 시군구 분석(locgoRegnVisitrDDList) — signguCode로 매핑한다. */
export async function fetchLocgoRegnVisitr(params: VisitorCntParams): Promise<VisitorCntFetchResult> {
  const res = await fetchAllPages("locgoRegnVisitrDDList", params, locgoItemSchema, "VISITOR_CNT:locgo");
  if (res.status === "ERROR") {
    return { status: "ERROR", byCode: null, resultCode: res.resultCode, resultMsg: res.resultMsg, rawPages: res.rawPages };
  }
  const byCode = aggregate(res.items, (i) => i.signguCode, (i) => i.signguNm);
  return { status: res.status, byCode, resultCode: res.resultCode, resultMsg: res.resultMsg, rawPages: res.rawPages };
}

/** 광역시도 분석(metcoRegnVisitrDDList) — areaCode로 매핑한다. 시군구 값을 합산하지 않는다. */
export async function fetchMetcoRegnVisitr(params: VisitorCntParams): Promise<VisitorCntFetchResult> {
  const res = await fetchAllPages("metcoRegnVisitrDDList", params, metcoItemSchema, "VISITOR_CNT:metco");
  if (res.status === "ERROR") {
    return { status: "ERROR", byCode: null, resultCode: res.resultCode, resultMsg: res.resultMsg, rawPages: res.rawPages };
  }
  const byCode = aggregate(res.items, (i) => i.areaCode, (i) => i.areaNm);
  return { status: res.status, byCode, resultCode: res.resultCode, resultMsg: res.resultMsg, rawPages: res.rawPages };
}
