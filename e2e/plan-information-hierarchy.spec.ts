import { test, expect, type Page } from "@playwright/test";

const GYEONGJU_ID = process.env.QA_GYEONGJU_ID;
const DAEJEON_ANCHOR_ID = process.env.QA_ANCHOR_PROJECT_ID;

test.skip(!GYEONGJU_ID || !DAEJEON_ANCHOR_ID, "대표 QA 프로젝트 환경변수가 없어 건너뜀");

async function box(page: Page, locator: ReturnType<Page["locator"]>) {
  const result = await locator.boundingBox();
  if (!result) throw new Error("첫 화면 측정 대상의 위치를 구할 수 없습니다.");
  return result;
}

async function expectFirstViewport(
  page: Page,
  projectId: string,
  expectAnchorPanel: boolean,
  requireSaveInViewport = true,
) {
  await page.goto(`/projects/${projectId}/plan`);
  const flow = page.getByTestId("course-studio-flow");
  const course = page.getByRole("heading", { name: "일자·시간대별 코스" });
  const map = page.getByTestId("course-map-container");
  const save = page.getByRole("region", { name: "실행안 저장" });
  await expect(flow).toBeVisible();
  await expect(course).toBeVisible();
  await expect(map).toBeVisible();
  await expect(save).toBeVisible();
  await expect(save.getByRole("button", { name: "저장" })).toBeVisible();

  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const [flowBox, courseBox, mapBox, saveBox] = await Promise.all([
    box(page, flow),
    box(page, course),
    box(page, map),
    box(page, save),
  ]);
  expect(flowBox.y).toBeLessThan(viewportHeight);
  expect(courseBox.y).toBeLessThan(viewportHeight);
  expect(mapBox.y).toBeLessThan(viewportHeight);
  if (requireSaveInViewport) expect(saveBox.y).toBeLessThan(viewportHeight);

  const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
  await expect(candidateSection.getByRole("button", { name: "후보 목록 열기" })).toBeVisible();
  await expect(candidateSection.locator("details")).not.toHaveAttribute("open");

  const preflightBox = await box(page, page.getByRole("heading", { name: "사업 사전검증 리포트" }));
  expect(preflightBox.y).toBeGreaterThan(courseBox.y);

  const anchorSection = page.getByRole("region", { name: "축제 Anchor 연계 후보" });
  if (expectAnchorPanel) {
    await expect(anchorSection).toBeVisible();
    await expect(anchorSection.locator("details")).not.toHaveAttribute("open");
  }
}

test.describe("Course Studio 첫 진입 정보 계층 — 대표 프로젝트", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("일반 프로젝트 desktop에서 전략·코스·지도·저장을 첫 화면에서 발견한다", async ({ page }) => {
    await expectFirstViewport(page, GYEONGJU_ID!, false);
  });

  test("Anchor 프로젝트 desktop에서 Anchor 후보는 접고 핵심 편집 흐름을 우선한다", async ({ page }) => {
    await expectFirstViewport(page, DAEJEON_ANCHOR_ID!, true);
  });
});

test.describe("Course Studio 첫 진입 정보 계층 — 390px 모바일", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("일반 프로젝트에서 흐름·코스·지도와 저장 조작을 유지하고 가로 overflow가 없다", async ({ page }) => {
    await expectFirstViewport(page, GYEONGJU_ID!, false, false);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});
