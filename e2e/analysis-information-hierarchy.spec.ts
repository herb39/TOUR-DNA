import { test, expect, type Locator, type Page } from "@playwright/test";

const GYEONGJU_ID = process.env.QA_GYEONGJU_ID;
const CHEONGJU_ID = process.env.QA_CHEONGJU_ID;

test.skip(!GYEONGJU_ID || !CHEONGJU_ID, "대표 분석 QA 프로젝트 환경변수가 없어 건너뜀");

async function y(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("분석 화면 측정 대상의 위치를 구할 수 없습니다.");
  return box.y;
}

async function expectAnalysisPriority(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/analysis`);
  await expect(page.getByRole("heading", { name: "관광 DNA 분석 · 전략 비교" })).toBeVisible();
  await expect(page.getByText("데이터 최신성", { exact: true })).toBeVisible();
  await expect(page.getByText("핵심 진단", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "관광 DNA 5축" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "전략 3안 비교" })).toBeVisible();

  for (const label of ["강점 ·", "개선 ·", "DNA 상대지수", "추천 전략 3안:"]) {
    await expect(page.getByText(new RegExp(label)).first()).toBeVisible();
  }
  for (const strategyName of ["문화·역사 체험형", "자연·웰니스형", "야간·체류 확대형", "청년 로컬·감성 콘텐츠형", "로컬미식·시장 연계형"]) {
    const candidate = page.getByText(strategyName, { exact: true }).first();
    if (await candidate.count()) await expect(candidate).toBeVisible();
  }

  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(await y(page, page.getByText("핵심 진단", { exact: true }))).toBeLessThan(viewportHeight);
  expect(await y(page, page.getByRole("heading", { name: "관광 DNA 5축" }))).toBeLessThan(viewportHeight);
  expect(await y(page, page.getByRole("heading", { name: "전략 3안 비교" }))).toBeLessThan(1400);

  const details = page.locator("details");
  expect(await details.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLDetailsElement).open).length)).toBe(0);

  const firstEvidence = page.locator("details", { hasText: "근거 보기" }).first();
  await firstEvidence.locator("summary").click();
  await expect(firstEvidence.getByRole("columnheader", { name: "원천 지표 정규화값" })).toBeVisible();
  await expect(firstEvidence.getByText("DNA 상대지수").first()).toBeVisible();
}

test.describe("분석·전략 화면 첫 진입 정보 계층", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("경주: 강점·약점·최신성·DNA·전략 3안을 빠르게 확인한다", async ({ page }) => {
    await expectAnalysisPriority(page, GYEONGJU_ID!);
  });

  test("청주: 다른 DNA 결과에서도 동일한 핵심 순서를 유지한다", async ({ page }) => {
    await expectAnalysisPriority(page, CHEONGJU_ID!);
  });
});

test.describe("분석·전략 화면 모바일·인쇄 회귀", () => {
  test("390px에서 숫자 label·전략 CTA가 깨지지 않고 가로 overflow가 없다", async ({ page }) => {
    test.skip(!GYEONGJU_ID, "경주 QA 프로젝트 환경변수가 없어 건너뜀");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${GYEONGJU_ID}/analysis`);
    await expect(page.getByText("DNA 상대지수", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "전략 3안 비교" })).toBeVisible();
    await expect(page.getByRole("link", { name: "전략 3안 확인하기 →" })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("인쇄 화면에 DNA·전략 내용이 남아 있다", async ({ page }) => {
    test.skip(!GYEONGJU_ID, "경주 QA 프로젝트 환경변수가 없어 건너뜀");
    await page.goto(`/projects/${GYEONGJU_ID}/print`);
    await expect(page.getByText("핵심 관광 지표")).toBeVisible();
    await expect(page.getByText("전략 3안 비교")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: /인쇄/ })).toBeHidden();
  });
});
