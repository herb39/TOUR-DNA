import { test, expect } from "@playwright/test";

const ACCESSIBILITY_PROJECT_ID = process.env.QA_ACCESSIBILITY_PROJECT_ID;

test.skip(!ACCESSIBILITY_PROJECT_ID, "QA_ACCESSIBILITY_PROJECT_ID 환경변수가 없어 건너뜀");
test.use({ viewport: { width: 390, height: 844 } });

test.describe("AnimatedDetails 모바일 회귀 검증 — 로컬 무장애 활성 프로젝트", () => {
  test("390×844에서 무장애 advisory·접기·버튼·badge·overflow를 검증한다", async ({ page }) => {
    await page.goto(`/projects/${ACCESSIBILITY_PROJECT_ID}/plan`);
    await expect(page.getByRole("heading", { name: "일자·시간대별 코스" })).toBeVisible();

    const accessibilityEvidence = page.getByTestId("accessibility-evidence").first();
    await expect(accessibilityEvidence).toBeVisible();
    const accessibilityDetails = accessibilityEvidence.locator("details");
    const accessibilitySummary = accessibilityDetails.locator("summary");
    await expect(accessibilitySummary).toHaveAttribute("aria-expanded", "false");
    await accessibilitySummary.click();
    await expect(accessibilitySummary).toHaveAttribute("aria-expanded", "true");
    await expect(accessibilityDetails.locator("[data-open='true']")).toBeVisible();
    await accessibilitySummary.click();
    await expect(accessibilitySummary).toHaveAttribute("aria-expanded", "false");

    const checklistSummary = page.getByRole("button", { name: /운영 체크리스트 보기/ });
    await expect(checklistSummary).toBeVisible();
    const checklistDetails = checklistSummary.locator("xpath=ancestor::details[1]");
    await checklistSummary.click();
    await expect(checklistSummary).toHaveAttribute("aria-expanded", "true");
    await checklistSummary.click();
    await expect(checklistSummary).toHaveAttribute("aria-expanded", "false");

    await accessibilitySummary.evaluate((element) => {
      for (let index = 0; index < 3; index += 1) {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(350);
    await expect(accessibilitySummary).toHaveAttribute("aria-expanded", "true");
    await expect(accessibilityDetails).toHaveAttribute("open", "");

    const metrics = await page.evaluate(() => {
      const targets = Array.from(document.querySelectorAll("button, span.rounded-full"));
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        overflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        wrapped: targets
          .map((element) => ({
            text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
            tag: element.tagName.toLowerCase(),
            ariaLabel: element.getAttribute("aria-label") ?? "",
            className: element.getAttribute("class") ?? "",
            width: Math.round(element.getBoundingClientRect().width),
            rectHeight: Math.round(element.getBoundingClientRect().height),
            clientHeight: (element as HTMLElement).clientHeight,
            lineHeight: getComputedStyle(element).lineHeight,
            whiteSpace: getComputedStyle(element).whiteSpace,
            lineCount: (() => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
            })(),
          }))
          .filter((item) => item.lineCount > 1 && item.rectHeight > 0),
      };
    });
    test.info().annotations.push({ type: "mobile-metrics", description: JSON.stringify(metrics) });
    expect(metrics.overflow.scrollWidth).toBeLessThanOrEqual(metrics.overflow.clientWidth + 1);
    expect(metrics.wrapped).toEqual([]);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const reducedMotionSummary = page.getByTestId("accessibility-evidence").first().locator("summary");
    const reducedMotionContent = page.getByTestId("accessibility-evidence").first().locator(".tour-dna-expandable-content");
    await reducedMotionSummary.click();
    await expect.poll(() => reducedMotionContent.evaluate((element) => getComputedStyle(element).transitionDuration)).toContain("0.001s");
    await expect(reducedMotionSummary).toHaveAttribute("aria-expanded", "true");

    expect(await checklistDetails.count()).toBe(1);
  });
});
