import { runTourismDataSync } from "../src/lib/services/syncService";
import { DEFAULT_BASE_YM } from "../src/lib/fixtures/metrics";
import { prisma } from "../src/lib/db";

async function main() {
  const baseYm = process.argv[2] ?? process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  console.log(`[sync-cli] baseYm=${baseYm} 동기화 시작`);
  const result = await runTourismDataSync({ baseYm, triggeredBy: "CLI" });
  console.log(JSON.stringify(result, null, 2));
  if (result.overallStatus === "FAILED") {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
