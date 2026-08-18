export type PetEvidenceDisplayStatus = "CONFIRMED" | "CONDITIONAL" | "UNKNOWN";

export interface PetEvidenceDisplay {
  status: PetEvidenceDisplayStatus;
  label: "공식 동반 정보 확인" | "조건부 동반" | "동반 정보 미확인";
  detailLines: string[];
  sourceLabel: string;
  fetchedAtLabel: string | null;
  scope: "ALL" | "PARTIAL" | "UNKNOWN";
  repositoryUnavailable?: boolean;
}

export interface PetEvidenceDisplayRow {
  status: string;
  availability: string;
  scope: string;
  requirements: unknown;
  capacityNote: string | null;
  riskNote: string | null;
  facilityNote: string | null;
  rawPayload: unknown;
  sourceCode: string;
  fetchedAt: Date | string;
}

export interface PetEvidenceSummary {
  total: number;
  confirmed: number;
  conditional: number;
  unknown: number;
}

export const PET_EVIDENCE_SOURCE_LABEL = "한국관광공사 반려동물 동반여행 정보";
export const PET_UNKNOWN_MESSAGE = "공식 반려동물 동반 정보가 확인되지 않았습니다.";
export const PET_UNKNOWN_HELP = "정보 없음이 이용 불가를 의미하지 않습니다. 방문 전 시설 확인이 필요합니다.";
export const PET_REPOSITORY_UNAVAILABLE_MESSAGE = "현재 환경에서는 반려동물 공식 정보 확인 기능을 사용할 수 없습니다.";

export function unknownPetEvidence(options: { repositoryUnavailable?: boolean } = {}): PetEvidenceDisplay {
  return {
    status: "UNKNOWN",
    label: "동반 정보 미확인",
    detailLines: [
      ...(options.repositoryUnavailable ? [PET_REPOSITORY_UNAVAILABLE_MESSAGE] : [PET_UNKNOWN_MESSAGE]),
      PET_UNKNOWN_HELP,
    ],
    sourceLabel: PET_EVIDENCE_SOURCE_LABEL,
    fetchedAtLabel: null,
    scope: "UNKNOWN",
    ...(options.repositoryUnavailable ? { repositoryUnavailable: true } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function requirementsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function fetchedAtLabel(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function detailLinesFromRow(row: PetEvidenceDisplayRow): string[] {
  const raw = asRecord(row.rawPayload);
  const details: string[] = [];
  const companionType = text(raw.acmpyTypeCd);
  if (companionType) details.push(`공식 동반 범위: ${companionType}`);
  for (const requirement of requirementsFrom(row.requirements)) {
    details.push(`필요 사항: ${requirement}`);
  }
  if (text(row.capacityNote)) details.push(`동반 가능 범위: ${text(row.capacityNote)}`);
  if (text(row.facilityNote)) details.push(text(row.facilityNote) as string);
  if (text(row.riskNote)) details.push(`주의 정보: ${text(row.riskNote)}`);
  return [...new Set(details)].slice(0, 5);
}

/** DB/API 내부 상태를 사용자 관점 상태로 변환한다. EMPTY/ERROR/누락은 모두 UNKNOWN이다. */
export function toPetEvidenceDisplay(row: PetEvidenceDisplayRow): PetEvidenceDisplay {
  const status: PetEvidenceDisplayStatus =
    row.status === "SUCCESS" && row.availability === "CONFIRMED"
      ? "CONFIRMED"
      : row.status === "SUCCESS" && row.availability === "CONDITIONAL"
        ? "CONDITIONAL"
        : "UNKNOWN";
  if (status === "UNKNOWN") return unknownPetEvidence();

  return {
    status,
    label: status === "CONFIRMED" ? "공식 동반 정보 확인" : "조건부 동반",
    detailLines: detailLinesFromRow(row),
    sourceLabel: PET_EVIDENCE_SOURCE_LABEL,
    fetchedAtLabel: fetchedAtLabel(row.fetchedAt),
    scope: row.scope === "ALL" ? "ALL" : row.scope === "PARTIAL" ? "PARTIAL" : "UNKNOWN",
  };
}

export function summarizePetEvidence(
  poiIds: readonly string[],
  evidenceByPoiId: Readonly<Record<string, PetEvidenceDisplay>>,
): PetEvidenceSummary {
  const uniquePoiIds = [...new Set(poiIds)];
  return uniquePoiIds.reduce(
    (summary, poiId) => {
      const status = evidenceByPoiId[poiId]?.status ?? "UNKNOWN";
      summary.total++;
      if (status === "CONFIRMED") summary.confirmed++;
      else if (status === "CONDITIONAL") summary.conditional++;
      else summary.unknown++;
      return summary;
    },
    { total: 0, confirmed: 0, conditional: 0, unknown: 0 },
  );
}
