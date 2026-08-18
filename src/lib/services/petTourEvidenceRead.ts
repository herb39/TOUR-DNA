import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  toPetEvidenceDisplay,
  unknownPetEvidence,
  PET_REPOSITORY_UNAVAILABLE_MESSAGE,
  type PetEvidenceDisplay,
  type PetEvidenceDisplayRow,
} from "@/lib/domain/petTourEvidenceDisplay";

export interface PetEvidenceReadResult {
  repository: "AVAILABLE" | "UNAVAILABLE";
  byPoiId: Record<string, PetEvidenceDisplay>;
  message?: string;
}

let petEvidenceTableUnavailable = false;

export function isMissingPetEvidenceSchemaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    return true;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "P2021" || code === "P2022") return true;
  }
  return error instanceof Error && /PoiConditionEvidence|poi condition evidence|does not exist|column .* does not exist/i.test(error.message);
}

function unknownMap(poiIds: readonly string[], repositoryUnavailable: boolean): Record<string, PetEvidenceDisplay> {
  return Object.fromEntries([...new Set(poiIds)].map((poiId) => [poiId, unknownPetEvidence({ repositoryUnavailable })]));
}

/** PET 조건이 활성화된 한 화면에서 필요한 POI id를 한 번에 조회한다. 빈 입력은 DB를 조회하지 않는다. */
export async function getPetEvidenceForPoiIds(poiIds: readonly string[]): Promise<PetEvidenceReadResult> {
  const uniquePoiIds = [...new Set(poiIds)].filter((poiId) => poiId.trim().length > 0);
  if (uniquePoiIds.length === 0) return { repository: "AVAILABLE", byPoiId: {} };
  if (petEvidenceTableUnavailable) {
    return {
      repository: "UNAVAILABLE",
      byPoiId: unknownMap(uniquePoiIds, true),
      message: PET_REPOSITORY_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const rows = await prisma.poiConditionEvidence.findMany({
      where: { conditionType: "PET", poiId: { in: uniquePoiIds } },
      select: {
        poiId: true,
        status: true,
        availability: true,
        scope: true,
        requirements: true,
        capacityNote: true,
        riskNote: true,
        facilityNote: true,
        rawPayload: true,
        sourceCode: true,
        fetchedAt: true,
      },
    });
    const byPoiId: Record<string, PetEvidenceDisplay> = {};
    for (const row of rows) {
      byPoiId[row.poiId] = toPetEvidenceDisplay(row as PetEvidenceDisplayRow);
    }
    return { repository: "AVAILABLE", byPoiId };
  } catch (error) {
    if (!isMissingPetEvidenceSchemaError(error)) throw error;
    petEvidenceTableUnavailable = true;
    return {
      repository: "UNAVAILABLE",
      byPoiId: unknownMap(uniquePoiIds, true),
      message: PET_REPOSITORY_UNAVAILABLE_MESSAGE,
    };
  }
}
