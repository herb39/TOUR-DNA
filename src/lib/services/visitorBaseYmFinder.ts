import { prisma } from "@/lib/db";
import { previousBaseYm } from "@/lib/services/baseYm";
import type { VisitorCntFetchResult, VisitorCntParams } from "@/lib/public-data/adapters/visitorCnt";
import { assessVisitorMonthCompleteness, type MonthCompletenessAssessment } from "@/lib/services/visitorMonthCompleteness";

/**
 * VISITOR_CNT의 "최신 완전 기준월"을 찾는다(2026-07-28 도입). 실제 API 호출/DB 접근은 모두 매개변수로
 * 주입받는다 — 이렇게 해야 이 서비스의 탐색 순서·최대 개월 수·캐시 우선·오류 처리 로직을 실제 API나
 * DB 없이 단위 테스트로 검증할 수 있다.
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
  | { state: "LIVE_COMPLETE"; baseYm: string; checked: MonthCompletenessAssessment[] }
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
 * 3. 완전하면 즉시 LIVE_COMPLETE로 반환하고 더 과거 달은 확인하지 않는다.
 * 4. API 자체가 ERROR면(네트워크/파싱 실패 등, 데이터가 없는 것과 다름) 그 시점에서 탐색을 중단하고
 *    API_ERROR를 반환한다 — 같은 문제가 다른 달에도 반복될 가능성이 높아 호출을 낭비하지 않기 위해서다.
 * 5. EMPTY/날짜 누락(불완전)이면 그 달만 건너뛰고 다음 과거 달을 계속 확인한다.
 * 6. maxLookback을 모두 소진해도 완전한 달이 없으면 NONE_AVAILABLE을 반환한다.
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
      return { state: "LIVE_COMPLETE", baseYm, checked };
    }
  }

  return { state: "NONE_AVAILABLE", checked };
}

/**
 * 실제 DB 기반 캐시 확인(기본 구현). 새 watermark 테이블을 만들지 않고 기존 DataSnapshot을 그대로
 * 재사용한다 — sync:visitor는 완전성 검증을 통과한 baseYm에 대해서만 VISITOR_CNT DataSnapshot을
 * SUCCESS/EMPTY로 저장하므로(enforceDateCompleteness 게이트), "필요한 지역 전부에 대해 이 baseYm의
 * VISITOR_CNT DataSnapshot이 SUCCESS 또는 EMPTY로 존재한다"는 사실 자체가 "과거에 이 달이 완전하다고
 * 확인되어 저장됐다"는 증거가 된다.
 */
export async function checkVisitorCntCacheViaDataSnapshot(baseYm: string): Promise<boolean> {
  const visitorSource = await prisma.dataSource.findUnique({ where: { code: "VISITOR_CNT" } });
  if (!visitorSource) return false;

  const regions = await prisma.region.findMany({
    where: {
      OR: [
        { level: "SIGUNGU", apiSigunguCode: { not: null } },
        { level: "SIDO", apiAreaCode: { not: null } },
      ],
    },
    select: { id: true },
  });
  if (regions.length === 0) return false;

  const snapshots = await prisma.dataSnapshot.findMany({
    where: {
      dataSourceId: visitorSource.id,
      baseYm,
      regionId: { in: regions.map((r) => r.id) },
      status: { in: ["SUCCESS", "EMPTY"] },
    },
    select: { regionId: true },
  });
  return snapshots.length === regions.length;
}
