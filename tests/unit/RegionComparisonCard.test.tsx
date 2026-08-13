// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { RegionComparisonCard } from "@/components/comparison/RegionComparisonCard";
import type { ComparedRegion } from "@/lib/domain/regionSimilarity";

function comparison(overrides: Partial<ComparedRegion> = {}): ComparedRegion {
  return {
    regionCode: "B",
    regionName: "B시",
    baseYm: "202606",
    axisDifferences: [
      { axis: "demand", axisLabel: "수요", targetScore: 60, candidateScore: 50, diff: 10, targetDisplayScore: 58, candidateDisplayScore: 50, displayDiff: 8 },
    ],
    relativePosition: "비교 가능한 1개 축 중 A시가(가) 1개 축에서 더 높습니다.",
    strengthWeaknessSummary: "수요 축이 앞섭니다.",
    benchmarkPoints: [],
    poiCompositionNote: null,
    poiCategoryShareDiffs: null,
    limitations: "이 비교는 공공데이터 기반 상대 비교(CURATED 규칙)이며, 실제 방문객 체감이나 시장 데이터와 다를 수 있습니다.",
    ...overrides,
  };
}

/** 모든 유사지역 카드에 동일하게 반복되는 "한계 및 추가 확인사항" 문구는 섹션에 한 번만 표시하도록
 * 옮겼다(2026-08-06) — 카드 자체에는 더 이상 렌더링하지 않는다. */
describe("RegionComparisonCard — 반복 안내문 제거", () => {
  it("카드에 한계 및 추가 확인사항 문구를 더 이상 표시하지 않는다", () => {
    render(<RegionComparisonCard comparison={comparison()} rank={1} comparisonBaseYm="202606" />);
    expect(screen.queryByText("한계 및 추가 확인사항:")).not.toBeInTheDocument();
    expect(
      screen.queryByText("이 비교는 공공데이터 기반 상대 비교(CURATED 규칙)이며, 실제 방문객 체감이나 시장 데이터와 다를 수 있습니다."),
    ).not.toBeInTheDocument();
  });

  it("카드별로 다른 정보(상대 위치·강점·DNA 축 차이)는 그대로 유지된다", () => {
    render(<RegionComparisonCard comparison={comparison()} rank={1} comparisonBaseYm="202606" />);
    expect(screen.getByText("비교 가능한 1개 축 중 A시가(가) 1개 축에서 더 높습니다.")).toBeInTheDocument();
    expect(screen.getByText("수요 축이 앞섭니다.")).toBeInTheDocument();
  });
});

/** 정보 위계 개선(2026-08-08) — 핵심 공통점(strengthWeaknessSummary)은 기본 화면에 바로 보이고,
 * 상대 위치·DNA 5축 차이표·벤치마킹 요소는 접힌 상세로 이동한다. */
describe("RegionComparisonCard — 정보 위계 개선(기본·상세 분리)", () => {
  it("핵심 공통점은 기본 화면에 바로 보이고, 축별 차이 상세는 기본적으로 접혀 있다", () => {
    render(<RegionComparisonCard comparison={comparison()} rank={1} comparisonBaseYm="202606" />);
    expect(screen.getByText("수요 축이 앞섭니다.")).toBeInTheDocument();

    const details = screen.getByText(/축별 차이·벤치마킹 보기/).closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByText("비교 가능한 1개 축 중 A시가(가) 1개 축에서 더 높습니다."));
  });
});

/** 2026-08-10 — DNA 카드/레이더와 같은 사용자 표시지수를 보여줘야 한다(내부 원점수를 그대로
 * 노출하지 않는다). targetScore=60/candidateScore=50(원점수)과 targetDisplayScore=58/
 * candidateDisplayScore=50(표시지수)을 의도적으로 다르게 둬서, 화면에 실제로 표시지수 쪽이
 * 렌더링되는지 구분해 확인한다. */
describe("RegionComparisonCard — 사용자 표시지수로 렌더링(내부 원점수 미노출)", () => {
  it("DNA 5축 차이 표에는 원점수가 아니라 표시지수(targetDisplayScore/candidateDisplayScore)가 나온다", () => {
    render(<RegionComparisonCard comparison={comparison()} rank={1} comparisonBaseYm="202606" />);
    expect(screen.getByText("58 vs 50")).toBeInTheDocument();
    expect(screen.queryByText("60 vs 50")).not.toBeInTheDocument();
  });

  it("diff 열에도 표시지수 기준 차이(displayDiff)가 나온다", () => {
    render(<RegionComparisonCard comparison={comparison()} rank={1} comparisonBaseYm="202606" />);
    expect(screen.getByText("+8")).toBeInTheDocument();
    expect(screen.queryByText("+10")).not.toBeInTheDocument();
  });
});
