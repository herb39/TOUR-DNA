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

  // Network provenance 판정(Phase 1-E, 2026-07-23 — POI 근거와 관계 근거를 독립적으로 판정한다).
  //
  // POI 근거: sourceType==="API"(실 TourAPI 동기화)와 "FIXTURE"(큐레이션)가 섞일 수 있다. 하나라도
  // fixture가 섞이면 이 POI 근거 전체를 LIVE_API라고 주장하지 않고 보수적으로 CURATED로 표시하되,
  // API 수/fixture 수를 별도로 노출해 혼합 상태를 투명하게 드러낸다(goal 6/7 — "API가 하나라도 있으면
  // LIVE_API"로 단순 처리하지 않음). PoiRelation의 존재 여부는 더 이상 이 판정에 영향을 주지 않는다
  // (goal 5 — 관계가 CURATED라는 이유만으로 API POI 근거까지 격하하지 않음).
  const poiApiCount = pois.filter((p) => p.sourceType === "API").length;
  const poiFixtureCount = pois.length - poiApiCount;
  const poiIsFallback = poiFixtureCount > 0;
  const poiProvenance: DataProvenance = poiIsFallback ? "CURATED" : "LIVE_API";

  // 관계 근거: 현재 syncService.ts가 연관관광지 API를 절대 호출하지 않는다(항상 POI_RELATION:SKIPPED —
  // docs/public-api-status.md 6번 항목, 정식 서비스명조차 미확인) — 즉 존재하는 PoiRelation 행은 전부
  // prisma/seed.ts가 넣은 CURATED 데이터다. 관계가 0건이면 "확인된 0건"인지 "애초에 근거가 없는지"
  // 현재 스키마로 구분할 수 없으므로(goal 8), null로 두어 이 근거 자체를 만들지 않는다(0을 임의로
  // CURATED로 지어내지 않음).
  const relationInput =
    relatedPoiCount > 0
      ? { count: relatedPoiCount, provenance: "CURATED" as const, isSnapshotFallback: true }
      : null;

  const networkInputs =
    pois.length > 0
      ? {
          attractionCount: pois.filter((p) => p.category === "ATTRACTION").length,
          relatedPoiCount,
          foodCount: pois.filter((p) => p.category === "FOOD").length,
          lodgingCount: pois.filter((p) => p.category === "LODGING").length,
          experienceCount: pois.filter((p) => p.category === "EXPERIENCE").length,
          collectedAt: new Date().toISOString(),
          poi: {
            apiCount: poiApiCount,
            fixtureCount: poiFixtureCount,
            provenance: poiProvenance,
            isSnapshotFallback: poiIsFallback,
          },
          relation: relationInput,
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
