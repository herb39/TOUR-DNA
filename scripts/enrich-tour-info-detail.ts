import { parseTourInfoDetailEnrichmentArgs, TOUR_INFO_DETAIL_ENRICHMENT_USAGE } from "../src/lib/domain/tourInfoDetailEnrichment";
import { enrichTourInfoDetail } from "../src/lib/services/tourInfoDetailEnrichment";
import { prisma } from "../src/lib/db";

async function main() {
  const parsed = parseTourInfoDetailEnrichmentArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[tour-info-detail] ${parsed.error}`);
    console.error(TOUR_INFO_DETAIL_ENRICHMENT_USAGE);
    process.exitCode = 1;
    return;
  }

  const result = await enrichTourInfoDetail(parsed.value);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "COMPLETED") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
