import { beforeEach, describe, expect, it, vi } from "vitest";

const evidenceFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { poiConditionEvidence: { findMany: (...args: unknown[]) => evidenceFindMany(...args) } },
}));

import { getAccessibilityEvidenceForPoiIds, isMissingAccessibilityEvidenceSchemaError } from "@/lib/services/accessibilityEvidenceRead";

beforeEach(() => {
  evidenceFindMany.mockReset();
});

describe("accessibilityEvidenceRead", () => {
  it("POI id가 없으면 DB를 조회하지 않는다", async () => {
    await expect(getAccessibilityEvidenceForPoiIds(["", "  ", ""])).resolves.toEqual({ repository: "AVAILABLE", byPoiId: {} });
    expect(evidenceFindMany).not.toHaveBeenCalled();
  });

  it("후보·코스 POI를 ACCESSIBILITY 조건으로 한 번에 조회한다", async () => {
    evidenceFindMany.mockResolvedValue([
      {
        poiId: "poi-1",
        status: "SUCCESS",
        dimensionDetails: {
          parking: { status: "AVAILABLE", rawText: "주차 가능" },
          restroom: { status: "UNKNOWN", rawText: null },
        },
        sourceCode: "TOUR_ACCESSIBILITY_DETAIL",
        fetchedAt: new Date("2026-08-25T00:00:00.000Z"),
      },
    ]);

    const result = await getAccessibilityEvidenceForPoiIds(["poi-1", "poi-1", "poi-2"]);

    expect(evidenceFindMany).toHaveBeenCalledTimes(1);
    expect(evidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conditionType: "ACCESSIBILITY", poiId: { in: ["poi-1", "poi-2"] } } }),
    );
    expect(result.byPoiId["poi-1"]?.status).toBe("OFFICIAL_INFO_AVAILABLE");
    expect(result.byPoiId["poi-1"]?.dimensions[0]).toMatchObject({ key: "parking", status: "AVAILABLE" });
    expect(result.byPoiId["poi-2"]).toBeUndefined();
  });

  it("공식 목록 외·evidence 누락은 접근 불가가 아닌 미확인으로 변환한다", async () => {
    evidenceFindMany.mockResolvedValue([
      {
        poiId: "poi-empty",
        status: "EMPTY",
        dimensionDetails: null,
        sourceCode: "TOUR_ACCESSIBILITY_DETAIL",
        fetchedAt: new Date("2026-08-25T00:00:00.000Z"),
      },
    ]);

    const result = await getAccessibilityEvidenceForPoiIds(["poi-empty", "poi-missing"]);

    expect(result.byPoiId["poi-empty"]?.status).toBe("OFFICIAL_INFO_UNKNOWN");
    expect(result.byPoiId["poi-missing"]).toBeUndefined();
  });

  it("PoiConditionEvidence 테이블이 없으면 미확인으로 안전하게 fallback한다", async () => {
    evidenceFindMany.mockRejectedValue({ code: "P2021", message: "The table `public.PoiConditionEvidence` does not exist." });

    const result = await getAccessibilityEvidenceForPoiIds(["poi-1"]);

    expect(result.repository).toBe("UNAVAILABLE");
    expect(result.byPoiId["poi-1"]?.status).toBe("OFFICIAL_INFO_UNKNOWN");
    expect(result.byPoiId["poi-1"]?.repositoryUnavailable).toBe(true);
    expect(result.message).toContain("현재 환경에서는");
    expect(isMissingAccessibilityEvidenceSchemaError({ code: "P2021" })).toBe(true);
  });
});
