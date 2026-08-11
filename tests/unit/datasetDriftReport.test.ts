// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2-C(2026-08-12) — `computeDatasetDriftReport`가 기존 production 함수(computeDna/
 * computeStrategies/computeRegionSimilarityComparisons/buildAnalysisContext)를 실제로 호출해
 * 올바르게 조합하는지 확인한다. DB 접근 함수(`buildDnaEngineInput`/`fetchPoisByCategory`/
 * `fetchRegionComparisonProfiles`)만 mock하고, DNA/전략/유사도 산식 자체는 실제 코드를 그대로
 * 실행한다 — QA용으로 산식을 다시 구현하지 않는다는 원칙을 테스트에서도 지킨다.
 */

const buildDnaEngineInput = vi.fn();
vi.mock("@/lib/services/buildDnaEngineInput", () => ({
  buildDnaEngineInput: (...args: unknown[]) => buildDnaEngineInput(...args),
}));

const fetchPoisByCategory = vi.fn();
vi.mock("@/lib/services/fetchPoisByCategory", () => ({
  fetchPoisByCategory: (...args: unknown[]) => fetchPoisByCategory(...args),
}));

const fetchRegionComparisonProfiles = vi.fn();
vi.mock("@/lib/services/fetchRegionComparisonProfiles", () => ({
  fetchRegionComparisonProfiles: (...args: unknown[]) => fetchRegionComparisonProfiles(...args),
}));

import { computeDatasetDriftReport, DRIFT_QA_SCENARIOS } from "@/lib/services/datasetDriftReport";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";
import type { RegionAxisProfile } from "@/lib/domain/regionSimilarity";

const ACTIVE_BASE_YM = "202606";
const CANDIDATE_BASE_YM = "202607";

function metric(regionCode: string, rawValue: number, metricCode: string, baseYm: string): RegionMetricValue {
  return {
    regionCode,
    baseYm,
    metricCode,
    rawValue,
    unit: "index",
    adminLevel: "SIGUNGU",
    sourceCode: "TAR_SVC_DEM",
    collectedAt: "2026-08-01T00:00:00.000Z",
    provenance: "LIVE_API",
    isSnapshotFallback: false,
  };
}

/** QA 시나리오 지역 하나의 DnaEngineInput을 만든다 — 코호트에 서로 다른 몇 개 지역을 섞어 min-max가
 * 항상 중립값(50)만 나오지 않게 한다. `bump`로 baseYm(active/candidate)별 점수를 살짝 다르게 한다. */
function scenarioDnaInput(regionCode: string, baseYm: string, bump: number): DnaEngineInput {
  const others: [string, number][] = [
    ["OTHER_A", 30],
    ["OTHER_B", 60],
    ["OTHER_C", 90],
  ];
  const cohortFor = (metricCode: string, targetValue: number) =>
    [[regionCode, targetValue] as [string, number], ...others].map(([code, v]) => metric(code, v, metricCode, baseYm));

  return {
    regionCode,
    baseYm,
    adminLevel: "SIGUNGU",
    metricCohorts: {
      [METRIC_CODES.DEMAND_SERVICE]: cohortFor(METRIC_CODES.DEMAND_SERVICE, 70 + bump),
      [METRIC_CODES.DEMAND_RESOURCE]: cohortFor(METRIC_CODES.DEMAND_RESOURCE, 60 + bump),
      [METRIC_CODES.STAY]: cohortFor(METRIC_CODES.STAY, 50 + bump),
      [METRIC_CODES.SPEND]: cohortFor(METRIC_CODES.SPEND, 55 + bump),
      [METRIC_CODES.DIVERSITY]: cohortFor(METRIC_CODES.DIVERSITY, 65 + bump),
    },
    networkInputs: {
      attractionCount: 10,
      relatedPoiCount: 0,
      foodCount: 15,
      lodgingCount: 8,
      experienceCount: 4,
      collectedAt: "2026-08-01T00:00:00.000Z",
      poi: { apiCount: 10, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
      relation: null,
    },
  };
}

function profile(code: string, name: string, baseYm: string, demandScore: number): RegionAxisProfile {
  return {
    code,
    name,
    baseYm,
    axisScores: {
      demand: { score: demandScore, status: "LIVE" },
      stay: { score: 50, status: "LIVE" },
      spend: { score: 50, status: "LIVE" },
      diversity: { score: 50, status: "LIVE" },
      network: { score: 50, status: "LIVE" },
    },
    poiCountByCategory: { ATTRACTION: 5, FOOD: 10 },
  };
}

beforeEach(() => {
  buildDnaEngineInput.mockReset();
  fetchPoisByCategory.mockReset();
  fetchRegionComparisonProfiles.mockReset();

  fetchPoisByCategory.mockResolvedValue({ FOOD: [], ATTRACTION: [] });

  buildDnaEngineInput.mockImplementation(async (regionCode: string, baseYm: string) => {
    const bump = baseYm === CANDIDATE_BASE_YM ? 10 : 0;
    return scenarioDnaInput(regionCode, baseYm, bump);
  });

  fetchRegionComparisonProfiles.mockImplementation(async (baseYm: string) => {
    const bump = baseYm === CANDIDATE_BASE_YM ? 10 : 0;
    return [
      profile("SGG_GANGNEUNG", "강릉시", baseYm, 70 + bump),
      profile("SGG_GYEONGJU", "경주시", baseYm, 40),
      profile("SGG_JECHEON", "제천시", baseYm, 55),
      profile("R_LOW", "저점지역", baseYm, 10),
      profile("R_MID", "중간지역", baseYm, 50),
    ];
  });
});

describe("computeDatasetDriftReport — 실제 production 함수 조합", () => {
  it("5축 axisReports를 전부 생성하고, active/candidate 프로필 조회를 정확한 baseYm으로 호출한다", async () => {
    const report = await computeDatasetDriftReport(ACTIVE_BASE_YM, CANDIDATE_BASE_YM);

    expect(fetchRegionComparisonProfiles).toHaveBeenCalledWith(ACTIVE_BASE_YM);
    expect(fetchRegionComparisonProfiles).toHaveBeenCalledWith(CANDIDATE_BASE_YM);
    expect(report.axisReports).toHaveLength(5);
    expect(report.axisReports.map((a) => a.axis).sort()).toEqual(["demand", "diversity", "network", "spend", "stay"]);
    // SGG_GANGNEUNG의 demand가 70→80으로 올랐고 다른 지역은 그대로라 median delta가 0보다 커야 한다.
    const demandAxis = report.axisReports.find((a) => a.axis === "demand")!;
    expect(demandAxis.comparableRegionCount).toBe(5);
  });

  it("similarity drift가 seed 지역(강릉/경주/제천)에 대해 Top3를 실제로 계산한다", async () => {
    const report = await computeDatasetDriftReport(ACTIVE_BASE_YM, CANDIDATE_BASE_YM);

    const gangneung = report.similarity.results.find((r) => r.code === "SGG_GANGNEUNG");
    expect(gangneung).toBeDefined();
    expect(gangneung!.skipped).toBe(false);
    expect(gangneung!.activeTop3.length).toBeGreaterThan(0);
    // seed 목록에 있지만 이번 mock 프로필에는 없는 지역(예: 서울 중구)은 skipped로 처리돼야 한다.
    const seoul = report.similarity.results.find((r) => r.code === "SGG_SEOUL_140");
    expect(seoul?.skipped).toBe(true);
  });

  it("대표 QA 시나리오 3개 전부에 대해 실제 computeStrategies를 호출해 top3 templateId를 만든다", async () => {
    const report = await computeDatasetDriftReport(ACTIVE_BASE_YM, CANDIDATE_BASE_YM);

    expect(report.strategy.scenarios).toHaveLength(DRIFT_QA_SCENARIOS.length);
    for (const s of report.strategy.scenarios) {
      expect(s.activeTop3TemplateIds.length).toBeGreaterThan(0);
      expect(s.candidateTop3TemplateIds.length).toBeGreaterThan(0);
    }
    // buildDnaEngineInput이 3개 시나리오 지역 각각에 대해 active/candidate 두 baseYm으로 호출됐는지 확인.
    for (const scenario of DRIFT_QA_SCENARIOS) {
      expect(buildDnaEngineInput).toHaveBeenCalledWith(scenario.regionCode, ACTIVE_BASE_YM);
      expect(buildDnaEngineInput).toHaveBeenCalledWith(scenario.regionCode, CANDIDATE_BASE_YM);
    }
  });

  it("strength/weakness drift를 두 baseYm의 axisScores로부터 계산한다", async () => {
    const report = await computeDatasetDriftReport(ACTIVE_BASE_YM, CANDIDATE_BASE_YM);
    expect(report.strengthWeakness.comparedRegionCount).toBe(5);
  });
});
