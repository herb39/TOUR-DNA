import { describe, expect, it } from "vitest";
import {
  computeRegionSimilarityComparisons,
  resolveAnalysisBaseYmMismatchNote,
  REGION_SIMILARITY_RULE_VERSION,
  type RegionAxisProfile,
} from "@/lib/domain/regionSimilarity";
import type { AxisStatus, DnaAxisKey } from "@/lib/domain/types";

function profile(
  code: string,
  name: string,
  scores: Partial<Record<DnaAxisKey, number | null>>,
  poiCountByCategory: RegionAxisProfile["poiCountByCategory"] = {},
  baseYm = "202606",
): RegionAxisProfile {
  const axisKeys: DnaAxisKey[] = ["demand", "stay", "spend", "diversity", "network"];
  const base: Record<DnaAxisKey, number | null> = {
    demand: 60,
    stay: 60,
    spend: 60,
    diversity: 60,
    network: 60,
  };
  const merged = { ...base, ...scores };
  const axisScores = Object.fromEntries(
    axisKeys.map((axis) => [
      axis,
      { score: merged[axis], status: (merged[axis] === null ? "MISSING" : "LIVE") as AxisStatus },
    ]),
  ) as RegionAxisProfile["axisScores"];
  return { code, name, baseYm, axisScores, poiCountByCategory };
}

const BALANCED_POI = { ATTRACTION: 20, FOOD: 20, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 };

describe("computeRegionSimilarityComparisons — 기본 동작", () => {
  it("가장 DNA 5축이 가까운 지역을 유사도 순으로 최대 3개 반환한다", () => {
    const target = profile("A", "A시", { demand: 50, stay: 50, spend: 50, diversity: 50, network: 50 }, BALANCED_POI);
    const near = profile("B", "B시", { demand: 52, stay: 51, spend: 49, diversity: 50, network: 50 }, BALANCED_POI);
    const mid = profile("C", "C시", { demand: 70, stay: 70, spend: 70, diversity: 70, network: 70 }, BALANCED_POI);
    const far = profile("D", "D시", { demand: 100, stay: 100, spend: 100, diversity: 100, network: 100 }, BALANCED_POI);

    const result = computeRegionSimilarityComparisons(target, [target, near, mid, far]);

    expect(result.comparisons.map((c) => c.regionCode)).toEqual(["B", "C", "D"]);
    expect(result.note).toBeNull(); // 3개 모두 확보됨
  });

  it("비교 지역이 있으면 카드마다 반복되는 한계 안내를 섹션 공통 문구(commonLimitationNote)로 한 번만 제공한다(2026-08-06)", () => {
    const target = profile("A", "A시", { demand: 50, stay: 50, spend: 50, diversity: 50, network: 50 }, BALANCED_POI);
    const near = profile("B", "B시", { demand: 52, stay: 51, spend: 49, diversity: 50, network: 50 }, BALANCED_POI);
    const result = computeRegionSimilarityComparisons(target, [target, near]);

    expect(result.commonLimitationNote).toBeTruthy();
    for (const c of result.comparisons) {
      expect(c.limitations).toBe(result.commonLimitationNote);
    }
  });

  it("비교 지역이 하나도 없으면 commonLimitationNote도 null이다(표시할 카드가 없음)", () => {
    const target = profile("A", "A시", {});
    const result = computeRegionSimilarityComparisons(target, [target]);
    expect(result.comparisons).toEqual([]);
    expect(result.commonLimitationNote).toBeNull();
  });

  it("candidatePoolSize는 대상 지역을 제외한 전체 후보 수를 그대로 담고(표시된 3개와 다를 수 있음), 후보가 적으면 isSmallCandidatePool이 true다(2026-08-06)", () => {
    const target = profile("A", "A시", { demand: 50, stay: 50, spend: 50, diversity: 50, network: 50 }, BALANCED_POI);
    const candidates = ["B", "C", "D", "E", "F"].map((c, i) =>
      profile(c, `${c}시`, { demand: 50 + i, stay: 50, spend: 50, diversity: 50, network: 50 }, BALANCED_POI),
    );
    const result = computeRegionSimilarityComparisons(target, [target, ...candidates]);

    expect(result.candidatePoolSize).toBe(5);
    expect(result.comparisons.length).toBe(3); // 화면에 보여주는 개수는 최대 3개로 제한됨
    expect(result.isSmallCandidatePool).toBe(true); // 5 < 임계값(10)
  });

  it("후보 지역이 충분히 많으면(임계값 이상) isSmallCandidatePool이 false다", () => {
    const target = profile("A", "A시", {}, BALANCED_POI);
    const candidates = Array.from({ length: 12 }, (_, i) =>
      profile(`R${i}`, `지역${i}`, { demand: 50 + i }, BALANCED_POI),
    );
    const result = computeRegionSimilarityComparisons(target, [target, ...candidates]);
    expect(result.candidatePoolSize).toBe(12);
    expect(result.isSmallCandidatePool).toBe(false);
  });

  it("자기 자신은 후보에서 제외된다", () => {
    const target = profile("A", "A시", {});
    const other = profile("B", "B시", { demand: 61 });
    const result = computeRegionSimilarityComparisons(target, [target, other]);
    expect(result.comparisons.every((c) => c.regionCode !== "A")).toBe(true);
  });

  it("규칙 버전(ruleVersion)을 항상 함께 반환한다", () => {
    const target = profile("A", "A시", {});
    const other = profile("B", "B시", { demand: 61 });
    const result = computeRegionSimilarityComparisons(target, [target, other]);
    expect(result.ruleVersion).toBe(REGION_SIMILARITY_RULE_VERSION);
  });

  it("동일 입력을 반복 호출해도 완전히 동일한 결과를 낸다(재현성)", () => {
    const target = profile("A", "A시", { demand: 55, stay: 62 }, BALANCED_POI);
    const candidates = [
      target,
      profile("B", "B시", { demand: 58, stay: 60 }, BALANCED_POI),
      profile("C", "C시", { demand: 40, stay: 80 }, { FOOD: 5, ATTRACTION: 5 }),
    ];
    const first = computeRegionSimilarityComparisons(target, candidates);
    const second = computeRegionSimilarityComparisons(target, candidates);
    expect(first).toEqual(second);
  });
});

describe("computeRegionSimilarityComparisons — 데이터 부족 처리", () => {
  it("공통 DNA 축이 3개 미만인 후보는 비교 대상에서 제외한다", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 });
    // B는 demand/stay만 있고 나머지는 MISSING → target과 공유 축 2개뿐(기준 미달)
    const sparse = profile("B", "B시", { demand: 61, stay: 59, spend: null, diversity: null, network: null });
    const result = computeRegionSimilarityComparisons(target, [target, sparse]);
    expect(result.comparisons).toHaveLength(0);
    expect(result.note).toContain("찾지 못했습니다");
  });

  it("비교 후보가 아예 없으면(자기 자신 하나뿐) 그 사실을 안내한다", () => {
    const target = profile("A", "A시", {});
    const result = computeRegionSimilarityComparisons(target, [target]);
    expect(result.comparisons).toHaveLength(0);
    expect(result.note).toContain("하나뿐");
  });

  it("비교 지역이 3개 미만이면 부족하다는 사실을 note로 알린다(억지로 채우지 않음)", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 });
    const only = profile("B", "B시", { demand: 61, stay: 59, spend: 60, diversity: 60, network: 60 });
    const result = computeRegionSimilarityComparisons(target, [target, only]);
    expect(result.comparisons).toHaveLength(1);
    expect(result.note).toContain("1곳");
  });

  it("두 지역 중 한 곳이라도 POI 데이터가 전혀 없으면 관광 자원 구성 비교를 만들지 않는다", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 }, {});
    const candidate = profile(
      "B",
      "B시",
      { demand: 61, stay: 59, spend: 60, diversity: 60, network: 60 },
      BALANCED_POI,
    );
    const result = computeRegionSimilarityComparisons(target, [target, candidate]);
    expect(result.comparisons[0].poiCompositionNote).toContain("반영하지 못했습니다");
  });

  it("MISSING인 축은 axisDifferences에 아예 포함되지 않는다(지어내지 않음)", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: null, network: 60 });
    const candidate = profile("B", "B시", { demand: 61, stay: 59, spend: 60, diversity: 60, network: 60 });
    const result = computeRegionSimilarityComparisons(target, [target, candidate]);
    expect(result.comparisons[0].axisDifferences.some((a) => a.axis === "diversity")).toBe(false);
    expect(result.comparisons[0].axisDifferences).toHaveLength(4);
  });
});

describe("computeRegionSimilarityComparisons — 강점·벤치마킹·상대 위치", () => {
  it("비교 지역이 뚜렷하게(10점 이상) 앞서는 축만 벤치마킹 포인트로 제시한다", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 });
    const candidate = profile("B", "B시", { demand: 61, stay: 85, spend: 60, diversity: 60, network: 60 }); // stay만 25점 격차
    const result = computeRegionSimilarityComparisons(target, [target, candidate]);
    const points = result.comparisons[0].benchmarkPoints;
    expect(points).toHaveLength(1);
    expect(points[0]).toContain("체류");
  });

  it("뚜렷하게 앞서는 축이 없으면 벤치마킹 포인트를 억지로 만들지 않는다(빈 배열)", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 });
    const candidate = profile("B", "B시", { demand: 61, stay: 59, spend: 60, diversity: 60, network: 60 });
    const result = computeRegionSimilarityComparisons(target, [target, candidate]);
    expect(result.comparisons[0].benchmarkPoints).toHaveLength(0);
  });

  it("비교한 모든 지역보다 대상 지역이 앞서는 축이 있으면 이 지역만의 강점으로 안내한다", () => {
    const target = profile("A", "A시", { demand: 90, stay: 60, spend: 60, diversity: 60, network: 60 });
    const b = profile("B", "B시", { demand: 50, stay: 61, spend: 60, diversity: 60, network: 60 });
    const c = profile("C", "C시", { demand: 40, stay: 59, spend: 61, diversity: 60, network: 60 });
    const result = computeRegionSimilarityComparisons(target, [target, b, c]);
    expect(result.uniqueStrengthNote).toContain("수요");
  });

  it("모든 비교 지역보다 앞서는 축이 없으면 uniqueStrengthNote는 null이다(지어내지 않음)", () => {
    const target = profile("A", "A시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 });
    const b = profile("B", "B시", { demand: 90, stay: 61, spend: 60, diversity: 60, network: 60 });
    const result = computeRegionSimilarityComparisons(target, [target, b]);
    expect(result.uniqueStrengthNote).toBeNull();
  });

  it("상대 위치 문구가 공유 축 수와 우위 개수를 정확히 반영한다", () => {
    const target = profile("A", "A시", { demand: 70, stay: 70, spend: 30, diversity: 30, network: 60 });
    const candidate = profile("B", "B시", { demand: 60, stay: 60, spend: 60, diversity: 60, network: 60 });
    const result = computeRegionSimilarityComparisons(target, [target, candidate]);
    expect(result.comparisons[0].relativePosition).toContain("5개 축 중");
    expect(result.comparisons[0].relativePosition).toContain("2개 축에서 더 높고");
    expect(result.comparisons[0].relativePosition).toContain("2개 축에서 더 낮습니다");
  });
});

describe("computeRegionSimilarityComparisons — 기준월(baseYm) 투명성", () => {
  it("모든 지역이 같은 기준월이면 comparisonBaseYm만 반환하고 혼합 안내는 없다(동일 케이스)", () => {
    const target = profile("A", "A시", {}, {}, "202606");
    const b = profile("B", "B시", { demand: 61 }, {}, "202606");
    const c = profile("C", "C시", { demand: 62 }, {}, "202606");
    const result = computeRegionSimilarityComparisons(target, [target, b, c]);
    expect(result.comparisonBaseYm).toBe("202606");
    expect(result.mixedBaseYm).toBe(false);
    expect(result.baseYmNote).toBeNull();
  });

  it("비교 지역 중 하나라도 다른 기준월을 쓰면 혼합 기준월로 표시한다(상이 케이스)", () => {
    const target = profile("A", "A시", {}, {}, "202606");
    const differentMonth = profile("B", "B시", { demand: 61 }, {}, "202605");
    const result = computeRegionSimilarityComparisons(target, [target, differentMonth]);
    expect(result.mixedBaseYm).toBe(true);
    expect(result.baseYmNote).toContain("B시(202605)");
    expect(result.comparisons[0].baseYm).toBe("202605");
  });

  it("여러 지역이 각기 다른 기준월을 쓰면 하나로 뭉개지 않고 전부 안내한다(혼합 케이스)", () => {
    const target = profile("A", "A시", {}, {}, "202606");
    const b = profile("B", "B시", { demand: 61 }, {}, "202605");
    const c = profile("C", "C시", { demand: 62 }, {}, "202604");
    const result = computeRegionSimilarityComparisons(target, [target, b, c]);
    expect(result.mixedBaseYm).toBe(true);
    expect(result.baseYmNote).toContain("B시(202605)");
    expect(result.baseYmNote).toContain("C시(202604)");
  });
});

describe("resolveAnalysisBaseYmMismatchNote — 분석 기준월과 비교 기준월 불일치 안내", () => {
  it("두 기준월이 같으면 안내하지 않는다", () => {
    expect(resolveAnalysisBaseYmMismatchNote("202606", "202606")).toBeNull();
  });

  it("두 기준월이 다르면 두 값을 모두 포함한 안내를 만든다", () => {
    const note = resolveAnalysisBaseYmMismatchNote("202605", "202606");
    expect(note).toContain("202605");
    expect(note).toContain("202606");
  });

  it("분석 기준월 정보 자체가 없으면(null) 대체 사용 사실을 안내한다", () => {
    const note = resolveAnalysisBaseYmMismatchNote(null, "202606");
    expect(note).toContain("202606");
    expect(note).toContain("기준월 정보가 없어");
  });
});
