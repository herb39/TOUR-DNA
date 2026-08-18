import { test, expect, type Page } from "@playwright/test";

// 로컬 QA fixture만 사용한다. 환경변수가 없으면 실제 DB에 연결하거나 프로젝트를 만들지 않고 건너뛴다.
const DAEJEON_ID = process.env.QA_ANCHOR_PROJECT_ID;
const SEJONG_ID = process.env.QA_SEJONG_ANCHOR_PROJECT_ID;
const JECHEON_ID = process.env.QA_JECHEON_EMPTY_ANCHOR_PROJECT_ID;

test.skip(!DAEJEON_ID || !SEJONG_ID, "QA_ANCHOR_PROJECT_ID/QA_SEJONG_ANCHOR_PROJECT_ID 환경변수가 없어 건너뜀");
test.use({ viewport: { width: 1280, height: 2600 } });

async function expectAnchorPanel(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/plan`);
  await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
  const panel = page.getByRole("region", { name: "축제 Anchor 연계 후보" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Anchor 시각은 고정합니다.")).toBeVisible();
  return panel;
}

test.describe("축제 Anchor 전후 후보 연결(P1-2c) 실제 Chromium QA", () => {
  test("대전: 행사 전 후보를 추가해도 Anchor 시각과 일반 후보 풀이 유지된다", async ({ page }) => {
    const panel = await expectAnchorPanel(page, DAEJEON_ID!);
    await expect(panel.getByText("행사 전 연결", { exact: true })).toBeVisible();
    const addButton = panel.getByRole("button", { name: /행사 전 후보를 일정에 추가/ }).first();
    await expect(addButton).toBeVisible();
    const addLabel = (await addButton.getAttribute("aria-label"))!;
    const candidateName = addLabel.replace(/ 행사 전 후보를 일정에 추가$/, "");
    await addButton.click();
    await expect(page.getByText(candidateName, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("15:00~17:00", { exact: true }).last()).toBeVisible();
    await expect(panel.getByRole("button", { name: addLabel })).toHaveCount(0);
  });

  test("세종: 행사 전·식사·행사 후·숙박 역할 후보와 거리 근거가 표시된다", async ({ page }) => {
    const panel = await expectAnchorPanel(page, SEJONG_ID!);
    for (const heading of ["행사 전 연결", "식사 연결", "행사 후 연결", "숙박 연결"]) {
      await expect(panel.getByText(heading, { exact: true })).toBeVisible();
    }
    await expect(panel.getByText(/직선거리/).first()).toBeVisible();
    await expect(panel.getByText(/운영시간 확인 필요|운영시간:/).first()).toBeVisible();
  });

  test("제천 no-candidate fixture는 빈 상태만 보여주고 페이지를 막지 않는다", async ({ page }) => {
    test.skip(!JECHEON_ID, "QA_JECHEON_EMPTY_ANCHOR_PROJECT_ID가 없어 건너뜀");
    const panel = await expectAnchorPanel(page, JECHEON_ID!);
    await expect(panel.getByText(/표시할 새 연계 후보가 없습니다|현재 지역 데이터와 Anchor 위치를 기준으로/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
  });
});
