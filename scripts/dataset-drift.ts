import { evaluateDatasetPromotion } from "../src/lib/services/datasetPromotion";
import { AXIS_LABEL_KO } from "../src/lib/domain/types";
import { prisma } from "../src/lib/db";

/**
 * Phase 2-C(2026-08-12): STAGING dataset을 ACTIVE로 승격하기 전에, 실제로 승격을 실행하지 않고
 * completeness/audit + DNA drift 결과만 미리 확인한다. **이 스크립트는 READ-ONLY다 — 어떤 DB 쓰기도
 * 하지 않는다.** ACTIVE를 실제로 바꾸려면 `npm run dataset:activate -- --base-ym=YYYYMM`을 별도로
 * 실행해야 한다(그 명령도 내부적으로 이 파일과 동일한 평가를 거친 뒤 PASS일 때만 승격한다).
 *
 * 사용법: npm run dataset:drift -- --base-ym=202607
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
    console.error("사용법: npm run dataset:drift -- --base-ym=202607");
    process.exitCode = 1;
    return;
  }

  console.log(`[dataset:drift] baseYm=${baseYm} 평가 시작(read-only, DB 쓰기 없음)...`);
  const evaluation = await evaluateDatasetPromotion(baseYm);

  console.log(`\n[dataset:drift] ACTIVE baseYm: ${evaluation.activeBaseYm ?? "(없음)"}`);
  console.log(`[dataset:drift] candidate baseYm: ${evaluation.baseYm}`);

  if (evaluation.completenessReport) {
    const r = evaluation.completenessReport;
    console.log(
      `[dataset:drift] completeness/audit: 판정=${r.verdict}, 완료 ${r.snapshot.fullyCompleteRegions}/${r.region.totalSigungu}, ` +
        `ERROR ${r.snapshot.errorRegions}곳`,
    );
  } else {
    console.log("[dataset:drift] completeness/audit: 평가하지 않음(그 전 단계에서 이미 BLOCKED)");
  }

  if (evaluation.driftReport) {
    const d = evaluation.driftReport;
    console.log("\n[dataset:drift] === DNA 축별 drift ===");
    for (const axis of d.axisReports) {
      console.log(
        `  ${AXIS_LABEL_KO[axis.axis]}(${axis.axis}): 비교 가능 ${axis.comparableRegionCount}곳, ` +
          `median ${axis.activeMedian?.toFixed(1)}→${axis.candidateMedian?.toFixed(1)}(Δ${axis.medianDelta?.toFixed(1)}), ` +
          `median|Δ| ${axis.medianAbsoluteDelta?.toFixed(1)}, p90|Δ| ${axis.p90AbsoluteDelta?.toFixed(1)}, ` +
          `max|Δ| ${axis.maxAbsoluteDelta?.toFixed(1)}, Spearman ${axis.spearmanRankCorrelation?.toFixed(3) ?? "N/A"}`,
      );
      console.log(
        `    top decile 유지 ${axis.topDecile.retainedCount}/${axis.topDecile.decileSize}, ` +
          `bottom decile 유지 ${axis.bottomDecile.retainedCount}/${axis.bottomDecile.decileSize}, ` +
          `신규 편입 ${axis.cohortChange.newlyPresentRegions.length}곳, 이탈 ${axis.cohortChange.removedRegions.length}곳, ` +
          `신규 극단값 ${axis.cohortChange.newExtremeRegions.length}곳`,
      );
      for (const w of axis.warnings) console.log(`    ⚠ ${w}`);
    }

    console.log("\n[dataset:drift] === strength/weakness drift ===");
    console.log(
      `  비교 ${d.strengthWeakness.comparedRegionCount}곳 중 변경 ${d.strengthWeakness.changedCount}곳 ` +
        `(${d.strengthWeakness.changeRate !== null ? (d.strengthWeakness.changeRate * 100).toFixed(1) : "N/A"}%)`,
    );

    console.log("\n[dataset:drift] === similarity drift(seed 10곳) ===");
    console.log(
      `  평균 Top3 overlap ${d.similarity.meanOverlap?.toFixed(2) ?? "N/A"}/3, ` +
        `Top1 유지율 ${d.similarity.top1RetainedRatio !== null ? (d.similarity.top1RetainedRatio * 100).toFixed(0) : "N/A"}%, ` +
        `0/3 overlap ${d.similarity.zeroOverlapCount}건, skipped ${d.similarity.skippedCount}건`,
    );

    console.log("\n[dataset:drift] === 대표 시나리오 전략 drift ===");
    for (const s of d.strategy.scenarios) {
      console.log(
        `  ${s.scenarioId}: 1위 ${s.activeTop1TemplateId ?? "N/A"} → ${s.candidateTop1TemplateId ?? "N/A"}` +
          `${s.top1Changed ? " (변경됨)" : ""}`,
      );
    }
  } else {
    console.log("\n[dataset:drift] DNA drift: 계산하지 않음(그 전 단계에서 이미 BLOCKED)");
  }

  console.log(`\n[dataset:drift] === 최종 판정: ${evaluation.verdict} ===`);
  for (const reason of evaluation.reasons) console.log(`  - ${reason}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
