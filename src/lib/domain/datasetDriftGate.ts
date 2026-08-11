import { DNA_AXES, type DnaAxisKey } from "./types";

/**
 * Phase 2-C(2026-08-12): STAGING dataset(candidate baseYm)을 ACTIVE(현재 baseYm)와 비교해 DNA 5축
 * 점수가 얼마나 달라지는지 순수 계산으로 측정한다. 이 파일은 DB에 전혀 접근하지 않는다 — 실제 DNA 값
 * 조회·계산은 `src/lib/services/datasetPromotion.ts`가 기존 `buildDnaEngineInput`/`computeDna`/
 * `fetchRegionComparisonProfiles`/`computeRegionSimilarityComparisons`/`computeStrategies`를 그대로
 * 재사용해 조립한 뒤, 이 파일의 순수 통계 함수에 넘긴다 — DNA/정규화/유사도/전략 산식은 여기서 전혀
 * 다시 구현하지 않는다.
 *
 * ## threshold에 대한 중요한 전제
 * 2026-08-12 기준 전국 규모로 완전히 수집된 baseYm은 사실상 202606 하나뿐이라, 실제 월간
 * historical drift 분포를 아직 관측하지 못했다. 아래 `DRIFT_GATE_THRESHOLDS`는 "이 정도 변화면
 * 사람이 한 번 더 보는 게 안전하다"는 보수적 안전장치일 뿐, 실측 근거로 확정된 값이 아니다 — 다음
 * 전국 dataset(예: 202607)이 실제로 완성되어 진짜 월간 drift 분포를 관측하면 반드시 재조정해야
 * 한다. 판단 근거는 `docs/implementation-status.md`의 Phase 2-C 절에 기록한다.
 */

export interface RegionAxisScoreSample {
  code: string;
  activeScore: number | null;
  candidateScore: number | null;
}

export interface DecileChurnReport {
  /** 비교 가능한 지역 수 기준으로 정한 decile 크기(각 10%, 최소 1). */
  decileSize: number;
  retainedCount: number;
  retainedRatio: number | null;
  /** candidate decile에 새로 들어온 지역(active decile에는 없었음). */
  entered: string[];
  /** active decile에서 빠진 지역(candidate decile에는 없음). */
  exited: string[];
}

export interface CohortChangeReport {
  /** candidate에는 값이 있지만 active에는 없던 지역(신규 편입 — 대개 upstream 데이터 제공 여부 변화). */
  newlyPresentRegions: string[];
  /** active에는 값이 있었지만 candidate에는 없는 지역. */
  removedRegions: string[];
  activeMax: number | null;
  candidateMax: number | null;
  maxDelta: number | null;
  /** candidate 전체(비교 가능 여부 무관) 분포의 p95 — newExtremeRegions 판정 기준. */
  candidateP95: number | null;
  /** 신규 편입 지역 중 candidateP95보다 뚜렷하게 큰 값을 가진 지역(극단값 유입 경보). */
  newExtremeRegions: string[];
}

export interface AxisDriftReport {
  axis: DnaAxisKey;
  comparableRegionCount: number;
  activeMedian: number | null;
  candidateMedian: number | null;
  medianDelta: number | null;
  activeP90: number | null;
  candidateP90: number | null;
  p90Delta: number | null;
  activeP95: number | null;
  candidateP95: number | null;
  p95Delta: number | null;
  meanAbsoluteDelta: number | null;
  medianAbsoluteDelta: number | null;
  p90AbsoluteDelta: number | null;
  maxAbsoluteDelta: number | null;
  /** 평균 순위(tie는 평균 순위로 처리) 기준 Pearson correlation — 표준적인 tie-보정 Spearman 방식. */
  spearmanRankCorrelation: number | null;
  topDecile: DecileChurnReport;
  bottomDecile: DecileChurnReport;
  cohortChange: CohortChangeReport;
  warnings: string[];
}

/** 선형보간(linear interpolation) 방식 percentile — numpy 기본값과 동일한 방식이라 별도 통계
 * 라이브러리 없이도 결과를 다른 도구로 재현·검증할 수 있다. `sortedAsc`는 오름차순 정렬된 배열이어야
 * 한다(호출부 책임). */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedAsc[lower];
  const weight = idx - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

/** 평균 순위(ties = 평균) 배열을 만든다 — 표준 tie-보정 rank 방식. */
function averageRanks(values: number[]): number[] {
  const n = values.length;
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let idx = 0;
  while (idx < n) {
    let j = idx;
    while (j + 1 < n && order[j + 1].v === order[idx].v) j++;
    const avgRank = (idx + j) / 2 + 1; // 1-based rank
    for (let k = idx; k <= j; k++) ranks[order[k].i] = avgRank;
    idx = j + 1;
  }
  return ranks;
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 2) return null;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null; // 한쪽이 전부 동일값이면 상관계수 정의 불가.
  return cov / Math.sqrt(varX * varY);
}

/** tie를 평균 순위로 보정한 Spearman rank correlation. */
function spearmanCorrelation(x: number[], y: number[]): number | null {
  if (x.length < 2) return null;
  return pearsonCorrelation(averageRanks(x), averageRanks(y));
}

function computeDecileChurn(
  comparable: { code: string; activeScore: number; candidateScore: number }[],
  direction: "top" | "bottom",
): DecileChurnReport {
  const decileSize = Math.max(1, Math.round(comparable.length * 0.1));
  const sortByActive = [...comparable].sort((a, b) =>
    direction === "top" ? b.activeScore - a.activeScore : a.activeScore - b.activeScore,
  );
  const sortByCandidate = [...comparable].sort((a, b) =>
    direction === "top" ? b.candidateScore - a.candidateScore : a.candidateScore - b.candidateScore,
  );
  const activeSet = new Set(sortByActive.slice(0, decileSize).map((r) => r.code));
  const candidateSet = new Set(sortByCandidate.slice(0, decileSize).map((r) => r.code));
  const retained = [...activeSet].filter((code) => candidateSet.has(code));
  const entered = [...candidateSet].filter((code) => !activeSet.has(code));
  const exited = [...activeSet].filter((code) => !candidateSet.has(code));
  return {
    decileSize,
    retainedCount: retained.length,
    retainedRatio: activeSet.size > 0 ? retained.length / activeSet.size : null,
    entered,
    exited,
  };
}

/** 신규 극단값 판정 여유(candidate p95보다 이만큼 더 크면 "뚜렷하게 큰 값"으로 본다). 점수 스케일이
 * 0~100 고정이라는 전제를 이용한 고정 마진이다 — 근거 없이 채택한 숫자이므로 report 근거란에 항상
 * 함께 출력한다(임계값이 아니라 관측·기록용 마진일 뿐, gate 판정에는 쓰지 않는다). */
const NEW_EXTREME_MARGIN = 10;

export function computeAxisDriftReport(axis: DnaAxisKey, samples: RegionAxisScoreSample[]): AxisDriftReport {
  const warnings: string[] = [];
  const comparable = samples
    .filter((s): s is { code: string; activeScore: number; candidateScore: number } =>
      s.activeScore !== null && s.candidateScore !== null,
    )
    .map((s) => ({ code: s.code, activeScore: s.activeScore, candidateScore: s.candidateScore }));

  const activeAllValues = samples.filter((s) => s.activeScore !== null).map((s) => s.activeScore as number);
  const candidateAllValues = samples.filter((s) => s.candidateScore !== null).map((s) => s.candidateScore as number);
  const activeMax = activeAllValues.length > 0 ? Math.max(...activeAllValues) : null;
  const candidateMax = candidateAllValues.length > 0 ? Math.max(...candidateAllValues) : null;
  const candidateSortedAll = [...candidateAllValues].sort((a, b) => a - b);
  const candidateP95All = candidateSortedAll.length > 0 ? percentile(candidateSortedAll, 0.95) : null;

  const newlyPresentRegions = samples.filter((s) => s.activeScore === null && s.candidateScore !== null).map((s) => s.code);
  const removedRegions = samples.filter((s) => s.activeScore !== null && s.candidateScore === null).map((s) => s.code);
  const newExtremeRegions = samples
    .filter(
      (s) =>
        s.activeScore === null &&
        s.candidateScore !== null &&
        candidateP95All !== null &&
        s.candidateScore > candidateP95All + NEW_EXTREME_MARGIN,
    )
    .map((s) => s.code);

  const cohortChange: CohortChangeReport = {
    newlyPresentRegions,
    removedRegions,
    activeMax,
    candidateMax,
    maxDelta: activeMax !== null && candidateMax !== null ? candidateMax - activeMax : null,
    candidateP95: candidateP95All,
    newExtremeRegions,
  };

  if (comparable.length === 0) {
    warnings.push("두 baseYm 모두에서 값이 있는(비교 가능한) 지역이 하나도 없다.");
    const emptyDecile: DecileChurnReport = { decileSize: 0, retainedCount: 0, retainedRatio: null, entered: [], exited: [] };
    return {
      axis,
      comparableRegionCount: 0,
      activeMedian: null,
      candidateMedian: null,
      medianDelta: null,
      activeP90: null,
      candidateP90: null,
      p90Delta: null,
      activeP95: null,
      candidateP95: null,
      p95Delta: null,
      meanAbsoluteDelta: null,
      medianAbsoluteDelta: null,
      p90AbsoluteDelta: null,
      maxAbsoluteDelta: null,
      spearmanRankCorrelation: null,
      topDecile: emptyDecile,
      bottomDecile: emptyDecile,
      cohortChange,
      warnings,
    };
  }

  if (comparable.length < 2) {
    warnings.push("비교 가능한 지역이 2곳 미만이라 rank correlation을 계산할 수 없다.");
  }

  const activeValues = comparable.map((s) => s.activeScore).sort((a, b) => a - b);
  const candidateValues = comparable.map((s) => s.candidateScore).sort((a, b) => a - b);
  const absoluteDeltas = comparable.map((s) => Math.abs(s.candidateScore - s.activeScore)).sort((a, b) => a - b);

  const activeMedian = percentile(activeValues, 0.5);
  const candidateMedian = percentile(candidateValues, 0.5);
  const activeP90 = percentile(activeValues, 0.9);
  const candidateP90 = percentile(candidateValues, 0.9);
  const activeP95 = percentile(activeValues, 0.95);
  const candidateP95 = percentile(candidateValues, 0.95);

  const meanAbsoluteDelta = absoluteDeltas.reduce((a, b) => a + b, 0) / absoluteDeltas.length;

  return {
    axis,
    comparableRegionCount: comparable.length,
    activeMedian,
    candidateMedian,
    medianDelta: candidateMedian - activeMedian,
    activeP90,
    candidateP90,
    p90Delta: candidateP90 - activeP90,
    activeP95,
    candidateP95,
    p95Delta: candidateP95 - activeP95,
    meanAbsoluteDelta,
    medianAbsoluteDelta: percentile(absoluteDeltas, 0.5),
    p90AbsoluteDelta: percentile(absoluteDeltas, 0.9),
    maxAbsoluteDelta: absoluteDeltas[absoluteDeltas.length - 1],
    spearmanRankCorrelation: spearmanCorrelation(
      comparable.map((s) => s.activeScore),
      comparable.map((s) => s.candidateScore),
    ),
    topDecile: computeDecileChurn(comparable, "top"),
    bottomDecile: computeDecileChurn(comparable, "bottom"),
    cohortChange,
    warnings,
  };
}

/** 5축 점수 중 가장 강한/약한 축을 결정한다(문자열 파싱 없이 점수 그대로 비교) — 동점이면 DNA_AXES에
 * 정의된 고정 순서상 먼저 나오는 축을 택한다(호출마다 동일한 결과를 보장하는 결정적 tie-break). */
export function deriveStrongestWeakestAxis(
  scores: Partial<Record<DnaAxisKey, number | null>>,
): { strongest: DnaAxisKey | null; weakest: DnaAxisKey | null } {
  let strongest: DnaAxisKey | null = null;
  let weakest: DnaAxisKey | null = null;
  let maxScore = -Infinity;
  let minScore = Infinity;
  for (const axis of DNA_AXES) {
    const score = scores[axis];
    if (score === null || score === undefined) continue;
    if (score > maxScore) {
      maxScore = score;
      strongest = axis;
    }
    if (score < minScore) {
      minScore = score;
      weakest = axis;
    }
  }
  return { strongest, weakest };
}

export interface StrengthWeaknessChangeReport {
  comparedRegionCount: number;
  unchangedCount: number;
  changedCount: number;
  changeRate: number | null;
  changedRegions: string[];
}

export function computeStrengthWeaknessDrift(
  regions: Array<{
    code: string;
    activeScores: Partial<Record<DnaAxisKey, number | null>>;
    candidateScores: Partial<Record<DnaAxisKey, number | null>>;
  }>,
): StrengthWeaknessChangeReport {
  const changedRegions: string[] = [];
  let comparedRegionCount = 0;
  for (const r of regions) {
    const active = deriveStrongestWeakestAxis(r.activeScores);
    const candidate = deriveStrongestWeakestAxis(r.candidateScores);
    if (active.strongest === null || active.weakest === null || candidate.strongest === null || candidate.weakest === null) {
      continue; // 축 점수가 부족해 강점/약점 자체를 판정할 수 없는 지역은 비교 대상에서 뺀다.
    }
    comparedRegionCount++;
    if (active.strongest !== candidate.strongest || active.weakest !== candidate.weakest) {
      changedRegions.push(r.code);
    }
  }
  return {
    comparedRegionCount,
    unchangedCount: comparedRegionCount - changedRegions.length,
    changedCount: changedRegions.length,
    changeRate: comparedRegionCount > 0 ? changedRegions.length / comparedRegionCount : null,
    changedRegions,
  };
}

/**
 * 유사지역 Top3 drift 판정용 seed 지역 10곳 — 근거 없이 무작위로 고르지 않고, 유형별로 명시적으로
 * 선정했다(해안 관광지·수도권 상권·섬 지역·산악 지역·소규모 어촌·내륙 일반 지역을 각 1곳 이상 포함).
 * 매번 이 배열 순서 그대로 사용한다(랜덤 샘플 금지).
 */
export const SIMILARITY_DRIFT_SEED_REGION_CODES = [
  "SGG_GANGNEUNG", // 강릉시 — 해안 관광지
  "SGG_GYEONGJU", // 경주시 — 문화유산 관광지
  "SGG_JECHEON", // 제천시 — 내륙 웰니스
  "SGG_SEOUL_140", // 서울 중구 — 수도권 핵심 상권
  "SGG_SEOUL_680", // 강남구 — 수도권 대형 상권
  "SGG_JEJU", // 제주시 — 도서 지역
  "SGG_HAEUNDAE", // 해운대구 — 해수욕장 관광지
  "SGG_PYEONGCHANG", // 평창군 — 산악 지역
  "SGG_NAMHAE", // 남해군 — 소규모 어촌
  "SGG_CHUNGBUK_130", // 충주시 — 내륙 일반 지역
] as const;

export interface SimilarityDriftSeedResult {
  code: string;
  /** seed 지역이 active/candidate 어느 한쪽에서라도 비교 프로필을 찾지 못하면 true — 이 경우
   * activeTop3/candidateTop3는 빈 배열이고 overlap 계산에서 제외된다. */
  skipped: boolean;
  activeTop3: string[];
  candidateTop3: string[];
  overlapCount: number;
  top1Unchanged: boolean;
}

export interface SimilarityDriftReport {
  seedRegionCodes: readonly string[];
  results: SimilarityDriftSeedResult[];
  /** skipped가 아닌 결과만 집계한다. */
  meanOverlap: number | null;
  top1RetainedRatio: number | null;
  zeroOverlapCount: number;
  skippedCount: number;
}

/** seed별 activeTop3/candidateTop3(이미 계산된 유사지역 Top3 코드 목록)를 받아 overlap 통계만
 * 계산하는 순수 함수 — 실제 Top3 계산(computeRegionSimilarityComparisons 호출)은 서비스 계층이
 * 담당한다(이 파일은 DB/도메인 유사도 산식을 다시 구현하지 않는다). */
export function summarizeSimilarityDrift(
  seedResults: Array<{ code: string; activeTop3: string[] | null; candidateTop3: string[] | null }>,
): SimilarityDriftReport {
  const results: SimilarityDriftSeedResult[] = seedResults.map((s) => {
    if (s.activeTop3 === null || s.candidateTop3 === null) {
      return { code: s.code, skipped: true, activeTop3: [], candidateTop3: [], overlapCount: 0, top1Unchanged: false };
    }
    const overlapCount = s.activeTop3.filter((code) => s.candidateTop3!.includes(code)).length;
    const top1Unchanged = s.activeTop3[0] !== undefined && s.activeTop3[0] === s.candidateTop3[0];
    return { code: s.code, skipped: false, activeTop3: s.activeTop3, candidateTop3: s.candidateTop3, overlapCount, top1Unchanged };
  });

  const active = results.filter((r) => !r.skipped);
  const meanOverlap = active.length > 0 ? active.reduce((sum, r) => sum + r.overlapCount, 0) / active.length : null;
  const top1RetainedRatio = active.length > 0 ? active.filter((r) => r.top1Unchanged).length / active.length : null;
  const zeroOverlapCount = active.filter((r) => r.overlapCount === 0).length;

  return {
    seedRegionCodes: SIMILARITY_DRIFT_SEED_REGION_CODES,
    results,
    meanOverlap,
    top1RetainedRatio,
    zeroOverlapCount,
    skippedCount: results.length - active.length,
  };
}

export interface StrategyDriftScenarioResult {
  scenarioId: string;
  activeTop1TemplateId: string | null;
  candidateTop1TemplateId: string | null;
  top1Changed: boolean;
  activeTop3TemplateIds: string[];
  candidateTop3TemplateIds: string[];
}

export interface StrategyDriftReport {
  scenarios: StrategyDriftScenarioResult[];
  top1ChangedCount: number;
  top1ChangedRatio: number | null;
}

/** 대표 시나리오별로 이미 계산된 전략 순위(templateId 목록)를 받아 변화만 집계한다 — 전략 점수식
 * 자체(computeStrategies)는 이 파일에서 재구현하지 않는다. */
export function summarizeStrategyDrift(
  scenarioResults: Array<{ scenarioId: string; activeTop3TemplateIds: string[]; candidateTop3TemplateIds: string[] }>,
): StrategyDriftReport {
  const scenarios: StrategyDriftScenarioResult[] = scenarioResults.map((s) => {
    const activeTop1 = s.activeTop3TemplateIds[0] ?? null;
    const candidateTop1 = s.candidateTop3TemplateIds[0] ?? null;
    return {
      scenarioId: s.scenarioId,
      activeTop1TemplateId: activeTop1,
      candidateTop1TemplateId: candidateTop1,
      top1Changed: activeTop1 !== candidateTop1,
      activeTop3TemplateIds: s.activeTop3TemplateIds,
      candidateTop3TemplateIds: s.candidateTop3TemplateIds,
    };
  });
  const top1ChangedCount = scenarios.filter((s) => s.top1Changed).length;
  return {
    scenarios,
    top1ChangedCount,
    top1ChangedRatio: scenarios.length > 0 ? top1ChangedCount / scenarios.length : null,
  };
}

export type PromotionVerdict = "PASS" | "REVIEW_REQUIRED" | "BLOCKED";

/**
 * 2026-08-12 기준 잠정 안전 임계값 — 실제 두 번째 전국 dataset(예: 202607)이 완성돼 진짜 월간 drift를
 * 관측하기 전까지는 "확정된 통계적 기준"이 아니라 "이 정도면 사람이 한 번 더 보는 게 안전하다"는
 * 보수적 안전장치다. 한 곳에서만 관리해 나중에 실측 근거로 재조정하기 쉽게 한다.
 */
export const DRIFT_GATE_THRESHOLDS = {
  /** 이 미만이면 그 축의 비교 자체가 통계적으로 의미가 없다고 보고 BLOCKED(명백한 데이터 문제로 간주). */
  minComparableRegionCount: 50,
  /** 축별 median absolute delta(0~100 점수 기준)가 이보다 크면 REVIEW_REQUIRED. log1p 정규화가
   * 이미 극단값 민감도를 24~35% 줄였다는 기존 QA 결과(같은 baseYm 내 leave-N-out 기준)를 감안해,
   * 안정된 데이터셋의 정상적인 월간 변동보다 뚜렷하게 큰 값으로 잡았다. */
  reviewMedianAbsoluteDelta: 15,
  /** 축별 Spearman rank correlation이 이보다 낮으면 REVIEW_REQUIRED — 성숙한 데이터셋에서 지역 순위가
   * 크게 뒤바뀌는 것은 정상적인 월간 갱신으로 보기 어렵다. */
  reviewMinSpearman: 0.85,
  /** strength/weakness 변화율이 이보다 크면 REVIEW_REQUIRED — 같은 baseYm 내 인위적 leave-N-out
   * 실험에서도 최대 40%까지 흔들린 이력이 있어(그 실험은 데이터를 일부 제거하는 극단적 상황), 실제
   * 월간 갱신에서 이 비율을 넘으면 그보다 더 큰 신호로 본다. */
  reviewStrengthWeaknessChangeRate: 0.25,
  /** similarity 평균 Top3 overlap(0~3)이 이보다 낮으면 REVIEW_REQUIRED. */
  reviewMinMeanSimilarityOverlap: 2.0,
  /** 0/3 overlap(완전히 다른 유사지역 추천) 사례가 이 개수 이상이면 REVIEW_REQUIRED. */
  reviewMaxZeroOverlapSeeds: 1,
  /** 대표 전략 시나리오 중 1위 전략이 바뀐 비율이 이보다 크면(과반 이상) REVIEW_REQUIRED. */
  reviewMaxStrategyTop1ChangedRatio: 0.5,
} as const;

export interface DriftGateDecisionInput {
  axisReports: AxisDriftReport[];
  strengthWeakness: StrengthWeaknessChangeReport;
  similarity: SimilarityDriftReport;
  strategy: StrategyDriftReport;
}

export interface DriftGateDecision {
  verdict: PromotionVerdict;
  reasons: string[];
}

/** 위 개별 drift 리포트들을 모아 최종 PASS/REVIEW_REQUIRED/BLOCKED를 판정한다 — completeness/audit
 * 판정은 이 함수 밖(datasetPromotion.ts)에서 먼저 확인해 BLOCKED로 걸러지므로, 여기서는 "DNA 계산
 * 자체는 됐지만 얼마나 달라졌는가"만 본다. */
export function decideDriftGateVerdict(input: DriftGateDecisionInput): DriftGateDecision {
  const reasons: string[] = [];
  let verdict: PromotionVerdict = "PASS";

  for (const axis of input.axisReports) {
    if (axis.comparableRegionCount < DRIFT_GATE_THRESHOLDS.minComparableRegionCount) {
      verdict = "BLOCKED";
      reasons.push(
        `[BLOCKED] ${axis.axis} 축의 비교 가능한 지역 수(${axis.comparableRegionCount})가 ` +
          `${DRIFT_GATE_THRESHOLDS.minComparableRegionCount}곳 미만이라 drift 판정 자체가 불가능하다.`,
      );
    }
    for (const value of [
      axis.activeMedian,
      axis.candidateMedian,
      axis.medianDelta,
      axis.meanAbsoluteDelta,
      axis.medianAbsoluteDelta,
      axis.p90AbsoluteDelta,
      axis.maxAbsoluteDelta,
      axis.spearmanRankCorrelation,
    ]) {
      if (value !== null && !Number.isFinite(value)) {
        verdict = "BLOCKED";
        reasons.push(`[BLOCKED] ${axis.axis} 축 drift 계산 결과에 NaN/Infinity가 포함되어 있다.`);
        break;
      }
    }
  }

  if (verdict === "BLOCKED") return { verdict, reasons };

  for (const axis of input.axisReports) {
    if (axis.medianAbsoluteDelta !== null && axis.medianAbsoluteDelta > DRIFT_GATE_THRESHOLDS.reviewMedianAbsoluteDelta) {
      verdict = "REVIEW_REQUIRED";
      reasons.push(
        `[REVIEW] ${axis.axis} 축 median absolute delta(${axis.medianAbsoluteDelta.toFixed(1)}점)가 ` +
          `임계값(${DRIFT_GATE_THRESHOLDS.reviewMedianAbsoluteDelta}점)을 초과했다.`,
      );
    }
    if (
      axis.spearmanRankCorrelation !== null &&
      axis.spearmanRankCorrelation < DRIFT_GATE_THRESHOLDS.reviewMinSpearman
    ) {
      verdict = "REVIEW_REQUIRED";
      reasons.push(
        `[REVIEW] ${axis.axis} 축 Spearman rank correlation(${axis.spearmanRankCorrelation.toFixed(3)})이 ` +
          `임계값(${DRIFT_GATE_THRESHOLDS.reviewMinSpearman}) 미만이다.`,
      );
    }
  }

  if (
    input.strengthWeakness.changeRate !== null &&
    input.strengthWeakness.changeRate > DRIFT_GATE_THRESHOLDS.reviewStrengthWeaknessChangeRate
  ) {
    verdict = "REVIEW_REQUIRED";
    reasons.push(
      `[REVIEW] strength/weakness 변화율(${(input.strengthWeakness.changeRate * 100).toFixed(1)}%)이 ` +
        `임계값(${DRIFT_GATE_THRESHOLDS.reviewStrengthWeaknessChangeRate * 100}%)을 초과했다.`,
    );
  }

  if (
    input.similarity.meanOverlap !== null &&
    input.similarity.meanOverlap < DRIFT_GATE_THRESHOLDS.reviewMinMeanSimilarityOverlap
  ) {
    verdict = "REVIEW_REQUIRED";
    reasons.push(
      `[REVIEW] 유사지역 평균 Top3 overlap(${input.similarity.meanOverlap.toFixed(2)}/3)이 ` +
        `임계값(${DRIFT_GATE_THRESHOLDS.reviewMinMeanSimilarityOverlap}) 미만이다.`,
    );
  }
  if (input.similarity.zeroOverlapCount > DRIFT_GATE_THRESHOLDS.reviewMaxZeroOverlapSeeds) {
    verdict = "REVIEW_REQUIRED";
    reasons.push(
      `[REVIEW] 유사지역 0/3 overlap 사례(${input.similarity.zeroOverlapCount}건)가 ` +
        `임계값(${DRIFT_GATE_THRESHOLDS.reviewMaxZeroOverlapSeeds}건)을 초과했다.`,
    );
  }

  if (
    input.strategy.top1ChangedRatio !== null &&
    input.strategy.top1ChangedRatio > DRIFT_GATE_THRESHOLDS.reviewMaxStrategyTop1ChangedRatio
  ) {
    verdict = "REVIEW_REQUIRED";
    reasons.push(
      `[REVIEW] 대표 시나리오 전략 1위 변경 비율(${(input.strategy.top1ChangedRatio * 100).toFixed(0)}%)이 ` +
        `임계값(${DRIFT_GATE_THRESHOLDS.reviewMaxStrategyTop1ChangedRatio * 100}%)을 초과했다.`,
    );
  }

  if (verdict === "PASS") {
    reasons.push("모든 drift 지표가 임계값 이내다.");
  }
  return { verdict, reasons };
}
