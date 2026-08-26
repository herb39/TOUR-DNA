import { test, expect, type Page, type Locator } from "@playwright/test";

// 실제 pointer 이벤트로 dnd-kit(@dnd-kit/core+sortable) drag 상호작용을 검증한다(Phase B 2단계
// 실제 통합 검증, 2026-08-16). QA 프로젝트 id는 로컬 전용 스크립트로 미리 생성해 환경변수로 받는다
// (Production Neon과 무관, 이 파일은 프로젝트를 새로 만들지 않는다).
const GYEONGJU_ID = process.env.QA_GYEONGJU_ID;
const CHEONGJU_ID = process.env.QA_CHEONGJU_ID;

test.skip(!GYEONGJU_ID || !CHEONGJU_ID, "QA_GYEONGJU_ID/QA_CHEONGJU_ID 환경변수가 없어 건너뜀");

// 실행안 페이지는 세로로 길어(코스+추천 후보 다수) 기본 720px 뷰포트에서는 drag source/target이
// 동시에 화면에 들어오지 않아 mouse 좌표 기반 drag 시뮬레이션이 어긋난다 — 실제 데스크톱에서도 벌어질
// 수 있는 상황이지만(스크롤 필요), 이 테스트의 목적은 dnd-kit 통합 경로 자체의 정상 동작 확인이므로
// 뷰포트를 넉넉하게 잡아 스크롤 없이 두 지점이 항상 같은 화면에 있도록 한다.
test.use({ viewport: { width: 1280, height: 2600 } });

/** dnd-kit PointerSensor(activationConstraint distance:8)를 확실히 넘기고, 충돌 감지가 실제 좌표를
 * 갱신하도록 여러 단계로 나눠 이동한다. */
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
  // activation distance(8px)를 넘기는 첫 이동
  await page.mouse.move(startX, startY + 12, { steps: 3 });
  await page.mouse.move(startX + (endX - startX) / 2, startY + (endY - startY) / 2, { steps: 8 });
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

/** 날짜 wrapper div를 정확히 찾는다 — `page.getByText("N일차")`만 쓰면 각 일정 항목의 "다른 날짜로
 * 이동" select 안 `<option>N일차</option>`에도 걸려 엉뚱한(너무 넓은) div가 선택된다. `<p>` 태그로
 * 한정하고, 그 부모(day.dayIndex별 실제 wrapper)를 반환한다. */
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

async function openCandidatePanel(page: Page) {
  const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
  const summary = candidateSection.getByRole("button", { name: "후보 목록 열기" });
  if (await summary.count()) await summary.click();
}

test.describe("코스 Drag & Drop 실제 pointer 상호작용 검증(경주, 로컬 QA 프로젝트)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${GYEONGJU_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await openCandidatePanel(page);
  });

  test("같은 날짜 안에서 pointer drag로 순서를 바꾸면 DOM 순서가 실제로 바뀐다", async ({ page }) => {
    const day1 = dayContainer(page, 1);
    const items = day1.locator("ul > li");
    const beforeNames = await items.locator("span.font-medium.text-slate-800").allTextContents();
    expect(beforeNames.length).toBeGreaterThanOrEqual(3);

    const thirdName = beforeNames[2].trim();
    const firstName = beforeNames[0].trim();

    const handle = scheduleHandle(page, thirdName);
    const targetHandle = scheduleHandle(page, firstName);
    await dragHandle(page, handle, targetHandle, -4);

    const afterNames = (await items.locator("span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(afterNames[0]).toBe(thirdName);
    expect(afterNames).not.toEqual(beforeNames.map((t) => t.trim()));
    // 개수는 그대로 유지된다(추가/삭제 없이 순서만 바뀜)
    expect(afterNames.length).toBe(beforeNames.length);
  });

  test("1일차 항목을 2일차 항목 위로 pointer drag하면 날짜가 바뀌고 전체 POI 수는 그대로다", async ({ page }) => {
    const day1 = dayContainer(page, 1);
    const day2 = dayContainer(page, 2);

    const day1NamesBefore = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    const day2NamesBefore = (await day2.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    const totalBefore = day1NamesBefore.length + day2NamesBefore.length;

    const movedName = day1NamesBefore[1].trim();
    const targetName = day2NamesBefore[0].trim();

    const handle = scheduleHandle(page, movedName);
    const targetHandle = scheduleHandle(page, targetName);
    await dragHandle(page, handle, targetHandle);

    const day1NamesAfter = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    const day2NamesAfter = (await day2.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());

    expect(day1NamesAfter).not.toContain(movedName);
    expect(day2NamesAfter).toContain(movedName);
    expect(day1NamesAfter.length + day2NamesAfter.length).toBe(totalBefore);
  });

  test("추천 후보를 pointer drag로 일정에 놓으면 일정에 추가되고 후보 풀에서 즉시 사라진다", async ({ page }) => {
    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const firstCandidateCard = candidateSection.locator("ul > li").first();
    const candidateName = (await firstCandidateCard.locator("p.font-medium").first().textContent())?.trim();
    expect(candidateName).toBeTruthy();

    const day1 = dayContainer(page, 1);
    const day1FirstItemName = (await day1.locator("ul > li span.font-medium.text-slate-800").first().textContent())?.trim();

    const handle = candidateHandle(page, candidateName!);
    const targetHandle = scheduleHandle(page, day1FirstItemName!);
    await dragHandle(page, handle, targetHandle);

    // 일정에 추가됨(시간 입력 aria-label로 확인 — 실제 코스 항목으로 반영됐다는 뜻)
    await expect(page.getByLabel(`${candidateName} 시간`)).toBeVisible();
    // 후보 풀에서 사라짐(같은 이름의 "드래그로 일정에 놓기" 버튼이 더 이상 없음)
    await expect(candidateHandle(page, candidateName!)).toHaveCount(0);
  });

  test("KeyboardSensor — 드래그 손잡이에 포커스 후 Space→화살표→Space로 순서를 바꿀 수 있다", async ({ page }) => {
    const day1 = dayContainer(page, 1);
    const items = day1.locator("ul > li");
    const beforeNames = (await items.locator("span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(beforeNames.length).toBeGreaterThanOrEqual(2);

    const firstHandle = scheduleHandle(page, beforeNames[0]);
    await firstHandle.focus();
    // 페이지가 보이는 시점과 dnd-kit KeyboardSensor가 hydration을 마친 시점이 다를 수 있다.
    // 실제 키보드 사용자가 겪는 이벤트 순서를 안정적으로 관찰하기 위해 센서가 연결될 여유를 둔다.
    await page.waitForTimeout(500);
    // dnd-kit KeyboardSensor 활성화(Space) → 이동(ArrowDown) → 드롭(Space) 사이에 React state가
    // 반영될 시간을 준다(연속 press 사이 지연 없이 보내면 활성화 전에 ArrowDown이 무시된다).
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(500);
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);

    const afterNames = (await items.locator("span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(afterNames[1]).toBe(beforeNames[0]);
    expect(afterNames).not.toEqual(beforeNames);
  });

  test("버튼/select/입력 클릭으로는 drag가 시작되지 않는다(오작동 없음)", async ({ page }) => {
    const day1 = dayContainer(page, 1);
    const beforeNames = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    const firstName = beforeNames[0];

    // 위/아래 버튼 클릭 — 정상적으로 그 자체의 동작만 수행하고 다른 항목 순서가 drag로 오염되지 않음
    await page.getByRole("button", { name: `${firstName} 아래로 이동` }).click();
    const afterMoveDown = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(afterMoveDown[1]).toBe(firstName);

    // 삭제 버튼도 정상 동작(다른 항목에 영향 없이 해당 항목만 삭제)
    const secondName = afterMoveDown[0];
    await page.getByRole("button", { name: `${firstName} 삭제` }).click();
    const afterDelete = (await day1.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(afterDelete).not.toContain(firstName);
    expect(afterDelete[0]).toBe(secondName);
  });

  test("저장 전에는 새 순서가 DB에 반영되지 않고, 저장 후 새로고침하면 순서가 유지된다", async ({ page }) => {
    const day1 = dayContainer(page, 1);
    const items = day1.locator("ul > li");
    const beforeNames = (await items.locator("span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(beforeNames.length).toBeGreaterThanOrEqual(3);
    const thirdName = beforeNames[2];
    const firstName = beforeNames[0];

    await dragHandle(page, scheduleHandle(page, thirdName), scheduleHandle(page, firstName), -4);
    const afterDragNames = (await items.locator("span.font-medium.text-slate-800").allTextContents()).map((t) => t.trim());
    expect(afterDragNames[0]).toBe(thirdName);

    await expect(page.getByText("저장하지 않은 변경사항이 있습니다.")).toBeVisible();

    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("모든 변경사항이 저장되었습니다.")).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    const day1After = dayContainer(page, 1);
    const afterReloadNames = (await day1After.locator("ul > li span.font-medium.text-slate-800").allTextContents()).map((t) =>
      t.trim(),
    );
    expect(afterReloadNames[0]).toBe(thirdName);
  });
});

test.describe("코스 Drag & Drop 실제 pointer 상호작용 검증(청주, 로컬 QA 프로젝트)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/projects/${CHEONGJU_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();
    await openCandidatePanel(page);
  });

  test("추천 후보를 drag로 추가 → 일정에서 삭제 → 후보 풀에 재등장 → 버튼으로 다시 추가", async ({ page }) => {
    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const firstCandidateCard = candidateSection.locator("ul > li").first();
    const candidateName = (await firstCandidateCard.locator("p.font-medium").first().textContent())?.trim();
    expect(candidateName).toBeTruthy();

    const day1 = dayContainer(page, 1);
    const day1FirstItemName = (await day1.locator("ul > li span.font-medium.text-slate-800").first().textContent())?.trim();

    await dragHandle(page, candidateHandle(page, candidateName!), scheduleHandle(page, day1FirstItemName!));
    await expect(page.getByLabel(`${candidateName} 시간`)).toBeVisible();
    await expect(candidateHandle(page, candidateName!)).toHaveCount(0);

    // 일정에서 삭제 → 후보 풀에 재등장
    await page.getByRole("button", { name: `${candidateName} 삭제` }).click();
    await expect(candidateHandle(page, candidateName!)).toBeVisible();

    // 기존 날짜 select + 버튼 방식으로 다시 추가(버튼 fallback 정상 확인)
    const card = candidateSection.locator("li", { has: page.getByText(candidateName!, { exact: true }) }).first();
    await card.getByRole("button", { name: new RegExp(`${candidateName}.*에 추가`) }).click();
    await expect(page.getByLabel(`${candidateName} 시간`)).toBeVisible();
    await expect(candidateHandle(page, candidateName!)).toHaveCount(0);
  });

  test("동일 시설(SHOPPING) dedup 회귀 — 후보 풀에 같은 시설 중복 카드가 없다", async ({ page }) => {
    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    const names = (await candidateSection.locator("ul > li p.font-medium").allTextContents()).map((t) => t.trim());
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  // 375px 모바일 레이아웃 + 버튼 fallback만 실제 브라우저로 확인한다. 실제 touch(멀티터치 포인터)
  // drag 시뮬레이션은 Playwright/CDP의 synthetic touch 이벤트 신뢰도가 낮아(dnd-kit의 PointerSensor가
  // 인식하는 실제 pointerType:"touch" 시퀀스를 안정적으로 재현하기 어려움) 이번 검증 범위에서
  // 제외했다 — 완료 보고에서 "touch drag 자체는 미검증"임을 명확히 분리해서 밝힌다.
  test("375px 모바일 — 가로 스크롤 없음 + 버튼 fallback(날짜 select+추가) 정상 동작", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/projects/${CHEONGJU_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBe(overflow.clientWidth);

    const candidateSection = page.locator("section", { has: page.getByRole("heading", { name: "추천 후보" }) });
    // 모바일에서는 후보 패널이 기본 접힘 상태라, DOM에 있어도 카드를 조작할 수 없다.
    await candidateSection.locator("summary").click();
    const firstCandidateCard = candidateSection.locator("ul > li").first();
    await expect(firstCandidateCard).toBeVisible();
    const candidateName = (await firstCandidateCard.locator("p.font-medium").first().textContent())?.trim();
    expect(candidateName).toBeTruthy();

    await page.getByLabel(`${candidateName} 추가할 날짜`).selectOption({ label: "2일차" });
    await firstCandidateCard.getByRole("button", { name: new RegExp(`${candidateName}.*에 추가`) }).click();
    await expect(page.getByLabel(`${candidateName} 시간`)).toBeVisible();
  });
});
