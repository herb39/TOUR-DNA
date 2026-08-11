import { activateDataset } from "../src/lib/services/activeDataset";
import { prisma } from "../src/lib/db";

/**
 * Phase 2-A(2026-08-11): baseYm 하나를 ACTIVE dataset으로 승격한다. 완전성 검증(4개 필수 소스가
 * SIGUNGU 전 지역에서 SUCCESS/EMPTY, ERROR 0)을 통과하지 못하면 거부하고 기존 ACTIVE를 그대로
 * 유지한다 — 자동 승격은 하지 않으며, 이 스크립트를 사람이 직접 실행해야만 승격된다.
 *
 * 사용법: npm run dataset:activate -- --base-ym=202606
 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseYm = args["base-ym"];
  if (!baseYm) {
    console.error("사용법: npm run dataset:activate -- --base-ym=202606");
    process.exitCode = 1;
    return;
  }

  const result = await activateDataset(baseYm);
  if (!result.ok) {
    console.error(`[dataset:activate] 거부됨 — baseYm=${baseYm}는 아직 ACTIVE로 승격할 수 없습니다.`);
    console.error(`  최종 판정: ${result.report.verdict}`);
    console.error(`  미완료 지역: ${result.report.snapshot.incompleteRegions}곳, ERROR: ${result.report.snapshot.errorRegions}곳`);
    result.report.verdictReasons.forEach((r) => console.error(`  - ${r}`));
    process.exitCode = 1;
    return;
  }

  console.log(`[dataset:activate] 성공 — baseYm=${result.baseYm}이 ACTIVE로 승격되었습니다.`);
  console.log(`  이전 ACTIVE: ${result.previousActiveBaseYm ?? "(없음)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
