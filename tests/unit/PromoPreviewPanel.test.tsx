// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PromoPreviewPanel } from "@/components/plan/promo/PromoPreviewPanel";
import { buildPromoContent, type BuildPromoContentInput } from "@/lib/domain/promoContent";
import type { PromoProjectSummary } from "@/lib/domain/promoPreview";

const PROJECT: PromoProjectSummary = {
  regionName: "강릉시",
  travelYear: 2026,
  travelMonth: 9,
  strategyName: "로컬미식·시장 연계형",
};

function baseInput(): BuildPromoContentInput {
  return {
    project: { role: "TRAVEL_AGENCY", regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "콘셉트",
      background: "배경",
      targetSummary: "미식에 관심이 높은 소규모 동행 여행객",
      sellingPoints: ["포인트1", "포인트2", "포인트3"],
      course: [
        {
          dayIndex: 1,
          items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "09:00", stayMinutes: 60, travel: "이동" }],
          lodging: null,
        },
      ],
      kpis: [{ name: "kpi", method: "method" }],
      operationChecklist: ["체크1"],
      risks: [{ risk: "위험1", mitigation: "대응1" }],
    },
    evidences: [],
  };
}

describe("PromoPreviewPanel", () => {
  it("기본값은 포스터 탭이고, 지역명·전략명·역할 라벨을 표시한다", () => {
    const content = buildPromoContent(baseInput());
    render(<PromoPreviewPanel content={content} project={PROJECT} />);
    expect(screen.getByRole("tab", { name: "포스터", selected: true })).toBeInTheDocument();
    expect(screen.getByText("경포대")).toBeInTheDocument();
    expect(screen.getByText("여행사/DMC 관점")).toBeInTheDocument();
  });

  it("카드뉴스 탭을 클릭하면 카드뉴스 미리보기로 전환된다", () => {
    const content = buildPromoContent(baseInput());
    render(<PromoPreviewPanel content={content} project={PROJECT} />);
    fireEvent.click(screen.getByRole("tab", { name: "카드뉴스" }));
    expect(screen.getByRole("tab", { name: "카드뉴스", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "카드뉴스 미리보기" })).toBeInTheDocument();
  });

  it("content prop이 바뀌면(편집·저장 반영) 미리보기도 최신 값을 보여준다", () => {
    const content = buildPromoContent(baseInput());
    const { rerender } = render(<PromoPreviewPanel content={content} project={PROJECT} />);
    expect(screen.getByText(content.landing.title)).toBeInTheDocument();

    const edited = { ...content, landing: { ...content.landing, title: "사용자가 수정한 제목" } };
    rerender(<PromoPreviewPanel content={edited} project={PROJECT} />);
    expect(screen.getByText("사용자가 수정한 제목")).toBeInTheDocument();
    expect(screen.queryByText(content.landing.title)).not.toBeInTheDocument();
  });

  it("역할이 LOCAL_GOV여도 카드에 역할명을 반복 표시하지 않고 상단 배지 한 곳에만 표시한다", () => {
    const content = buildPromoContent({ ...baseInput(), project: { ...baseInput().project, role: "LOCAL_GOV" } });
    render(<PromoPreviewPanel content={content} project={PROJECT} />);
    expect(screen.getAllByText(/지자체\/관광재단/)).toHaveLength(1);
  });
});
