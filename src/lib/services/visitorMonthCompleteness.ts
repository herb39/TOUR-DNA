import type { VisitorCntFetchResult } from "@/lib/public-data/adapters/visitorCnt";
import { monthToYmdRange } from "@/lib/public-data/adapters/visitorCnt";

/**
 * VISITOR_CNT(DataLabService) 응답의 "월 완전성"을 순수 함수로 판정한다. API 호출/DB 접근은 전혀 하지
 * 않는다 — 이미 받아온 VisitorCntFetchResult(또는 그 안의 baseYmd 집합)만으로 판단해야 테스트와
 * 실제 사용(월 탐색 서비스, 동기화 저장 게이트) 양쪽에서 재사용할 수 있다.
 *
 * "완전한 월"의 정의(2026-07-28 사용자 요구사항):
 * - API 호출 결과가 SUCCESS여야 한다(EMPTY/ERROR는 완전하지 않음).
 * - 해당 월 1일~말일까지 모든 baseYmd가 실제로 존재해야 한다(하루라도 누락되면 불완전).
 * - 월간 수치는 월간 "순"방문자수가 아니라 baseYmd(일자)별 값의 합계라는 원본 API의 산출 방식을 그대로
 *   전제한다 — 날짜 커버리지가 이 전제가 성립하는 최소 조건이다.
 */

/** baseYm(YYYYMM) 하루 뒤의 YYYYMMDD 문자열을 계산한다(달력 계산만 하는 순수 함수). */
function nextYmd(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`;
}

/** baseYm(YYYYMM)의 1일부터 말일까지 YYYYMMDD 문자열 전체를 오름차순으로 반환한다. */
export function expectedDatesOfMonth(baseYm: string): string[] {
  const { startYmd, endYmd } = monthToYmdRange(baseYm);
  const dates: string[] = [];
  let cursor = startYmd;
  // YYYYMMDD는 같은 자리수 문자열이라 사전식 비교가 곧 날짜 비교와 같다.
  while (cursor <= endYmd) {
    dates.push(cursor);
    cursor = nextYmd(cursor);
  }
  return dates;
}

export interface DateCoverageResult {
  complete: boolean;
  /** 기대한 날짜 중 응답에 없었던 날짜(YYYYMMDD), 오름차순. */
  missingDates: string[];
}

/** 기대 날짜 전체가 presentDates(응답에서 실제로 관측된 baseYmd 집합)에 있는지 확인한다. */
export function assessDateCoverage(baseYm: string, presentDates: Iterable<string>): DateCoverageResult {
  const expected = expectedDatesOfMonth(baseYm);
  const present = new Set(presentDates);
  const missingDates = expected.filter((d) => !present.has(d));
  return { complete: missingDates.length === 0, missingDates };
}

/**
 * VisitorCntFetchResult(byCode에 지역별 rawItems가 들어 있음)에서 실제로 관측된 baseYmd 전체를 모은다.
 * ERROR 상태거나 byCode가 없으면 빈 집합(지어내지 않음).
 */
export function collectBaseYmdSet(result: VisitorCntFetchResult): Set<string> {
  const set = new Set<string>();
  if (result.status === "ERROR") return set;
  for (const agg of result.byCode.values()) {
    for (const item of agg.rawItems) {
      const value = (item as { baseYmd?: unknown }).baseYmd;
      if (typeof value === "string") set.add(value);
    }
  }
  return set;
}

export type IncompleteReason =
  | "LOCGO_ERROR"
  | "LOCGO_EMPTY"
  | "LOCGO_INCOMPLETE_DATES"
  | "METCO_ERROR"
  | "METCO_EMPTY"
  | "METCO_INCOMPLETE_DATES";

export interface MonthCompletenessAssessment {
  baseYm: string;
  complete: boolean;
  /** 완전하면 null, 아니면 어느 쪽이 왜 불완전한지. */
  reason: IncompleteReason | null;
  locgo: { status: VisitorCntFetchResult["status"]; missingDates: string[] };
  metco: { status: VisitorCntFetchResult["status"]; missingDates: string[] };
}

/**
 * 기초지자체(locgo)·광역지자체(metco) 응답을 함께 평가해 이 baseYm이 "완전한 월"인지 판정한다.
 * 하나라도 불완전하면 전체를 불완전으로 취급한다(사용자 요구사항: "기초지자체 또는 광역지자체 중
 * 하나라도 불완전하면 해당 월을 건너뛴다").
 */
export function assessVisitorMonthCompleteness(
  baseYm: string,
  locgoResult: VisitorCntFetchResult,
  metcoResult: VisitorCntFetchResult,
): MonthCompletenessAssessment {
  if (locgoResult.status === "ERROR") {
    return {
      baseYm,
      complete: false,
      reason: "LOCGO_ERROR",
      locgo: { status: "ERROR", missingDates: [] },
      metco: { status: metcoResult.status, missingDates: [] },
    };
  }
  if (locgoResult.status === "EMPTY") {
    return {
      baseYm,
      complete: false,
      reason: "LOCGO_EMPTY",
      locgo: { status: "EMPTY", missingDates: [] },
      metco: { status: metcoResult.status, missingDates: [] },
    };
  }
  const locgoCoverage = assessDateCoverage(baseYm, collectBaseYmdSet(locgoResult));
  if (!locgoCoverage.complete) {
    return {
      baseYm,
      complete: false,
      reason: "LOCGO_INCOMPLETE_DATES",
      locgo: { status: "SUCCESS", missingDates: locgoCoverage.missingDates },
      metco: { status: metcoResult.status, missingDates: [] },
    };
  }

  if (metcoResult.status === "ERROR") {
    return {
      baseYm,
      complete: false,
      reason: "METCO_ERROR",
      locgo: { status: "SUCCESS", missingDates: [] },
      metco: { status: "ERROR", missingDates: [] },
    };
  }
  if (metcoResult.status === "EMPTY") {
    return {
      baseYm,
      complete: false,
      reason: "METCO_EMPTY",
      locgo: { status: "SUCCESS", missingDates: [] },
      metco: { status: "EMPTY", missingDates: [] },
    };
  }
  const metcoCoverage = assessDateCoverage(baseYm, collectBaseYmdSet(metcoResult));
  if (!metcoCoverage.complete) {
    return {
      baseYm,
      complete: false,
      reason: "METCO_INCOMPLETE_DATES",
      locgo: { status: "SUCCESS", missingDates: [] },
      metco: { status: "SUCCESS", missingDates: metcoCoverage.missingDates },
    };
  }

  return {
    baseYm,
    complete: true,
    reason: null,
    locgo: { status: "SUCCESS", missingDates: [] },
    metco: { status: "SUCCESS", missingDates: [] },
  };
}

/**
 * 단일 소스(locgo 또는 metco) 하나만 놓고 "SUCCESS인데 날짜가 일부 누락"인지 판정하는 하위 유틸리티.
 * syncService.ts는 이 함수를 직접 쓰지 않고 아래 `enforceCombinedDateCompleteness`(기초·광역 원자적
 * 게이트)를 쓴다 — 한쪽만 완전하다고 그쪽만 저장하면 안 되기 때문이다. 이 함수는 순수 날짜 판정
 * 자체를 테스트하거나 재사용할 때를 위해 남겨둔다.
 */
export function enforceDateCompleteness(baseYm: string, result: VisitorCntFetchResult): VisitorCntFetchResult {
  if (result.status !== "SUCCESS") return result;
  const coverage = assessDateCoverage(baseYm, collectBaseYmdSet(result));
  if (coverage.complete) return result;
  return {
    status: "ERROR",
    byCode: null,
    resultCode: "INCOMPLETE_MONTH",
    resultMsg: `기준월 ${baseYm} 날짜 커버리지 불완전(누락 ${coverage.missingDates.length}일: ${coverage.missingDates.slice(0, 5).join(", ")}${coverage.missingDates.length > 5 ? " 외" : ""}) — 불완전 합계를 저장하지 않음`,
    rawPages: [],
  };
}

export interface CombinedDateCompletenessResult {
  locgo: VisitorCntFetchResult;
  metco: VisitorCntFetchResult;
  assessment: MonthCompletenessAssessment;
}

/**
 * syncService.ts(syncVisitorCnt)의 실제 저장 게이트. 기초(locgo)·광역(metco)을 함께 평가해 **둘 다**
 * SUCCESS이고 날짜가 완전할 때만 원본 결과를 그대로 통과시킨다. 하나라도 ERROR/EMPTY/날짜 누락이면
 * 기초·광역 양쪽 모두를 ERROR로 바꿔치기해, 한쪽만 저장되고 다른 쪽은 저장되지 않는 상황을 만들지
 * 않는다("한쪽만 완전하면 완전한 쪽은 저장한다"는 이전 정책을 폐기함, 2026-07-29).
 *
 * rawPages를 비우지 않고 실제로 판정에 쓰인 사유를 담아 채운다 — 완전성 검증 실패도 "실제로 응답은
 * 받았지만 쓸 수 없었다"는 점에서 다른 어댑터의 ERROR 처리와 다르지 않으므로, upsertSnapshot의
 * preserve 정책과 markMetricsAsCached(CACHED_API 강등)이 다른 소스와 동일하게 동작해야 한다 — 기존
 * SUCCESS 스냅샷은 보존되고, 그 스냅샷이 만든 LIVE_API metric은 "최신 시도가 실패해 이전 값을
 * 재사용 중"이라는 사실을 그대로 반영해 CACHED_API로 낮아진다.
 */
export function enforceCombinedDateCompleteness(
  baseYm: string,
  locgoResult: VisitorCntFetchResult,
  metcoResult: VisitorCntFetchResult,
): CombinedDateCompletenessResult {
  const assessment = assessVisitorMonthCompleteness(baseYm, locgoResult, metcoResult);
  if (assessment.complete) {
    return { locgo: locgoResult, metco: metcoResult, assessment };
  }

  const resultMsg = `기준월 ${baseYm} 완전성 검증 실패(${assessment.reason}) — 기초/광역 모두 저장하지 않고 기존 SUCCESS를 보존한다`;
  const incomplete: VisitorCntFetchResult = {
    status: "ERROR",
    byCode: null,
    resultCode: "INCOMPLETE_MONTH",
    resultMsg,
    rawPages: [{ resultCode: "INCOMPLETE_MONTH", resultMsg }],
  };
  return { locgo: incomplete, metco: incomplete, assessment };
}
