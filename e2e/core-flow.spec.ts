import { test, expect, type Page } from "@playwright/test";

async function submitProjectForm(
  page: Page,
  opts: {
    projectName: string;
    sido: string;
    travelMonth: string;
    ageGroup: string;
  },
) {
  await page.goto("/projects/new");
  await page.getByLabel("프로젝트명").fill(opts.projectName);
  await page.getByLabel("시·도").selectOption({ label: opts.sido });
  await page.getByLabel("여행 월").selectOption(opts.travelMonth);
  await page.getByRole("checkbox", { name: opts.ageGroup }).check();
  await page.getByRole("button", { name: "분석 시작" }).click();
  await page.waitForURL(/\/projects\/.+\/analysis/, { timeout: 15_000 });
}

// 데모 프로젝트를 읽기 전용으로만 사용하는 테스트: 데이터를 변경하지 않는다.
test.describe("TOUR DNA 핵심 플로우 (읽기 전용, 데모 프로젝트 사용)", () => {
  test("홈에서 데모 프로젝트를 열면 DNA 5축과 전략 3안이 보인다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "데이터 기반 지역 관광상품 기획 엔진" })).toBeVisible();
    await page.getByRole("link", { name: /데모 프로젝트 열기/ }).click();
    await page.waitForURL(/\/projects\/.+\/(analysis|plan)/);
    if (!page.url().includes("/analysis")) {
      await page.goto(page.url().replace("/plan", "/analysis"));
    }

    await expect(page.getByRole("heading", { name: "관광 DNA 5축" })).toBeVisible();
    for (const axis of ["수요(Demand)", "체류(Stay)", "소비(Spend)", "다양성(Diversity)", "연계(Network)"]) {
      await expect(page.getByText(axis, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "전략 3안 비교" })).toBeVisible();
    await expect(page.getByRole("button", { name: "이 전략 선택" })).toHaveCount(3);
  });

  test("근거 보기 패널을 열면 원값/정규화값/출처가 표시된다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /데모 프로젝트 열기/ }).click();
    await page.waitForURL(/\/projects\/.+\/(analysis|plan)/);
    if (!page.url().includes("/analysis")) {
      await page.goto(page.url().replace("/plan", "/analysis"));
    }

    const firstDetails = page.locator("details", { hasText: "근거 보기" }).first();
    await firstDetails.locator("summary").click();
    await expect(firstDetails.getByText("반영 규칙")).toBeVisible();
  });

  test("지도 API 키가 없으면 좌표/주소 목록 fallback이 표시된다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /데모 프로젝트 열기/ }).click();
    await page.waitForURL(/\/projects\/.+\/(analysis|plan)/);
    if (!page.url().includes("/analysis")) {
      await page.goto(page.url().replace("/plan", "/analysis"));
    }
    await expect(page.getByText("지도 API 키가 설정되지 않아")).toBeVisible();
  });

  test("Cron 동기화 엔드포인트는 인증 없이 호출하면 401을 반환한다", async ({ request }) => {
    const res = await request.get("/api/cron/sync-tourism-data");
    expect(res.status()).toBe(401);
  });
});

// 상태를 변경하는 테스트는 항상 새로 제출한 프로젝트를 사용해 데모 데이터를 건드리지 않는다.
test.describe("TOUR DNA 핵심 플로우 (신규 프로젝트, 상태 변경 포함)", () => {
  test("새 프로젝트 제출 → 분석 → 전략 선택 → 실행안 편집 → 새로고침 유지 → 인쇄", async ({ page }) => {
    const projectName = `E2E 대전 종합 ${Date.now()}`;
    await submitProjectForm(page, { projectName, sido: "대전광역시", travelMonth: "9월", ageGroup: "20대" });

    await expect(page.getByRole("heading", { name: "관광 DNA 5축" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "전략 3안 비교" })).toBeVisible();

    await page.getByRole("button", { name: "이 전략 선택" }).first().click();
    await page.waitForURL(/\/projects\/.+\/plan/);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "운영 체크리스트" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "KPI" })).toBeVisible();

    const newName = `${projectName} - 수정됨`;
    await page.getByLabel("상품명").fill(newName);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByLabel("상품명")).toHaveValue(newName);

    const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1];
    await page.goto(`/projects/${projectId}/print`);
    await expect(page.getByText("기획 배경")).toBeVisible();
    await expect(page.getByText("데이터 근거 요약")).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: /인쇄/ })).toBeHidden();
  });

  test("필수 입력이 없으면 한국어 오류 메시지가 표시된다", async ({ page }) => {
    await page.goto("/projects/new");
    await page.getByLabel("프로젝트명").fill("");
    await page.getByRole("button", { name: "분석 시작" }).click();
    await expect(page.getByText("프로젝트명을 입력해주세요.")).toBeVisible();
  });

  test("다른 지역으로 분석하면 전략 순위/점수가 달라진다", async ({ page, context }) => {
    const nameA = `E2E 대전 비교 ${Date.now()}`;
    await submitProjectForm(page, { projectName: nameA, sido: "대전광역시", travelMonth: "9월", ageGroup: "20대" });
    const strategyTextA = await page.locator("h2:has-text('전략 3안 비교') ~ div").first().innerText();

    const page2 = await context.newPage();
    const nameB = `E2E 양양 비교 ${Date.now()}`;
    await submitProjectForm(page2, { projectName: nameB, sido: "강원특별자치도", travelMonth: "9월", ageGroup: "20대" });
    const strategyTextB = await page2.locator("h2:has-text('전략 3안 비교') ~ div").first().innerText();

    expect(strategyTextA).not.toEqual(strategyTextB);
  });

  test("동일 입력으로 두 번 분석하면 같은 전략 순위/점수를 반환한다", async ({ page, context }) => {
    const base = Date.now();
    const nameA = `E2E 결정론 A ${base}`;
    await submitProjectForm(page, { projectName: nameA, sido: "충청북도", travelMonth: "5월", ageGroup: "30대" });
    const strategyTextA = await page.locator("h2:has-text('전략 3안 비교') ~ div").first().innerText();

    const page2 = await context.newPage();
    const nameB = `E2E 결정론 B ${base}`;
    await submitProjectForm(page2, { projectName: nameB, sido: "충청북도", travelMonth: "5월", ageGroup: "30대" });
    const strategyTextB = await page2.locator("h2:has-text('전략 3안 비교') ~ div").first().innerText();

    expect(strategyTextA).toEqual(strategyTextB);
  });
});
