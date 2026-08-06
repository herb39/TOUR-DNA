// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { StrategyResourcePlanPanel } from "@/components/strategy/StrategyResourcePlanPanel";
import type { StrategyBudgetItem, StrategyPartnerLink } from "@/lib/domain/strategyResourcePlan";

const budgetItems: StrategyBudgetItem[] = [
  { category: "홍보", amount: "기관 산정 필요", description: "홍보물 제작" },
  { category: "인력", amount: "기관 산정 필요", description: "현장 운영 인력" },
];
const partners: StrategyPartnerLink[] = [{ category: "지자체 부서", name: "관광과", reason: "행정 협조" }];

/** 전략 3개가 모두 펼쳐지면 화면이 지나치게 길어져 기본 접힘으로 바꾼다(2026-08-06) — 펼치면 기존
 * 예산·협력 대상 내용은 그대로 보여야 한다. */
describe("StrategyResourcePlanPanel — 기본 접힘", () => {
  it("기본 상태에서는 접혀 있고, 요약(카테고리 개수)만 보인다", () => {
    render(<StrategyResourcePlanPanel budgetItems={budgetItems} partners={partners} />);
    const details = screen.getByText(/예산 및 협력 대상 보기/).closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(/예산 카테고리 2/)).toBeInTheDocument();
    expect(screen.getByText(/협력 대상 1/)).toBeInTheDocument();
  });

  it("클릭하면 펼쳐지고 기존 예산 항목·협력 대상 설명이 모두 나타난다", () => {
    render(<StrategyResourcePlanPanel budgetItems={budgetItems} partners={partners} />);
    const summary = screen.getByText(/예산 및 협력 대상 보기/);
    fireEvent.click(summary);
    const details = summary.closest("details");
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("홍보물 제작")).toBeInTheDocument();
    expect(screen.getByText("현장 운영 인력")).toBeInTheDocument();
    expect(screen.getByText(/관광과/)).toBeInTheDocument();
    expect(screen.getByText("행정 협조")).toBeInTheDocument();
  });
});
