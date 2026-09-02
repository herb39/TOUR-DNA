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

export const TOU_DIV_CODES = ["3101", "3102", "3103", "3104", "3105", "3106"] as const;
export const EXP_DIV_CODES = ["3201", "3202", "3203", "3204", "3205", "3206"] as const;
export const INTL_DIV_CODE_NATIONALITY = "3303" as const; // "외국인 방문객 국적 다양성" — 이미 그 자체로 다양성 지수
export const TOU_DIV_REQUIRED_CODES = [
  ...TOU_DIV_CODES,
  ...EXP_DIV_CODES,
  INTL_DIV_CODE_NATIONALITY,
] as const;

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
  /** 이 코드 하나의 호출/파싱이 실제로 정상 완료됐는지(값의 유무와 무관) — 네트워크 실패나 예상 밖
   * 응답 구조로 진짜 실패한 경우만 false. 공공데이터포털이 정상 응답(resultCode=0000)했지만 단순히
   * 그 코드에 해당하는 값이 없는 경우(items가 빈 문자열)는 파싱 자체는 성공한 것이라 true다(2026-08-10
   * 버그 수정 — 이 구분이 없어 "13개 코드 모두 정상 호출·EMPTY"인 신설 행정구역까지 무조건 ERROR로
   * 오분류해, 매 배치 실행마다 불필요하게 재호출 대상으로 남는 문제가 있었다). */
  ok: boolean;
  /** 호출 자체가 실패했을 때(ok=false) 실제 원인 문구(예: "HTTP 429") — quota/rate-limit 감지
   * (`isQuotaOrRateLimitSignal`, syncService.ts)가 이 문구를 검사한다(2026-08-10 버그 수정). 이 필드가
   * 없던 이전 버전은 quota 초과로 대량 429가 발생해도 이를 감지하지 못해 배치가 멈추지 않는 문제가
   * 있었다 — 실제로 baseYm=202606 3차 배치에서 TOU_DIV_IX가 1,566회의 HTTP 429를 받고도
   * `stoppedDueToQuota: false`로 끝까지 진행된 것으로 재현·확인됨. ok=true(정상 호출)면 항상 undefined.
   */
  errorMessage?: string;
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
  if (!res.ok) return { value: null, ok: false, errorMessage: res.errorMessage, raw: null };
  try {
    const parsed = parsePublicDataEnvelope(schema, res.data);
    const value = parsed.items[0]?.[valueKey];
    return { value: typeof value === "number" ? value : null, ok: true, raw: res.data };
  } catch {
    // 예상과 다른 응답 구조(예: 에러 전용 플랫 구조)여도 실제로 받은 본문은 raw로 보존한다.
    return { value: null, ok: false, errorMessage: "예상과 다른 응답 구조(파싱 실패)", raw: res.data };
  }
}

/** 13개(연령대 6+6, 국적 1) 코드 호출에서 실제로 받은 원본 응답들. 지어내지 않고 받은 것만 담는다. */
export interface TouDivIxRaw {
  tou: Array<{ code: string; data: unknown }>;
  exp: Array<{ code: string; data: unknown }>;
  intl: { code: string; data: unknown };
}

/**
 * TOU_DIV_IX의 DataSnapshot이 재개 시점에 "완료"로 간주될 수 있는지 판정한다.
 *
 * fetchTouDivIx는 일부 코드가 실패해도 받은 원본을 보존하면서 composite를 계산할 수 있다.
 * 따라서 result status만 보면 12/13 또는 5/13인 부분 응답도 SUCCESS로 보일 수 있다. 이
 * helper는 실제 응답에 13개 필수 코드의 값이 모두 있는지를 확인해, 부분 snapshot은 다음
 * resume에서 재수집 대상으로 남긴다. 필수 코드 집합은 fetchTouDivIx가 호출하는 상수에서
 * 파생하므로 이 목록과 resume 판정이 서로 어긋나지 않는다.
 */
export function isTouDivIxRawComplete(raw: unknown): raw is TouDivIxRaw {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Partial<TouDivIxRaw>;
  const entries: unknown[] = [
    ...(Array.isArray(candidate.tou) ? candidate.tou : []),
    ...(Array.isArray(candidate.exp) ? candidate.exp : []),
    ...(candidate.intl ? [candidate.intl] : []),
  ];
  const dataCodes = entries
    .filter((entry) => Boolean(entry) && typeof entry === "object")
    .map((entry) => entry as { code?: unknown; data?: unknown })
    .filter((entry) => typeof entry.code === "string" && entry.data !== null && entry.data !== undefined)
    .map((entry) => entry.code);
  const uniqueCodes = new Set(dataCodes);

  return (
    dataCodes.length === TOU_DIV_REQUIRED_CODES.length &&
    uniqueCodes.size === TOU_DIV_REQUIRED_CODES.length &&
    TOU_DIV_REQUIRED_CODES.every((code) => uniqueCodes.has(code))
  );
}

/** syncService.ts의 isQuotaOrRateLimitSignal과 동일한 판정 기준 — 13개 코드 중 일부만 quota/429를
 * 맞고 나머지가 정상이면 전체 status는 SUCCESS/EMPTY로 정상 계산되어(부분 실패는 정상적으로 흡수)
 * quotaSignal이 없다면 이 신호 자체가 완전히 사라진다(2026-08-10 발견 — 실제 baseYm=202606 배치에서
 * TOU_DIV_IX가 1,566회 HTTP 429를 받고도 모든 지역이 SUCCESS/EMPTY로 끝나 `failed: 0`으로 보고돼
 * quota 초과를 완전히 놓쳤다). isQuotaOrRateLimitSignal을 import하면 순환 의존이 생기므로 같은 패턴을
 * 여기 그대로 복제한다 — 두 곳 모두 고쳐야 할 만큼 자주 바뀌는 로직이 아니다. */
function isQuotaSignal(message: string | undefined): boolean {
  if (!message) return false;
  return /HTTP\s*429|rate limit|too many requests|LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(message);
}

export type TouDivIxResult =
  | {
      status: "SUCCESS" | "EMPTY";
      composite: number | null;
      breakdown: DiversityBreakdown;
      itemCount: number;
      raw: TouDivIxRaw;
      /** 13개 코드 중 하나라도 quota/rate-limit 신호를 받았으면 그 메시지(예: "HTTP 429") — 전체
       * status가 SUCCESS/EMPTY로 정상 계산됐어도 이 필드로 quota 초과 사실 자체는 드러낸다. */
      quotaSignal: string | null;
    }
  | { status: "ERROR"; composite: null; breakdown: null; resultMsg: string; itemCount: 0; raw: TouDivIxRaw; quotaSignal: string | null };

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

  const allFetches = [...touVals, ...expVals, intlVal];
  const quotaSignal = allFetches.find((v) => isQuotaSignal(v.errorMessage))?.errorMessage ?? null;

  // 13개 코드 전부 값이 없어도, 그중 하나라도 실제로 호출/파싱에 성공했다면(ok=true) 이는 "API가
  // 정상 응답했지만 이 지역·baseYm에 해당 통계가 없는" EMPTY 상황이다(TAR_SVC_DEM 등 다른 소스와
  // 동일한 원칙) — 진짜 ERROR는 13개 전부 호출/파싱 자체가 실패했을 때만이다.
  const anyOk = touVals.some((v) => v.ok) || expVals.some((v) => v.ok) || intlVal.ok;
  if (validTou.length === 0 && validExp.length === 0 && intlValue === null && !anyOk) {
    // 13개 코드 전부 호출/파싱이 실패했을 때, 실제 실패 사유(예: "HTTP 429")를 그대로 노출한다 —
    // syncService.ts의 isQuotaOrRateLimitSignal이 이 문구로 quota/rate-limit을 감지해 배치를 즉시
    // 중단하므로, 여기서 원인을 뭉뚱그리면 대량 429가 발생해도 배치가 멈추지 않는다(2026-08-10 수정).
    const firstFailureMessage = allFetches.find((v) => v.errorMessage)?.errorMessage;
    return {
      status: "ERROR",
      composite: null,
      breakdown: null,
      resultMsg: firstFailureMessage ?? "모든 코드 호출/파싱 실패",
      itemCount: 0,
      raw,
      quotaSignal,
    };
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
    quotaSignal,
  };
}
