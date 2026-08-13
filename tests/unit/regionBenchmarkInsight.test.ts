import { describe, expect, it } from "vitest";
import { buildRegionBenchmarkInsight } from "@/lib/domain/regionBenchmarkInsight";
import type { ComparedRegion } from "@/lib/domain/regionSimilarity";
import type { DnaAxisKey } from "@/lib/domain/types";

function axisDiff(axis: DnaAxisKey, targetScore: number, candidateScore: number) {
  return {
    axis,
    axisLabel: axis,
    targetScore,
    candidateScore,
    diff: targetScore - candidateScore,
    targetDisplayScore: targetScore,
    candidateDisplayScore: candidateScore,
    displayDiff: targetScore - candidateScore,
  };
}

function region(overrides: Partial<ComparedRegion> = {}): ComparedRegion {
  return {
    regionCode: "B",
    regionName: "B시",
    baseYm: "202606",
    axisDifferences: [],
    relativePosition: "",
    strengthWeaknessSummary: "",
    benchmarkPoints: [],
    poiCompositionNote: null,
    poiCategoryShareDiffs: null,
    limitations: "",
    ...overrides,
  };
}

const AXIS_SCORES: { axis: DnaAxisKey; score: number | null }[] = [
  { axis: "demand", score: 70 },
  { axis: "stay", score: 60 },
  { axis: "spend", score: 20 },
  { axis: "diversity", score: 65 },
  { axis: "network", score: 68 },
];

describe("buildRegionBenchmarkInsight — 벤치마킹 후보 선정(2026-08-13)", () => {
  it("대상 지역의 최약축을 비교 지역이 10점 이상 앞서면 벤치마킹 인사이트를 만든다", () => {
    const comparisons = [
      region({ regionName: "제주시", axisDifferences: [axisDiff("spend", 20, 41), axisDiff("stay", 60, 62)] }),
    ];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].benchmarkRegionName).toBe("제주시");
    expect(result.insights[0].targetAxis).toBe("spend");
    expect(result.insights[0].displayScoreGap).toBe(21);
    expect(result.emptyStateNote).toBeNull();
  });

  it("10점 미만 차이는 벤치마킹으로 인정하지 않는다(regionSimilarity.ts의 임계값과 동일)", () => {
    const comparisons = [region({ axisDifferences: [axisDiff("spend", 20, 28)] })];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    expect(result.insights).toHaveLength(0);
    expect(result.emptyStateNote).toContain("명확한 벤치마킹 우위가 확인되는 지역이 없습니다");
  });

  it("비교 지역이 없으면(empty) 억지로 인사이트를 만들지 않는다", () => {
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons: [], role: undefined });
    expect(result.insights).toHaveLength(0);
    expect(result.emptyStateNote).toContain("비교할 유사지역이 없어");
  });

  it("여러 후보 중 격차가 가장 큰 지역을 선택한다", () => {
    const comparisons = [
      region({ regionCode: "B", regionName: "B시", axisDifferences: [axisDiff("spend", 20, 32)] }),
      region({ regionCode: "C", regionName: "C시", axisDifferences: [axisDiff("spend", 20, 41)] }),
    ];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    expect(result.insights[0].benchmarkRegionName).toBe("C시");
  });

  it("최대 2개까지만 만들고, 같은 지역을 두 번 쓰지 않는다", () => {
    const comparisons = [
      region({
        regionCode: "B",
        regionName: "B시",
        axisDifferences: [axisDiff("spend", 20, 41), axisDiff("stay", 60, 75)],
      }),
      region({ regionCode: "C", regionName: "C시", axisDifferences: [axisDiff("stay", 60, 90)] }),
    ];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    expect(result.insights.length).toBeLessThanOrEqual(2);
    const regionNames = result.insights.map((i) => i.benchmarkRegionName);
    expect(new Set(regionNames).size).toBe(regionNames.length);
  });

  it("POI 카테고리 비중 차이가 충분하면(5%p 이상) 참고 방향에 포함한다", () => {
    const comparisons = [
      region({
        regionName: "제주시",
        axisDifferences: [axisDiff("spend", 20, 41)],
        poiCategoryShareDiffs: [
          { category: "FOOD", categoryLabel: "음식", targetSharePercent: 20, candidateSharePercent: 35 },
          { category: "EXPERIENCE", categoryLabel: "체험", targetSharePercent: 10, candidateSharePercent: 12 },
        ],
      }),
    ];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    expect(result.insights[0].whatToReference).toContain("음식");
    expect(result.insights[0].whatToReference).not.toContain("체험");
  });

  it("POI 비중 차이 데이터가 없으면 근거 없이 지어내지 않고 일반 안내로 대체한다", () => {
    const comparisons = [
      region({ regionName: "제주시", axisDifferences: [axisDiff("spend", 20, 41)], poiCategoryShareDiffs: null }),
    ];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    expect(result.insights[0].whatToReference).toContain("확인되지 않았지만");
  });

  it("역할에 따라 참고 방향 문구의 마지막 구절이 달라진다", () => {
    const comparisons = [region({ regionName: "제주시", axisDifferences: [axisDiff("spend", 20, 41)] })];
    const agency = buildRegionBenchmarkInsight({
      targetAxisScores: AXIS_SCORES,
      comparisons,
      role: "TRAVEL_AGENCY",
    });
    const gov = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: "LOCAL_GOV" });
    expect(agency.insights[0].whatToReference).toContain("상품 구성");
    expect(gov.insights[0].whatToReference).toContain("정책·사업 구조");
  });

  it("인과관계를 단정하는 표현('때문에', '그래서')을 쓰지 않는다", () => {
    const comparisons = [
      region({
        regionName: "제주시",
        axisDifferences: [axisDiff("spend", 20, 41)],
        poiCategoryShareDiffs: [
          { category: "FOOD", categoryLabel: "음식", targetSharePercent: 20, candidateSharePercent: 35 },
        ],
      }),
    ];
    const result = buildRegionBenchmarkInsight({ targetAxisScores: AXIS_SCORES, comparisons, role: undefined });
    const allText = result.insights.map((i) => `${i.whyCompared} ${i.whatIsBetter} ${i.whatToReference}`).join(" ");
    expect(allText).not.toContain("때문에");
    expect(allText).not.toContain("그래서");
  });

  it("DNA 축 데이터가 전부 없으면(레거시) 인사이트를 만들지 않는다", () => {
    const comparisons = [region({ axisDifferences: [axisDiff("spend", 20, 41)] })];
    const empty = AXIS_SCORES.map((a) => ({ axis: a.axis, score: null }));
    const result = buildRegionBenchmarkInsight({ targetAxisScores: empty, comparisons, role: undefined });
    expect(result.insights).toHaveLength(0);
  });
});
