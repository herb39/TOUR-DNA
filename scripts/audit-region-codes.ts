/**
 * Region 테이블의 apiAreaCode/apiSigunguCode를 실제 VISITOR_CNT API 응답(코드 전체 목록)과 대조해
 * 감사 결과를 출력한다(2026-07-28 도입). 판정 로직 자체는 src/lib/services/regionCodeAudit.ts의
 * 순수 함수 auditRegionCodes()이고, 이 스크립트는 그 입력(Region 목록, API 코드 집합)을 실제로
 * 조회해 넘겨주는 역할만 한다.
 *
 * 사용법:
 *   npm run audit:region-codes
 *   npm run audit:region-codes -- --base-ym 202606   (특정 월 응답으로 감사하고 싶을 때)
 */
import { prisma } from "../src/lib/db";
import { fetchLocgoRegnVisitr, fetchMetcoRegnVisitr } from "../src/lib/public-data/adapters/visitorCnt";
import { findLatestCompleteVisitorBaseYm, checkVisitorCntCacheViaDataSnapshot, lookbackCandidates } from "../src/lib/services/visitorBaseYmFinder";
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

async function pickBaseYm(serviceKey: string, baseUrl: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const result = await findLatestCompleteVisitorBaseYm({
    serviceKey,
    baseUrl,
    fetchLocgo: fetchLocgoRegnVisitr,
    fetchMetco: fetchMetcoRegnVisitr,
    checkCache: checkVisitorCntCacheViaDataSnapshot,
  });
  if (result.state === "LIVE_COMPLETE" || result.state === "CACHED") return result.baseYm;
  // 완전한 월을 못 찾아도 감사 자체는 "코드가 있는지"만 보면 되므로, 최선 노력으로 직전 달을 그대로
  // 쓴다(불완전할 수 있다는 점은 출력에 명시한다).
  console.log(
    `경고: 완전한 월을 찾지 못함(${result.state}) — 감사용으로는 직전 달 응답을 그대로 사용합니다(코드 존재 여부만 확인).`,
  );
  return lookbackCandidates()[0];
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
  const baseYm = await pickBaseYm(serviceKey, baseUrl, args["base-ym"]);
  console.log(`=== Region 행정구역 코드 감사(baseYm=${baseYm}) ===`);

  const [locgoResult, metcoResult] = await Promise.all([
    fetchLocgoRegnVisitr({ serviceKey, baseUrl, baseYm }),
    fetchMetcoRegnVisitr({ serviceKey, baseUrl, baseYm }),
  ]);

  const apiSignguCodes = new Set<string>(locgoResult.status === "ERROR" ? [] : locgoResult.byCode.keys());
  const apiAreaCodes = new Set<string>(metcoResult.status === "ERROR" ? [] : metcoResult.byCode.keys());
  if (locgoResult.status === "ERROR") console.log(`경고: 기초지자체 API 오류 — ${locgoResult.resultMsg} (Region-only 판정만 가능)`);
  if (metcoResult.status === "ERROR") console.log(`경고: 광역지자체 API 오류 — ${metcoResult.resultMsg} (Region-only 판정만 가능)`);

  const regionRows = await prisma.region.findMany({
    select: { code: true, name: true, level: true, apiAreaCode: true, apiSigunguCode: true },
  });
  const regions: RegionLike[] = regionRows as RegionLike[];

  const audit = auditRegionCodes({ regions, apiAreaCodes, apiSignguCodes });

  console.log(`\n전체 Region 수: ${audit.totalRegions}`);
  console.log(`정상 매핑 수: ${audit.okCount}`);

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

  if (byType("MISSING_CODE").length + byType("DUPLICATE_CODE").length + byType("INVALID_FORMAT").length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
