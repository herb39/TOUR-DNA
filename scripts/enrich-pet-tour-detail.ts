import { parsePetTourEnrichmentArgs, PET_TOUR_ENRICHMENT_USAGE } from "../src/lib/domain/petTourEnrichment";
import { enrichPetTourEvidence } from "../src/lib/services/petTourEnrichment";
import { withRequestCounter } from "../src/lib/public-data/requestCounter";
import { prisma } from "../src/lib/db";

async function main() {
  const parsed = parsePetTourEnrichmentArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[pet-tour] ${parsed.error}`);
    console.error(PET_TOUR_ENRICHMENT_USAGE);
    process.exitCode = 1;
    return;
  }

  const { result, requestCounts } = await withRequestCounter(() => enrichPetTourEvidence(parsed.value));
  console.log(JSON.stringify({ ...result, apiRequestCounts: requestCounts }, null, 2));
  if (result.status !== "COMPLETED") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
