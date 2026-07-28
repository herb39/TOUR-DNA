import { previousBaseYm } from "@/lib/services/baseYm";
import type { VisitorCntFetchResult, VisitorCntParams } from "@/lib/public-data/adapters/visitorCnt";
import { assessVisitorMonthCompleteness, type MonthCompletenessAssessment } from "@/lib/services/visitorMonthCompleteness";

/**
 * VISITOR_CNT의 "최신 완전 기준월"을 찾는다(2026-07-28 도입, 2026-07-29 DB 결합 제거). 실제 API 호출은
 * 매개변수로 주입받고, DB 캐시 확인도 함수로 주입받는다(구현체는 별도 모듈 visitorCntCacheStore.ts) —
 * 이 파일 자체는 `@/lib/db`를 전혀 import하지 않으므로 DATABASE_URL 없이도 import·단위테스트가 가능하다
 * (db.ts는 모듈 로드 시점에 DATABASE_URL이 없으면 즉시 throw하므로, 순수 탐색 로직과 절대 같은 파일에
 * 두면 안 된다).
 */

/** 진행 중인 이번 달의 baseYm(YYYYMM). now를 주입할 수 있어 테스트가 "오늘"에 의존하지 않는다. */
export function currentBaseYm(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 이번 달을 절대 포함하지 않고, 직전 달부터 과거 방향으로 최대 maxLookback개월의 baseYm 후보를
 * 최신순으로 반환한다.
 */
export function lookbackCandidates(now: Date = new Date(), maxLookback = 6): string[] {
  const candidates: string[] = [];
  let cursor = currentBaseYm(now);
  for (let i = 0; i < maxLookback; i++) {
    cursor = previousBaseYm(cursor);
    candidates.push(cursor);
  }
  return candidates;
}

export type FindLatestCompleteBaseYmResult =
  | {
      state: "LIVE_COMPLETE";
      baseYm: string;
      checked: MonthCompletenessAssessment[];
      /** 이 달을 확인하며 실제로 받은 결과 — 호출부(예: verify:visitor-api)가 상세 보고를 위해 같은
       * baseYm을 다시 조회하지 않고 그대로 재사용할 수 있다. */
      locgoResult: VisitorCntFetchResult;
      metcoResult: VisitorCntFetchResult;
    }
  | { state: "CACHED"; baseYm: string; checked: MonthCompletenessAssessment[] }
  | { state: "NONE_AVAILABLE"; checked: MonthCompletenessAssessment[] }
  | { state: "API_ERROR"; baseYm: string; message: string; checked: MonthCompletenessAssessment[] };

export interface FindLatestCompleteBaseYmDeps {
  serviceKey: string;
  baseUrl: string;
  now?: Date;
  maxLookback?: number;
  fetchLocgo: (params: VisitorCntParams) => Promise<VisitorCntFetchResult>;
  fetchMetco: (params: VisitorCntParams) => Promise<VisitorCntFetchResult>;
  /** 이 baseYm이 이미 "완전한 월"로 확인되어 저장돼 있는지 확인한다(API 호출 없이). */
  checkCache: (baseYm: string) => Promise<boolean>;
}

/**
 * 직전 달부터 최대 maxLookback개월을 최신순으로 확인해 "완전한 월"을 찾는다. 후보마다:
 * 1. 캐시부터 확인한다(API 호출 없음) — 있으면 즉시 CACHED로 반환(일일 호출 한도 절약).
 * 2. 캐시가 없으면 실제로 locgo/metco를 조회해 완전성을 판정한다.
 * 3. 완전하면 즉시 LIVE_COMPLETE로 반환하고(그때 받은 원본 결과도 함께 반환) 더 과거 달은 확인하지
 *    않는다 — 호출부가 상세 보고를 위해 같은 달을 또 조회할 필요가 없다.
 * 4. API 자체가 ERROR면(네트워크/파싱 실패 등, 데이터가 없는 것과 다름) 그 시점에서 탐색을 중단하고
 *    API_ERROR를 반환한다 — 같은 문제가 다른 달에도 반복될 가능성이 높아 호출을 낭비하지 않기 위해서다.
 * 5. EMPTY/날짜 누락(불완전)이면 그 달만 건너뛰고 다음 과거 달을 계속 확인한다.
 * 6. maxLookback을 모두 소진해도 완전한 달이 없으면 NONE_AVAILABLE을 반환한다.
 *
 * `checked`는 이번 탐색에서 완전성을 실제로 "판정"한 모든 달의 목록이다 — 최종적으로 선택된 완전한
 * 달(LIVE_COMPLETE)도 판정을 거쳤으므로 포함된다. CACHED/API_ERROR로 끝난 달 자체는 완전성 판정을
 * 하지 않았으므로(캐시 확인만 했거나 API가 아예 실패했으므로) checked에 들어가지 않는다.
 *
 * 완전한 월을 찾지 못하면 임의의 baseYm이나 seed 값을 대신 반환하지 않는다 — 호출부가 명시적으로
 * NONE_AVAILABLE/API_ERROR를 확인하고 처리해야 한다.
 */
export async function findLatestCompleteVisitorBaseYm(
  deps: FindLatestCompleteBaseYmDeps,
): Promise<FindLatestCompleteBaseYmResult> {
  const { serviceKey, baseUrl, now, maxLookback = 6, fetchLocgo, fetchMetco, checkCache } = deps;
  const candidates = lookbackCandidates(now, maxLookback);
  const checked: MonthCompletenessAssessment[] = [];

  for (const baseYm of candidates) {
    const cached = await checkCache(baseYm);
    if (cached) {
      return { state: "CACHED", baseYm, checked };
    }

    const [locgoResult, metcoResult] = await Promise.all([
      fetchLocgo({ serviceKey, baseUrl, baseYm }),
      fetchMetco({ serviceKey, baseUrl, baseYm }),
    ]);

    if (locgoResult.status === "ERROR" || metcoResult.status === "ERROR") {
      // resultMsg는 VisitorCntFetchResult 유니온의 모든 분기에 공통으로 존재하므로 별도 narrowing 없이
      // 바로 읽을 수 있다 — ERROR인 쪽의 메시지를 우선한다(둘 다 ERROR면 locgo를 대표로 보고한다).
      const message = locgoResult.status === "ERROR" ? locgoResult.resultMsg : metcoResult.resultMsg;
      return { state: "API_ERROR", baseYm, message, checked };
    }

    const assessment = assessVisitorMonthCompleteness(baseYm, locgoResult, metcoResult);
    checked.push(assessment);
    if (assessment.complete) {
      return { state: "LIVE_COMPLETE", baseYm, checked, locgoResult, metcoResult };
    }
  }

  return { state: "NONE_AVAILABLE", checked };
}
