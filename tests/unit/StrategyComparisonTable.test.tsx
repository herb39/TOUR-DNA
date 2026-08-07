// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { StrategyComparisonTable } from "@/components/strategy/StrategyComparisonTable";
import type { StrategyComparisonRow } from "@/lib/domain/strategyResourcePlan";

function row(overrides: Partial<StrategyComparisonRow> = {}): StrategyComparisonRow {
  return {
    id: "s1",
    rank: 1,
    name: "로컬미식·시장 연계형",
    totalScore: 82,
    templateId: "LOCAL_FOOD_MARKET",
    coreProblem: "미식 자원 활용도가 낮음",
    coreResource: "전통시장",
    stayStyle: "당일형",
    executionDifficulty: "LOW",
    expectedEffect: "체류 소비 증가",
    risks: ["성수기 혼잡", "우천 시 매력도 저하"],
    roleFitRanking: [
      { role: "TRAVEL_AGENCY", roleLabel: "여행사/DMC", score: 90 },
      { role: "LOCAL_GOV", roleLabel: "지자체/관광재단", score: 70 },
      { role: "FESTIVAL_PLANNER", roleLabel: "축제 기획자", score: 60 },
    ],
    dataAvailability: "COMPLETE",
    ...overrides,
  };
}

/** 5초 이해 UX 개선(2026-08-07) — 기본 표는 핵심 방향·기대 효과·실행 난이도·주요 위험 4개만 보이고,
 * 활용 자원·체류 방식·적합 역할은 접힌 상세로 옮긴다(데이터는 삭제하지 않음). */
describe("StrategyComparisonTable — 기본 표 간소화", () => {
  it("기본 표에는 핵심 방향·기대 효과·실행 난이도·주요 위험 4개 항목만 보인다", () => {
    render(<StrategyComparisonTable rows={[row()]} />);
    expect(screen.getByText("핵심 방향")).toBeInTheDocument();
    expect(screen.getByText("기대 효과")).toBeInTheDocument();
    expect(screen.getByText("실행 난이도")).toBeInTheDocument();
    expect(screen.getByText("주요 위험")).toBeInTheDocument();
  });

  it("활용 자원·체류 방식·적합 역할은 기본 화면에는 없고 접힌 상세 안에만 있다", () => {
    render(<StrategyComparisonTable rows={[row()]} />);
    const details = screen.getByText("활용 자원·체류 방식·적합 역할 더보기").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toContainElement(screen.getByText("전통시장"));
    expect(details).toContainElement(screen.getByText("당일형"));
  });

  it("주요 위험 두 번째 항목은 기본 표에는 없고 접힌 상세의 전체 목록에만 있다", () => {
    render(<StrategyComparisonTable rows={[row()]} />);
    const details = screen.getByText("활용 자원·체류 방식·적합 역할 더보기").closest("details")!;
    // "우천 시 매력도 저하"(두 번째 위험)는 기본 표 요약(첫 번째 위험만 표시)에는 없고, 접힌
    // 상세의 전체 위험 목록에만 존재해야 한다.
    expect(screen.getByText("우천 시 매력도 저하")).toBeInTheDocument();
    expect(details).toContainElement(screen.getByText("우천 시 매력도 저하"));
  });

  it("1순위 전략에는 '추천 1순위', 2순위 이후에는 '대안 N' 라벨이 붙는다", () => {
    render(
      <StrategyComparisonTable
        rows={[row({ id: "s1", rank: 1 }), row({ id: "s2", rank: 2, name: "야간·체류 확대형" })]}
      />,
    );
    expect(screen.getByText("추천 1순위")).toBeInTheDocument();
    expect(screen.getByText("대안 2")).toBeInTheDocument();
  });

  it("roleFit이라는 내부 공식 이름이 화면에 노출되지 않는다", () => {
    render(<StrategyComparisonTable rows={[row()]} />);
    expect(screen.queryByText(/roleFit/)).not.toBeInTheDocument();
  });
});
