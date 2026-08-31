import type {
  AccessibilityDimensionDetails,
  AccessibilityDimensionKey,
  AccessibilityDimensionStatus,
} from "./accessibilityEvidence";

export type AccessibilityEvidenceDisplayStatus = "OFFICIAL_INFO_AVAILABLE" | "OFFICIAL_INFO_UNKNOWN";

export interface AccessibilityDimensionDisplay {
  key: AccessibilityDimensionKey;
  label: string;
  status: AccessibilityDimensionStatus;
  statusLabel: string;
  rawText: string | null;
}

export interface AccessibilityEvidenceDisplay {
  status: AccessibilityEvidenceDisplayStatus;
  label: "공식 접근성 정보" | "공식 접근성 정보 미확인";
  dimensions: AccessibilityDimensionDisplay[];
  sourceLabel: string;
  fetchedAtLabel: string | null;
  hasMeaningfulDimensions: boolean;
  repositoryUnavailable?: boolean;
}

export interface AccessibilityEvidenceDisplayRow {
  status: string;
  dimensionDetails: unknown;
  sourceCode: string;
  fetchedAt: Date | string;
}

export interface AccessibilityEvidenceSummary {
  total: number;
  available: number;
  unknown: number;
}

export const ACCESSIBILITY_EVIDENCE_SOURCE_LABEL = "한국관광공사 공식 무장애 여행정보";
export const ACCESSIBILITY_UNKNOWN_MESSAGE = "공식 접근성 정보가 확인되지 않았습니다.";
export const ACCESSIBILITY_UNKNOWN_HELP = "정보 미확인은 접근 불가를 뜻하지 않습니다.";

export const ACCESSIBILITY_DIMENSION_ORDER: AccessibilityDimensionKey[] = [
  "parking",
  "restroom",
  "route",
  "entranceExit",
  "wheelchair",
  "elevator",
  "visualGuide",
  "strollerFamily",
  "otherSupport",
];

export const ACCESSIBILITY_DIMENSION_LABEL: Record<AccessibilityDimensionKey, string> = {
  parking: "주차",
  restroom: "화장실",
  route: "이동 경로",
  entranceExit: "출입구",
  wheelchair: "휠체어",
  elevator: "엘리베이터",
  visualGuide: "시각 안내",
  strollerFamily: "유아차·가족 지원",
  otherSupport: "기타 지원 정보",
};

export const ACCESSIBILITY_DIMENSION_STATUS_LABEL: Record<AccessibilityDimensionStatus, string> = {
  AVAILABLE: "이용 가능/설치 정보 있음",
  UNAVAILABLE: "이용 불가/없음으로 안내됨",
  CONDITIONAL: "조건 또는 사전 확인 필요",
  UNKNOWN: "정보 미확인",
};

const KNOWN_DIMENSION_STATUSES = new Set<AccessibilityDimensionStatus>(["AVAILABLE", "UNAVAILABLE", "CONDITIONAL"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const ACCESSIBILITY_RAW_FIELD_KEYS = new Set([
  "wheelchair",
  "exit",
  "elevator",
  "restroom",
  "guidesystem",
  "blindhandicapetc",
  "signguide",
  "videoguide",
  "hearingroom",
  "hearinghandicapetc",
  "stroller",
  "lactationroom",
  "babysparechair",
  "infantsfamilyetc",
  "auditorium",
  "room",
  "handicapetc",
  "braileblock",
  "helpdog",
  "guidehuman",
  "audioguide",
  "bigprint",
  "brailepromotion",
  "parking",
  "route",
  "publictransport",
  "ticketoffice",
  "promotion",
]);

function removeAccessibilityRawFieldPrefixes(value: string): string {
  return value
    .split(/\s*\|\s*/)
    .map((part) => {
      const match = part.match(/^([a-z][a-z0-9]*)\s*:\s*(.*)$/i);
      return match && ACCESSIBILITY_RAW_FIELD_KEYS.has(match[1].toLowerCase()) ? match[2].trim() : part.trim();
    })
    .filter(Boolean)
    .join(" | ");
}

/** 원문은 React 문자열로만 렌더링하고 태그·공백을 정리해 카드 영역의 overflow를 막는다. */
export function sanitizeAccessibilityRawText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  const withoutFieldPrefixes = removeAccessibilityRawFieldPrefixes(normalized);
  if (!withoutFieldPrefixes) return null;
  return withoutFieldPrefixes.length > 240 ? `${withoutFieldPrefixes.slice(0, 237)}...` : withoutFieldPrefixes;
}

function fetchedAtLabel(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDimensions(value: unknown): AccessibilityDimensionDetails {
  const source = asRecord(value);
  return Object.fromEntries(
    ACCESSIBILITY_DIMENSION_ORDER.map((key) => {
      const detail = asRecord(source[key]);
      const status = KNOWN_DIMENSION_STATUSES.has(detail.status as AccessibilityDimensionStatus)
        ? (detail.status as AccessibilityDimensionStatus)
        : "UNKNOWN";
      return [key, { status, rawText: sanitizeAccessibilityRawText(detail.rawText) }];
    }),
  ) as AccessibilityDimensionDetails;
}

export function unknownAccessibilityEvidence(options: { repositoryUnavailable?: boolean } = {}): AccessibilityEvidenceDisplay {
  return {
    status: "OFFICIAL_INFO_UNKNOWN",
    label: "공식 접근성 정보 미확인",
    dimensions: [],
    sourceLabel: ACCESSIBILITY_EVIDENCE_SOURCE_LABEL,
    fetchedAtLabel: null,
    hasMeaningfulDimensions: false,
    ...(options.repositoryUnavailable ? { repositoryUnavailable: true } : {}),
  };
}

export function toAccessibilityEvidenceDisplay(row: AccessibilityEvidenceDisplayRow): AccessibilityEvidenceDisplay {
  const details = normalizeDimensions(row.dimensionDetails);
  const dimensions = ACCESSIBILITY_DIMENSION_ORDER.map((key) => ({
    key,
    label: ACCESSIBILITY_DIMENSION_LABEL[key],
    status: details[key].status,
    statusLabel: ACCESSIBILITY_DIMENSION_STATUS_LABEL[details[key].status],
    rawText: details[key].rawText,
  }));
  const hasMeaningfulDimensions = dimensions.some((dimension) =>
    KNOWN_DIMENSION_STATUSES.has(dimension.status) || Boolean(dimension.rawText),
  );

  if (row.status !== "SUCCESS" || !asRecord(row.dimensionDetails)) return unknownAccessibilityEvidence();

  return {
    status: "OFFICIAL_INFO_AVAILABLE",
    label: "공식 접근성 정보",
    dimensions,
    sourceLabel: ACCESSIBILITY_EVIDENCE_SOURCE_LABEL,
    fetchedAtLabel: fetchedAtLabel(row.fetchedAt),
    hasMeaningfulDimensions,
  };
}

export function summarizeAccessibilityEvidence(
  poiIds: readonly string[],
  evidenceByPoiId: Readonly<Record<string, AccessibilityEvidenceDisplay>>,
): AccessibilityEvidenceSummary {
  return [...new Set(poiIds)].reduce(
    (summary, poiId) => {
      summary.total++;
      if (evidenceByPoiId[poiId]?.status === "OFFICIAL_INFO_AVAILABLE") summary.available++;
      else summary.unknown++;
      return summary;
    },
    { total: 0, available: 0, unknown: 0 },
  );
}
