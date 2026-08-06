// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import type { OpportunityItem } from "@/lib/domain/businessOpportunity";

function opportunity(overrides: Partial<OpportunityItem> = {}): OpportunityItem {
  return {
    category: "WEAKNESS_RECOVERY",
    title: "수요 기반 확대 기회",
    problem: "관광 수요가 비교군 대비 낮음",
    strengthsToLeverage: "체류 축이 강점으로 확인됨",
    targetAudience: "재방문 가능성이 높은 방문객",
    timing: "상시 추진 가능",
    direction: "재방문·구전 유도 사업",
    evidence: ["수요 축 40점"],
    limitations:
      "이 기회는 공공데이터 기반 상대 비교와 기획 규칙(CURATED)으로 도출한 가설이며, 실제 사업성(수요조사·투자 대비 효과)은 별도 검증이 필요합니다.",
    uniqueLimitationNote: null,
    ...overrides,
  };
}

/** 모든 기회 카드에 동일하게 반복되는 공공데이터 한계·검증 안내는 섹션에 한 번만 표시하도록 옮겼다
 * (2026-08-06) — 기회별로 다른 한계(uniqueLimitationNote)만 카드에 남긴다. */
describe("OpportunityCard — 반복 안내문 통합", () => {
  it("uniqueLimitationNote가 없으면(공통 안내뿐이면) 카드에 한계 문단을 표시하지 않는다", () => {
    render(<OpportunityCard opportunity={opportunity()} rank={1} />);
    expect(screen.queryByText("한계 및 추가 확인사항:")).not.toBeInTheDocument();
  });

  it("uniqueLimitationNote가 있으면 그 문구만 카드에 표시한다(공통 안내 문구는 표시하지 않음)", () => {
    render(
      <OpportunityCard
        opportunity={opportunity({ uniqueLimitationNote: "이 축은 실시간이 아닌 최근 확보 데이터를 사용해 계산됐습니다." })}
        rank={1}
      />,
    );
    expect(screen.getByText("한계 및 추가 확인사항:")).toBeInTheDocument();
    expect(screen.getByText("이 축은 실시간이 아닌 최근 확보 데이터를 사용해 계산됐습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/CURATED\)으로 도출한 가설/)).not.toBeInTheDocument();
  });

  it("기회별 핵심 정보(제목·문제·타깃·근거)는 그대로 유지된다", () => {
    render(<OpportunityCard opportunity={opportunity()} rank={1} />);
    expect(screen.getByText("수요 기반 확대 기회")).toBeInTheDocument();
    expect(screen.getByText("관광 수요가 비교군 대비 낮음")).toBeInTheDocument();
    expect(screen.getByText("재방문 가능성이 높은 방문객")).toBeInTheDocument();
    expect(screen.getByText("수요 축 40점")).toBeInTheDocument();
  });
});
