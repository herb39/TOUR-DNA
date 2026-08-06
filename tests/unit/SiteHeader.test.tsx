// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { SiteHeader } from "@/components/layout/SiteHeader";

/** 헤더 잠금(로그아웃) 버튼 삭제(2026-08-06) — 사이트 전체 접근 제어(SITE_ACCESS_PASSWORD, proxy.ts)와
 * 프로젝트별 잠금(projectAccess.ts)은 이 버튼과 무관하게 서버에서 독립적으로 동작하므로, 버튼 UI만
 * 없어져도 실제 접근 제어에는 영향이 없다 — 이 테스트는 UI 노출 여부만 확인한다. */
describe("SiteHeader — 잠금(로그아웃) 버튼 미노출", () => {
  it("잠금 버튼/텍스트가 더 이상 렌더링되지 않는다", () => {
    render(<SiteHeader />);
    expect(screen.queryByText("잠금")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /잠금/ })).not.toBeInTheDocument();
  });

  it("모바일 뷰(같은 마크업, 반응형 클래스만 다름)에도 잠금 버튼이 없다 — 별도 햄버거 메뉴가 없어 동일 DOM을 검사한다", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("기존 정상 네비게이션(새 관광상품 기획)은 그대로 유지된다", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "새 관광상품 기획" })).toBeInTheDocument();
  });

  /** 별도 프로젝트 목록 화면이 없어(홈이 곧 목록) "프로젝트 목록" 메뉴는 홈 링크와 중복이었다
   * (2026-08-06 제거). 로고가 이미 홈으로 이동하는 링크를 제공한다. */
  it("프로젝트 목록 메뉴는 더 이상 노출되지 않는다(홈 링크와 중복)", () => {
    render(<SiteHeader />);
    expect(screen.queryByText("프로젝트 목록")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "프로젝트 목록" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TOUR DNA/ })).toHaveAttribute("href", "/");
  });
});
