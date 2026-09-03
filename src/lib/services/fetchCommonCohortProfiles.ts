import { prisma } from "@/lib/db";
import { computeDna } from "@/lib/domain/dna";
import {
  buildCommonMetricCohort,
  buildCommonPresenceCohort,
  intersectRegionCodeSets,
  type CommonMetricCohort,
} from "@/lib/domain/datasetDriftCommonCohort";
import { METRIC_CODES, type DnaEngineInput, type DnaResult, type NetworkRawInputs, type RegionMetricValue } from "@/lib/domain/types";
import type { RegionAxisProfile } from "@/lib/domain/regionSimilarity";
import { previousBaseYm } from "./baseYm";
import { fetchMetricCohort } from "./metricCohort";

const NORMALIZED_METRIC_CODES = [
  METRIC_CODES.DEMAND_SERVICE,
  METRIC_CODES.DEMAND_RESOURCE,
  METRIC_CODES.STAY,
  METRIC_CODES.SPEND,
  METRIC_CODES.DIVERSITY,
] as const;

export interface CommonCohortMetricReport {
  activeRegionCount: number;
  candidateRegionCount: number;
  commonRegionCount: number;
  asymmetricRegionCount: number;
}

export interface CommonCohortProfileSet {
  activeProfiles: RegionAxisProfile[];
  candidateProfiles: RegionAxisProfile[];
  activeDnaByCode: Map<string, DnaResult>;
  candidateDnaByCode: Map<string, DnaResult>;
  fullAxisCommonRegionCodes: string[];
  metricCohortReports: Record<string, CommonCohortMetricReport>;
  fullAxisCommonCohortSize: number;
}

interface PoiCountRow {
  regionId: string;
  category: string;
  sourceType: string;
}

interface PoiSummary {
  counts: Partial<Record<"ATTRACTION" | "FOOD" | "LODGING" | "EXPERIENCE" | "FESTIVAL" | "SHOPPING", number>>;
  apiCount: number;
  fixtureCount: number;
}

function mapByRegion(entries: RegionMetricValue[]): Map<string, RegionMetricValue> {
  return new Map(entries.map((entry) => [entry.regionCode, entry]));
}

function toMetricReport(cohort: CommonMetricCohort): CommonCohortMetricReport {
  return {
    activeRegionCount: cohort.activeRegionCount,
    candidateRegionCount: cohort.candidateRegionCount,
    commonRegionCount: cohort.commonRegionCodes.length,
    asymmetricRegionCount: cohort.asymmetricRegionCount,
  };
}

function buildPoiSummaries(rows: PoiCountRow[]): Map<string, PoiSummary> {
  const summaries = new Map<string, PoiSummary>();
  for (const row of rows) {
    const summary = summaries.get(row.regionId) ?? { counts: {}, apiCount: 0, fixtureCount: 0 };
    summary.counts[row.category as keyof PoiSummary["counts"]] =
      (summary.counts[row.category as keyof PoiSummary["counts"]] ?? 0) + 1;
    if (row.sourceType === "API") summary.apiCount++;
    else summary.fixtureCount++;
    summaries.set(row.regionId, summary);
  }
  return summaries;
}

function buildNetworkInputs(summary: PoiSummary | undefined): NetworkRawInputs | null {
  if (!summary) return null;
  const isSnapshotFallback = summary.fixtureCount > 0;
  return {
    attractionCount: summary.counts.ATTRACTION ?? 0,
    foodCount: summary.counts.FOOD ?? 0,
    lodgingCount: summary.counts.LODGING ?? 0,
    experienceCount: summary.counts.EXPERIENCE ?? 0,
    collectedAt: new Date().toISOString(),
    poi: {
      apiCount: summary.apiCount,
      fixtureCount: summary.fixtureCount,
      provenance: isSnapshotFallback ? "CURATED" : "LIVE_API",
      isSnapshotFallback,
    },
  };
}

function buildMetricCohorts(
  metricCohorts: Map<string, { active: RegionMetricValue[]; candidate: RegionMetricValue[] }>,
  baseYm: string,
  side: "active" | "candidate",
): Partial<Record<string, RegionMetricValue[]>> {
  return Object.fromEntries(
    [...metricCohorts.entries()].map(([metricCode, cohort]) => [metricCode, cohort[side].filter((entry) => entry.baseYm === baseYm)]),
  );
}

function buildDnaInput(
  regionCode: string,
  baseYm: string,
  side: "active" | "candidate",
  metricCohorts: Map<string, { active: RegionMetricValue[]; candidate: RegionMetricValue[] }>,
  commonGrowthCodes: Set<string>,
  visitorCurrentBySide: Map<string, RegionMetricValue>,
  visitorPreviousBySide: Map<string, RegionMetricValue>,
  networkInputs: NetworkRawInputs | null,
): DnaEngineInput {
  const growthIncluded = commonGrowthCodes.has(regionCode);
  return {
    regionCode,
    baseYm,
    adminLevel: "SIGUNGU",
    metricCohorts: buildMetricCohorts(metricCohorts, baseYm, side),
    previousVisitorCount: growthIncluded
      ? visitorPreviousBySide.get(regionCode)
        ? {
            value: visitorPreviousBySide.get(regionCode)!.rawValue,
            baseYm: visitorPreviousBySide.get(regionCode)!.baseYm,
            sourceCode: visitorPreviousBySide.get(regionCode)!.sourceCode,
            collectedAt: visitorPreviousBySide.get(regionCode)!.collectedAt,
            provenance: visitorPreviousBySide.get(regionCode)!.provenance,
            isSnapshotFallback: visitorPreviousBySide.get(regionCode)!.isSnapshotFallback,
          }
        : null
      : null,
    currentVisitorCount: growthIncluded
      ? visitorCurrentBySide.get(regionCode)
        ? {
            value: visitorCurrentBySide.get(regionCode)!.rawValue,
            baseYm: visitorCurrentBySide.get(regionCode)!.baseYm,
            sourceCode: visitorCurrentBySide.get(regionCode)!.sourceCode,
            collectedAt: visitorCurrentBySide.get(regionCode)!.collectedAt,
            provenance: visitorCurrentBySide.get(regionCode)!.provenance,
            isSnapshotFallback: visitorCurrentBySide.get(regionCode)!.isSnapshotFallback,
          }
        : null
      : null,
    visitorGrowthComparison: null,
    networkInputs,
  };
}

function toProfile(regionCode: string, regionName: string, baseYm: string, dna: DnaResult, poiSummary: PoiSummary | undefined): RegionAxisProfile {
  return {
    code: regionCode,
    name: regionName,
    baseYm,
    axisScores: {
      demand: { score: dna.demand.score, status: dna.demand.status },
      stay: { score: dna.stay.score, status: dna.stay.status },
      spend: { score: dna.spend.score, status: dna.spend.status },
      diversity: { score: dna.diversity.score, status: dna.diversity.status },
      network: { score: dna.network.score, status: dna.network.status },
    },
    poiCountByCategory: poiSummary?.counts ?? {},
  };
}

/**
 * promotion drift 전용 공통 비교 cohort를 만든다. 사용자-facing DNA 경로와 분리된 읽기 전용 조회이며,
 * raw metric은 양쪽 월에 모두 존재하는 지역만 각 metric의 정규화 cohort에 넣는다.
 */
export async function fetchCommonCohortProfiles(activeBaseYm: string, candidateBaseYm: string): Promise<CommonCohortProfileSet> {
  const cohortCache = new Map<string, Promise<RegionMetricValue[]>>();
  const load = (metricCode: string, baseYm: string) => {
    const key = `${metricCode}:${baseYm}`;
    const cached = cohortCache.get(key);
    if (cached) return cached;
    const pending = fetchMetricCohort(metricCode, baseYm, "SIGUNGU");
    cohortCache.set(key, pending);
    return pending;
  };

  const activePreviousYm = previousBaseYm(activeBaseYm);
  const candidatePreviousYm = previousBaseYm(candidateBaseYm);
  const requestedCohorts = new Map<string, Promise<RegionMetricValue[]>>();
  for (const metricCode of NORMALIZED_METRIC_CODES) {
    requestedCohorts.set(`active:${metricCode}`, load(metricCode, activeBaseYm));
    requestedCohorts.set(`candidate:${metricCode}`, load(metricCode, candidateBaseYm));
  }
  requestedCohorts.set("active:visitorCurrent", load(METRIC_CODES.VISITOR_CNT, activeBaseYm));
  requestedCohorts.set("active:visitorPrevious", load(METRIC_CODES.VISITOR_CNT, activePreviousYm));
  requestedCohorts.set("candidate:visitorCurrent", load(METRIC_CODES.VISITOR_CNT, candidateBaseYm));
  requestedCohorts.set("candidate:visitorPrevious", load(METRIC_CODES.VISITOR_CNT, candidatePreviousYm));

  const [regions, poiRows, ...cohortRows] = await Promise.all([
    prisma.region.findMany({ where: { level: "SIGUNGU" }, orderBy: { code: "asc" } }),
    prisma.poi.findMany({
      where: { region: { level: "SIGUNGU" } },
      select: { regionId: true, category: true, sourceType: true },
    }),
    ...requestedCohorts.values(),
  ]);
  const cohortEntries = [...requestedCohorts.keys()].reduce((map, key, index) => map.set(key, cohortRows[index]), new Map<string, RegionMetricValue[]>());
  const poiSummaries = buildPoiSummaries(poiRows as PoiCountRow[]);
  const regionCodeById = new Map(regions.map((region) => [region.id, region.code]));
  const poiSummaryByCode = new Map<string, PoiSummary>();
  for (const [regionId, summary] of poiSummaries) {
    const code = regionCodeById.get(regionId);
    if (code) poiSummaryByCode.set(code, summary);
  }

  const commonMetricCohorts = new Map<string, CommonMetricCohort>();
  const metricCohortReports: Record<string, CommonCohortMetricReport> = {};
  for (const metricCode of NORMALIZED_METRIC_CODES) {
    const cohort = buildCommonMetricCohort(
      cohortEntries.get(`active:${metricCode}`) ?? [],
      cohortEntries.get(`candidate:${metricCode}`) ?? [],
    );
    commonMetricCohorts.set(metricCode, cohort);
    metricCohortReports[metricCode] = toMetricReport(cohort);
  }

  const activeVisitorCurrent = mapByRegion(cohortEntries.get("active:visitorCurrent") ?? []);
  const activeVisitorPrevious = mapByRegion(cohortEntries.get("active:visitorPrevious") ?? []);
  const candidateVisitorCurrent = mapByRegion(cohortEntries.get("candidate:visitorCurrent") ?? []);
  const candidateVisitorPrevious = mapByRegion(cohortEntries.get("candidate:visitorPrevious") ?? []);
  const activeGrowthCodes = [...activeVisitorCurrent.keys()].filter((code) => activeVisitorPrevious.has(code));
  const candidateGrowthCodes = [...candidateVisitorCurrent.keys()].filter((code) => candidateVisitorPrevious.has(code));
  const commonGrowth = buildCommonPresenceCohort(activeGrowthCodes, candidateGrowthCodes);
  const growthReport: CommonCohortMetricReport = {
    activeRegionCount: activeGrowthCodes.length,
    candidateRegionCount: candidateGrowthCodes.length,
    commonRegionCount: commonGrowth.commonRegionCodes.length,
    asymmetricRegionCount: commonGrowth.asymmetricRegionCount,
  };
  metricCohortReports[METRIC_CODES.DEMAND_VISITOR_GROWTH] = growthReport;

  const activeDnaByCode = new Map<string, DnaResult>();
  const candidateDnaByCode = new Map<string, DnaResult>();
  const activeProfiles: RegionAxisProfile[] = [];
  const candidateProfiles: RegionAxisProfile[] = [];
  const activeGrowthSet = new Set(commonGrowth.commonRegionCodes);
  const candidateGrowthSet = activeGrowthSet;
  const metricCohorts = new Map<string, { active: RegionMetricValue[]; candidate: RegionMetricValue[] }>(
    [...commonMetricCohorts.entries()].map(([metricCode, cohort]) => [metricCode, { active: cohort.active, candidate: cohort.candidate }]),
  );

  for (const region of regions) {
    const activeDna = computeDna(
      buildDnaInput(
        region.code,
        activeBaseYm,
        "active",
        metricCohorts,
        activeGrowthSet,
        activeVisitorCurrent,
        activeVisitorPrevious,
        buildNetworkInputs(poiSummaryByCode.get(region.code)),
      ),
    );
    const candidateDna = computeDna(
      buildDnaInput(
        region.code,
        candidateBaseYm,
        "candidate",
        metricCohorts,
        candidateGrowthSet,
        candidateVisitorCurrent,
        candidateVisitorPrevious,
        buildNetworkInputs(poiSummaryByCode.get(region.code)),
      ),
    );
    activeDnaByCode.set(region.code, activeDna);
    candidateDnaByCode.set(region.code, candidateDna);
    activeProfiles.push(toProfile(region.code, region.name, activeBaseYm, activeDna, poiSummaryByCode.get(region.code)));
    candidateProfiles.push(toProfile(region.code, region.name, candidateBaseYm, candidateDna, poiSummaryByCode.get(region.code)));
  }

  const fullAxisCommonRegionCodes = intersectRegionCodeSets([
    activeProfiles.filter((profile) => Object.values(profile.axisScores).every((axis) => axis.score !== null)).map((profile) => profile.code),
    candidateProfiles.filter((profile) => Object.values(profile.axisScores).every((axis) => axis.score !== null)).map((profile) => profile.code),
  ]);

  return {
    activeProfiles,
    candidateProfiles,
    activeDnaByCode,
    candidateDnaByCode,
    fullAxisCommonRegionCodes,
    metricCohortReports,
    fullAxisCommonCohortSize: fullAxisCommonRegionCodes.length,
  };
}
