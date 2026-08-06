// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/access-actions", () => ({
  verifyProjectAccessAction: vi.fn(async () => ({})),
}));

import { ProjectLockScreen } from "@/components/project/ProjectLockScreen";

/** 프로젝트별 비밀번호 화면에서 브라우저 뒤로가기 없이 이탈할 수 있어야 한다(2026-08-06) — router.back()이
 * 아니라 실제 <Link href="/">를 써서, 방문 기록이 없는 직접 URL 진입에서도 항상 동작한다. 별도 프로젝트
 * 목록 화면이 없어(홈이 곧 목록) "프로젝트 목록으로 돌아가기"는 제거하고 "홈으로 돌아가기" 하나만 둔다
 * (2026-08-06 재수정). */
describe("ProjectLockScreen — 이탈 경로(2026-08-06 추가·정리)", () => {
  it("홈으로 돌아가기 링크 1개만 항상(오류 표시 전에도) 렌더링된다", () => {
    render(<ProjectLockScreen projectId="p1" />);
    expect(screen.getAllByRole("link", { name: "홈으로 돌아가기" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "홈으로 돌아가기" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "프로젝트 목록으로 돌아가기" })).not.toBeInTheDocument();
  });

  it("비밀번호 입력 필드와 제출 버튼은 그대로 유지된다(접근 제어 로직 변경 없음)", () => {
    render(<ProjectLockScreen projectId="p1" />);
    expect(screen.getByLabelText("비밀번호")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "입장" })).toBeInTheDocument();
  });
});
