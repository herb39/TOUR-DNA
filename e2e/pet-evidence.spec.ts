import { test, expect } from "@playwright/test";

const PET_PROJECT_ID = process.env.QA_PET_PROJECT_ID;

test.skip(!PET_PROJECT_ID, "QA_PET_PROJECT_ID 환경변수가 없어 건너뜀");

test.describe("반려동물 조건 advisory — 로컬 QA 프로젝트", () => {
  test("공식 PET 근거와 미확인 상태를 함께 표시한다", async ({ page }) => {
    await page.goto(`/projects/${PET_PROJECT_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();

    const evidence = page
      .getByTestId("pet-evidence")
      .filter({ hasText: /공식 동반 정보 확인|조건부 동반/ })
      .first();
    await expect(evidence).toBeVisible();
    const summary = evidence.locator("summary");
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await summary.click();
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    await expect(evidence.getByText(/출처: 한국관광공사 반려동물 동반여행 정보/)).toBeVisible();

    await expect(page.getByText("동반 정보 미확인").first()).toBeVisible();
  });
});
