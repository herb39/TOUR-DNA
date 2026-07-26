// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const generatePromoContentAction = vi.fn();
const savePromoContentAction = vi.fn();

vi.mock("@/app/projects/[id]/plan/actions", () => ({
  generatePromoContentAction: (...args: unknown[]) => generatePromoContentAction(...args),
  savePromoContentAction: (...args: unknown[]) => savePromoContentAction(...args),
}));

import { PromoContentEditor } from "@/components/plan/PromoContentEditor";
import { buildPromoContent } from "@/lib/domain/promoContent";
import type { PromoContent } from "@/lib/domain/promoContent";
import type { GetPromoContentResult } from "@/lib/services/promoContentService";

const PROJECT_ID = "project-1";

function sampleContent(role: "TRAVEL_AGENCY" | "LOCAL_GOV" = "TRAVEL_AGENCY"): PromoContent {
  return buildPromoContent({
    project: { role, regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "콘셉트",
      background: "배경",
      targetSummary: "타깃",
      sellingPoints: ["a", "b", "c"],
      course: [
        {
          dayIndex: 1,
          items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "이동" }],
          lodging: null,
        },
      ],
      kpis: [{ name: "kpi", method: "method" }],
    },
    evidences: [],
  });
}

function emptyInitial(): GetPromoContentResult {
  return { ok: true, content: null };
}

function filledInitial(content: PromoContent): GetPromoContentResult {
  return { ok: true, content };
}

beforeEach(() => {
  generatePromoContentAction.mockReset();
  savePromoContentAction.mockReset();
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("초기 상태", () => {
  it("콘텐츠가 null이면 빈 상태와 생성 버튼을 표시한다", () => {
    render(<PromoContentEditor projectId={PROJECT_ID} initial={emptyInitial()} />);
    expect(screen.getByText("아직 생성된 홍보자료가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홍보자료 생성" })).toBeInTheDocument();
  });

  it("저장된 콘텐츠가 있으면 편집 UI에 기존 값이 표시된다", () => {
    const content = sampleContent();
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);
    expect(screen.getByDisplayValue(content.landing.title)).toBeInTheDocument();
    expect(screen.getByDisplayValue(content.blog.title)).toBeInTheDocument();
  });

  it("invalidContent를 빈 상태로 처리하지 않고 오류 메시지를 표시한다", () => {
    render(<PromoContentEditor projectId={PROJECT_ID} initial={{ ok: false, code: "invalidContent", message: "bad" }} />);
    expect(screen.queryByText("아직 생성된 홍보자료가 없습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("저장된 홍보자료 또는 편집한 내용의 구조가 올바르지 않습니다.");
  });

  it("noPlan이면 생성 버튼이 비활성화된다", () => {
    render(<PromoContentEditor projectId={PROJECT_ID} initial={{ ok: false, code: "noPlan", message: "no plan" }} />);
    expect(screen.getByRole("button", { name: "홍보자료 생성" })).toBeDisabled();
  });
});

describe("생성", () => {
  it("최초 생성 시 overwrite 없이 액션을 호출한다", async () => {
    const content = sampleContent();
    generatePromoContentAction.mockResolvedValue({ ok: true, content });
    render(<PromoContentEditor projectId={PROJECT_ID} initial={emptyInitial()} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, { overwrite: false }));
    expect(await screen.findByDisplayValue(content.landing.title)).toBeInTheDocument();
  });

  it("생성 실패 시 기존(빈) 상태를 유지한다", async () => {
    generatePromoContentAction.mockResolvedValue({ ok: false, code: "internalError", message: "fail" });
    render(<PromoContentEditor projectId={PROJECT_ID} initial={emptyInitial()} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("일시적인 오류"));
    expect(screen.getByText("아직 생성된 홍보자료가 없습니다.")).toBeInTheDocument();
  });

  it("빈 화면 최초 생성이 alreadyExists를 반환하면 확인창을 표시하고, 확인 전에는 overwrite를 호출하지 않는다", async () => {
    generatePromoContentAction.mockResolvedValueOnce({ ok: false, code: "alreadyExists", message: "이미 있음" });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromoContentEditor projectId={PROJECT_ID} initial={emptyInitial()} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, { overwrite: false }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("재생성")));
    expect(generatePromoContentAction).toHaveBeenCalledTimes(1); // overwrite:true로는 아직 호출되지 않음
    expect(generatePromoContentAction).not.toHaveBeenCalledWith(PROJECT_ID, { overwrite: true });
  });

  it("빈 화면 최초 생성이 alreadyExists를 반환하고 사용자가 확인하면 그때만 overwrite:true로 호출한다", async () => {
    const content = sampleContent();
    generatePromoContentAction.mockResolvedValueOnce({ ok: false, code: "alreadyExists", message: "이미 있음" });
    generatePromoContentAction.mockResolvedValueOnce({ ok: true, content });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromoContentEditor projectId={PROJECT_ID} initial={emptyInitial()} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, { overwrite: false }));
    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, { overwrite: true }));
    expect(generatePromoContentAction).toHaveBeenCalledTimes(2);
    expect(await screen.findByDisplayValue(content.landing.title)).toBeInTheDocument();
  });

  it("빈 화면 최초 생성에서 alreadyExists 후 확인을 취소하면 계속 빈 상태를 유지한다", async () => {
    generatePromoContentAction.mockResolvedValueOnce({ ok: false, code: "alreadyExists", message: "이미 있음" });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromoContentEditor projectId={PROJECT_ID} initial={emptyInitial()} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledTimes(1));
    expect(screen.getByText("아직 생성된 홍보자료가 없습니다.")).toBeInTheDocument();
  });

  it("invalidContent 복구 버튼은 확인 전에 overwrite를 호출하지 않는다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromoContentEditor projectId={PROJECT_ID} initial={{ ok: false, code: "invalidContent", message: "bad" }} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("재생성"));
    expect(generatePromoContentAction).not.toHaveBeenCalled();
  });

  it("invalidContent 복구 버튼은 확인 시에만 overwrite:true로 호출한다", async () => {
    const content = sampleContent();
    generatePromoContentAction.mockResolvedValue({ ok: true, content });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PromoContentEditor projectId={PROJECT_ID} initial={{ ok: false, code: "invalidContent", message: "bad" }} />);

    fireEvent.click(screen.getByRole("button", { name: "홍보자료 생성" }));

    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, { overwrite: true }));
    expect(generatePromoContentAction).toHaveBeenCalledTimes(1);
  });

  it("alreadyExists면 사용자 확인 없이 overwrite를 호출하지 않고, 확인 후에만 {overwrite:true}로 호출한다", async () => {
    const content = sampleContent();
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);

    generatePromoContentAction.mockResolvedValueOnce({ ok: true, content: { ...content, landing: { ...content.landing, title: "재생성된 제목" } } });
    fireEvent.click(screen.getByRole("button", { name: "재생성" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("재생성"));
    await waitFor(() => expect(generatePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, { overwrite: true }));
  });

  it("재생성 확인을 취소하면 액션을 호출하지 않고 현재 콘텐츠를 유지한다", () => {
    const content = sampleContent();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);

    fireEvent.click(screen.getByRole("button", { name: "재생성" }));

    expect(generatePromoContentAction).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(content.landing.title)).toBeInTheDocument();
  });
});

describe("편집과 저장", () => {
  it("문구 수정 시 dirty 상태가 활성화된다", () => {
    const content = sampleContent();
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);
    expect(screen.getByText("모든 변경사항이 저장되었습니다.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("제목", { selector: "#promo-landing-title" }), { target: { value: "수정된 제목" } });

    expect(screen.getByText("저장하지 않은 변경사항이 있습니다.")).toBeInTheDocument();
  });

  it("역할별 discriminator가 보존된다(TRAVEL_AGENCY)", () => {
    const content = sampleContent("TRAVEL_AGENCY");
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);
    expect(screen.getByText("여행상품 홍보자료")).toBeInTheDocument();
    expect(screen.queryByText("보도자료")).not.toBeInTheDocument();
  });

  it("역할별 discriminator가 보존된다(LOCAL_GOV)", () => {
    const content = sampleContent("LOCAL_GOV");
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);
    expect(screen.getByText("보도자료")).toBeInTheDocument();
    expect(screen.queryByText("여행상품 홍보자료")).not.toBeInTheDocument();
  });

  it("저장 시 전체 PromoContent를 전달하고, 성공하면 dirty가 해제된다", async () => {
    const content = sampleContent();
    savePromoContentAction.mockResolvedValue({ ok: true, content });
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(savePromoContentAction).toHaveBeenCalledWith(PROJECT_ID, content));
    await waitFor(() => expect(screen.getByText("모든 변경사항이 저장되었습니다.")).toBeInTheDocument());
  });

  it("저장 실패 시 편집 내용을 유지한다", async () => {
    const content = sampleContent();
    savePromoContentAction.mockResolvedValue({ ok: false, code: "invalidContent", message: "bad" });
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);

    fireEvent.change(screen.getByLabelText("제목", { selector: "#promo-landing-title" }), { target: { value: "사용자 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("구조가 올바르지 않습니다"));
    expect(screen.getByDisplayValue("사용자 수정")).toBeInTheDocument();
  });
});

describe("복사", () => {
  it("전체 복사 클릭 시 clipboard.writeText가 호출되고 '복사됨'으로 바뀐다", async () => {
    const content = sampleContent();
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);

    fireEvent.click(screen.getByRole("button", { name: "전체 복사" }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "복사됨" })).toBeInTheDocument();
  });

  it("clipboard 실패 시 '복사됨'으로 표시하지 않는다", async () => {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const content = sampleContent();
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);

    fireEvent.click(screen.getByRole("button", { name: "전체 복사" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("복사에 실패"));
    expect(screen.queryByRole("button", { name: "복사됨" })).not.toBeInTheDocument();
  });
});

describe("근거 표시", () => {
  it("생성 근거를 펼치면 courseHighlights 순서가 유지되고 timeSlot/mealPurpose가 표시된다", () => {
    const content = sampleContent();
    render(<PromoContentEditor projectId={PROJECT_ID} initial={filledInitial(content)} />);
    fireEvent.click(screen.getByRole("button", { name: "생성 근거 보기 ▼" }));
    expect(screen.getByText(/10:00 경포대/)).toBeInTheDocument();
  });
});
