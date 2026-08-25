import type { AccessibilityEnrichmentParams } from "../services/accessibilityEnrichment";
import { MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN, MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN } from "./accessibilityLimits";

export const ACCESSIBILITY_ENRICHMENT_USAGE =
  "사용법: npm run enrich:accessibility -- --region-code=SGG_GYEONGJU --max-items=8\n" +
  "       --max-list-pages=20 --delay-ms=100 --dry-run은 선택 사항입니다.";

export type AccessibilityEnrichmentCliArgs = AccessibilityEnrichmentParams;

function parsePositiveInteger(value: string, option: string): { value?: number; error?: string } {
  if (!/^[0-9]+$/.test(value)) return { error: `${option}은 정수여야 합니다.` };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return { error: `${option} 값이 너무 큽니다.` };
  return { value: parsed };
}

export function parseAccessibilityEnrichmentArgs(argv: string[]):
  | { ok: true; value: AccessibilityEnrichmentCliArgs }
  | { ok: false; error: string } {
  let regionCode: string | undefined;
  let maxItems: number | undefined;
  let maxListPages = MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN;
  let delayMs = 100;
  let dryRun = false;

  for (const token of argv) {
    if (token === "--dry-run") {
      if (dryRun) return { ok: false, error: "--dry-run을 두 번 이상 지정할 수 없습니다." };
      dryRun = true;
      continue;
    }
    if (token.startsWith("--region-code=")) {
      if (regionCode !== undefined) return { ok: false, error: "--region-code를 두 번 이상 지정할 수 없습니다." };
      const value = token.slice("--region-code=".length).trim();
      if (!value) return { ok: false, error: "--region-code 값이 비어 있습니다." };
      regionCode = value;
      continue;
    }
    if (token.startsWith("--max-items=")) {
      if (maxItems !== undefined) return { ok: false, error: "--max-items를 두 번 이상 지정할 수 없습니다." };
      const parsed = parsePositiveInteger(token.slice("--max-items=".length), "--max-items");
      if (parsed.error) return { ok: false, error: parsed.error };
      maxItems = parsed.value;
      if (maxItems === undefined || maxItems < 1 || maxItems > MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN) {
        return { ok: false, error: `--max-items는 1~${MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN} 범위여야 합니다.` };
      }
      continue;
    }
    if (token.startsWith("--max-list-pages=")) {
      const parsed = parsePositiveInteger(token.slice("--max-list-pages=".length), "--max-list-pages");
      if (parsed.error) return { ok: false, error: parsed.error };
      maxListPages = parsed.value ?? 0;
      if (maxListPages < 1 || maxListPages > MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN) {
        return { ok: false, error: `--max-list-pages는 1~${MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN} 범위여야 합니다.` };
      }
      continue;
    }
    if (token.startsWith("--delay-ms=")) {
      const parsed = parsePositiveInteger(token.slice("--delay-ms=".length), "--delay-ms");
      if (parsed.error) return { ok: false, error: parsed.error };
      delayMs = parsed.value ?? 0;
      if (delayMs > 5000) return { ok: false, error: "--delay-ms는 0~5000 범위여야 합니다." };
      continue;
    }
    return { ok: false, error: `알 수 없는 옵션입니다: "${token}"` };
  }

  if (!regionCode) return { ok: false, error: `--region-code=SIGUNGU를 지정해야 합니다.\n${ACCESSIBILITY_ENRICHMENT_USAGE}` };
  if (maxItems === undefined) return { ok: false, error: `--max-items를 지정해야 합니다.\n${ACCESSIBILITY_ENRICHMENT_USAGE}` };

  return { ok: true, value: { regionCode, maxItems, maxListPages, delayMs, dryRun } };
}
