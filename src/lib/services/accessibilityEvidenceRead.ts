import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  ACCESSIBILITY_EVIDENCE_SOURCE_LABEL,
  toAccessibilityEvidenceDisplay,
  unknownAccessibilityEvidence,
  type AccessibilityEvidenceDisplay,
  type AccessibilityEvidenceDisplayRow,
} from "@/lib/domain/accessibilityEvidenceDisplay";

export interface AccessibilityEvidenceReadResult {
  repository: "AVAILABLE" | "UNAVAILABLE";
  byPoiId: Record<string, AccessibilityEvidenceDisplay>;
  message?: string;
}

const ACCESSIBILITY_REPOSITORY_UNAVAILABLE_MESSAGE = "현재 환경에서는 공식 접근성 정보 확인 기능을 사용할 수 없습니다.";
let accessibilityEvidenceTableUnavailable = false;

export function isMissingAccessibilityEvidenceSchemaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    return true;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "P2021" || code === "P2022") return true;
  }
  return error instanceof Error && /PoiConditionEvidence|poi condition evidence|does not exist|column .* does not exist/i.test(error.message);
}

function unknownMap(poiIds: readonly string[], repositoryUnavailable: boolean): Record<string, AccessibilityEvidenceDisplay> {
  return Object.fromEntries(
    [...new Set(poiIds)].map((poiId) => [poiId, unknownAccessibilityEvidence({ repositoryUnavailable })]),
  );
}

/** 한 화면에서 필요한 POI의 ACCESSIBILITY evidence를 한 번의 IN 조회로 읽는다. */
export async function getAccessibilityEvidenceForPoiIds(poiIds: readonly string[]): Promise<AccessibilityEvidenceReadResult> {
  const uniquePoiIds = [...new Set(poiIds)].filter((poiId) => poiId.trim().length > 0);
  if (uniquePoiIds.length === 0) return { repository: "AVAILABLE", byPoiId: {} };
  if (accessibilityEvidenceTableUnavailable) {
    return {
      repository: "UNAVAILABLE",
      byPoiId: unknownMap(uniquePoiIds, true),
      message: ACCESSIBILITY_REPOSITORY_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const rows = await prisma.poiConditionEvidence.findMany({
      where: { conditionType: "ACCESSIBILITY", poiId: { in: uniquePoiIds } },
      select: {
        poiId: true,
        status: true,
        dimensionDetails: true,
        sourceCode: true,
        fetchedAt: true,
      },
    });
    const byPoiId: Record<string, AccessibilityEvidenceDisplay> = {};
    for (const row of rows) {
      byPoiId[row.poiId] = toAccessibilityEvidenceDisplay(row as AccessibilityEvidenceDisplayRow);
    }
    return { repository: "AVAILABLE", byPoiId };
  } catch (error) {
    if (!isMissingAccessibilityEvidenceSchemaError(error)) throw error;
    accessibilityEvidenceTableUnavailable = true;
    return {
      repository: "UNAVAILABLE",
      byPoiId: unknownMap(uniquePoiIds, true),
      message: ACCESSIBILITY_REPOSITORY_UNAVAILABLE_MESSAGE,
    };
  }
}

export { ACCESSIBILITY_EVIDENCE_SOURCE_LABEL };
