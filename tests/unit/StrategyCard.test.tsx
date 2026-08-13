// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { StrategyCard, type StrategyCardData } from "@/components/strategy/StrategyCard";

function strategy(overrides: Partial<StrategyCardData> = {}): StrategyCardData {
  return {
    id: "s1",
    rank: 1,
    name: "로컬미식·시장 연계형",
    concept: "지역 시장과 연계한 미식 코스",
    totalScore: 82,
    scoreBreakdown: { demandFit: 70, supplyFit: 60, seasonFit: 80, targetFit: 75, feasibilityFit: 65, roleFit: 55 },
    reasons: ["미식 자원이 풍부함", "접근성이 좋음"],
    targetDescription: "미식을 즐기는 개별 여행객",
    consumptionTouchpoints: { food: true, lodging: false, experience: true, examples: ["전통시장 투어"] },
    risks: ["성수기 혼잡"],
    evidences: [],
    coreProblem: "미식 자원 활용도가 낮음",
    coreResource: "전통시장",
    stayStyle: "당일형",
    executionDifficulty: "LOW",
    expectedEffect: "체류 소비 증가",
    ...overrides,
  };
}

/** 전략 비교표에 이미 나와 있는 5개 항목(해결 문제/활용 자원/체류 방식/실행 난이도/기대 효과)을 전략
 * 카드에서 중복 제거하고, 표에 없는 전략별 고유 정보(점수 세부·소비 접점·위험)는 접어서 유지한다
 * (2026-08-06). 2026-08-13: 1순위는 "추천 근거" 4단계에 coreProblem(해석)을 다시 노출하도록
 * 의도적으로 바꿨으므로(사용자가 "왜 1위인가"를 바로 알 수 있어야 함), 이 중복 제거 원칙은 2·3순위
 * 카드에서만 그대로 유지된다. */
describe("StrategyCard — 비교표 중복 정보 제거(2·3순위)", () => {
  it("2·3순위 카드는 해결 문제·활용 자원·체류 방식·실행 난이도·기대 효과를 표시하지 않는다", () => {
    render(<StrategyCard strategy={strategy({ rank: 2 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("해결하려는 문제")).not.toBeInTheDocument();
    expect(screen.queryByText("활용 자원")).not.toBeInTheDocument();
    expect(screen.queryByText("체류 방식")).not.toBeInTheDocument();
    expect(screen.queryByText("실행 난이도")).not.toBeInTheDocument();
    expect(screen.queryByText("기대 효과")).not.toBeInTheDocument();
    expect(screen.queryByText("미식 자원 활용도가 낮음")).not.toBeInTheDocument();
  });

  it("전략명·핵심 설명·점수·타깃·선택 버튼은 기본 화면에 항상 노출된다", () => {
    render(<StrategyCard strategy={strategy()} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("로컬미식·시장 연계형")).toBeInTheDocument();
    expect(screen.getByText("지역 시장과 연계한 미식 코스")).toBeInTheDocument();
    expect(screen.getByText("82점")).toBeInTheDocument();
    expect(screen.getByText(/타깃: 미식을 즐기는 개별 여행객/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 전략 선택" })).toBeInTheDocument();
  });

  it("2·3순위(rationale 없음) 전략은 여전히 '차별화 포인트' 목록을 보여준다", () => {
    render(<StrategyCard strategy={strategy({ rank: 2 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("차별화 포인트")).toBeInTheDocument();
    expect(screen.getByText("미식 자원이 풍부함")).toBeInTheDocument();
  });

  it("점수 세부·소비 접점·위험 요인은 삭제되지 않고 접힌 상세(<details>)에 그대로 남는다", () => {
    render(<StrategyCard strategy={strategy()} isSelected={false} onSelect={vi.fn()} />);
    const details = screen.getByText("점수 세부·소비 접점·위험 보기").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("수요 적합도")).toBeInTheDocument();
    expect(screen.getByText("지역 소비 접점")).toBeInTheDocument();
    expect(screen.getByText("위험 요인")).toBeInTheDocument();
    expect(screen.getByText("성수기 혼잡")).toBeInTheDocument();
  });

  it("근거 보기 details는 기존과 동일하게 유지된다", () => {
    render(<StrategyCard strategy={strategy()} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("근거 보기")).toBeInTheDocument();
  });
});

/** 5초 이해 UX 개선(2026-08-07) — 1순위 전략은 즉시 식별 가능해야 하고, 2·3순위는 실패한 전략처럼
 * 보이면 안 된다("대안"으로 표현). */
describe("StrategyCard — 추천 1순위 강조", () => {
  it("1순위 전략에는 '추천 1순위' 배지가 표시된다", () => {
    render(<StrategyCard strategy={strategy({ rank: 1 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("추천 1순위")).toBeInTheDocument();
  });

  it("2·3순위 전략에는 '대안 N' 배지가 표시되고 '순위'라는 표현은 쓰지 않는다", () => {
    render(<StrategyCard strategy={strategy({ rank: 2 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("대안 2")).toBeInTheDocument();
    expect(screen.queryByText(/2순위/)).not.toBeInTheDocument();
  });
});

/** 정보 위계 개선(2026-08-08) — 기본 화면에서 추천 이유(최대 2개)·예상 효과·주요 위험 1개가 바로
 * 보여야 사용자가 펼치지 않고도 전략을 비교할 수 있다. */
describe("StrategyCard — 정보 위계 개선(예상 효과·주요 위험 기본 노출)", () => {
  it("예상 효과와 주요 위험 1개가 펼치지 않아도 기본 화면에 보인다", () => {
    render(<StrategyCard strategy={strategy()} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/예상 효과: 체류 소비 증가/)).toBeInTheDocument();
    expect(screen.getByText(/주요 위험: 성수기 혼잡/)).toBeInTheDocument();
  });

  it("차별화 포인트가 2개를 넘으면 기본 화면에는 최대 2개만 보이고 나머지는 상세에서 확인할 수 있다(2·3순위)", () => {
    render(
      <StrategyCard
        strategy={strategy({ rank: 2, reasons: ["이유1", "이유2", "이유3"] })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("이유1")).toBeInTheDocument();
    expect(screen.getByText("이유2")).toBeInTheDocument();
    expect(screen.getByText(/그 외 1개는/)).toBeInTheDocument();

    // "이유3"은 접힌 상세(<details>) 안에만 있어야 하고, 기본 화면의 차별화 포인트 목록에는 없어야 한다.
    const visibleReasonList = screen.getByText("차별화 포인트").parentElement!;
    expect(visibleReasonList).not.toHaveTextContent("이유3");
    const details = screen.getByText("점수 세부·소비 접점·위험 보기").closest("details");
    expect(details).toContainElement(screen.getByText("이유3"));
  });
});

/** 전략 추천 근거 강화(2026-08-13) — 1순위 전략에만 "데이터 진단→해석→추천 이유→실행 방향" 4단계
 * 근거를 보여주고, 2·3순위는 기존 "차별화 포인트" 목록을 그대로 유지한다(11절 방침). */
describe("StrategyCard — 1순위 전략 추천 근거(데이터 진단→해석→추천 이유→실행 방향)", () => {
  it("1순위이고 coreProblem 등 5필드가 있으면 '추천 근거' 4단계 블록을 보여준다", () => {
    render(
      <StrategyCard
        strategy={strategy({ rank: 1, role: "TRAVEL_AGENCY" })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("추천 근거")).toBeInTheDocument();
    expect(screen.getByText("① 데이터 진단")).toBeInTheDocument();
    expect(screen.getByText("② 해석")).toBeInTheDocument();
    expect(screen.getByText("③ 추천 이유")).toBeInTheDocument();
    expect(screen.getByText("④ 실행 방향")).toBeInTheDocument();
    expect(screen.getByText("미식 자원 활용도가 낮음")).toBeInTheDocument();
    expect(screen.queryByText("차별화 포인트")).not.toBeInTheDocument();
  });

  it("1순위이지만 coreProblem 등이 레거시로 null이면 '추천 근거' 대신 기존 차별화 포인트를 보여준다", () => {
    render(
      <StrategyCard
        strategy={strategy({ rank: 1, coreProblem: null, coreResource: null, stayStyle: null })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText("추천 근거")).not.toBeInTheDocument();
    expect(screen.getByText("차별화 포인트")).toBeInTheDocument();
  });

  it("2·3순위는 coreProblem이 있어도 '추천 근거' 블록을 보여주지 않는다(길이 제한 방침)", () => {
    render(<StrategyCard strategy={strategy({ rank: 2 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("추천 근거")).not.toBeInTheDocument();
  });
});
