import { test, expect, type Page, type Locator } from "@playwright/test";

// 실행안 편집 중(Drag & Drop 재정렬/날짜 이동/추천 후보 추가/삭제) 지도가 즉시 반영되는지, 그리고
// Kakao Mobility 실제 경로 조회가 편집마다 반복 호출되지 않는지를 실제 Chromium + 실제 카카오맵 SDK로
// 검증한다(Phase B, 2026-08-16 — 저장 전 지도 실시간 갱신). QA 프로젝트 id는 로컬 전용 스크립트로
// 미리 만들어 환경변수로 받는다(Production Neon 무관).
const GYEONGJU_ID = process.env.QA_GYEONGJU_ID;
const CHEONGJU_ID = process.env.QA_CHEONGJU_ID;
const DAEJEON_ANCHOR_ID = process.env.QA_ANCHOR_PROJECT_ID;

test.skip(!GYEONGJU_ID || !CHEONGJU_ID || !DAEJEON_ANCHOR_ID, "대표 QA 프로젝트 환경변수가 없어 건너뜀");

test.use({ viewport: { width: 1280, height: 2600 } });

async function dragHandle(page: Page, handle: Locator, target: Locator, targetOffsetY = 0) {
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag source/target bounding box를 구할 수 없습니다.");

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2 + targetOffsetY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 12, { steps: 3 });
  await page.mouse.move(startX + (endX - startX) / 2, startY + (endY - startY) / 2, { steps: 8 });
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

function dayContainer(page: Page, dayIndex: number): Locator {
  return page
    .locator("p.text-xs.font-semibold.text-slate-500", { hasText: new RegExp(`^${dayIndex}일차$`) })
    .locator("xpath=..");
}

function scheduleHandle(page: Page, poiName: string): Locator {
  return page.getByRole("button", { name: `${poiName} 드래그로 순서·날짜 변경` });
}

function candidateHandle(page: Page, poiName: string): Locator {
  return page.getByRole("button", { name: `${poiName} 드래그로 일정에 놓기` });
}

test.describe("코스 편집 중 지도 실시간 갱신 — 경주(로컬 QA 프로젝트)", () => {
  test("Drag(재정렬/날짜 이동/후보 추가/삭제) 중에는 서버 요청이 추가로 발생하지 않고, 저장 시에만 1회 더 발생한다", async ({
    page,
  }) => {
    const planRequests: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes(`/projects/${GYEONGJU_ID}/plan`)) {
        planRequests.push(req.url());
      }
    });

    await page.goto(`/projects/${GYEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    // 마운트 시 지도가 실제 경로(Kakao Mobility)를 조회하는 서버 액션 1건이 발생할 때까지 기다린다.
    await expect.poll(() => planRequests.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    const requestsAfterMount = planRequests.length;

    const day1 = dayContainer(page, 1);
    const beforeNames = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );
    expect(beforeNames.length).toBeGreaterThanOrEqual(3);

    // 같은 날짜 reorder
    await dragHandle(page, scheduleHandle(page, beforeNames[2]), scheduleHandle(page, beforeNames[0]), -4);
    await page.waitForTimeout(300);

    // 추천 후보 → 일정 drag 추가
    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const candidateNamesBefore = (await candidateSection.locator("ul > li p.font-medium").allTextContents()).map((t) => t.trim());
    const firstCandidateCard = candidateSection.locator("ul > li").first();
    const candidateName = (await firstCandidateCard.locator("p.font-medium").first().textContent())?.trim();
    if (candidateName) {
      await expect(firstCandidateCard.getByText(/현재 코스 기준 직선거리 약/)).toBeVisible();
      await dragHandle(page, candidateHandle(page, candidateName), scheduleHandle(page, beforeNames[0]));
      await page.waitForTimeout(300);
    }

    // 일정에서 삭제
    if (candidateName) {
      await page.getByRole("button", { name: `${candidateName} 삭제` }).click();
      await page.waitForTimeout(300);
    }

    const candidateNamesAfter = (await candidateSection.locator("ul > li p.font-medium").allTextContents()).map((t) => t.trim());
    expect(candidateNamesAfter).toEqual(candidateNamesBefore);

    // 지도는 여전히 정상 렌더링돼 있고(오류로 사라지지 않음), 이 시점까지 추가 서버 요청은 없어야 한다.
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    expect(planRequests.length).toBe(requestsAfterMount);

    // 저장하면 그때 처음으로 요청이 1건 추가된다(savePlanAction).
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    expect(planRequests.length).toBe(requestsAfterMount + 1);
  });

  test("같은 날짜 reorder 후에도 지도가 사라지거나 지도 관련 오류를 내지 않는다", async ({ page }) => {
    // dnd-kit이 SSR/hydration 사이에 내부 id(DndDescribedBy-N)를 다르게 생성해 발생하는 hydration
    // mismatch 경고는 이번 지도 작업과 무관한 기존(Drag & Drop 도입 시점) 이슈라 필터링한다 — 여기서는
    // 지도(Kakao SDK/좌표/렌더링) 관련 오류만 없는지 확인한다.
    const mapRelatedErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /kakao|course-map|지도/i.test(msg.text())) {
        mapRelatedErrors.push(msg.text());
      }
    });

    await page.goto(`/projects/${GYEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();

    const day1 = dayContainer(page, 1);
    const beforeNames = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );
    await dragHandle(page, scheduleHandle(page, beforeNames[2]), scheduleHandle(page, beforeNames[0]), -4);

    await expect(page.getByTestId("course-map-container")).toBeVisible();
    expect(mapRelatedErrors).toEqual([]);
  });

  test("날짜 간 이동 후에도 지도가 정상 렌더링된다(day별 표시 변경)", async ({ page }) => {
    await page.goto(`/projects/${GYEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();

    const day1 = dayContainer(page, 1);
    const day2 = dayContainer(page, 2);
    const day1Names = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );
    const day2Names = (await day2.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );

    await dragHandle(page, scheduleHandle(page, day1Names[1]), scheduleHandle(page, day2Names[0]));
    await expect(page.getByTestId("course-map-container")).toBeVisible();
  });

  test("저장 후 새로고침하면 지도/일정이 그대로 일치한다", async ({ page }) => {
    await page.goto(`/projects/${GYEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();

    const day1 = dayContainer(page, 1);
    const beforeNames = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );
    await dragHandle(page, scheduleHandle(page, beforeNames[2]), scheduleHandle(page, beforeNames[0]), -4);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    const day1After = dayContainer(page, 1);
    const afterNames = (await day1After.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map(
      (t) => t.trim(),
    );
    expect(afterNames[0]).toBe(beforeNames[2]);
  });
});

test.describe("코스 편집 중 지도 실시간 갱신 — 청주(로컬 QA 프로젝트)", () => {
  test("추천 후보 drag 추가 → 지도 유지 → 삭제 → 지도 유지 → 후보 재등장", async ({ page }) => {
    await page.goto(`/projects/${CHEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();

    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const firstCandidateCard = candidateSection.locator("ul > li").first();
    const candidateName = (await firstCandidateCard.locator("p.font-medium").first().textContent())?.trim();
    expect(candidateName).toBeTruthy();

    const day1 = dayContainer(page, 1);
    const day1FirstItemName = (await day1.locator("ul > li span.font-medium.text-slate-800").first().textContent())?.trim();

    await dragHandle(page, candidateHandle(page, candidateName!), scheduleHandle(page, day1FirstItemName!));
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    await expect(page.getByLabel(`${candidateName} 시간`)).toBeVisible();

    await page.getByRole("button", { name: `${candidateName} 삭제` }).click();
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    await expect(candidateHandle(page, candidateName!)).toBeVisible();
  });

  test("추천 후보의 유형별 기본 체류시간과 사용자 수정값은 날짜 이동·저장·재로드 후에도 유지된다", async ({ page }) => {
    await page.goto(`/projects/${CHEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("현재 저장된 내용과 같습니다.", { exact: true })).toBeVisible();

    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const firstCandidateCard = candidateSection.locator("ul > li").first();
    const candidateName = (await firstCandidateCard.locator("p.font-medium").first().textContent())?.trim();
    expect(candidateName).toBeTruthy();

    await candidateSection.getByRole("button", { name: new RegExp(`${candidateName}.*1일차에 추가`) }).click();
    await expect(page.getByText("저장하지 않은 변경사항이 있습니다.", { exact: true })).toBeVisible();
    const stayInput = page.getByLabel(`${candidateName} 체류시간(분)`);
    await expect(stayInput).toHaveValue("120");

    await stayInput.fill("130");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    await expect(page.getByText("현재 저장된 내용과 같습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(`${candidateName} 체류시간(분)`)).toHaveValue("130");

    await page.getByLabel(`${candidateName} 다른 날짜로 이동`).selectOption("2");
    await expect(page.getByText("저장하지 않은 변경사항이 있습니다.", { exact: true })).toBeVisible();
    await expect(page.getByLabel(`${candidateName} 체류시간(분)`)).toHaveValue("130");

    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    await expect(page.getByText("현재 저장된 내용과 같습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(`${candidateName} 체류시간(분)`)).toHaveValue("130");

    await page.getByRole("button", { name: `${candidateName} 삭제` }).click();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });
  });

  test("375px 모바일 — 편집 후에도 가로 스크롤이 생기지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto(`/projects/${CHEONGJU_ID}/plan`);
    await expect(page.getByTestId("course-map-container")).toBeVisible();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("현재 저장된 내용과 같습니다.", { exact: true })).toBeVisible();

    const day1 = dayContainer(page, 1);
    const beforeNames = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );
    if (beforeNames.length >= 2) {
      await page.getByRole("button", { name: `${beforeNames[0]} 아래로 이동` }).click();
      await expect(page.getByText("저장하지 않은 변경사항이 있습니다.", { exact: true })).toBeVisible();
    }

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBe(overflow.clientWidth);
  });
});

test.describe("코스 편집 중 일반 후보 재정렬 — 대전 Anchor(로컬 QA 프로젝트)", () => {
  test("일반 후보는 현재 코스 변경에 반응하고 Anchor 연계 후보와 독립적으로 유지된다", async ({ page }) => {
    await page.goto(`/projects/${DAEJEON_ANCHOR_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();

    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const anchorSection = page.getByRole("region", { name: "축제 Anchor 연계 후보" });
    await expect(anchorSection).toBeVisible();
    const beforeNames = (await candidateSection.locator("ul > li p.font-medium").allTextContents()).map((t) => t.trim());
    expect(beforeNames.length).toBeGreaterThan(0);

    const candidateName = beforeNames[0];
    await expect(candidateSection.locator("ul > li").first().getByText(/현재 코스 기준 직선거리 약/)).toBeVisible();
    await candidateSection.getByRole("button", { name: new RegExp(`${candidateName}.*1일차에 추가`) }).click();
    await expect(page.getByLabel(`${candidateName} 시간`)).toBeVisible();
    await expect(anchorSection).toBeVisible();

    await page.getByRole("button", { name: `${candidateName} 삭제` }).click();
    await expect(candidateSection.getByRole("button", { name: new RegExp(`${candidateName}.*1일차에 추가`) })).toBeVisible();
    const afterNames = (await candidateSection.locator("ul > li p.font-medium").allTextContents()).map((t) => t.trim());
    expect(afterNames).toEqual(beforeNames);
  });
});
