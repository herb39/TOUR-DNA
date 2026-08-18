import { test, expect } from "@playwright/test";

// P1-2b 수동 QA용 로컬 프로젝트 id. 환경변수가 없으면 저장·DB 변경 없이 건너뛴다.
// Production Neon 프로젝트를 자동으로 생성하거나 migration하지 않는다.
const ANCHOR_PROJECT_ID = process.env.QA_ANCHOR_PROJECT_ID;

test.skip(!ANCHOR_PROJECT_ID, "QA_ANCHOR_PROJECT_ID 환경변수가 없어 건너뜀");

test.describe("확정 축제 Anchor 코스 고정 연결(로컬 QA 프로젝트)", () => {
  test("명시적 고정 전후에 기존 POI를 보존하고 Anchor를 고정 일정으로 표시한다", async ({ page }) => {
    await page.goto(`/projects/${ANCHOR_PROJECT_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "확정된 축제 Anchor" })).toBeVisible();

    const regularDragHandles = page.getByRole("button", { name: /드래그로 순서·날짜 변경/ });
    const beforeCount = await regularDragHandles.count();
    const applyButton = page.getByRole("button", { name: "이 축제를 코스에 고정" });

    if (await applyButton.isVisible()) {
      await applyButton.click();
      await expect(page.getByText("축제 Anchor", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /코스에서만 제거/ }).first()).toBeVisible();
      await expect(regularDragHandles).toHaveCount(beforeCount);
    } else {
      await expect(page.getByText(/코스에 고정된 Anchor:/)).toBeVisible();
    }
  });
});
