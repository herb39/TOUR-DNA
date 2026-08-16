import type { TourInfoDetailItem } from "../public-data/adapters/tourInfoDetail";

export const TOUR_INFO_DETAIL_ENRICHMENT_USAGE =
  "사용법: npm run enrich:tour-info-detail -- --region-code=SGG_JECHEON --max-items=10\n" +
  "       --region-code(SIGUNGU)와 --max-items(이번 실행의 최대 상세 API 호출 수)를 반드시 지정합니다.\n" +
  "       전국 증분은 npm run enrich:tour-info-detail -- --all-regions --max-items=100 형식으로 실행합니다.";

export const MAX_DETAIL_ITEMS_PER_RUN = 100;

export interface TourInfoDetailEnrichmentRegionArgs {
  regionCode: string;
  maxItems: number;
}

export interface TourInfoDetailEnrichmentAllRegionsArgs {
  allRegions: true;
  maxItems: number;
}

export type TourInfoDetailEnrichmentArgs =
  | TourInfoDetailEnrichmentRegionArgs
  | TourInfoDetailEnrichmentAllRegionsArgs;

export function parseTourInfoDetailEnrichmentArgs(argv: string[]):
  | { ok: true; value: TourInfoDetailEnrichmentArgs }
  | { ok: false; error: string } {
  let regionCode: string | null = null;
  let maxItems: number | null = null;
  let allRegions = false;

  for (const token of argv) {
    if (token === "--all-regions") {
      if (allRegions) return { ok: false, error: "--all-regions를 두 번 이상 지정할 수 없습니다." };
      allRegions = true;
      continue;
    }
    if (token.startsWith("--region-code=")) {
      if (regionCode !== null) return { ok: false, error: "--region-code를 두 번 이상 지정할 수 없습니다." };
      const value = token.slice("--region-code=".length).trim();
      if (!value) return { ok: false, error: "--region-code 값이 비어 있습니다." };
      regionCode = value;
      continue;
    }
    if (token.startsWith("--max-items=")) {
      if (maxItems !== null) return { ok: false, error: "--max-items를 두 번 이상 지정할 수 없습니다." };
      const value = token.slice("--max-items=".length);
      if (!/^[1-9][0-9]*$/.test(value)) return { ok: false, error: "--max-items는 1 이상의 정수여야 합니다." };
      maxItems = Number(value);
      if (maxItems > MAX_DETAIL_ITEMS_PER_RUN) {
        return { ok: false, error: `--max-items는 실행당 최대 ${MAX_DETAIL_ITEMS_PER_RUN}건까지 지정할 수 있습니다.` };
      }
      continue;
    }
    return { ok: false, error: `알 수 없는 옵션입니다: "${token}"` };
  }

  if (allRegions && regionCode) {
    return { ok: false, error: "--all-regions와 --region-code는 함께 지정할 수 없습니다." };
  }
  if (maxItems === null || (!allRegions && !regionCode)) {
    return { ok: false, error: `--region-code 또는 --all-regions와 --max-items를 지정해야 합니다.\n${TOUR_INFO_DETAIL_ENRICHMENT_USAGE}` };
  }
  if (allRegions) return { ok: true, value: { allRegions: true, maxItems } };
  return { ok: true, value: { regionCode: regionCode as string, maxItems } };
}

export interface TourInfoDetailEnrichmentPoi {
  id: string;
  externalId: string | null;
  sourceType: string;
  operatingHours: string | null;
  closedDays: string | null;
  rawPayload: unknown;
}

export interface TourInfoDetailEnrichmentCandidate extends TourInfoDetailEnrichmentPoi {
  externalId: string;
  contentTypeId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasText(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

interface TourInfoDetailTarget {
  contentTypeId: string;
  matches: (raw: Record<string, unknown>) => boolean;
}

/** 운영시간·휴무일을 상세 API로 확인할 안전한 공식 분류만 대상으로 한다.
 * VE07은 문화시설(14), LS는 레포츠(28)로 contentTypeId와 구조 분류를 함께 확인한다. */
const TOUR_INFO_DETAIL_TARGETS: TourInfoDetailTarget[] = [
  { contentTypeId: "14", matches: (raw) => raw.lclsSystm2 === "VE07" },
  { contentTypeId: "28", matches: (raw) => raw.lclsSystm1 === "LS" },
];

function findTourInfoDetailTarget(raw: Record<string, unknown>): TourInfoDetailTarget | null {
  const contentTypeId = typeof raw.contenttypeid === "string" ? raw.contenttypeid : null;
  return TOUR_INFO_DETAIL_TARGETS.find((target) => target.contentTypeId === contentTypeId && target.matches(raw)) ?? null;
}

/** 공식 구조 분류(VE07 문화시설·LS 레포츠)만 대상으로 한다. 이미 상세 응답을 저장한 POI는 재호출하지 않는다. */
export function selectTourInfoDetailCandidates(
  pois: TourInfoDetailEnrichmentPoi[],
  maxItems: number,
): TourInfoDetailEnrichmentCandidate[] {
  return pois
    .map((poi) => {
      const raw = asRecord(poi.rawPayload);
      const target = findTourInfoDetailTarget(raw);
      if (
        poi.sourceType === "API" &&
        poi.externalId !== null &&
        target !== null &&
        !hasText(poi.operatingHours) &&
        !hasText(poi.closedDays) &&
        raw.detailIntro2 === undefined
      ) {
        return { poi, target };
      }
      return null;
    })
    .filter((value): value is { poi: TourInfoDetailEnrichmentPoi; target: TourInfoDetailTarget } => value !== null)
    .map(({ poi, target }) => ({ ...poi, externalId: poi.externalId as string, contentTypeId: target.contentTypeId }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, maxItems);
}

export interface MergedTourInfoDetail {
  operatingHours: string | null;
  closedDays: string | null;
  rawPayload: Record<string, unknown>;
}

/** 기존 areaBasedList2 원본을 보존하면서 detailIntro2 원본과 정규화 결과를 함께 기록한다. */
export function mergeTourInfoDetail(
  poi: Pick<TourInfoDetailEnrichmentPoi, "operatingHours" | "closedDays" | "rawPayload">,
  detail: TourInfoDetailItem | null,
  fetchedAt: string,
): MergedTourInfoDetail {
  const raw = asRecord(poi.rawPayload);
  return {
    operatingHours: detail?.operatingHours ?? poi.operatingHours,
    closedDays: detail?.closedDays ?? poi.closedDays,
    rawPayload: {
      ...raw,
      detailIntro2: {
        fetchedAt,
        operatingHours: detail?.operatingHours ?? null,
        closedDays: detail?.closedDays ?? null,
        raw: detail?.rawPayload ?? null,
      },
    },
  };
}
