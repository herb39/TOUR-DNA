import { beforeEach, describe, expect, it, vi } from "vitest";

const evidenceFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { poiConditionEvidence: { findMany: (...args: unknown[]) => evidenceFindMany(...args) } },
}));

import { getPetEvidenceForPoiIds, isMissingPetEvidenceSchemaError } from "@/lib/services/petTourEvidenceRead";

beforeEach(() => {
  evidenceFindMany.mockReset();
});

describe("petTourEvidenceRead", () => {
  it("POI id가 없으면 DB를 조회하지 않는다", async () => {
    await expect(getPetEvidenceForPoiIds(["", "  ", ""])).resolves.toEqual({ repository: "AVAILABLE", byPoiId: {} });
    expect(evidenceFindMany).not.toHaveBeenCalled();
  });

  it("후보·코스 POI를 하나의 IN 조회로 읽고 POI별 map으로 변환한다", async () => {
    evidenceFindMany.mockResolvedValue([
      {
        poiId: "poi-1",
        status: "SUCCESS",
        availability: "CONFIRMED",
        scope: "ALL",
        requirements: [],
        capacityNote: null,
        riskNote: null,
        facilityNote: null,
        rawPayload: { acmpyTypeCd: "전구역 동반가능" },
        sourceCode: "detailPetTour2",
        fetchedAt: new Date("2026-08-19T00:00:00.000Z"),
      },
    ]);

    const result = await getPetEvidenceForPoiIds(["poi-1", "poi-1", "poi-2"]);

    expect(evidenceFindMany).toHaveBeenCalledTimes(1);
    expect(evidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conditionType: "PET", poiId: { in: ["poi-1", "poi-2"] } } }),
    );
    expect(result.repository).toBe("AVAILABLE");
    expect(result.byPoiId["poi-1"]?.status).toBe("CONFIRMED");
    expect(result.byPoiId["poi-2"]).toBeUndefined();
  });

  it("PoiConditionEvidence 테이블이 없으면 UNKNOWN unavailable로 안전하게 fallback한다", async () => {
    evidenceFindMany.mockRejectedValue({ code: "P2021", message: "The table `public.PoiConditionEvidence` does not exist." });

    const result = await getPetEvidenceForPoiIds(["poi-1"]);

    expect(result.repository).toBe("UNAVAILABLE");
    expect(result.byPoiId["poi-1"]?.status).toBe("UNKNOWN");
    expect(result.byPoiId["poi-1"]?.repositoryUnavailable).toBe(true);
    expect(result.message).toContain("현재 환경에서는");
    expect(isMissingPetEvidenceSchemaError({ code: "P2021" })).toBe(true);
    expect(isMissingPetEvidenceSchemaError(new Error("PoiConditionEvidence does not exist"))).toBe(true);
  });
});
