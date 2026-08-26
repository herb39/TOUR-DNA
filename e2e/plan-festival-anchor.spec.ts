import { test, expect, type Page } from "@playwright/test";

// P1-2b 로컬 QA용 프로젝트 id. 환경변수가 없으면 저장·DB 변경 없이 건너뛴다.
// Production Neon 프로젝트를 자동으로 생성하거나 migration하지 않는다.
const ANCHOR_PROJECT_ID = process.env.QA_ANCHOR_PROJECT_ID;
const ANCHOR_EVENT_NAME = process.env.QA_ANCHOR_EVENT_NAME;
const ANCHOR_EVENT_START_DATE = process.env.QA_ANCHOR_EVENT_START_DATE;
const ANCHOR_EVENT_END_DATE = process.env.QA_ANCHOR_EVENT_END_DATE;

test.skip(!ANCHOR_PROJECT_ID, "QA_ANCHOR_PROJECT_ID 환경변수가 없어 건너뜀");

async function expectAnchorFixtureFacts(page: Page) {
  if (ANCHOR_EVENT_NAME) await expect(page.locator("body")).toContainText(ANCHOR_EVENT_NAME);
  if (ANCHOR_EVENT_START_DATE && ANCHOR_EVENT_END_DATE) {
    await expect(page.locator("body")).toContainText(
      `행사일 ${ANCHOR_EVENT_START_DATE}~${ANCHOR_EVENT_END_DATE}`,
    );
  }
}

test.describe("확정 축제 Anchor 코스 고정 연결(로컬 QA 프로젝트)", () => {
  test("고정→저장/reload→다른 브라우저 확인→코스에서만 제거를 수행한다", async ({ page, browser }) => {
    await page.goto(`/projects/${ANCHOR_PROJECT_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "확정된 축제 Anchor" })).toBeVisible();
    await expectAnchorFixtureFacts(page);

    const regularDragHandles = page.getByRole("button", { name: /드래그로 순서·날짜 변경/ });
    const beforeCount = await regularDragHandles.count();
    const applyButton = page.getByRole("button", { name: "이 축제를 코스에 고정" });

    // fixture가 이전 실행에서 남아 있어도 먼저 코스에서만 제거해 이 테스트의 시작 상태를 정리한다.
    const existingCourseRemove = page.getByRole("button", { name: "코스에서만 제거", exact: true });
    if (await existingCourseRemove.count()) {
      await existingCourseRemove.first().click();
      await page.getByRole("button", { name: "저장" }).click();
      await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
      await page.reload();
    }

    await expect(applyButton).toBeVisible();
    await applyButton.click();
    await expect(page.getByText("축제 Anchor", { exact: true })).toBeVisible();
    await expect(page.getByText(/이 일정은 드래그·시간·날짜 편집에서 제외됩니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "코스에서만 제거", exact: true })).toBeVisible();
    // 기존 POI만 드래그 가능하고, Anchor에는 일반 편집 손잡이가 생기지 않는다.
    await expect(regularDragHandles).toHaveCount(beforeCount);

    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText(/현재 프로젝트 Anchor와 일치합니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "이 축제를 코스에 고정" })).toHaveCount(0);

    // 저장된 Anchor와 코스는 다른 브라우저 context에서도 동일하게 보인다.
    const otherContext = await browser.newContext({ viewport: { width: 1280, height: 2600 } });
    const otherPage = await otherContext.newPage();
    try {
      await otherPage.goto(`/projects/${ANCHOR_PROJECT_ID}/plan`);
      await expect(otherPage.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
      await expect(otherPage.getByText(/현재 프로젝트 Anchor와 일치합니다/)).toBeVisible();
      await expect(otherPage.getByRole("button", { name: "코스에서만 제거", exact: true })).toBeVisible();
    } finally {
      await otherContext.close();
    }

    // 코스에서만 제거해도 ProjectAnchor 확정은 유지된다.
    await page.getByRole("button", { name: "코스에서만 제거", exact: true }).click();
    await expect(page.getByRole("button", { name: "이 축제를 코스에 고정" })).toBeVisible();
    await expect(page.getByText("프로젝트 확정", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: "이 축제를 코스에 고정" })).toBeVisible();
    await expect(page.getByText("프로젝트 확정", { exact: true })).toBeVisible();
  });

  test("ProjectAnchor 변경으로 stale 된 코스를 다시 반영하고 저장한다", async ({ page }) => {
    test.skip(!process.env.QA_ANCHOR_STALE, "stale fixture 환경변수가 없어 건너뜀");
    await page.goto(`/projects/${ANCHOR_PROJECT_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await expect(page.getByText(/ProjectAnchor 설정이 변경되었습니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "변경한 Anchor 다시 반영" })).toBeVisible();

    await page.getByRole("button", { name: "변경한 Anchor 다시 반영" }).click();
    await expect(page.getByText("현재 프로젝트 Anchor와 일치합니다.")).toBeVisible();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText("현재 프로젝트 Anchor와 일치합니다.")).toBeVisible();
  });

  test("ProjectAnchor 삭제로 orphan 된 코스를 코스에서만 제거한다", async ({ page }) => {
    test.skip(!process.env.QA_ANCHOR_ORPHAN, "orphan fixture 환경변수가 없어 건너뜀");
    await page.goto(`/projects/${ANCHOR_PROJECT_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await expect(page.getByText(/프로젝트 Anchor가 삭제되었거나 조회되지 않습니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "코스에서만 제거", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "코스에서만 제거", exact: true }).click();
    await expect(page.getByText("현재 프로젝트에 확정된 축제 Anchor가 없습니다.")).toBeVisible();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByText("현재 프로젝트에 확정된 축제 Anchor가 없습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "코스에서만 제거", exact: true })).toHaveCount(0);
  });
});
