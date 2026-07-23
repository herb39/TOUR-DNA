import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { parsePublicDataEnvelope } from "../types";

/**
 * 한국관광공사_지역별 관광 다양성 서비스 (AreaTarDivService).
 * 실 서비스키로 확인된 사항(2026-07-21, 사용자가 Swagger 예시로 코드 체계 전체를 확인해줌):
 * - base: https://apis.data.go.kr/B551011/AreaTarDivService
 * - /areaTouDivList(관광객 다양성): touDivIxCd 3101~3106 = 10대~60대 방문객수 지수(연령대별 6종 전부 확인).
 * - /areaExpDivList(관광 소비 다양성): expDivIxCd 3201~3206 = 10대~60대 소비액 지수(연령대별 6종 전부 확인).
 * - /areaIntlDivList(국제적 다양성): intlDivIxCd 3301=외국인 소비액, 3302=외국인 방문자수,
 *   3303=외국인 방문객 국적 다양성(이미 그 자체로 다양성 지수).
 * - 필수 파라미터: serviceKey, MobileOS, MobileApp, areaCd(시도 2자리), signguCd(시군구 5자리), baseYm.
 * - 에러 응답은 성공 응답과 다른 최상위 구조(`{resultCode, resultMsg}`, response 래퍼 없음)로 온다 —
 *   오퍼레이션/코드별로 개별 파싱해 하나가 실패해도 나머지는 반영되도록 처리한다.
 *
 * ## 종합 다양성 점수 재계산 로직
 * touDivIxCd/expDivIxCd 각각은 "특정 연령대 하나"의 단일 지표라 그 자체로는 종합 다양성 점수가 아니다
 * (예: touDivIxCd=3103 하나만 쓰면 "30대 방문객수"일 뿐 "다양성"이 아님). 우리 도메인이 기대하는
 * "다양성(여러 연령/국적에 걸친 고른 분포)"을 만들기 위해, 연령대 6종의 변동계수(CV=표준편차/평균)가
 * 낮을수록(=연령대별로 고르게 분포할수록) 다양성이 높다고 보고 `evenness = clamp(100*(1-CV), 0, 100)`로
 * 변환한다. 방문객 연령 다양성(touDivIxCd 6종)·소비 연령 다양성(expDivIxCd 6종)·국적 다양성(intlDivIxCd
 * 3303, 이미 지수화됨) 3개를 단순 평균한 값을 최종 `touDivIxVal`(METRIC_CODES.DIVERSITY)로 저장한다.
 * 이 산식은 공공데이터가 제공하는 "공식" 다양성 점수가 아니라 우리가 원자료로부터 도출한 자체 방법론이다
 * (docs/scoring-model.md 참고).
 */

const touItemSchema = z.object({
  touDivIxCd: z.string().optional(),
  touDivIxVal: z.coerce.number().optional(),
});
const expItemSchema = z.object({
  expDivIxCd: z.string().optional(),
  expDivIxVal: z.coerce.number().optional(),
});
const intlItemSchema = z.object({
  intlDivIxCd: z.string().optional(),
  intlDivIxVal: z.coerce.number().optional(),
});

export interface TouDivIxParams {
  serviceKey: string;
  baseUrl: string;
  areaCd: string;
  signguCd: string;
  baseYm: string;
}

const TOU_DIV_CODES = ["3101", "3102", "3103", "3104", "3105", "3106"];
const EXP_DIV_CODES = ["3201", "3202", "3203", "3204", "3205", "3206"];
const INTL_DIV_CODE_NATIONALITY = "3303"; // "외국인 방문객 국적 다양성" — 이미 그 자체로 다양성 지수

export interface DiversityBreakdown {
  visitorAgeEvenness: number | null;
  spendAgeEvenness: number | null;
  nationalityDiversity: number | null;
  composite: number | null;
}

function evenness(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.min(100, Math.max(0, 100 * (1 - cv)));
}

function buildUrl(baseUrl: string, path: string, code: string, codeParam: string, params: TouDivIxParams): string {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd: params.areaCd,
    signguCd: params.signguCd,
    baseYm: params.baseYm,
    numOfRows: "10",
    pageNo: "1",
    _type: "json",
    [codeParam]: code,
  });
  return `${baseUrl}/${path}?${qs.toString()}`;
}

interface CodeFetchResult {
  value: number | null;
  /** 실제로 받은 원본 응답(있는 경우만) — 네트워크 실패 등으로 본문 자체가 없으면 null(지어내지 않음). */
  raw: unknown;
}

async function fetchCode<T extends { [k: string]: unknown }>(
  url: string,
  sourceCode: string,
  schema: z.ZodType<T>,
  valueKey: keyof T,
): Promise<CodeFetchResult> {
  const res = await fetchPublicDataJson(url, { sourceCode });
  if (!res.ok) return { value: null, raw: null };
  try {
    const parsed = parsePublicDataEnvelope(schema, res.data);
    const value = parsed.items[0]?.[valueKey];
    return { value: typeof value === "number" ? value : null, raw: res.data };
  } catch {
    // 예상과 다른 응답 구조(예: 에러 전용 플랫 구조)여도 실제로 받은 본문은 raw로 보존한다.
    return { value: null, raw: res.data };
  }
}

/** 13개(연령대 6+6, 국적 1) 코드 호출에서 실제로 받은 원본 응답들. 지어내지 않고 받은 것만 담는다. */
export interface TouDivIxRaw {
  tou: Array<{ code: string; data: unknown }>;
  exp: Array<{ code: string; data: unknown }>;
  intl: { code: string; data: unknown };
}

export type TouDivIxResult =
  | { status: "SUCCESS" | "EMPTY"; composite: number | null; breakdown: DiversityBreakdown; itemCount: number; raw: TouDivIxRaw }
  | { status: "ERROR"; composite: null; breakdown: null; resultMsg: string; itemCount: 0; raw: TouDivIxRaw };

/** 연령대별 방문객/소비 다양성 + 국적 다양성을 모두 조회해 종합 다양성 점수를 계산한다. */
export async function fetchTouDivIx(params: TouDivIxParams): Promise<TouDivIxResult> {
  const [touVals, expVals, intlVal] = await Promise.all([
    Promise.all(
      TOU_DIV_CODES.map((code) =>
        fetchCode(buildUrl(params.baseUrl, "areaTouDivList", code, "touDivIxCd", params), "TOU_DIV_IX:tou", touItemSchema, "touDivIxVal"),
      ),
    ),
    Promise.all(
      EXP_DIV_CODES.map((code) =>
        fetchCode(buildUrl(params.baseUrl, "areaExpDivList", code, "expDivIxCd", params), "TOU_DIV_IX:exp", expItemSchema, "expDivIxVal"),
      ),
    ),
    fetchCode(
      buildUrl(params.baseUrl, "areaIntlDivList", INTL_DIV_CODE_NATIONALITY, "intlDivIxCd", params),
      "TOU_DIV_IX:intl",
      intlItemSchema,
      "intlDivIxVal",
    ),
  ]);

  const raw: TouDivIxRaw = {
    tou: TOU_DIV_CODES.map((code, i) => ({ code, data: touVals[i].raw })),
    exp: EXP_DIV_CODES.map((code, i) => ({ code, data: expVals[i].raw })),
    intl: { code: INTL_DIV_CODE_NATIONALITY, data: intlVal.raw },
  };

  const validTou = touVals.map((v) => v.value).filter((v): v is number => v !== null);
  const validExp = expVals.map((v) => v.value).filter((v): v is number => v !== null);
  const intlValue = intlVal.value;
  const itemCount = validTou.length + validExp.length + (intlValue !== null ? 1 : 0);

  if (validTou.length === 0 && validExp.length === 0 && intlValue === null) {
    return { status: "ERROR", composite: null, breakdown: null, resultMsg: "모든 코드 호출/파싱 실패", itemCount: 0, raw };
  }

  const visitorAgeEvenness = evenness(validTou);
  const spendAgeEvenness = evenness(validExp);
  const nationalityDiversity = intlValue;

  const subScores = [visitorAgeEvenness, spendAgeEvenness, nationalityDiversity].filter(
    (v): v is number => v !== null,
  );
  const rawComposite = subScores.length > 0 ? subScores.reduce((s, v) => s + v, 0) / subScores.length : null;
  const composite = rawComposite === null ? null : Math.round(rawComposite * 100) / 100;

  return {
    status: composite === null ? "EMPTY" : "SUCCESS",
    composite,
    breakdown: { visitorAgeEvenness, spendAgeEvenness, nationalityDiversity, composite },
    itemCount,
    raw,
  };
}
