// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2-C(2026-08-12) — STAGING dataset이 완전히 수집됐다는 사실만으로 자동 승격되지 않고,
 * completeness/audit + DNA drift gate를 모두 통과해야만 `promoteDataset`이 실제로 ACTIVE를 바꾸도록
 * 하는 단일 promotion 경로의 핵심 불변조건을 고정한다:
 * (1) 대상 dataset이 없거나 STAGING이 아니거나 ACTIVE가 없거나 target<=ACTIVE면 무거운 drift 계산
 *     자체를 시작하지 않고 즉시 BLOCKED.
 * (2) completeness/audit 미통과면 BLOCKED(드리프트 계산 안 함).
 * (3) drift gate가 REVIEW_REQUIRED/BLOCKED면 `promoteDataset`은 activateDataset을 호출하지 않는다
 *     (ACTIVE 유지).
 * (4) PASS일 때만 activateDataset을 호출해 실제로 승격한다.
 */

const datasetFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { dataset: { findUnique: (...args: unknown[]) => datasetFindUnique(...args) } },
}));

const getActiveDatasetBaseYm = vi.fn();
const checkDatasetCompleteness = vi.fn();
const activateDataset = vi.fn();
vi.mock("@/lib/services/activeDataset", () => ({
  getActiveDatasetBaseYm: (...args: unknown[]) => getActiveDatasetBaseYm(...args),
  checkDatasetCompleteness: (...args: unknown[]) => checkDatasetCompleteness(...args),
  activateDataset: (...args: unknown[]) => activateDataset(...args),
}));

const computeDatasetDriftReport = vi.fn();
vi.mock("@/lib/services/datasetDriftReport", () => ({
  computeDatasetDriftReport: (...args: unknown[]) => computeDatasetDriftReport(...args),
}));

import { evaluateDatasetPromotion, promoteDataset } from "@/lib/services/datasetPromotion";

function passingCompletenessReport() {
  return {
    verdict: "PASS" as const,
    verdictReasons: [],
    snapshot: { incompleteRegions: 0, errorRegions: 0, fullyCompleteRegions: 255 },
    region: { totalSigungu: 255 },
  };
}

function minimalDriftReport() {
  // decideDriftGateVerdict가 PASS를 내도록, 모든 지표가 임계값 이내인 최소 axisReports 5개 + 나머지.
  const axis = (name: string) => ({
    axis: name,
    comparableRegionCount: 200,
    activeMedian: 50,
    candidateMedian: 50,
    medianDelta: 0,
    activeP90: 80,
    candidateP90: 80,
    p90Delta: 0,
    activeP95: 90,
    candidateP95: 90,
    p95Delta: 0,
    meanAbsoluteDelta: 1,
    medianAbsoluteDelta: 1,
    p90AbsoluteDelta: 2,
    maxAbsoluteDelta: 3,
    spearmanRankCorrelation: 0.98,
    topDecile: { decileSize: 20, retainedCount: 20, retainedRatio: 1, entered: [], exited: [] },
    bottomDecile: { decileSize: 20, retainedCount: 20, retainedRatio: 1, entered: [], exited: [] },
    cohortChange: { newlyPresentRegions: [], removedRegions: [], activeMax: 100, candidateMax: 100, maxDelta: 0, candidateP95: 90, newExtremeRegions: [] },
    warnings: [],
  });
  return {
    activeBaseYm: "202606",
    candidateBaseYm: "202607",
    axisReports: ["demand", "stay", "spend", "diversity", "network"].map(axis),
    strengthWeakness: { comparedRegionCount: 200, unchangedCount: 195, changedCount: 5, changeRate: 0.025, changedRegions: [] },
    similarity: { seedRegionCodes: [], results: [], meanOverlap: 2.8, top1RetainedRatio: 0.9, zeroOverlapCount: 0, skippedCount: 0 },
    strategy: { scenarios: [], top1ChangedCount: 0, top1ChangedRatio: 0 },
  };
}

function bigDriftReport() {
  const report = minimalDriftReport();
  report.axisReports = report.axisReports.map((a) => ({ ...a, medianAbsoluteDelta: 50 })); // 임계값(15) 크게 초과
  return report;
}

beforeEach(() => {
  datasetFindUnique.mockReset();
  getActiveDatasetBaseYm.mockReset();
  checkDatasetCompleteness.mockReset();
  activateDataset.mockReset();
  computeDatasetDriftReport.mockReset();
});

describe("evaluateDatasetPromotion — BLOCKED 사전조건(무거운 drift 계산 시작 안 함)", () => {
  it("대상 dataset이 존재하지 않으면 BLOCKED다", async () => {
    datasetFindUnique.mockResolvedValue(null);

    const result = await evaluateDatasetPromotion("202607");

    expect(result.verdict).toBe("BLOCKED");
    expect(getActiveDatasetBaseYm).not.toHaveBeenCalled();
    expect(computeDatasetDriftReport).not.toHaveBeenCalled();
  });

  it("dataset이 STAGING이 아니면(예: 이미 ACTIVE) BLOCKED다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "ACTIVE" });

    const result = await evaluateDatasetPromotion("202607");

    expect(result.verdict).toBe("BLOCKED");
    expect(result.reasons.join(" ")).toContain("STAGING");
    expect(getActiveDatasetBaseYm).not.toHaveBeenCalled();
    expect(computeDatasetDriftReport).not.toHaveBeenCalled();
  });

  it("ACTIVE dataset이 없으면 BLOCKED다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue(null);

    const result = await evaluateDatasetPromotion("202607");

    expect(result.verdict).toBe("BLOCKED");
    expect(checkDatasetCompleteness).not.toHaveBeenCalled();
    expect(computeDatasetDriftReport).not.toHaveBeenCalled();
  });

  it("target baseYm이 ACTIVE보다 최신이 아니면 BLOCKED다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202605", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");

    const result = await evaluateDatasetPromotion("202605");

    expect(result.verdict).toBe("BLOCKED");
    expect(checkDatasetCompleteness).not.toHaveBeenCalled();
  });

  it("target baseYm이 ACTIVE와 정확히 같아도(승격이 아니라 재승격 시도) BLOCKED다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202606", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");

    const result = await evaluateDatasetPromotion("202606");

    expect(result.verdict).toBe("BLOCKED");
  });

  it("completeness/audit 미통과면 BLOCKED고 drift 계산은 하지 않는다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    checkDatasetCompleteness.mockResolvedValue({
      complete: false,
      report: { verdict: "INCOMPLETE", verdictReasons: ["미완료 지역 있음"], snapshot: { incompleteRegions: 3, errorRegions: 0 } },
    });

    const result = await evaluateDatasetPromotion("202607");

    expect(result.verdict).toBe("BLOCKED");
    expect(computeDatasetDriftReport).not.toHaveBeenCalled();
  });
});

describe("evaluateDatasetPromotion — 정상 candidate에서 drift report를 계산하고 gate를 판정한다", () => {
  it("completeness PASS + drift가 임계값 이내면 최종 PASS다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    checkDatasetCompleteness.mockResolvedValue({ complete: true, report: passingCompletenessReport() });
    computeDatasetDriftReport.mockResolvedValue(minimalDriftReport());

    const result = await evaluateDatasetPromotion("202607");

    expect(computeDatasetDriftReport).toHaveBeenCalledWith("202606", "202607");
    expect(result.verdict).toBe("PASS");
    expect(result.driftReport).not.toBeNull();
  });

  it("drift가 크면 REVIEW_REQUIRED다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    checkDatasetCompleteness.mockResolvedValue({ complete: true, report: passingCompletenessReport() });
    computeDatasetDriftReport.mockResolvedValue(bigDriftReport());

    const result = await evaluateDatasetPromotion("202607");

    expect(result.verdict).toBe("REVIEW_REQUIRED");
  });
});

describe("promoteDataset — PASS일 때만 실제로 승격한다", () => {
  it("PASS면 activateDataset을 호출해 승격한다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    checkDatasetCompleteness.mockResolvedValue({ complete: true, report: passingCompletenessReport() });
    computeDatasetDriftReport.mockResolvedValue(minimalDriftReport());
    activateDataset.mockResolvedValue({ ok: true, baseYm: "202607", previousActiveBaseYm: "202606" });

    const result = await promoteDataset("202607");

    expect(activateDataset).toHaveBeenCalledWith("202607");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.baseYm).toBe("202607");
      expect(result.previousActiveBaseYm).toBe("202606");
    }
  });

  it("REVIEW_REQUIRED면 activateDataset을 호출하지 않고 기존 ACTIVE를 유지한다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    checkDatasetCompleteness.mockResolvedValue({ complete: true, report: passingCompletenessReport() });
    computeDatasetDriftReport.mockResolvedValue(bigDriftReport());

    const result = await promoteDataset("202607");

    expect(activateDataset).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.evaluation.verdict).toBe("REVIEW_REQUIRED");
  });

  it("BLOCKED면 activateDataset을 호출하지 않고 기존 ACTIVE를 유지한다", async () => {
    datasetFindUnique.mockResolvedValue(null);

    const result = await promoteDataset("202607");

    expect(activateDataset).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.evaluation.verdict).toBe("BLOCKED");
  });

  it("evaluateDatasetPromotion은 어떤 DB 쓰기도 하지 않는다(dataset.findUnique 조회만 수행)", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    checkDatasetCompleteness.mockResolvedValue({ complete: true, report: passingCompletenessReport() });
    computeDatasetDriftReport.mockResolvedValue(minimalDriftReport());

    await evaluateDatasetPromotion("202607");

    expect(activateDataset).not.toHaveBeenCalled();
  });
});
