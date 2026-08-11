import { promoteDataset } from "../src/lib/services/datasetPromotion";
import { prisma } from "../src/lib/db";

/**
 * Phase 2-A(2026-08-11)에서는 completeness 검증만 통과하면 즉시 ACTIVE로 승격했다. Phase
 * 2-C(2026-08-12)부터는 그 사이에 DNA drift gate 판정이 하나 더 끼어든다 — completeness/audit이
 * PASS여도 drift가 REVIEW_REQUIRED/BLOCKED면 이 스크립트는 승격하지 않고 기존 ACTIVE를 그대로
 * 유지한다. `--force`/`--skip-drift` 같은 우회 옵션은 의도적으로 제공하지 않는다(운영자가 drift
 * 결과를 미리 보려면 `npm run dataset:drift -- --base-ym=YYYYMM`을 먼저 실행하면 된다 — 그 명령은
 * 읽기 전용이라 안전하게 반복 실행할 수 있다).
 *
 * 사용법: npm run dataset:activate -- --base-ym=202607
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
    console.error("사용법: npm run dataset:activate -- --base-ym=202607");
    process.exitCode = 1;
    return;
  }

  const result = await promoteDataset(baseYm);
  if (!result.ok) {
    console.error(`[dataset:activate] 거부됨 — baseYm=${baseYm}는 아직 ACTIVE로 승격할 수 없습니다.`);
    console.error(`  최종 판정: ${result.evaluation.verdict}`);
    for (const reason of result.evaluation.reasons) console.error(`  - ${reason}`);
    console.error("  상세 drift 결과는 npm run dataset:drift -- --base-ym=" + baseYm + "로 확인하세요.");
    process.exitCode = 1;
    return;
  }

  console.log(`[dataset:activate] 성공 — baseYm=${result.baseYm}이 ACTIVE로 승격되었습니다.`);
  console.log(`  이전 ACTIVE: ${result.previousActiveBaseYm ?? "(없음)"}`);
  console.log(`  최종 판정: ${result.evaluation.verdict}`);
  for (const reason of result.evaluation.reasons) console.log(`  - ${reason}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
