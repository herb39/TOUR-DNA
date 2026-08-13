import { AXIS_LABEL_KO, type DnaAxisKey } from "./types";
import type { UserRoleCode } from "./audienceContext";
import type { ComparedRegion } from "./regionSimilarity";

/**
 * 유사지역 비교(regionSimilarity.ts)를 "비슷한 지역을 보여주는 기능"에서 "무엇을 벤치마킹할 수 있는가"로
 * 잇는 순수 조합 함수(2026-08-13). 새 유사도 산식·새 DB 조회를 만들지 않고, 이미 `computeRegionSimilarityComparisons`가
 * 계산해 `RegionComparisonAnalysis.comparisons`(analysis/print/plan 세 화면이 공유하는
 * `regionComparisonSnapshot`)에 저장한 값만 재사용한다:
 * - `axisDifferences`(두 지역의 DNA 5축 차이, 이미 계산됨)
 * - `benchmarkPoints`가 쓰는 것과 같은 임계값(10점 이상 차이)
 * - `poiCategoryShareDiffs`(카테고리별 등록 비중, 이미 계산됨)
 *
 * ## 벤치마킹 후보 선정 기준(방식 A — 기존 top3 유사지역 안에서 선택)
 * 1. 대상 지역의 DNA 5축 중 가장 약한 축(들)을 우선한다(최대 2개).
 * 2. 이미 계산된 top3 유사지역(comparisons) 중, 그 축에서 대상 지역보다 10점 이상 앞서는 지역이 있으면
 *    그중 격차가 가장 큰 지역을 벤치마킹 대상으로 선택한다(regionSimilarity.ts의 BENCHMARK_MARGIN과
 *    동일한 기준 — 여기서 새 임계값을 만들지 않는다).
 * 3. 조건을 만족하는 지역이 없으면 그 축은 건너뛴다 — 억지로 만들지 않는다.
 * 4. 같은 지역이 이미 다른 축의 벤치마킹으로 쓰였으면 중복해서 쓰지 않는다(서로 다른 지역 최대 2곳).
 *
 * LLM을 쓰지 않으며, 같은 snapshot 입력에는 항상 같은 결과를 낸다.
 */

export const REGION_BENCHMARK_INSIGHT_RULE_VERSION = "region-benchmark-insight-rules-v1";

/** POI 카테고리 비중이 이 값(퍼센트포인트) 이상 높아야 "공급 비중이 더 높다"고 언급한다 — 사소한 차이까지
 * 억지로 언급하지 않는다. */
const POI_SHARE_MARGIN = 5;
/** 벤치마킹으로 인정할 최소 DNA 축 격차(regionSimilarity.ts의 BENCHMARK_MARGIN과 동일한 기준을 재사용). */
const AXIS_BENCHMARK_MARGIN = 10;
/** 최대로 보여줄 벤치마킹 인사이트 수. */
const MAX_INSIGHTS = 2;

/** 벤치마킹 방향 문구의 역할별 클로징(CURATED, 매우 가벼운 반영) — 지역 데이터 비교가 핵심이며, 역할은
 * 마지막 한 구절만 바꾼다(18절 방침, role-specific 알고리즘을 새로 만들지 않는다). */
const ROLE_ACTION_CLOSING: Record<UserRoleCode, string> = {
  TRAVEL_AGENCY: "상품 구성을 검토할 때 참고할 가치가 있습니다.",
  LOCAL_GOV: "정책·사업 구조를 검토할 때 참고할 가치가 있습니다.",
  FESTIVAL_PLANNER: "프로그램 연계 구조를 검토할 때 참고할 가치가 있습니다.",
};
const DEFAULT_ACTION_CLOSING = "검토할 가치가 있습니다.";

/** 축 차이의 "해석"(② 단계, CURATED) — 인과관계를 단정하지 않고 상관 수준으로만 표현한다. */
const AXIS_INTERPRETATION: Record<DnaAxisKey, string> = {
  demand: "관광 자원 조건이 비슷한데도 관광 수요를 상대적으로 더 크게 이끌어내는 구조입니다.",
  stay: "비슷한 관광 자원 조건에서도 방문객의 체류를 상대적으로 더 오래 유도하는 구조입니다.",
  spend: "비슷한 방문 구조에서도 현장 소비로의 전환이 상대적으로 더 강합니다.",
  diversity: "비슷한 조건에서도 관광 유형을 더 다양하게 갖춘 구조입니다.",
  network: "비슷한 조건에서도 관광지 간 연계가 상대적으로 더 촘촘한 구조입니다.",
};

export interface RegionBenchmarkInsight {
  benchmarkRegionName: string;
  targetAxis: DnaAxisKey;
  targetAxisLabel: string;
  /** 사용자 표시지수 기준 격차(항상 양수) — displayDiff를 그대로 재사용한다(원점수 혼용 금지). */
  displayScoreGap: number;
  /** ① 왜 비교하는가 — 이미 top3 유사지역으로 선정된 사실만 말한다(새 유사도 주장 없음). */
  whyCompared: string;
  /** ② 무엇이 더 나은가 — 실제 축 차이(데이터)와 해석을 함께 담는다. */
  whatIsBetter: string;
  /** ③ 무엇을 참고할 수 있는가 — POI 카테고리 비중 차이가 있을 때만 그 근거를 포함한다(없으면 축 차이만). */
  whatToReference: string;
}

export interface RegionBenchmarkAnalysis {
  insights: RegionBenchmarkInsight[];
  /** insights가 비어 있을 때만 채워지는 안내 — 억지로 하나를 추천하지 않는다. */
  emptyStateNote: string | null;
  ruleVersion: string;
}

export interface RegionBenchmarkInsightInput {
  /** 대상 지역 DNA 5축 원점수(raw, 0~100) — 내부 판정(약점 축 선정)에만 쓰고 화면 문구에는 쓰지 않는다. */
  targetAxisScores: { axis: DnaAxisKey; score: number | null }[];
  /** 이미 계산된 유사지역 비교 결과(RegionComparisonAnalysis.comparisons) — 새로 계산하지 않는다. */
  comparisons: ComparedRegion[];
  role: UserRoleCode | undefined;
}

function buildPoiShareClause(diffs: ComparedRegion["poiCategoryShareDiffs"]): string | null {
  if (!diffs) return null;
  const notable = diffs
    .map((d) => ({ ...d, gap: d.candidateSharePercent - d.targetSharePercent }))
    .filter((d) => d.gap >= POI_SHARE_MARGIN)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);
  if (notable.length === 0) return null;
  const labels = notable.map((d) => d.categoryLabel).join("·");
  return `${labels} 공급 비중도 상대적으로 높습니다.`;
}

/** 대상 지역의 특정 축에서, 이미 top3로 선정된 유사지역 중 그 축을 10점 이상 앞서는 지역을 찾아 가장
 * 격차가 큰 곳을 고른다 — regionSimilarity.ts가 이미 계산해 둔 axisDifferences만 스캔한다(새 계산 없음). */
function findBestBenchmarkForAxis(
  axis: DnaAxisKey,
  comparisons: ComparedRegion[],
  excludeRegionCodes: Set<string>,
): { region: ComparedRegion; diffMagnitude: number } | null {
  let best: { region: ComparedRegion; diffMagnitude: number } | null = null;
  for (const region of comparisons) {
    if (excludeRegionCodes.has(region.regionCode)) continue;
    const diff = region.axisDifferences.find((a) => a.axis === axis);
    if (!diff || diff.diff > -AXIS_BENCHMARK_MARGIN) continue; // 대상 지역이 더 낮아야(음수) 벤치마킹 대상
    const magnitude = Math.abs(diff.displayDiff);
    if (!best || magnitude > best.diffMagnitude) {
      best = { region, diffMagnitude: magnitude };
    }
  }
  return best;
}

/** 유사지역 벤치마킹 인사이트를 계산한다. DB 조회·외부 API 호출이 전혀 없는 순수 함수 — 같은 입력이면
 * 항상 같은 결과를 낸다(LLM 미사용). */
export function buildRegionBenchmarkInsight(input: RegionBenchmarkInsightInput): RegionBenchmarkAnalysis {
  const { targetAxisScores, comparisons, role } = input;

  if (comparisons.length === 0) {
    return {
      insights: [],
      emptyStateNote: "현재 비교할 유사지역이 없어 벤치마킹 포인트를 만들 수 없습니다.",
      ruleVersion: REGION_BENCHMARK_INSIGHT_RULE_VERSION,
    };
  }

  const available = targetAxisScores.filter(
    (a): a is { axis: DnaAxisKey; score: number } => a.score !== null && Number.isFinite(a.score),
  );
  const weakestAxesInOrder = [...available].sort((a, b) => a.score - b.score).map((a) => a.axis);

  const insights: RegionBenchmarkInsight[] = [];
  const usedRegionCodes = new Set<string>();

  for (const axis of weakestAxesInOrder) {
    if (insights.length >= MAX_INSIGHTS) break;
    const match = findBestBenchmarkForAxis(axis, comparisons, usedRegionCodes);
    if (!match) continue;

    usedRegionCodes.add(match.region.regionCode);
    const poiClause = buildPoiShareClause(match.region.poiCategoryShareDiffs);
    const actionClosing = role ? ROLE_ACTION_CLOSING[role] : DEFAULT_ACTION_CLOSING;

    insights.push({
      benchmarkRegionName: match.region.regionName,
      targetAxis: axis,
      targetAxisLabel: AXIS_LABEL_KO[axis],
      displayScoreGap: match.diffMagnitude,
      whyCompared: `관광 DNA 5축·관광 자원 구성이 유사해 비교 대상으로 선정된 지역입니다.`,
      whatIsBetter: `${AXIS_LABEL_KO[axis]} 지수가 이 지역보다 ${match.diffMagnitude}점 높습니다. ${AXIS_INTERPRETATION[axis]}`,
      whatToReference: poiClause
        ? `${poiClause} ${actionClosing}`
        : `구체적인 공급 구성 차이는 확인되지 않았지만, ${AXIS_LABEL_KO[axis]} 운영 방식 자체는 ${actionClosing}`,
    });
  }

  return {
    insights,
    emptyStateNote:
      insights.length === 0
        ? "현재 유사지역 중 명확한 벤치마킹 우위가 확인되는 지역이 없습니다."
        : null,
    ruleVersion: REGION_BENCHMARK_INSIGHT_RULE_VERSION,
  };
}
