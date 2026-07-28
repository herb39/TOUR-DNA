/**
 * VISITOR_CNT만 동기화하는 CLI(2026-07-28 도입). 전체 6개 소스를 동기화하는 sync-tourism-data.ts와
 * 달리, 이 스크립트는 syncService.ts의 syncVisitorCnt()만 호출한다 — 전국 시군구/광역 응답을 baseYm당
 * 한 번씩만 조회하고(지역별 반복 호출 없음), 날짜 커버리지가 불완전하면 자동으로 저장을 건너뛴다
 * (enforceDateCompleteness, syncVisitorCnt 내부).
 *
 * 사용법:
 *   npm run sync:visitor -- --baseYm=202606
 *   npm run sync:visitor -- --baseYm=202607 --force-current-month   (진행 중인 달을 굳이 돌려야 할 때만)
 */
import { prisma } from "../src/lib/db";
import { syncVisitorCnt } from "../src/lib/services/syncService";
import { currentBaseYm } from "../src/lib/services/visitorBaseYmFinder";

function parseArgs(argv: string[]): { baseYm?: string; forceCurrentMonth: boolean } {
  let baseYm: string | undefined;
  let forceCurrentMonth = false;
  for (const arg of argv) {
    if (arg.startsWith("--baseYm=")) baseYm = arg.slice("--baseYm=".length);
    else if (arg === "--force-current-month") forceCurrentMonth = true;
  }
  return { baseYm, forceCurrentMonth };
}

function isValidYyyymm(value: string): boolean {
  if (!/^\d{6}$/.test(value)) return false;
  const month = Number(value.slice(4, 6));
  return month >= 1 && month <= 12;
}

async function main() {
  const { baseYm, forceCurrentMonth } = parseArgs(process.argv.slice(2));
  if (!baseYm) {
    console.error("사용법: npm run sync:visitor -- --baseYm=YYYYMM [--force-current-month]");
    process.exitCode = 1;
    return;
  }
  if (!isValidYyyymm(baseYm)) {
    console.error(`baseYm 형식이 올바르지 않습니다(YYYYMM 기대): "${baseYm}"`);
    process.exitCode = 1;
    return;
  }
  if (baseYm === currentBaseYm() && !forceCurrentMonth) {
    console.error(
      `baseYm=${baseYm}은(는) 진행 중인 이번 달입니다 — 아직 데이터가 완전하지 않을 가능성이 높아 기본적으로 거부합니다.\n` +
        "정말 실행해야 하면 --force-current-month를 추가하세요(그래도 날짜 커버리지가 불완전하면 저장은 자동으로 건너뜁니다).",
    );
    process.exitCode = 1;
    return;
  }

  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    console.error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다(.env.local 확인).");
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date();
  const visitorSource = await prisma.dataSource.findUnique({ where: { code: "VISITOR_CNT" } });
  if (!visitorSource) {
    console.error("DataSource(VISITOR_CNT)가 DB에 없습니다 — npm run db:seed로 시드했는지 확인하세요.");
    process.exitCode = 1;
    return;
  }
  const [sigunguRegions, sidoRegions] = await Promise.all([
    prisma.region.findMany({ where: { level: "SIGUNGU" } }),
    prisma.region.findMany({ where: { level: "SIDO" } }),
  ]);

  console.log(`[sync-visitor] baseYm=${baseYm} 동기화 시작(시군구 ${sigunguRegions.length}개, 광역 ${sidoRegions.length}개)`);
  const results = await syncVisitorCnt({ baseYm, serviceKey, visitorSource, sigunguRegions, sidoRegions });
  console.log(JSON.stringify(results, null, 2));

  const hasFailure = results.some((r) => r.status === "FAILED");
  const hasSuccess = results.some((r) => r.status === "SUCCESS");
  const overallStatus = !hasFailure ? "SUCCESS" : hasSuccess ? "PARTIAL" : "FAILED";

  await prisma.syncLog.create({
    data: {
      baseYm,
      triggeredBy: "CLI",
      overallStatus,
      results: results as unknown as object,
      startedAt,
      endedAt: new Date(),
    },
  });

  console.log(`[sync-visitor] 완료: overallStatus=${overallStatus}`);
  if (overallStatus === "FAILED") process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
