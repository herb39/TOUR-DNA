import type { PetTourEnrichmentParams } from "../services/petTourEnrichment";
import { MAX_PET_TOUR_DETAIL_ITEMS_PER_RUN, MAX_PET_TOUR_LIST_PAGES_PER_RUN } from "./petTourLimits";

export const PET_TOUR_ENRICHMENT_USAGE =
  "사용법: npm run enrich:pet-tour-detail -- --all-regions --max-items=10\n" +
  "       특정 지역: --region-code=SGG_GYEONGJU --mode=area --max-items=10\n" +
  "       --mode=sync(전국 동기화 목록, 기본값) 또는 --mode=area(단일 SIGUNGU 지역 목록)\n" +
  "       --dry-run은 공식 목록·local 교집합·cache 대상만 확인하고 상세 호출/저장을 하지 않습니다.";

export interface PetTourEnrichmentCliArgs extends PetTourEnrichmentParams {
  allRegions: boolean;
}

function parsePositiveInteger(value: string, option: string): { value?: number; error?: string } {
  if (!/^[0-9]+$/.test(value)) return { error: `${option}은 정수여야 합니다.` };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return { error: `${option} 값이 너무 큽니다.` };
  return { value: parsed };
}

export function parsePetTourEnrichmentArgs(argv: string[]):
  | { ok: true; value: PetTourEnrichmentCliArgs }
  | { ok: false; error: string } {
  let regionCode: string | undefined;
  let allRegions = false;
  let mode: "sync" | "area" = "sync";
  let maxItems: number | undefined;
  let maxListPages = MAX_PET_TOUR_LIST_PAGES_PER_RUN;
  let delayMs = 100;
  let dryRun = false;

  for (const token of argv) {
    if (token === "--all-regions") {
      if (allRegions) return { ok: false, error: "--all-regions를 두 번 이상 지정할 수 없습니다." };
      allRegions = true;
      continue;
    }
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
    if (token.startsWith("--mode=")) {
      const value = token.slice("--mode=".length).trim();
      if (value !== "sync" && value !== "area") return { ok: false, error: "--mode는 sync 또는 area여야 합니다." };
      mode = value;
      continue;
    }
    if (token.startsWith("--max-items=")) {
      if (maxItems !== undefined) return { ok: false, error: "--max-items를 두 번 이상 지정할 수 없습니다." };
      const parsed = parsePositiveInteger(token.slice("--max-items=".length), "--max-items");
      if (parsed.error) return { ok: false, error: parsed.error };
      maxItems = parsed.value;
      if (maxItems === undefined || maxItems < 1 || maxItems > MAX_PET_TOUR_DETAIL_ITEMS_PER_RUN) {
        return { ok: false, error: `--max-items는 1~${MAX_PET_TOUR_DETAIL_ITEMS_PER_RUN} 범위여야 합니다.` };
      }
      continue;
    }
    if (token.startsWith("--max-list-pages=")) {
      const parsed = parsePositiveInteger(token.slice("--max-list-pages=".length), "--max-list-pages");
      if (parsed.error) return { ok: false, error: parsed.error };
      maxListPages = parsed.value ?? 0;
      if (maxListPages < 1 || maxListPages > MAX_PET_TOUR_LIST_PAGES_PER_RUN) {
        return { ok: false, error: `--max-list-pages는 1~${MAX_PET_TOUR_LIST_PAGES_PER_RUN} 범위여야 합니다.` };
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

  if (allRegions && regionCode) return { ok: false, error: "--all-regions와 --region-code는 함께 지정할 수 없습니다." };
  if (mode === "area" && allRegions) return { ok: false, error: "--mode=area는 --all-regions와 함께 사용할 수 없습니다." };
  if (mode === "area" && !regionCode) return { ok: false, error: "--mode=area에는 --region-code=SIGUNGU를 지정해야 합니다." };
  if (!allRegions && !regionCode) return { ok: false, error: "--all-regions 또는 --region-code=SIGUNGU를 지정해야 합니다." };
  if (maxItems === undefined) return { ok: false, error: `--max-items를 지정해야 합니다.\n${PET_TOUR_ENRICHMENT_USAGE}` };

  return {
    ok: true,
    value: {
      regionCode,
      allRegions,
      mode,
      maxItems,
      maxListPages,
      delayMs,
      dryRun,
    },
  };
}
