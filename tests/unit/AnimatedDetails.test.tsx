// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advanceAnimation() {
  act(() => {
    vi.runAllTimers();
  });
}

describe("AnimatedDetails", () => {
  it("네이티브 details 의미를 유지하면서 열고 닫는다", () => {
    vi.useFakeTimers();
    render(
      <AnimatedDetails summary="상세 보기">
        <p>상세 내용</p>
      </AnimatedDetails>,
    );

    const details = screen.getByText("상세 보기").closest("details")!;
    const summary = screen.getByText("상세 보기");
    const content = screen.getByText("상세 내용").parentElement!;

    expect(details).not.toHaveAttribute("open");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(content).toHaveClass("tour-dna-expandable-content");

    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(summary).toHaveAttribute("aria-expanded", "true");
    advanceAnimation();

    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(summary).toHaveAttribute("aria-expanded", "false");
    advanceAnimation();
    expect(details).not.toHaveAttribute("open");
  });

  it("빠르게 반복해도 마지막 의도(열림)를 유지한다", () => {
    vi.useFakeTimers();
    render(
      <AnimatedDetails summary="후보 목록">
        <p>후보 내용</p>
      </AnimatedDetails>,
    );

    const summary = screen.getByText("후보 목록");
    const details = summary.closest("details")!;

    fireEvent.click(summary);
    fireEvent.click(summary);
    fireEvent.click(summary);
    advanceAnimation();

    expect(details).toHaveAttribute("open");
    expect(summary).toHaveAttribute("aria-expanded", "true");
  });

  it("Enter와 Space 키보드 활성화를 지원한다", () => {
    vi.useFakeTimers();
    render(
      <AnimatedDetails summary="키보드 상세">
        <p>키보드 내용</p>
      </AnimatedDetails>,
    );

    const summary = screen.getByRole("button", { name: "키보드 상세" });
    const details = summary.closest("details")!;

    fireEvent.keyDown(summary, { key: "Enter" });
    expect(details).toHaveAttribute("open");
    advanceAnimation();
    fireEvent.keyDown(summary, { key: " " });
    expect(details).toHaveAttribute("open");
    advanceAnimation();
    expect(details).not.toHaveAttribute("open");
  });

  it("reduced-motion 환경에서는 높이 전환을 기다리지 않는다", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      }),
    );

    render(
      <AnimatedDetails summary="접기">
        <p>내용</p>
      </AnimatedDetails>,
    );

    const summary = screen.getByText("접기");
    const details = summary.closest("details")!;
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    fireEvent.click(summary);
    expect(details).not.toHaveAttribute("open");
  });
});
