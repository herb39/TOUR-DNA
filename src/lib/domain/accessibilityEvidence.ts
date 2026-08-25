import type { AccessibilityDetailRawItem, AccessibilityListItem } from "../public-data/adapters/accessibility";

export const ACCESSIBILITY_CONDITION_TYPE = "ACCESSIBILITY" as const;

export type AccessibilityDimensionStatus = "AVAILABLE" | "UNAVAILABLE" | "CONDITIONAL" | "UNKNOWN";
export type AccessibilityDimensionKey =
  | "wheelchair"
  | "entranceExit"
  | "elevator"
  | "restroom"
  | "parking"
  | "route"
  | "visualGuide"
  | "strollerFamily"
  | "otherSupport";

export interface AccessibilityDimensionDetail {
  status: AccessibilityDimensionStatus;
  rawText: string | null;
}

export type AccessibilityDimensionDetails = Record<AccessibilityDimensionKey, AccessibilityDimensionDetail>;

export interface AccessibilityTarget extends AccessibilityListItem {
  sourceModifiedTime: string | null;
  sourceShowFlag: string;
}

export interface AccessibilityLocalPoi {
  id: string;
  externalId: string | null;
  category: string;
}

export interface ExistingAccessibilityEvidence {
  contentId: string;
  status: "SUCCESS" | "EMPTY" | "ERROR";
  sourceModifiedTime: string | null;
  sourceShowFlag: string | null;
}

export interface AccessibilityTargetSelection {
  officialItems: AccessibilityTarget[];
  hiddenItems: AccessibilityTarget[];
  matchedTargets: AccessibilityTarget[];
  matchedPois: AccessibilityLocalPoi[];
  unmatchedContentIds: string[];
  cacheHits: AccessibilityTarget[];
  changedTargets: AccessibilityTarget[];
  fetchTargets: AccessibilityTarget[];
}

type AccessibilityField = keyof AccessibilityDetailRawItem;

const DIMENSION_FIELDS: Record<AccessibilityDimensionKey, Array<[AccessibilityField, string]>> = {
  wheelchair: [["wheelchair", "wheelchair"]],
  entranceExit: [["exit", "exit"]],
  elevator: [["elevator", "elevator"]],
  restroom: [["restroom", "restroom"]],
  parking: [["parking", "parking"]],
  route: [["route", "route"]],
  visualGuide: [
    ["blindhandicapetc", "blindhandicapetc"],
    ["braileblock", "braileblock"],
    ["brailepromotion", "brailepromotion"],
    ["bigprint", "bigprint"],
    ["videoguide", "videoguide"],
    ["signguide", "signguide"],
  ],
  strollerFamily: [
    ["stroller", "stroller"],
    ["lactationroom", "lactationroom"],
    ["babysparechair", "babysparechair"],
    ["infantsfamilyetc", "infantsfamilyetc"],
    ["auditorium", "auditorium"],
  ],
  otherSupport: [
    ["handicapetc", "handicapetc"],
    ["guidesystem", "guidesystem"],
    ["guidehuman", "guidehuman"],
    ["audioguide", "audioguide"],
    ["publictransport", "publictransport"],
    ["ticketoffice", "ticketoffice"],
    ["promotion", "promotion"],
    ["room", "room"],
  ],
};

function nonBlank(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toTarget(item: AccessibilityListItem): AccessibilityTarget {
  return { ...item, sourceModifiedTime: item.modifiedtime ?? null, sourceShowFlag: item.showflag ?? "1" };
}

function compareTargets(left: AccessibilityTarget, right: AccessibilityTarget): number {
  return (left.sourceModifiedTime ?? "").localeCompare(right.sourceModifiedTime ?? "") || left.contentid.localeCompare(right.contentid);
}

export function deduplicateAccessibilityTargets(items: AccessibilityListItem[]): AccessibilityTarget[] {
  const byContentId = new Map<string, AccessibilityTarget>();
  for (const item of items) {
    const target = toTarget(item);
    const previous = byContentId.get(target.contentid);
    if (!previous || compareTargets(previous, target) < 0) byContentId.set(target.contentid, target);
  }
  return [...byContentId.values()].sort((left, right) => left.contentid.localeCompare(right.contentid));
}

function isFreshCache(target: AccessibilityTarget, evidence: ExistingAccessibilityEvidence | undefined): boolean {
  return Boolean(
    evidence &&
      (evidence.status === "SUCCESS" || evidence.status === "EMPTY") &&
      target.sourceModifiedTime !== null &&
      evidence.sourceModifiedTime === target.sourceModifiedTime &&
      evidence.sourceShowFlag === target.sourceShowFlag,
  );
}

export function selectAccessibilityTargets(params: {
  officialItems: AccessibilityListItem[];
  localPois: AccessibilityLocalPoi[];
  existingEvidence: ExistingAccessibilityEvidence[];
  maxItems: number;
  priorityContentIds?: string[];
  restrictToPriorityContentIds?: boolean;
}): AccessibilityTargetSelection {
  const allOfficialItems = deduplicateAccessibilityTargets(params.officialItems);
  const hiddenItems = allOfficialItems.filter((item) => item.sourceShowFlag === "0");
  const officialItems = allOfficialItems.filter((item) => item.sourceShowFlag !== "0");
  const priorityContentIds = params.priorityContentIds ?? [];
  const priorityRank = new Map(priorityContentIds.map((contentId, index) => [contentId, index]));
  const consideredItems = params.restrictToPriorityContentIds
    ? officialItems.filter((item) => priorityRank.has(item.contentid))
    : officialItems;
  const poisByExternalId = new Map(
    params.localPois.filter((poi) => poi.externalId !== null).map((poi) => [poi.externalId as string, poi]),
  );
  const evidenceByContentId = new Map(params.existingEvidence.map((evidence) => [evidence.contentId, evidence]));
  const matchedTargets: AccessibilityTarget[] = [];
  const matchedPois: AccessibilityLocalPoi[] = [];
  const unmatchedContentIds: string[] = [];
  const cacheHits: AccessibilityTarget[] = [];
  const changedTargets: AccessibilityTarget[] = [];

  for (const target of consideredItems) {
    const poi = poisByExternalId.get(target.contentid);
    if (!poi) {
      unmatchedContentIds.push(target.contentid);
      continue;
    }
    matchedTargets.push(target);
    matchedPois.push(poi);
    if (isFreshCache(target, evidenceByContentId.get(target.contentid))) cacheHits.push(target);
    else changedTargets.push(target);
  }

  const orderedChangedTargets = priorityContentIds.length === 0
    ? changedTargets
    : [...changedTargets].sort((left, right) => {
        const leftRank = priorityRank.get(left.contentid);
        const rightRank = priorityRank.get(right.contentid);
        return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
      });

  return {
    officialItems,
    hiddenItems,
    matchedTargets,
    matchedPois,
    unmatchedContentIds,
    cacheHits,
    changedTargets: orderedChangedTargets,
    fetchTargets: orderedChangedTargets.slice(0, params.maxItems),
  };
}

function classifyRawText(value: string): AccessibilityDimensionStatus {
  const normalized = value.replace(/\s+/g, "");
  if (/없음|불가|불가능|미설치|미제공|없다/.test(normalized)) return "UNAVAILABLE";
  if (/문의|확인|예약|사전|일부|조건|제한|필요|협의/.test(normalized)) return "CONDITIONAL";
  if (/가능|있음|설치|구비|제공|확보|완비|접근/.test(normalized)) return "AVAILABLE";
  return "UNKNOWN";
}

function summarizeDimension(values: Array<{ label: string; text: string }>): AccessibilityDimensionDetail {
  if (values.length === 0) return { status: "UNKNOWN", rawText: null };
  const statuses = values.map((value) => classifyRawText(value.text));
  const hasConditional = statuses.includes("CONDITIONAL");
  const hasAvailable = statuses.includes("AVAILABLE");
  const hasUnavailable = statuses.includes("UNAVAILABLE");
  const status = hasConditional || (hasAvailable && hasUnavailable)
    ? "CONDITIONAL"
    : hasAvailable
      ? "AVAILABLE"
      : hasUnavailable && statuses.every((item) => item === "UNAVAILABLE")
        ? "UNAVAILABLE"
        : "UNKNOWN";
  return {
    status,
    rawText: values.map((value) => `${value.label}: ${value.text}`).join(" | "),
  };
}

/**
 * 접근성은 전체 가능 여부를 추론하지 않고 차원별 원문과 최소 상태만 정규화한다.
 * 빈 값·누락·판정하기 어려운 자유 서술은 UNKNOWN으로 남긴다.
 */
export function normalizeAccessibilityDetail(item: AccessibilityDetailRawItem): AccessibilityDimensionDetails {
  return Object.fromEntries(
    Object.entries(DIMENSION_FIELDS).map(([dimension, fields]) => {
      const values = fields
        .map(([field, label]) => {
          const value = nonBlank(item[field]);
          return value ? { label, text: value } : null;
        })
        .filter((value): value is { label: string; text: string } => value !== null);
      return [dimension, summarizeDimension(values)];
    }),
  ) as AccessibilityDimensionDetails;
}

export function accessibilityDimensionStatusCounts(
  details: AccessibilityDimensionDetails[],
): Record<AccessibilityDimensionKey, Record<AccessibilityDimensionStatus, number>> {
  return Object.fromEntries(Object.keys(DIMENSION_FIELDS).map((dimension) => {
    const key = dimension as AccessibilityDimensionKey;
    const counts: Record<AccessibilityDimensionStatus, number> = { AVAILABLE: 0, UNAVAILABLE: 0, CONDITIONAL: 0, UNKNOWN: 0 };
    for (const detail of details) counts[detail[key].status]++;
    return [key, counts];
  })) as Record<AccessibilityDimensionKey, Record<AccessibilityDimensionStatus, number>>;
}
