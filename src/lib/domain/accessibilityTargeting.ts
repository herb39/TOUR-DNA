export const TARGETED_COLLECTION_ORDER = ["CANDIDATE", "COURSE", "ANCHOR_CANDIDATE"] as const;
export const TARGETED_CATEGORY_ORDER = ["ATTRACTION", "FOOD", "LODGING", "EXPERIENCE", "SHOPPING"] as const;

export type TargetedAccessibilityCollection = (typeof TARGETED_COLLECTION_ORDER)[number];
export type TargetedAccessibilityCoverageState =
  | "EVIDENCE_AVAILABLE"
  | "LISTED_NOT_ENRICHED"
  | "NOT_IN_OFFICIAL_LIST";

export interface TargetedAccessibilityRow {
  id: string;
  name: string;
  category: string;
  externalId: string | null;
  projectId: string;
  regionCode: string;
  collection: TargetedAccessibilityCollection;
  anchorRole?: string;
}

export interface TargetedOfficialSnapshot {
  sourceModifiedTime: string | null;
  sourceShowFlag: string;
}

export interface TargetedEvidenceSnapshot {
  poiId: string;
  contentId: string;
  status: "SUCCESS" | "EMPTY" | "ERROR";
  sourceModifiedTime: string | null;
  sourceShowFlag: string | null;
}

export type TargetedOfficialByRegion = Map<string, Map<string, TargetedOfficialSnapshot>>;

const collectionRank = new Map(TARGETED_COLLECTION_ORDER.map((collection, index) => [collection, index]));
const categoryRank = new Map<string, number>(TARGETED_CATEGORY_ORDER.map((category, index) => [category, index]));

function compareStable(left: TargetedAccessibilityRow, right: TargetedAccessibilityRow): number {
  return left.regionCode.localeCompare(right.regionCode)
    || left.category.localeCompare(right.category)
    || left.name.localeCompare(right.name, "ko")
    || left.id.localeCompare(right.id);
}

function isFreshEvidence(
  row: TargetedAccessibilityRow,
  official: TargetedOfficialSnapshot | undefined,
  evidence: TargetedEvidenceSnapshot | undefined,
): boolean {
  return Boolean(
    official &&
      evidence &&
      (evidence.status === "SUCCESS" || evidence.status === "EMPTY") &&
      official.sourceModifiedTime !== null &&
      evidence.contentId === row.externalId &&
      evidence.sourceModifiedTime === official.sourceModifiedTime &&
      evidence.sourceShowFlag === official.sourceShowFlag,
  );
}

export function classifyTargetedAccessibilityRow(params: {
  row: TargetedAccessibilityRow;
  officialByRegion: TargetedOfficialByRegion;
  evidenceByPoiId: Map<string, TargetedEvidenceSnapshot>;
}): TargetedAccessibilityCoverageState {
  const { row } = params;
  const official = row.externalId ? params.officialByRegion.get(row.regionCode)?.get(row.externalId) : undefined;
  if (!official) return "NOT_IN_OFFICIAL_LIST";
  return isFreshEvidence(row, official, params.evidenceByPoiId.get(row.id))
    ? "EVIDENCE_AVAILABLE"
    : "LISTED_NOT_ENRICHED";
}

function chooseRepresentativeRows(rows: TargetedAccessibilityRow[]): TargetedAccessibilityRow[] {
  const byPoiId = new Map<string, TargetedAccessibilityRow>();
  for (const row of rows) {
    const previous = byPoiId.get(row.id);
    if (!previous) {
      byPoiId.set(row.id, row);
      continue;
    }
    const previousRank = collectionRank.get(previous.collection) ?? Number.MAX_SAFE_INTEGER;
    const currentRank = collectionRank.get(row.collection) ?? Number.MAX_SAFE_INTEGER;
    if (currentRank < previousRank || (currentRank === previousRank && compareStable(row, previous) < 0)) {
      byPoiId.set(row.id, row);
    }
  }
  return [...byPoiId.values()];
}

/** 사용자 노출 우선순위는 후보 → 코스/숙박 → Anchor 후보로 유지하고, 같은 그룹은 category round-robin한다. */
export function orderTargetedAccessibilityRows(rows: TargetedAccessibilityRow[]): TargetedAccessibilityRow[] {
  const representatives = chooseRepresentativeRows(rows);
  const ordered: TargetedAccessibilityRow[] = [];
  for (const collection of TARGETED_COLLECTION_ORDER) {
    const group = representatives.filter((row) => row.collection === collection);
    const byCategory = new Map<string, TargetedAccessibilityRow[]>();
    for (const row of group.sort(compareStable)) {
      const list = byCategory.get(row.category) ?? [];
      list.push(row);
      byCategory.set(row.category, list);
    }
    let added = true;
    while (added) {
      added = false;
      for (const category of TARGETED_CATEGORY_ORDER) {
        const list = byCategory.get(category);
        const row = list?.shift();
        if (row) {
          ordered.push(row);
          added = true;
        }
      }
      for (const [category, list] of byCategory) {
        if (TARGETED_CATEGORY_ORDER.includes(category as (typeof TARGETED_CATEGORY_ORDER)[number])) continue;
        const row = list.shift();
        if (row) {
          ordered.push(row);
          added = true;
        }
      }
    }
  }
  return ordered;
}

export function countTargetedAccessibilityStates(params: {
  rows: TargetedAccessibilityRow[];
  officialByRegion: TargetedOfficialByRegion;
  evidenceByPoiId: Map<string, TargetedEvidenceSnapshot>;
}) {
  const counts: Record<TargetedAccessibilityCoverageState, number> = {
    EVIDENCE_AVAILABLE: 0,
    LISTED_NOT_ENRICHED: 0,
    NOT_IN_OFFICIAL_LIST: 0,
  };
  for (const row of params.rows) {
    counts[classifyTargetedAccessibilityRow({ ...params, row })]++;
  }
  const total = params.rows.length;
  return {
    total,
    ...counts,
    currentCoverage: total === 0 ? null : counts.EVIDENCE_AVAILABLE / total,
    coverageCeiling: total === 0 ? null : (counts.EVIDENCE_AVAILABLE + counts.LISTED_NOT_ENRICHED) / total,
  };
}

export function countTargetedAccessibilityCategories(params: {
  rows: TargetedAccessibilityRow[];
  officialByRegion: TargetedOfficialByRegion;
  evidenceByPoiId: Map<string, TargetedEvidenceSnapshot>;
}) {
  return Object.fromEntries(
    [...new Set(params.rows.map((row) => row.category))].sort((left, right) => (categoryRank.get(left) ?? 99) - (categoryRank.get(right) ?? 99) || left.localeCompare(right)).map((category) => {
      const rows = params.rows.filter((row) => row.category === category);
      return [category, countTargetedAccessibilityStates({ ...params, rows })];
    }),
  );
}
