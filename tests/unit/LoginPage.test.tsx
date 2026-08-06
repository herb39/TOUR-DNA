// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/login/actions", () => ({
  loginAction: vi.fn(async () => ({})),
}));

import LoginPage from "@/app/login/page";

async function renderLoginPage(next?: string) {
  const ui = await LoginPage({ searchParams: Promise.resolve({ next }) });
  render(ui);
}

/** 사이트 전체 비밀번호 화면에서 브라우저 뒤로가기 없이 홈으로 돌아갈 수 있어야 한다(2026-08-06). */
describe("LoginPage — 홈으로 돌아가기(2026-08-06 추가)", () => {
  it("홈으로 돌아가기 링크가 렌더링된다", async () => {
    await renderLoginPage();
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "/");
  });

  it("외부 URL을 next로 넘겨도 로그인 폼의 hidden next 값은 안전한 내부 경로로 대체된다(open redirect 차단, 기존 safeNextPath 회귀 확인)", async () => {
    await renderLoginPage("https://evil.example.com");
    const hidden = document.querySelector('input[name="next"]') as HTMLInputElement;
    expect(hidden.value).toBe("/");
  });

  it("내부 상대 경로 next는 그대로 유지된다", async () => {
    await renderLoginPage("/projects/new");
    const hidden = document.querySelector('input[name="next"]') as HTMLInputElement;
    expect(hidden.value).toBe("/projects/new");
  });

  it("비밀번호 입력 필드와 제출 버튼은 그대로 유지된다(접근 제어 로직 변경 없음)", async () => {
    await renderLoginPage();
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "입장" })).toBeInTheDocument();
  });
});
