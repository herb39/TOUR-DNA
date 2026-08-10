// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PromoPreviewPanel } from "@/components/plan/promo/PromoPreviewPanel";
import { buildPromoContent, type BuildPromoContentInput, type PromoContent } from "@/lib/domain/promoContent";
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

/** 실제 PromoContentEditor의 updateContent와 같은 동작을 재현하는 최소 스텁 — 편집 폼이 이 콜백을
 * 호출하면 다음 렌더에서 최신 content를 반영하도록 rerender에 넘긴다. */
function renderPanel(content: PromoContent) {
  const updateContent = vi.fn();
  const copyToClipboard = vi.fn();
  const utils = render(
    <PromoPreviewPanel
      content={content}
      project={PROJECT}
      updateContent={updateContent}
      copyToClipboard={copyToClipboard}
      copiedKey={null}
    />,
  );
  return { ...utils, updateContent, copyToClipboard };
}

describe("PromoPreviewPanel", () => {
  it("기본값은 포스터 탭이고, 지역명·전략명·역할 라벨을 표시한다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    expect(screen.getByRole("tab", { name: "포스터", selected: true })).toBeInTheDocument();
    expect(screen.getByText("경포대")).toBeInTheDocument();
    expect(screen.getByText("여행사/DMC 관점")).toBeInTheDocument();
  });

  it("카드뉴스 탭을 클릭하면 카드뉴스 미리보기로 전환된다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "카드뉴스" }));
    expect(screen.getByRole("tab", { name: "카드뉴스", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "카드뉴스 미리보기" })).toBeInTheDocument();
  });

  it("content prop이 바뀌면(편집·저장 반영) 미리보기도 최신 값을 보여준다", () => {
    const content = buildPromoContent(baseInput());
    const { rerender } = renderPanel(content);
    expect(screen.getByText(content.landing.title)).toBeInTheDocument();

    const edited = { ...content, landing: { ...content.landing, title: "사용자가 수정한 제목" } };
    fireEvent.click(screen.getByRole("tab", { name: "랜딩" }));
    rerender(
      <PromoPreviewPanel
        content={edited}
        project={PROJECT}
        updateContent={vi.fn()}
        copyToClipboard={vi.fn()}
        copiedKey={null}
      />,
    );
    expect(screen.getByText("사용자가 수정한 제목")).toBeInTheDocument();
    expect(screen.queryByText(content.landing.title)).not.toBeInTheDocument();
  });

  it("역할이 LOCAL_GOV여도 카드에 역할명을 반복 표시하지 않고 상단 배지 한 곳에만 표시한다", () => {
    const content = buildPromoContent({ ...baseInput(), project: { ...baseInput().project, role: "LOCAL_GOV" } });
    renderPanel(content);
    expect(screen.getAllByText(/지자체\/관광재단/)).toHaveLength(1);
  });

  it("7개 탭(포스터·카드뉴스·숏폼·SNS·블로그·랜딩·제안서)이 모두 있다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    for (const label of ["포스터", "카드뉴스", "숏폼", "SNS", "블로그", "랜딩", "제안서"]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
  });

  it("SNS 탭은 캡션과 해시태그를 실제 게시글처럼 보여준다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "SNS" }));
    // caption이 여러 문단(개행 포함)으로 확장돼(2026-08-11) getByText의 기본 정규화가 단일 텍스트
    // 노드 안의 개행을 일반 매처와 다르게 처리한다 — element.textContent를 직접 비교하는 커스텀
    // 매처로 확인한다.
    expect(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === "p" && element.textContent === content.instagram.caption),
    ).toBeInTheDocument();
    if (content.instagram.hashtags.length > 0) {
      expect(screen.getByText(`#${content.instagram.hashtags[0]}`, { exact: false })).toBeInTheDocument();
    }
  });

  it("블로그 탭은 제목과 본문을 기사 형태로 보여준다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "블로그" }));
    expect(screen.getByText(content.blog.title)).toBeInTheDocument();
    // body가 여러 문단(개행 포함)으로 확장돼(2026-08-11) SNS 캡션과 같은 이유로 커스텀 매처를 쓴다.
    expect(
      screen.getByText((_, element) => element?.tagName.toLowerCase() === "p" && element.textContent === content.blog.body),
    ).toBeInTheDocument();
  });

  it("랜딩 탭은 히어로 제목·대표 코스·CTA를 함께 보여준다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "랜딩" }));
    expect(screen.getByText(content.landing.title)).toBeInTheDocument();
    expect(screen.getByText("대표 코스")).toBeInTheDocument();
    expect(screen.getByText("경포대")).toBeInTheDocument();
  });

  it("제안서 탭은 사업명·핵심 전략·추진 목적을 함께 보여준다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "제안서" }));
    expect(screen.getByText("강릉 미식 코스")).toBeInTheDocument();
    expect(screen.getByText("핵심 전략")).toBeInTheDocument();
    expect(screen.getByText(PROJECT.strategyName)).toBeInTheDocument();
    expect(screen.getByText("추진 목적")).toBeInTheDocument();
  });

  it("결과물이 기본으로 보이고, 입력폼(textarea)은 '문구 편집'을 눌러야 나타난다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "블로그" }));
    expect(screen.queryByLabelText("본문")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "문구 편집" }));
    expect(screen.getByLabelText("본문")).toBeInTheDocument();
  });

  it("문구 편집에서 값을 바꾸면 부모의 updateContent가 호출된다", () => {
    const content = buildPromoContent(baseInput());
    const { updateContent } = renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "블로그" }));
    fireEvent.click(screen.getByRole("button", { name: "문구 편집" }));
    fireEvent.change(screen.getByLabelText("본문"), { target: { value: "새로운 본문" } });
    expect(updateContent).toHaveBeenCalled();
  });

  it("탭을 바꾸면 문구 편집이 다시 닫힌 상태로 시작한다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    fireEvent.click(screen.getByRole("tab", { name: "블로그" }));
    fireEvent.click(screen.getByRole("button", { name: "문구 편집" }));
    expect(screen.getByLabelText("본문")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "랜딩" }));
    expect(screen.getByRole("button", { name: "문구 편집" })).toBeInTheDocument();
    expect(screen.queryByLabelText("본문")).not.toBeInTheDocument();
  });

  it("포스터 탭에는 '문구 편집' 버튼이 없고, 대신 다른 탭에서 고치라는 안내만 보인다", () => {
    const content = buildPromoContent(baseInput());
    renderPanel(content);
    expect(screen.queryByRole("button", { name: "문구 편집" })).not.toBeInTheDocument();
    expect(screen.getByText(/랜딩·SNS·제안서 탭의 문구를 조합해/)).toBeInTheDocument();
  });
});
