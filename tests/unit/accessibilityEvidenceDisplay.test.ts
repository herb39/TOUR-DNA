import { describe, expect, it } from "vitest";
import {
  summarizeAccessibilityEvidence,
  toAccessibilityEvidenceDisplay,
  unknownAccessibilityEvidence,
} from "@/lib/domain/accessibilityEvidenceDisplay";

describe("accessibilityEvidenceDisplay", () => {
  it("공식 evidence를 차원 우선순위·사용자 문구로 변환한다", () => {
    const result = toAccessibilityEvidenceDisplay({
      status: "SUCCESS",
      sourceCode: "TOUR_ACCESSIBILITY_DETAIL",
      fetchedAt: new Date("2026-08-25T00:00:00.000Z"),
      dimensionDetails: {
        parking: { status: "AVAILABLE", rawText: "<b>주차 가능</b>" },
        restroom: { status: "CONDITIONAL", rawText: "사전 문의 필요" },
        route: { status: "UNKNOWN", rawText: null },
      },
    });

    expect(result.status).toBe("OFFICIAL_INFO_AVAILABLE");
    expect(result.dimensions[0]).toMatchObject({ key: "parking", statusLabel: "이용 가능/설치 정보 있음", rawText: "주차 가능" });
    expect(result.dimensions[1]).toMatchObject({ key: "restroom", statusLabel: "조건 또는 사전 확인 필요" });
    expect(result.fetchedAtLabel).toBe("2026.08.25");
  });

  it("EMPTY·누락·전체 UNKNOWN은 overall 불가가 아닌 공식 정보 미확인으로 처리한다", () => {
    const empty = toAccessibilityEvidenceDisplay({
      status: "EMPTY",
      sourceCode: "TOUR_ACCESSIBILITY_DETAIL",
      fetchedAt: "2026-08-25T00:00:00.000Z",
      dimensionDetails: null,
    });

    expect(empty.status).toBe("OFFICIAL_INFO_UNKNOWN");
    expect(empty.label).toBe("공식 접근성 정보 미확인");
    expect(empty.label).not.toContain("불가");
    expect(unknownAccessibilityEvidence().status).toBe("OFFICIAL_INFO_UNKNOWN");
  });

  it("요약은 중복 POI를 한 번만 계산한다", () => {
    const available = toAccessibilityEvidenceDisplay({
      status: "SUCCESS",
      sourceCode: "TOUR_ACCESSIBILITY_DETAIL",
      fetchedAt: "2026-08-25T00:00:00.000Z",
      dimensionDetails: { parking: { status: "AVAILABLE", rawText: "주차 가능" } },
    });
    const summary = summarizeAccessibilityEvidence(["poi-1", "poi-1", "poi-2"], { "poi-1": available });

    expect(summary).toEqual({ total: 2, available: 1, unknown: 1 });
  });
});
