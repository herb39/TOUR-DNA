/**
 * Region 테이블의 apiAreaCode/apiSigunguCode를 실제 VISITOR_CNT API 응답(코드 전체 목록)과 대조해
 * 감사 결과를 출력한다(2026-07-28 도입, 2026-07-29 API 오류 처리 보완). 판정 로직 자체는
 * src/lib/services/regionCodeAudit.ts의 순수 함수 auditRegionCodes()이고, 이 스크립트는 그 입력
 * (Region 목록, API 코드 집합)을 실제로 조회해 넘겨주는 역할만 한다.
 *
 * 사용법:
 *   npm run audit:region-codes
 *   npm run audit:region-codes -- --base-ym 202606   (특정 월 응답으로 감사하고 싶을 때)
 */
import { prisma } from "../src/lib/db";
import { fetchLocgoRegnVisitr, fetchMetcoRegnVisitr } from "../src/lib/public-data/adapters/visitorCnt";
import { findLatestCompleteVisitorBaseYm, lookbackCandidates } from "../src/lib/services/visitorBaseYmFinder";
import { checkVisitorCntCacheViaDataSnapshot } from "../src/lib/services/visitorCntCacheStore";
import { auditRegionCodes, HIGHLIGHT_REGION_CODES, type RegionLike } from "../src/lib/services/regionCodeAudit";
import { DATA_SOURCE_SEED } from "../src/lib/fixtures/dataSources";

function baseUrlFor(code: string): string {
  const source = DATA_SOURCE_SEED.find((d) => d.code === code);
  if (!source) throw new Error(`DATA_SOURCE_SEED에 ${code}가 없습니다.`);
  return source.baseUrl;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

type BaseYmResolution = { baseYm: string; note: string | null } | { baseYm: null; note: string };

/**
 * 감사에 쓸 baseYm을 정한다. --base-ym이 있으면 그대로 쓴다. 없으면 최신 완전 기준월을 탐색하되,
 * 탐색이 API_ERROR로 끝났으면(=이미 그 달을 실제로 호출해서 실패를 확인했다는 뜻) 같은 달을 또
 * 호출하지 않고 즉시 포기한다 — 같은 문제가 반복될 가능성이 높은 호출을 낭비하지 않기 위해서다.
 * NONE_AVAILABLE(완전한 달을 못 찾았지만 API 자체는 정상)이면 감사는 "코드 존재 여부"만 보면 되므로
 * 최선 노력으로 가장 최근 후보를 그대로 쓴다.
 */
async function resolveBaseYm(serviceKey: string, baseUrl: string, explicit?: string): Promise<BaseYmResolution> {
  if (explicit) return { baseYm: explicit, note: null };

  const result = await findLatestCompleteVisitorBaseYm({
    serviceKey,
    baseUrl,
    fetchLocgo: fetchLocgoRegnVisitr,
    fetchMetco: fetchMetcoRegnVisitr,
    checkCache: checkVisitorCntCacheViaDataSnapshot,
  });
  if (result.state === "LIVE_COMPLETE" || result.state === "CACHED") {
    return { baseYm: result.baseYm, note: null };
  }
  if (result.state === "API_ERROR") {
    return {
      baseYm: null,
      note: `최신 완전 기준월 탐색이 API 오류로 중단됨(baseYm=${result.baseYm}: ${result.message}) — 같은 달을 다시 호출하지 않고 감사를 중단합니다.`,
    };
  }
  return {
    baseYm: lookbackCandidates()[0],
    note: "완전한 월을 찾지 못함(NONE_AVAILABLE) — 감사용으로는 가장 최근 후보 응답을 그대로 사용합니다(코드 존재 여부만 확인).",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    console.error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다(.env.local 확인).");
    process.exitCode = 1;
    return;
  }

  const baseUrl = baseUrlFor("VISITOR_CNT");
  const resolution = await resolveBaseYm(serviceKey, baseUrl, args["base-ym"]);
  if (resolution.note) console.log(resolution.note);
  if (resolution.baseYm === null) {
    process.exitCode = 1;
    return;
  }
  const baseYm = resolution.baseYm;
  console.log(`=== Region 행정구역 코드 감사(baseYm=${baseYm}) ===`);

  const [locgoResult, metcoResult] = await Promise.all([
    fetchLocgoRegnVisitr({ serviceKey, baseUrl, baseYm }),
    fetchMetcoRegnVisitr({ serviceKey, baseUrl, baseYm }),
  ]);

  // ERROR면 빈 Set이 아니라 null을 넘긴다 — 빈 Set은 "API가 코드를 하나도 안 줬다"는 뜻이 되어 모든
  // Region 코드가 REGION_ONLY(허위)로 잘못 탐지된다. null은 "이 범위는 검증 자체가 불가능했다"는 뜻으로
  // auditRegionCodes가 해당 범위의 API_ONLY/REGION_ONLY 판정을 통째로 건너뛴다.
  const apiSignguCodes = locgoResult.status === "ERROR" ? null : new Set<string>(locgoResult.byCode.keys());
  const apiAreaCodes = metcoResult.status === "ERROR" ? null : new Set<string>(metcoResult.byCode.keys());
  let hasApiFailure = false;
  if (locgoResult.status === "ERROR") {
    console.log(`경고: 기초지자체 API 오류 — ${locgoResult.resultMsg} (signguCode 범위는 검증 불가로 표시)`);
    hasApiFailure = true;
  }
  if (metcoResult.status === "ERROR") {
    console.log(`경고: 광역지자체 API 오류 — ${metcoResult.resultMsg} (areaCode 범위는 검증 불가로 표시)`);
    hasApiFailure = true;
  }

  const regionRows = await prisma.region.findMany({
    select: { code: true, name: true, level: true, apiAreaCode: true, apiSigunguCode: true },
  });
  const regions: RegionLike[] = regionRows as RegionLike[];

  const audit = auditRegionCodes({ regions, apiAreaCodes, apiSignguCodes });

  console.log(`\n전체 Region 수: ${audit.totalRegions}`);
  console.log(`정상 매핑 수: ${audit.okCount}`);
  if (audit.areaCodeVerificationSkipped) console.log("광역(areaCode) API_ONLY/REGION_ONLY: 검증 불가(API 오류)");
  if (audit.signguCodeVerificationSkipped) console.log("기초(signguCode) API_ONLY/REGION_ONLY: 검증 불가(API 오류)");

  const byType = (type: string) => audit.issues.filter((i) => i.type === type);
  console.log(`\n코드 누락(${byType("MISSING_CODE").length}건):`);
  byType("MISSING_CODE").forEach((i) => console.log(`  - ${i.regionName}(${i.regionCode}): ${i.detail}`));
  console.log(`\n코드 중복(${byType("DUPLICATE_CODE").length}건):`);
  byType("DUPLICATE_CODE").forEach((i) => console.log(`  - ${i.regionName}(${i.regionCode}): ${i.detail}`));
  console.log(`\n코드 형식 오류(${byType("INVALID_FORMAT").length}건):`);
  byType("INVALID_FORMAT").forEach((i) => console.log(`  - ${i.regionName}(${i.regionCode}): ${i.detail}`));
  console.log(`\nAPI에만 존재하는 코드(${byType("API_ONLY").length}건):`);
  byType("API_ONLY").forEach((i) => console.log(`  - ${i.detail}`));
  console.log(`\nRegion에만 존재하는 코드(${byType("REGION_ONLY").length}건):`);
  byType("REGION_ONLY").forEach((i) => console.log(`  - ${i.regionName}(${i.regionCode}): ${i.detail}`));

  console.log(`\n대표 시나리오(${HIGHLIGHT_REGION_CODES.join(", ")}):`);
  audit.highlights.forEach((h) => console.log(`  - ${h.regionCode}(${h.name ?? "?"}): status=${h.status} apiAreaCode=${h.apiAreaCode} apiSigunguCode=${h.apiSigunguCode}`));

  if (hasApiFailure || byType("MISSING_CODE").length + byType("DUPLICATE_CODE").length + byType("INVALID_FORMAT").length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
