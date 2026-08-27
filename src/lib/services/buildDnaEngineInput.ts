import { prisma } from "@/lib/db";
import {
  METRIC_CODES,
  type DataProvenance,
  type DnaEngineInput,
  type RegionMetricValue,
  type VisitorGrowthComparisonInput,
} from "@/lib/domain/types";
import { fetchMetricCohort } from "./metricCohort";
import { previousBaseYm, previousYearSameMonth } from "./baseYm";
import { measureAnalysisStage } from "./analysisTiming";

const AXIS_METRIC_CODES = [
  METRIC_CODES.DEMAND_SERVICE,
  METRIC_CODES.DEMAND_RESOURCE,
  METRIC_CODES.STAY,
  METRIC_CODES.SPEND,
  METRIC_CODES.DIVERSITY,
];

export interface BuildDnaEngineInputOptions {
  /** 한 번의 유사지역 비교 계산 안에서 동일 코호트 조회를 공유하는 요청 범위 캐시. 영속 캐시가 아니다. */
  metricCohortCache?: Map<string, Promise<RegionMetricValue[]>>;
}

function loadMetricCohort(
  metricCode: string,
  baseYm: string,
  adminLevel: DnaEngineInput["adminLevel"],
  cache?: Map<string, Promise<RegionMetricValue[]>>,
): Promise<RegionMetricValue[]> {
  if (!cache) return fetchMetricCohort(metricCode, baseYm, adminLevel);

  const key = `${metricCode}:${baseYm}:${adminLevel}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = fetchMetricCohort(metricCode, baseYm, adminLevel);
  cache.set(key, pending);
  return pending;
}

export async function buildDnaEngineInput(
  regionCode: string,
  baseYm: string,
  options: BuildDnaEngineInputOptions = {},
): Promise<DnaEngineInput> {
  const region = await measureAnalysisStage(
    "dna-input.region-load",
    () => prisma.region.findUniqueOrThrow({ where: { code: regionCode } }),
    { io: "db", queryCount: 1, regionCode },
  );

  const cohorts: DnaEngineInput["metricCohorts"] = {};
  await measureAnalysisStage(
    "dna-input.axis-cohorts",
    async () => {
      for (const metricCode of AXIS_METRIC_CODES) {
        cohorts[metricCode] = await loadMetricCohort(metricCode, baseYm, region.level, options.metricCohortCache);
      }
    },
    {
      io: "db",
      queryCount: options.metricCohortCache ? 0 : AXIS_METRIC_CODES.length,
      execution: "sequential",
      cache: options.metricCohortCache ? "REQUEST_SHARED" : "NONE",
      regionCode,
    },
  );

  const prevBaseYm = previousBaseYm(baseYm);
  const yoyBaseYm = previousYearSameMonth(baseYm);
  const [visitorCurrentCohort, visitorPrevCohort, visitorYoyCohort] = await measureAnalysisStage(
    "dna-input.visitor-cohorts",
    () =>
      Promise.all([
        loadMetricCohort(METRIC_CODES.VISITOR_CNT, baseYm, region.level, options.metricCohortCache),
        loadMetricCohort(METRIC_CODES.VISITOR_CNT, prevBaseYm, region.level, options.metricCohortCache),
        loadMetricCohort(METRIC_CODES.VISITOR_CNT, yoyBaseYm, region.level, options.metricCohortCache),
      ]),
    {
      io: "db",
      queryCount: options.metricCohortCache ? 0 : 3,
      execution: "parallel",
      cache: options.metricCohortCache ? "REQUEST_SHARED" : "NONE",
      regionCode,
    },
  );
  const currentVisitor = visitorCurrentCohort.find((v) => v.regionCode === regionCode);
  const prevVisitor = visitorPrevCohort.find((v) => v.regionCode === regionCode);
  const yoyVisitor = visitorYoyCohort.find((v) => v.regionCode === regionCode);

  // 화면 표시용 증감률 비교(2026-07-29): 전년 동월 데이터를 우선 사용하고, 없을 때만 직전 확인월로
  // 대체한다. DNA 수요 축 점수(previousVisitorCount 기반, 전월 대비)는 그대로 두고 절대 바꾸지 않는다 —
  // 이 비교값은 요약카드/전략 추천 근거 표시에만 쓰인다.
  const visitorGrowthComparison: VisitorGrowthComparisonInput | null = (() => {
    if (!currentVisitor) return null;
    const chosen = yoyVisitor
      ? { basis: "YOY" as const, entry: yoyVisitor }
      : prevVisitor
        ? { basis: "MOM" as const, entry: prevVisitor }
        : null;
    if (!chosen) return null;
    const growthRatePercent =
      chosen.entry.rawValue > 0
        ? Math.round(((currentVisitor.rawValue - chosen.entry.rawValue) / chosen.entry.rawValue) * 10000) / 100
        : null;
    return {
      basis: chosen.basis,
      comparisonBaseYm: chosen.entry.baseYm,
      comparisonValue: chosen.entry.rawValue,
      growthRatePercent,
    };
  })();

  const pois = await measureAnalysisStage(
    "dna-input.poi-load",
    () => prisma.poi.findMany({ where: { regionId: region.id } }),
    { io: "db", queryCount: 1, regionCode },
  );

  // Network provenance 판정(Phase 1-E, 2026-07-23 도입 — 이후 Phase 3(2026-08-13)에서 관계 근거는
  // 완전히 제외했다. PoiRelation은 더 이상 조회하지 않는다 — 산식이 이 데이터를 전혀 쓰지 않으므로
  // (docs/scoring-model.md 참고), DB의 기존 PoiRelation 행은 historical/reference로만 남는다).
  //
  // POI 근거: sourceType==="API"(실 TourAPI 동기화)와 "FIXTURE"(큐레이션)가 섞일 수 있다. 하나라도
  // fixture가 섞이면 이 POI 근거 전체를 LIVE_API라고 주장하지 않고 보수적으로 CURATED로 표시하되,
  // API 수/fixture 수를 별도로 노출해 혼합 상태를 투명하게 드러낸다("API가 하나라도 있으면 LIVE_API"로
  // 단순 처리하지 않음).
  const poiApiCount = pois.filter((p) => p.sourceType === "API").length;
  const poiFixtureCount = pois.length - poiApiCount;
  const poiIsFallback = poiFixtureCount > 0;
  const poiProvenance: DataProvenance = poiIsFallback ? "CURATED" : "LIVE_API";

  const networkInputs =
    pois.length > 0
      ? {
          attractionCount: pois.filter((p) => p.category === "ATTRACTION").length,
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
    visitorGrowthComparison,
    networkInputs,
  };
}
