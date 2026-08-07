import { AXIS_LABEL_KO, DNA_AXES, type AxisStatus, type DnaAxisKey } from "./types";
import type { PoiCategoryCode } from "./strategyTemplates";

/**
 * 유사지역 비교(README 로드맵 "유사지역 비교", 2026-08-02). 분석 지역과 DNA 5축·관광 자원 구성이
 * 가장 비슷한 지원 지역 2~3곳을 골라, 점수 차이·상대 위치·벤치마킹 포인트를 함께 보여준다 — DNA 5축
 * 점수만 보면 "67점이 좋은 건지 나쁜 건지" 감이 오지 않는다는 문제를 비교군 맥락으로 보완한다.
 *
 * ## 선정 기준(4가지, 전부 순수 계산 — 외부 API 없음)
 * 1. 행정단위: 대상 지역과 같은 레벨(SIGUNGU)의 지원 지역만 후보로 삼는다(자기 자신은 제외).
 * 2. DNA 5축 거리: 두 지역이 공통으로 값을 가진 축들에 대해 RMS(제곱평균제곱근) 거리를 계산한다 —
 *    DNA 5축 자체의 점수 산식(dna.ts)은 전혀 건드리지 않고, 이미 계산된 0~100 점수만 비교한다.
 * 3. 관광 자원 구성: 지역 전체 POI가 6개 카테고리에 어떻게 분포하는지(비중 벡터)를 비교해, 구성이
 *    비슷한 지역일수록 가깝다고 본다. 두 지역 중 하나라도 POI 데이터가 전혀 없으면 이 항목은
 *    반영하지 않는다(임의로 지어내지 않음).
 * 4. 데이터 완전성: 공통으로 값이 있는 DNA 축이 `MIN_SHARED_AXES`개 미만이면 그 지역은 비교 후보에서
 *    아예 제외한다("근거 있는 비교만" 원칙 — businessOpportunity.ts와 동일).
 *
 * 이 파일은 DB에 전혀 접근하지 않는 순수 함수만 담는다. 실제 DNA·POI 데이터 조회는
 * `src/lib/services/fetchRegionComparisonProfiles.ts`가 맡는다.
 *
 * ## 기준월(baseYm) 투명성(2026-08-02 보완)
 * 이 비교는 조회 시점에 지원 지역 전체를 다시 계산하므로, "분석 화면에 저장된 DNA 점수가 실제로 어떤
 * 기준월 데이터인지"와 "지금 이 비교가 어떤 기준월로 계산됐는지"가 항상 같다는 보장이 없다(POI/지표가
 * 그 사이 갱신됐을 수 있음). 이를 감추지 않고:
 * - `RegionComparisonAnalysis.comparisonBaseYm`: 이번 비교에 실제로 쓰인 기준월(대상 지역 기준).
 * - 각 `RegionAxisProfile.baseYm`: 그 지역의 DNA 계산에 실제로 쓰인 기준월 — 요청한 기준월에 해당
 *   지표가 없으면 다른 값이 될 수 있어(방어적 설계) 지역마다 다르면 `mixedBaseYm`/`baseYmNote`로
 *   숨기지 않고 그대로 드러낸다.
 * - `resolveAnalysisBaseYmMismatchNote()`: 프로젝트 자체의 분석 기준월과 이번 비교 기준월이 다르면
 *   안내 문구를 만든다(분석·인쇄 화면이 동일하게 사용).
 */

export const REGION_SIMILARITY_RULE_VERSION = "region-similarity-rules-v1";

/** 데이터 완전성 기준(항목 4) — 공통 DNA 축이 이 개수 미만이면 비교 후보에서 제외한다. */
const MIN_SHARED_AXES = 3;
/** 이 정도 이상 점수 차이가 나야 "벤치마킹할 요소"로 제시한다(사소한 차이까지 억지로 제시하지 않음). */
const BENCHMARK_MARGIN = 10;
/** 최대로 보여줄 비교 지역 수. */
const MAX_COMPARISONS = 3;
/** 후보 지역 수가 이 값 미만이면 "모집단이 적어 참고용으로만 활용하라"는 안내를 추가로 보여준다
 * (2026-08-06, 표시용 임계값 — 유사도 계산·순위에는 영향을 주지 않는다). */
const SMALL_CANDIDATE_POOL_THRESHOLD = 10;

const ALL_POI_CATEGORIES: PoiCategoryCode[] = ["ATTRACTION", "FOOD", "LODGING", "EXPERIENCE", "FESTIVAL", "SHOPPING"];

export interface RegionAxisProfile {
  code: string;
  name: string;
  /** 이 지역의 DNA 계산에 실제로 쓰인 기준월(YYYYMM) — 요청한 기준월과 다를 수 있다(방어적 설계). */
  baseYm: string;
  axisScores: Record<DnaAxisKey, { score: number | null; status: AxisStatus }>;
  /** 지역 전체 POI 카테고리별 개수(좌표·이름 등 상세는 필요 없음 — strategy.ts POI 배치 로직과 무관). */
  poiCountByCategory: Partial<Record<PoiCategoryCode, number>>;
}

export interface AxisDifference {
  axis: DnaAxisKey;
  axisLabel: string;
  targetScore: number;
  candidateScore: number;
  /** targetScore - candidateScore. 양수면 대상 지역이 더 높음. */
  diff: number;
}

export interface ComparedRegion {
  regionCode: string;
  regionName: string;
  /** 이 비교 지역의 DNA 계산에 실제로 쓰인 기준월. */
  baseYm: string;
  /** 두 지역 모두 값이 있는 축만 담는다(MISSING 축은 지어내지 않음). */
  axisDifferences: AxisDifference[];
  relativePosition: string;
  strengthWeaknessSummary: string;
  /** 비교 지역이 뚜렷하게 앞서는 축에서만 생성한다 — 없으면 빈 배열(억지로 채우지 않음). */
  benchmarkPoints: string[];
  poiCompositionNote: string | null;
  limitations: string;
}

export interface RegionComparisonAnalysis {
  targetRegionName: string;
  /** 이번 비교에 실제로 쓰인 기준월(대상 지역 기준 — target.baseYm과 동일). */
  comparisonBaseYm: string;
  /** 비교 지역 중 하나 이상이 comparisonBaseYm과 다른 기준월 데이터를 쓴 경우 true. */
  mixedBaseYm: boolean;
  /** mixedBaseYm일 때만 채워지는 안내 문구 — 어떤 지역이 다른 기준월을 썼는지 구체적으로 밝힌다. */
  baseYmNote: string | null;
  /** 0~3개. */
  comparisons: ComparedRegion[];
  /** 비교한 지역 전부보다 대상 지역이 앞서는 축이 있을 때만 채워진다. */
  uniqueStrengthNote: string | null;
  /** 비교 후보가 3개 미만이거나 하나도 없을 때만 채워지는 사유 설명. */
  note: string | null;
  /** 대상 지역을 제외한 전체 후보 지역 수(현재 지원하는 SIGUNGU 지역 - 1) — 2026-08-06, "전국에서 가장
   * 유사한 지역"처럼 오해하지 않도록 실제 비교 모집단 규모를 화면에 그대로 밝힌다. comparisons.length는
   * 화면에 보여주는 개수(최대 3)일 뿐이라 이 값과 다를 수 있다. */
  candidatePoolSize: number;
  /** candidatePoolSize가 작아 통계적으로 의미 있는 "유사 지역"이라 보기 어려울 때 true(2026-08-06) —
   * 임계값(SMALL_CANDIDATE_POOL_THRESHOLD)은 순위·거리 계산에는 전혀 영향을 주지 않는 표시용 판정이다. */
  isSmallCandidatePool: boolean;
  /** 모든 비교 카드에 동일하게 붙는 한계 안내(ComparedRegion.limitations와 항상 같은 문구) — 카드마다
   * 반복 렌더링하지 않고 섹션에 한 번만 표시하기 위해 여기 별도로 둔다(2026-08-06). 비교 카드가
   * 하나도 없으면 표시할 대상이 없어 null. */
  commonLimitationNote: string | null;
  ruleVersion: string;
}

const LIMITATION_SUFFIX = "관광지 등록 현황 등 공공데이터를 기준으로 한 상대 비교입니다.";

interface AxisDistanceResult {
  distance: number;
  sharedAxes: AxisDifference[];
}

function computeAxisDistance(target: RegionAxisProfile, candidate: RegionAxisProfile): AxisDistanceResult | null {
  const shared: AxisDifference[] = [];
  for (const axis of DNA_AXES) {
    const t = target.axisScores[axis];
    const c = candidate.axisScores[axis];
    if (t.score === null || c.score === null) continue;
    shared.push({
      axis,
      axisLabel: AXIS_LABEL_KO[axis],
      targetScore: t.score,
      candidateScore: c.score,
      diff: Math.round((t.score - c.score) * 100) / 100,
    });
  }
  if (shared.length < MIN_SHARED_AXES) return null;
  const meanSquare = shared.reduce((sum, s) => sum + (s.targetScore - s.candidateScore) ** 2, 0) / shared.length;
  return { distance: Math.sqrt(meanSquare), sharedAxes: shared };
}

interface PoiDistanceResult {
  distance: number;
  note: string;
}

function computePoiCompositionDistance(
  target: RegionAxisProfile,
  candidate: RegionAxisProfile,
): PoiDistanceResult | null {
  const targetTotal = ALL_POI_CATEGORIES.reduce((sum, c) => sum + (target.poiCountByCategory[c] ?? 0), 0);
  const candidateTotal = ALL_POI_CATEGORIES.reduce((sum, c) => sum + (candidate.poiCountByCategory[c] ?? 0), 0);
  if (targetTotal === 0 || candidateTotal === 0) return null; // 근거 없이 지어내지 않는다.

  const sumSquares = ALL_POI_CATEGORIES.reduce((sum, c) => {
    const targetShare = (target.poiCountByCategory[c] ?? 0) / targetTotal;
    const candidateShare = (candidate.poiCountByCategory[c] ?? 0) / candidateTotal;
    return sum + (targetShare - candidateShare) ** 2;
  }, 0);

  return {
    distance: Math.sqrt(sumSquares) * 100,
    note: `관광지 구성(등록 POI 카테고리 비중)도 비교 근거로 반영했습니다(${target.name} ${targetTotal}건, ${candidate.name} ${candidateTotal}건).`,
  };
}

function buildRelativePosition(targetName: string, shared: AxisDifference[]): string {
  const better = shared.filter((s) => s.diff > 0).length;
  const worse = shared.filter((s) => s.diff < 0).length;
  const tie = shared.length - better - worse;
  const tieText = tie > 0 ? ` (동률 ${tie}개)` : "";
  return `비교 가능한 ${shared.length}개 축 중 ${targetName}이(가) ${better}개 축에서 더 높고, ${worse}개 축에서 더 낮습니다${tieText}.`;
}

function buildStrengthWeaknessSummary(shared: AxisDifference[]): string {
  const sortedDesc = [...shared].sort((a, b) => b.diff - a.diff);
  const best = sortedDesc[0];
  const worst = sortedDesc[sortedDesc.length - 1];

  if (best.diff <= 0) {
    return `이 지역과 비교했을 때 뚜렷하게 앞서는 축은 확인되지 않았습니다(가장 근접한 축: ${best.axisLabel}, 차이 ${Math.abs(best.diff)}점).`;
  }
  if (worst.diff >= 0) {
    return `${best.axisLabel} 축이 ${Math.abs(best.diff)}점 앞서며, 뚜렷하게 뒤처지는 축은 확인되지 않았습니다.`;
  }
  return `${best.axisLabel} 축은 ${Math.abs(best.diff)}점 앞서지만, ${worst.axisLabel} 축은 ${Math.abs(worst.diff)}점 뒤처집니다.`;
}

function buildBenchmarkPoints(candidateName: string, shared: AxisDifference[]): string[] {
  return shared
    .filter((s) => s.diff <= -BENCHMARK_MARGIN)
    .sort((a, b) => a.diff - b.diff)
    .map(
      (s) =>
        `${s.axisLabel} 축(${candidateName} ${s.candidateScore}점 vs 이 지역 ${s.targetScore}점) — ${candidateName}의 운영 방식을 참고할 만합니다.`,
    );
}

function computeUniqueStrengthNote(targetName: string, comparisons: ComparedRegion[]): string | null {
  if (comparisons.length === 0) return null;

  const axisSets = comparisons.map((c) => new Set(c.axisDifferences.map((a) => a.axis)));
  const commonAxes = DNA_AXES.filter((axis) => axisSets.every((set) => set.has(axis)));

  const dominantAxes = commonAxes.filter((axis) =>
    comparisons.every((c) => {
      const d = c.axisDifferences.find((a) => a.axis === axis);
      return d !== undefined && d.diff > 0;
    }),
  );
  if (dominantAxes.length === 0) return null;

  // 비교 지역들 대비 여유(최소 diff)가 가장 큰 축을 대표로 제시한다.
  const bestAxis = dominantAxes
    .map((axis) => {
      const minDiff = Math.min(
        ...comparisons.map((c) => c.axisDifferences.find((a) => a.axis === axis)!.diff),
      );
      return { axis, minDiff };
    })
    .sort((a, b) => b.minDiff - a.minDiff)[0];

  return `${AXIS_LABEL_KO[bestAxis.axis]} 축은 비교한 ${comparisons.length}개 지역 모두보다 높아, ${targetName}만의 강점으로 활용할 수 있습니다.`;
}

function buildNote(comparedCount: number, candidateCount: number): string | null {
  if (candidateCount === 0) {
    return "비교할 다른 지원 지역이 없습니다 — 현재 지원 지역이 이 지역 하나뿐입니다.";
  }
  if (comparedCount === 0) {
    return "비교 가능한 유사 지역을 찾지 못했습니다 — 공통 DNA 축 데이터가 부족하거나(최소 3개 축 필요), 비교 근거가 충분하지 않습니다.";
  }
  if (comparedCount < MAX_COMPARISONS) {
    return `근거가 충분한 비교 지역만 표시했습니다(${comparedCount}곳). 나머지 지원 지역은 공통 DNA 축 부족 등으로 비교 근거가 충분하지 않아 제외했습니다.`;
  }
  return null;
}

/** 유사지역 비교를 계산한다. DB 조회·외부 API 호출이 전혀 없는 순수 함수 — 같은 입력이면 항상 같은
 * 결과를 낸다. */
export function computeRegionSimilarityComparisons(
  target: RegionAxisProfile,
  candidates: RegionAxisProfile[],
): RegionComparisonAnalysis {
  const others = candidates.filter((c) => c.code !== target.code);

  const scored = others
    .map((candidate) => {
      const axisResult = computeAxisDistance(target, candidate);
      if (!axisResult) return null; // 데이터 완전성 기준 미달 — 무리하게 비교하지 않는다.
      const poiResult = computePoiCompositionDistance(target, candidate);
      const distance = poiResult ? axisResult.distance * 0.6 + poiResult.distance * 0.4 : axisResult.distance;
      return { code: candidate.code, name: candidate.name, baseYm: candidate.baseYm, distance, axisResult, poiResult };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const sorted = [...scored].sort((a, b) => a.distance - b.distance);
  const top = sorted.slice(0, MAX_COMPARISONS);

  const comparisons: ComparedRegion[] = top.map((t) => ({
    regionCode: t.code,
    regionName: t.name,
    baseYm: t.baseYm,
    axisDifferences: t.axisResult.sharedAxes,
    relativePosition: buildRelativePosition(target.name, t.axisResult.sharedAxes),
    strengthWeaknessSummary: buildStrengthWeaknessSummary(t.axisResult.sharedAxes),
    benchmarkPoints: buildBenchmarkPoints(t.name, t.axisResult.sharedAxes),
    poiCompositionNote:
      t.poiResult?.note ?? "관광지 구성 비교는 두 지역 중 한 곳 이상의 등록 POI 데이터가 없어 반영하지 못했습니다.",
    limitations: LIMITATION_SUFFIX,
  }));

  const comparisonBaseYm = target.baseYm;
  const differingRegions = comparisons.filter((c) => c.baseYm !== comparisonBaseYm);
  const mixedBaseYm = differingRegions.length > 0;
  const baseYmNote = mixedBaseYm
    ? `이 비교의 기준 기준월은 ${comparisonBaseYm}이지만, ${differingRegions
        .map((r) => `${r.regionName}(${r.baseYm})`)
        .join(", ")}은(는) 다른 기준월 데이터를 사용했습니다 — 시점 차이가 있는 비교이니 참고용으로만 활용하세요.`
    : null;

  return {
    targetRegionName: target.name,
    comparisonBaseYm,
    mixedBaseYm,
    baseYmNote,
    comparisons,
    uniqueStrengthNote: computeUniqueStrengthNote(target.name, comparisons),
    note: buildNote(comparisons.length, others.length),
    commonLimitationNote: comparisons.length > 0 ? LIMITATION_SUFFIX : null,
    candidatePoolSize: others.length,
    isSmallCandidatePool: others.length < SMALL_CANDIDATE_POOL_THRESHOLD,
    ruleVersion: REGION_SIMILARITY_RULE_VERSION,
  };
}

/** 프로젝트 자체의 분석 기준월(analysisBaseYm)과 유사지역 비교에 실제로 쓰인 기준월(comparisonBaseYm)이
 * 다르면 안내 문구를 만든다 — 분석 화면과 인쇄 화면이 동일하게 이 함수를 호출해 같은 안내를 보여준다.
 * DB 접근이 없는 순수 함수. */
export function resolveAnalysisBaseYmMismatchNote(
  analysisBaseYm: string | null,
  comparisonBaseYm: string,
): string | null {
  if (analysisBaseYm === null) {
    return `이 프로젝트의 분석 근거에 기준월 정보가 없어, 유사지역 비교는 현재 확보된 기준월(${comparisonBaseYm})로 계산했습니다.`;
  }
  if (analysisBaseYm !== comparisonBaseYm) {
    return `분석 기준월(${analysisBaseYm})과 유사지역 비교에 사용한 기준월(${comparisonBaseYm})이 다릅니다 — 두 화면의 점수가 완전히 같은 시점 기준이 아닐 수 있습니다.`;
  }
  return null;
}
