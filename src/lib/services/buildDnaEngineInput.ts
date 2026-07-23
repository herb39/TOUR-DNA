import { prisma } from "@/lib/db";
import { METRIC_CODES, type DataProvenance, type DnaEngineInput } from "@/lib/domain/types";
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

  // Network provenance 판정(Phase 1-C, 2026-07-23): POI는 sourceType==="API"(실 TourAPI 동기화)와
  // "FIXTURE"(큐레이션)가 섞일 수 있고, PoiRelation은 현재 syncService.ts가 절대 채우지 않는다(항상
  // POI_RELATION:SKIPPED — docs/public-api-status.md 6번 항목, 정식 서비스명조차 미확인) — 즉 존재하는
  // PoiRelation 행은 전부 prisma/seed.ts가 넣은 CURATED 데이터다. 하나라도 non-API POI가 섞이거나
  // 관계 수가 0보다 크면 이 Network 근거 전체를 LIVE로 표시하지 않는다(마스터 문서 1-2절: "추정값이
  // 하나라도 포함되면 LIVE로 표시하지 않는다"와 동일한 원칙을 curated 데이터에도 적용).
  const hasNonApiPoi = pois.some((p) => p.sourceType !== "API");
  const hasCuratedRelations = relatedPoiCount > 0;
  const networkIsFallback = hasNonApiPoi || hasCuratedRelations;
  const networkProvenance: DataProvenance = networkIsFallback ? "CURATED" : "LIVE_API";

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
          provenance: networkProvenance,
          isSnapshotFallback: networkIsFallback,
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
          provenance: prevVisitor.provenance,
          isSnapshotFallback: prevVisitor.isSnapshotFallback,
        }
      : null,
    currentVisitorCount: currentVisitor
      ? {
          value: currentVisitor.rawValue,
          baseYm: currentVisitor.baseYm,
          sourceCode: currentVisitor.sourceCode,
          collectedAt: currentVisitor.collectedAt,
          provenance: currentVisitor.provenance,
          isSnapshotFallback: currentVisitor.isSnapshotFallback,
        }
      : null,
    networkInputs,
  };
}
