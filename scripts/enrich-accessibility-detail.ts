import { parseAccessibilityEnrichmentArgs, ACCESSIBILITY_ENRICHMENT_USAGE } from "../src/lib/domain/accessibilityEnrichment";
import { enrichAccessibilityEvidence } from "../src/lib/services/accessibilityEnrichment";
import { withRequestCounter } from "../src/lib/public-data/requestCounter";
import { prisma } from "../src/lib/db";

async function main(): Promise<void> {
  const parsed = parseAccessibilityEnrichmentArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[accessibility] ${parsed.error}`);
    console.error(ACCESSIBILITY_ENRICHMENT_USAGE);
    process.exitCode = 1;
    return;
  }

  const { result, requestCounts } = await withRequestCounter(() => enrichAccessibilityEvidence(parsed.value));
  console.log(JSON.stringify({ ...result, apiRequestCounts: requestCounts }, null, 2));
  if (result.status !== "COMPLETED") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
