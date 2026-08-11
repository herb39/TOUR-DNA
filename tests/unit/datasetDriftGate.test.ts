import { describe, expect, it } from "vitest";
import {
  computeAxisDriftReport,
  computeStrengthWeaknessDrift,
  deriveStrongestWeakestAxis,
  decideDriftGateVerdict,
  summarizeSimilarityDrift,
  summarizeStrategyDrift,
  DRIFT_GATE_THRESHOLDS,
  type RegionAxisScoreSample,
  type AxisDriftReport,
} from "@/lib/domain/datasetDriftGate";

/**
 * Phase 2-C(2026-08-12) drift gate 순수 함수 테스트. 이 파일은 DB/외부 API에 전혀 접근하지 않는다.
 */

function samples(pairs: Array<[string, number | null, number | null]>): RegionAxisScoreSample[] {
  return pairs.map(([code, activeScore, candidateScore]) => ({ code, activeScore, candidateScore }));
}

describe("computeAxisDriftReport — 기본 통계", () => {
  it("median/p90/p95/절대차 통계를 정확히 계산한다(선형보간 percentile)", () => {
    // active: 10,20,...,100(10개), candidate: active + 5(모든 지역이 5점씩 오름)
    const pairs: Array<[string, number, number]> = Array.from({ length: 10 }, (_, i) => [
      `R${i}`,
      (i + 1) * 10,
      (i + 1) * 10 + 5,
    ]);
    const report = computeAxisDriftReport("demand", samples(pairs));

    expect(report.comparableRegionCount).toBe(10);
    // active 오름차순: 10..100, median(선형보간, n=10) = (50+60)/2 = 55
    expect(report.activeMedian).toBeCloseTo(55, 5);
    expect(report.candidateMedian).toBeCloseTo(60, 5);
    expect(report.medianDelta).toBeCloseTo(5, 5);
    // 모든 지역이 정확히 5점씩 올랐으므로 절대차 통계는 전부 5.
    expect(report.meanAbsoluteDelta).toBeCloseTo(5, 5);
    expect(report.medianAbsoluteDelta).toBeCloseTo(5, 5);
    expect(report.maxAbsoluteDelta).toBeCloseTo(5, 5);
    // 순위가 완전히 보존되므로 Spearman은 1에 매우 가깝다.
    expect(report.spearmanRankCorrelation).toBeCloseTo(1, 5);
  });

  it("비교 가능한 지역이 하나도 없으면 안전하게 null/경고를 반환한다", () => {
    const report = computeAxisDriftReport("stay", samples([["R1", null, 80], ["R2", 70, null]]));
    expect(report.comparableRegionCount).toBe(0);
    expect(report.activeMedian).toBeNull();
    expect(report.spearmanRankCorrelation).toBeNull();
    expect(report.warnings.length).toBeGreaterThan(0);
    // cohort 변화는 비교 불가와 무관하게 계산돼야 한다.
    expect(report.cohortChange.newlyPresentRegions).toEqual(["R1"]);
    expect(report.cohortChange.removedRegions).toEqual(["R2"]);
  });

  it("비교 가능한 지역이 1곳뿐이면 rank correlation을 계산하지 않고 경고를 남긴다", () => {
    const report = computeAxisDriftReport("spend", samples([["R1", 50, 55]]));
    expect(report.comparableRegionCount).toBe(1);
    expect(report.spearmanRankCorrelation).toBeNull();
    expect(report.warnings.some((w) => w.includes("2곳 미만"))).toBe(true);
  });

  it("순위가 정확히 역전되면 Spearman은 -1에 가깝다", () => {
    const pairs: Array<[string, number, number]> = [
      ["R1", 10, 100],
      ["R2", 30, 70],
      ["R3", 50, 50],
      ["R4", 70, 30],
      ["R5", 100, 10],
    ];
    const report = computeAxisDriftReport("diversity", samples(pairs));
    expect(report.spearmanRankCorrelation).toBeCloseTo(-1, 5);
  });

  it("동점(tie)이 있어도 평균 순위 방식으로 안전하게 계산된다(NaN 없음)", () => {
    const pairs: Array<[string, number, number]> = [
      ["R1", 50, 50],
      ["R2", 50, 60],
      ["R3", 70, 60],
      ["R4", 90, 90],
    ];
    const report = computeAxisDriftReport("network", samples(pairs));
    expect(report.spearmanRankCorrelation).not.toBeNull();
    expect(Number.isFinite(report.spearmanRankCorrelation!)).toBe(true);
  });
});

describe("computeAxisDriftReport — decile churn", () => {
  it("순위가 완전히 보존되면 top/bottom decile이 100% 유지된다", () => {
    const pairs: Array<[string, number, number]> = Array.from({ length: 20 }, (_, i) => [`R${i}`, i + 1, i + 1 + 3]);
    const report = computeAxisDriftReport("demand", samples(pairs));
    expect(report.topDecile.retainedRatio).toBe(1);
    expect(report.bottomDecile.retainedRatio).toBe(1);
    expect(report.topDecile.entered).toEqual([]);
    expect(report.bottomDecile.entered).toEqual([]);
  });

  it("최상위 지역이 candidate에서 최하위로 완전히 뒤바뀌면 top decile 이탈이 감지된다", () => {
    const pairs: Array<[string, number, number]> = Array.from({ length: 20 }, (_, i) => [`R${i}`, i + 1, 20 - i]);
    const report = computeAxisDriftReport("demand", samples(pairs));
    // active 1위(R19, score=20)가 candidate에서는 최하위(score=1)가 된다.
    expect(report.topDecile.exited).toContain("R19");
    expect(report.topDecile.entered).toContain("R0");
  });
});

describe("computeAxisDriftReport — cohort change(신규/이탈/극단값)", () => {
  it("신규 편입 지역 중 candidate p95를 크게 초과하는 값을 극단값으로 표시한다", () => {
    const pairs: Array<[string, number | null, number | null]> = [
      ...Array.from({ length: 19 }, (_, i) => [`R${i}`, i + 1, i + 1] as [string, number, number]),
      ["NEW_EXTREME", null, 99], // 신규 편입 + 나머지 대비 극단적으로 큰 값
    ];
    const report = computeAxisDriftReport("spend", samples(pairs));
    expect(report.cohortChange.newlyPresentRegions).toEqual(["NEW_EXTREME"]);
    expect(report.cohortChange.newExtremeRegions).toEqual(["NEW_EXTREME"]);
    expect(report.cohortChange.candidateMax).toBe(99);
  });

  it("신규 편입이어도 candidate p95 근처 값이면 극단값으로 표시하지 않는다", () => {
    const pairs: Array<[string, number | null, number | null]> = [
      ...Array.from({ length: 19 }, (_, i) => [`R${i}`, i + 1, i + 1] as [string, number, number]),
      ["NEW_NORMAL", null, 19], // 기존 분포 범위 안의 평범한 값
    ];
    const report = computeAxisDriftReport("spend", samples(pairs));
    expect(report.cohortChange.newlyPresentRegions).toEqual(["NEW_NORMAL"]);
    expect(report.cohortChange.newExtremeRegions).toEqual([]);
  });
});

describe("deriveStrongestWeakestAxis", () => {
  it("점수가 가장 높은/낮은 축을 정확히 고른다", () => {
    const result = deriveStrongestWeakestAxis({ demand: 80, stay: 30, spend: 50, diversity: 60, network: 70 });
    expect(result.strongest).toBe("demand");
    expect(result.weakest).toBe("stay");
  });

  it("동점이면 DNA_AXES 정의 순서상 먼저 나오는 축을 결정적으로 택한다", () => {
    const result = deriveStrongestWeakestAxis({ demand: 80, stay: 80, spend: 20, diversity: 20, network: 50 });
    expect(result.strongest).toBe("demand"); // demand가 stay보다 먼저 등장 + 동점
    expect(result.weakest).toBe("spend"); // spend가 diversity보다 먼저 등장 + 동점
  });

  it("null/undefined 축은 후보에서 제외한다", () => {
    const result = deriveStrongestWeakestAxis({ demand: null, stay: 40, spend: undefined, diversity: 60, network: 10 });
    expect(result.strongest).toBe("diversity");
    expect(result.weakest).toBe("network");
  });

  it("전부 값이 없으면 strongest/weakest 모두 null이다", () => {
    const result = deriveStrongestWeakestAxis({});
    expect(result.strongest).toBeNull();
    expect(result.weakest).toBeNull();
  });
});

describe("computeStrengthWeaknessDrift", () => {
  it("강점/약점 축이 그대로면 unchanged로, 하나라도 바뀌면 changed로 집계한다", () => {
    const report = computeStrengthWeaknessDrift([
      {
        code: "R1",
        activeScores: { demand: 90, stay: 10, spend: 50, diversity: 50, network: 50 },
        candidateScores: { demand: 90, stay: 10, spend: 55, diversity: 50, network: 50 }, // 강점/약점 축 동일
      },
      {
        code: "R2",
        activeScores: { demand: 90, stay: 10, spend: 50, diversity: 50, network: 50 },
        candidateScores: { demand: 10, stay: 90, spend: 50, diversity: 50, network: 50 }, // 강점/약점 축 반전
      },
    ]);
    expect(report.comparedRegionCount).toBe(2);
    expect(report.unchangedCount).toBe(1);
    expect(report.changedCount).toBe(1);
    expect(report.changedRegions).toEqual(["R2"]);
    expect(report.changeRate).toBeCloseTo(0.5, 5);
  });

  it("한쪽 baseYm에서 강점/약점 판정이 불가능한 지역은 비교 대상에서 제외한다", () => {
    const report = computeStrengthWeaknessDrift([
      { code: "R1", activeScores: {}, candidateScores: { demand: 50, stay: 50, spend: 50, diversity: 50, network: 50 } },
    ]);
    expect(report.comparedRegionCount).toBe(0);
    expect(report.changeRate).toBeNull();
  });
});

describe("summarizeSimilarityDrift", () => {
  it("overlap/top1 유지 여부를 정확히 집계한다", () => {
    const report = summarizeSimilarityDrift([
      { code: "SEED1", activeTop3: ["A", "B", "C"], candidateTop3: ["A", "B", "C"] }, // overlap 3, top1 유지
      { code: "SEED2", activeTop3: ["A", "B", "C"], candidateTop3: ["D", "E", "F"] }, // overlap 0
      { code: "SEED3", activeTop3: ["A", "B", "C"], candidateTop3: ["B", "A", "D"] }, // overlap 2, top1 변경
      { code: "SEED4", activeTop3: null, candidateTop3: null }, // skipped
    ]);
    expect(report.skippedCount).toBe(1);
    expect(report.zeroOverlapCount).toBe(1);
    expect(report.meanOverlap).toBeCloseTo((3 + 0 + 2) / 3, 5);
    expect(report.top1RetainedRatio).toBeCloseTo(1 / 3, 5);
  });
});

describe("summarizeStrategyDrift", () => {
  it("1위 전략 template이 바뀐 시나리오만 top1Changed로 표시한다", () => {
    const report = summarizeStrategyDrift([
      { scenarioId: "s1", activeTop3TemplateIds: ["T1", "T2", "T3"], candidateTop3TemplateIds: ["T1", "T3", "T2"] },
      { scenarioId: "s2", activeTop3TemplateIds: ["T1", "T2", "T3"], candidateTop3TemplateIds: ["T2", "T1", "T3"] },
    ]);
    expect(report.scenarios[0].top1Changed).toBe(false);
    expect(report.scenarios[1].top1Changed).toBe(true);
    expect(report.top1ChangedCount).toBe(1);
    expect(report.top1ChangedRatio).toBeCloseTo(0.5, 5);
  });
});

describe("decideDriftGateVerdict", () => {
  function axisReport(overrides: Partial<AxisDriftReport>): AxisDriftReport {
    return {
      axis: "demand",
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
      ...overrides,
    };
  }

  const passStrengthWeakness = { comparedRegionCount: 200, unchangedCount: 195, changedCount: 5, changeRate: 0.025, changedRegions: [] };
  const passSimilarity = { seedRegionCodes: [], results: [], meanOverlap: 2.8, top1RetainedRatio: 0.9, zeroOverlapCount: 0, skippedCount: 0 };
  const passStrategy = { scenarios: [], top1ChangedCount: 0, top1ChangedRatio: 0 };

  it("모든 지표가 임계값 이내면 PASS다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({})],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("PASS");
  });

  it("비교 가능 지역 수가 임계값 미만이면 BLOCKED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({ comparableRegionCount: DRIFT_GATE_THRESHOLDS.minComparableRegionCount - 1 })],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("BLOCKED");
  });

  it("median absolute delta가 NaN이면 BLOCKED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({ medianAbsoluteDelta: NaN })],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("BLOCKED");
  });

  it("축 median absolute delta가 임계값을 넘으면 REVIEW_REQUIRED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({ medianAbsoluteDelta: DRIFT_GATE_THRESHOLDS.reviewMedianAbsoluteDelta + 1 })],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("REVIEW_REQUIRED");
  });

  it("Spearman이 임계값보다 낮으면 REVIEW_REQUIRED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({ spearmanRankCorrelation: DRIFT_GATE_THRESHOLDS.reviewMinSpearman - 0.01 })],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("REVIEW_REQUIRED");
  });

  it("strength/weakness 변화율이 임계값을 넘으면 REVIEW_REQUIRED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({})],
      strengthWeakness: { ...passStrengthWeakness, changeRate: DRIFT_GATE_THRESHOLDS.reviewStrengthWeaknessChangeRate + 0.01 },
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("REVIEW_REQUIRED");
  });

  it("유사지역 평균 overlap이 임계값보다 낮으면 REVIEW_REQUIRED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({})],
      strengthWeakness: passStrengthWeakness,
      similarity: { ...passSimilarity, meanOverlap: DRIFT_GATE_THRESHOLDS.reviewMinMeanSimilarityOverlap - 0.1 },
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("REVIEW_REQUIRED");
  });

  it("0/3 overlap 사례가 임계값을 넘으면 REVIEW_REQUIRED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({})],
      strengthWeakness: passStrengthWeakness,
      similarity: { ...passSimilarity, zeroOverlapCount: DRIFT_GATE_THRESHOLDS.reviewMaxZeroOverlapSeeds + 1 },
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("REVIEW_REQUIRED");
  });

  it("대표 시나리오 전략 1위 변경 비율이 임계값을 넘으면 REVIEW_REQUIRED다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [axisReport({})],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: { ...passStrategy, top1ChangedRatio: DRIFT_GATE_THRESHOLDS.reviewMaxStrategyTop1ChangedRatio + 0.01 },
    });
    expect(decision.verdict).toBe("REVIEW_REQUIRED");
  });

  it("BLOCKED 조건이 있으면 REVIEW_REQUIRED 조건과 무관하게 항상 BLOCKED가 우선한다", () => {
    const decision = decideDriftGateVerdict({
      axisReports: [
        axisReport({ comparableRegionCount: DRIFT_GATE_THRESHOLDS.minComparableRegionCount - 1, medianAbsoluteDelta: 0.1 }),
      ],
      strengthWeakness: passStrengthWeakness,
      similarity: passSimilarity,
      strategy: passStrategy,
    });
    expect(decision.verdict).toBe("BLOCKED");
  });
});
