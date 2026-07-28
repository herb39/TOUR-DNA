/**
 * VISITOR_CNT(DataLabService) 실제 API를 사람이 눈으로 확인할 수 있게 진단 정보를 출력한다
 * (2026-07-28 도입, 2026-07-29 DB 결합 제거 + 재호출 방지 + 실제 페이지 요청 횟수 계산으로 보완).
 *
 * 이 스크립트는 `@/lib/db`를 import하지 않는다 — DATABASE_URL이 없어도 그냥 실행된다("최신 완전 기준월"
 * 캐시 확인도 이 스크립트에서는 의도적으로 끄고 항상 라이브로 조회한다). TOUR_API_SERVICE_KEY만 있으면
 * 충분하다.
 *
 * 사용법:
 *   npm run verify:visitor-api
 *
 * 필요 환경변수:
 *   TOUR_API_SERVICE_KEY — 없으면 값을 요구하거나 출력하지 않고 변수명만 안내하고 종료한다.
 *
 * 출력에는 serviceKey 원문을 절대 포함하지 않는다(URL을 보여줄 때도 항상 마스킹한다).
 */
import {
  fetchLocgoRegnVisitr,
  fetchMetcoRegnVisitr,
  monthToYmdRange,
  type VisitorCntFetchResult,
  type VisitorCntParams,
} from "../src/lib/public-data/adapters/visitorCnt";
import { collectBaseYmdSet, assessDateCoverage } from "../src/lib/services/visitorMonthCompleteness";
import { runVisitorApiVerification } from "../src/lib/services/visitorApiVerification";
import { maskServiceKeyInUrl } from "../src/lib/public-data/urlMasking";
import { DATA_SOURCE_SEED } from "../src/lib/fixtures/dataSources";

function baseUrlFor(code: string): string {
  const source = DATA_SOURCE_SEED.find((d) => d.code === code);
  if (!source) throw new Error(`DATA_SOURCE_SEED에 ${code}가 없습니다.`);
  return source.baseUrl;
}

function touDivCdPresence(result: VisitorCntFetchResult): { local: boolean; otherDomestic: boolean; foreign: boolean } {
  if (result.status === "ERROR") return { local: false, otherDomestic: false, foreign: false };
  let local = false;
  let otherDomestic = false;
  let foreign = false;
  for (const agg of result.byCode.values()) {
    for (const item of agg.rawItems) {
      const cd = (item as { touDivCd?: unknown }).touDivCd;
      if (cd === "1") local = true;
      else if (cd === "2") otherDomestic = true;
      else if (cd === "3") foreign = true;
    }
  }
  return { local, otherDomestic, foreign };
}

function hasDecimalTouNum(result: VisitorCntFetchResult): boolean {
  if (result.status === "ERROR") return false;
  for (const agg of result.byCode.values()) {
    for (const item of agg.rawItems) {
      const touNum = (item as { touNum?: unknown }).touNum;
      if (typeof touNum === "number" && !Number.isInteger(touNum)) return true;
    }
  }
  return false;
}

/** rawPages[0]의 response.body.totalCount를 지어내지 않고 실제 값이 있으면만 읽는다. */
function extractTotalCount(result: VisitorCntFetchResult): number | null {
  if (result.status === "ERROR" || result.rawPages.length === 0) return null;
  const first = result.rawPages[0] as { response?: { body?: { totalCount?: unknown } } };
  const totalCount = first?.response?.body?.totalCount;
  return typeof totalCount === "number" ? totalCount : null;
}

function reportResult(label: string, baseYm: string, result: VisitorCntFetchResult) {
  console.log(`\n  [${label}] baseYm=${baseYm}`);
  console.log(`    status=${result.status} resultCode=${result.resultCode}`);
  if (result.status === "ERROR") {
    console.log(`    resultMsg=${result.resultMsg}`);
    return;
  }
  const totalCount = extractTotalCount(result);
  console.log(`    totalCount=${totalCount ?? "(응답에 없음)"}`);
  console.log(`    페이지 수(실제 수신)=${result.rawPages.length}`);
  const dates = collectBaseYmdSet(result);
  const sortedDates = Array.from(dates).sort();
  console.log(
    `    수집된 기준일자 범위=${sortedDates.length > 0 ? `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]} (${sortedDates.length}일)` : "(없음)"}`,
  );
  const coverage = assessDateCoverage(baseYm, dates);
  console.log(`    날짜 완전성=${coverage.complete ? "완전" : `불완전(누락 ${coverage.missingDates.length}일)`}`);
  const presence = touDivCdPresence(result);
  console.log(`    touDivCd 존재 여부: 현지인(1)=${presence.local} 외지인(2)=${presence.otherDomestic} 외국인(3)=${presence.foreign}`);
  console.log(`    touNum 소수값 관측=${hasDecimalTouNum(result)}`);
}

/**
 * globalThis.fetch를 직접 감싸 "실제 HTTP 페이지 요청 횟수"를 센다. fetchLocgoRegnVisitr 같은 어댑터
 * 함수 1회 호출이 내부적으로 여러 페이지를 조회할 수 있으므로(pagination), 어댑터 호출 횟수를 API
 * 호출 횟수로 세면 과소 계산된다 — 실제 네트워크 요청 지점(fetch)에서 세야 정확하다.
 */
function wrapFetchWithCounter(): { restore: () => void; count: () => number } {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    calls++;
    return originalFetch(...args);
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = originalFetch; }, count: () => calls };
}

async function main() {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  console.log("=== VISITOR_CNT(DataLabService) 실 API 진단 ===");
  console.log(`인증키(TOUR_API_SERVICE_KEY) 설정 여부: ${serviceKey ? "설정됨" : "미설정"}`);
  if (!serviceKey) {
    console.log("\nTOUR_API_SERVICE_KEY 환경변수가 없습니다. .env.local에 설정한 뒤 다시 실행하세요.");
    console.log("(이 스크립트는 인증키 값을 요구하거나 출력하지 않습니다 — 변수명만 안내합니다.)");
    process.exitCode = 1;
    return;
  }

  const baseUrl = baseUrlFor("VISITOR_CNT");
  const exampleUrl = `${baseUrl}/locgoRegnVisitrDDList?serviceKey=${encodeURIComponent(serviceKey)}&_type=json`;
  console.log(`예시 요청 URL(마스킹): ${maskServiceKeyInUrl(exampleUrl)}`);

  const counter = wrapFetchWithCounter();
  let report;
  try {
    // 이 스크립트의 목적은 캐시 단축이 아니라 실제 API 동작 확인이므로 캐시 확인은 항상 false로 둔다.
    report = await runVisitorApiVerification({
      serviceKey,
      baseUrl,
      fetchLocgo: fetchLocgoRegnVisitr,
      fetchMetco: fetchMetcoRegnVisitr,
      checkCache: async () => false,
    });
  } finally {
    counter.restore();
  }
  const { searchResult } = report;

  console.log(`\n=== 최신 완전 기준월 탐색 결과: ${searchResult.state} ===`);
  for (const assessment of searchResult.checked) {
    const reasonKo =
      assessment.reason === null
        ? "완전"
        : assessment.reason === "LOCGO_ERROR"
          ? "기초지자체 API 오류"
          : assessment.reason === "LOCGO_EMPTY"
            ? "기초지자체 응답 EMPTY(0건)"
            : assessment.reason === "LOCGO_INCOMPLETE_DATES"
              ? `기초지자체 날짜 누락(${assessment.locgo.missingDates.length}일)`
              : assessment.reason === "METCO_ERROR"
                ? "광역지자체 API 오류"
                : assessment.reason === "METCO_EMPTY"
                  ? "광역지자체 응답 EMPTY(0건)"
                  : `광역지자체 날짜 누락(${assessment.metco.missingDates.length}일)`;
    console.log(`  - ${assessment.baseYm}: ${assessment.complete ? "완전" : `제외(${reasonKo})`}`);
  }

  if (searchResult.state === "LIVE_COMPLETE") {
    console.log(`\n최신 완전 기준월 후보: ${searchResult.baseYm}`);
    const { startYmd, endYmd } = monthToYmdRange(searchResult.baseYm);
    console.log(`(월 범위: ${startYmd} ~ ${endYmd})`);
    // 탐색 중 이미 받은 결과를 그대로 쓴다 — 같은 baseYm을 다시 조회하지 않는다.
    reportResult("기초지자체 locgoRegnVisitrDDList", searchResult.baseYm, report.locgo!);
    reportResult("광역지자체 metcoRegnVisitrDDList", searchResult.baseYm, report.metco!);
  } else if (searchResult.state === "CACHED") {
    console.log(`\n캐시(기존 DataSnapshot)에 이미 완전한 월로 기록됨: ${searchResult.baseYm}`);
  } else if (searchResult.state === "API_ERROR") {
    console.log(`\nAPI 오류로 탐색을 중단함: baseYm=${searchResult.baseYm} message=${searchResult.message}`);
  } else {
    console.log("\n사용 가능한 완전 기준월을 찾지 못함(최대 6개월 확인).");
  }

  console.log(`\n총 API 호출 횟수(실제 HTTP 요청 수, 이 스크립트 실행 기준): ${counter.count()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
