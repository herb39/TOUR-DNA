import { prisma } from "@/lib/db";
import { METRIC_CODES, type DnaEngineInput } from "@/lib/domain/types";
import { fetchMetricCohort } from "./metricCohort";
import { previousBaseYm } from "./baseYm";

const AXIS_METRIC_CODES = [
  METRIC_CODES.DEMAND_SERVICE,
  METRIC_CODES.DEMAND_RESOURCE,
  METRIC_CODES.STAY,
  METRIC_CODES.SPEND,
  METRIC_CODES.DIVERSITY,
];

export async function buildDnaEngineInput(regionCode: string, baseYm: string): Promise<DnaEngineInput> {
  const region = await prisma.region.findUniqueOrThrow({ where: { code: regionCode } });

  const cohorts: DnaEngineInput["metricCohorts"] = {};
  for (const metricCode of AXIS_METRIC_CODES) {
    cohorts[metricCode] = await fetchMetricCohort(metricCode, baseYm, region.level);
  }

  const prevBaseYm = previousBaseYm(baseYm);
  const [visitorCurrentCohort, visitorPrevCohort] = await Promise.all([
    fetchMetricCohort(METRIC_CODES.VISITOR_CNT, baseYm, region.level),
    fetchMetricCohort(METRIC_CODES.VISITOR_CNT, prevBaseYm, region.level),
  ]);
  const currentVisitor = visitorCurrentCohort.find((v) => v.regionCode === regionCode);
  const prevVisitor = visitorPrevCohort.find((v) => v.regionCode === regionCode);

  const pois = await prisma.poi.findMany({ where: { regionId: region.id } });
  const relatedPoiCount = await prisma.poiRelation.count({
    where: { centerPoi: { regionId: region.id } },
  });

  const networkInputs =
    pois.length > 0
      ? {
          attractionCount: pois.filter((p) => p.category === "ATTRACTION").length,
          relatedPoiCount,
          foodCount: pois.filter((p) => p.category === "FOOD").length,
          lodgingCount: pois.filter((p) => p.category === "LODGING").length,
          experienceCount: pois.filter((p) => p.category === "EXPERIENCE").length,
          sourceCode: "POI_RELATION",
          collectedAt: new Date().toISOString(),
          isSnapshotFallback: false,
        }
      : null;

  return {
    regionCode,
    baseYm,
    adminLevel: region.level,
    metricCohorts: cohorts,
    previousVisitorCount: prevVisitor
      ? {
          value: prevVisitor.rawValue,
          baseYm: prevVisitor.baseYm,
          sourceCode: prevVisitor.sourceCode,
          collectedAt: prevVisitor.collectedAt,
        }
      : null,
    currentVisitorCount: currentVisitor
      ? {
          value: currentVisitor.rawValue,
          baseYm: currentVisitor.baseYm,
          sourceCode: currentVisitor.sourceCode,
          collectedAt: currentVisitor.collectedAt,
        }
      : null,
    networkInputs,
  };
}
