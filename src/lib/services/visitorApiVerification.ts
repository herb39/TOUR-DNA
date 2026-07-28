import { findLatestCompleteVisitorBaseYm, type FindLatestCompleteBaseYmDeps, type FindLatestCompleteBaseYmResult } from "@/lib/services/visitorBaseYmFinder";
import type { VisitorCntFetchResult } from "@/lib/public-data/adapters/visitorCnt";

/**
 * verify:visitor-api CLI의 핵심 로직을 스크립트 밖으로 분리한다(2026-07-29) — 실행 파일(scripts/
 * verify-visitor-api.ts)은 이 함수를 부르기만 하고, 실제 로직은 여기서 DI 기반으로 단위 테스트한다.
 * 이 파일은 `@/lib/db`를 import하지 않는다(visitorBaseYmFinder.ts도 마찬가지) — DATABASE_URL 없이도
 * import·실행이 가능해야 한다.
 */
export interface VisitorApiVerificationReport {
  searchResult: FindLatestCompleteBaseYmResult;
  /**
   * LIVE_COMPLETE일 때만 채워진다 — findLatestCompleteVisitorBaseYm이 그 baseYm을 확인하며 이미 받은
   * 결과를 그대로 재사용한 것이다. 상세 보고를 만들겠다고 같은 baseYm을 또 조회하지 않는다(호출 낭비
   * 방지).
   */
  locgo?: VisitorCntFetchResult;
  metco?: VisitorCntFetchResult;
}

export async function runVisitorApiVerification(deps: FindLatestCompleteBaseYmDeps): Promise<VisitorApiVerificationReport> {
  const searchResult = await findLatestCompleteVisitorBaseYm(deps);
  if (searchResult.state === "LIVE_COMPLETE") {
    return { searchResult, locgo: searchResult.locgoResult, metco: searchResult.metcoResult };
  }
  return { searchResult };
}
