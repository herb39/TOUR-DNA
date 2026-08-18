import { describe, expect, it } from "vitest";
import {
  PET_UNKNOWN_HELP,
  PET_UNKNOWN_MESSAGE,
  summarizePetEvidence,
  toPetEvidenceDisplay,
  unknownPetEvidence,
} from "@/lib/domain/petTourEvidenceDisplay";

const baseRow = {
  status: "SUCCESS",
  availability: "CONFIRMED",
  scope: "ALL",
  requirements: ["목줄 필요"],
  capacityNote: null,
  riskNote: null,
  facilityNote: null,
  rawPayload: { acmpyTypeCd: "전구역 동반가능" },
  sourceCode: "detailPetTour2",
  fetchedAt: new Date("2026-08-19T00:00:00.000Z"),
};

describe("petTourEvidenceDisplay", () => {
  it("공식 확인 상태는 원문 근거와 확인일을 짧게 표시한다", () => {
    const display = toPetEvidenceDisplay(baseRow);

    expect(display.status).toBe("CONFIRMED");
    expect(display.label).toBe("공식 동반 정보 확인");
    expect(display.detailLines).toContain("공식 동반 범위: 전구역 동반가능");
    expect(display.detailLines).toContain("필요 사항: 목줄 필요");
    expect(display.fetchedAtLabel).toBe("2026.08.19");
  });

  it("조건부 상태는 이용 불가가 아니라 조건부 동반으로 변환한다", () => {
    const display = toPetEvidenceDisplay({
      ...baseRow,
      availability: "CONDITIONAL",
      scope: "PARTIAL",
      rawPayload: { acmpyTypeCd: "일부 구역" },
    });

    expect(display.status).toBe("CONDITIONAL");
    expect(display.label).toBe("조건부 동반");
    expect(display.scope).toBe("PARTIAL");
  });

  it.each([
    ["EMPTY", "CONFIRMED"],
    ["ERROR", "CONDITIONAL"],
    ["SUCCESS", "UNKNOWN"],
  ])("%s 또는 모호한 근거는 UNKNOWN으로 안전하게 처리한다", (status, availability) => {
    const display = toPetEvidenceDisplay({ ...baseRow, status, availability });

    expect(display.status).toBe("UNKNOWN");
    expect(display.detailLines).toContain(PET_UNKNOWN_MESSAGE);
    expect(display.detailLines).toContain(PET_UNKNOWN_HELP);
  });

  it("row가 없거나 저장소가 unavailable이어도 미확인과 이용 불가를 구분한다", () => {
    const unknown = unknownPetEvidence();
    const unavailable = unknownPetEvidence({ repositoryUnavailable: true });

    expect(unknown.status).toBe("UNKNOWN");
    expect(unknown.repositoryUnavailable).toBeUndefined();
    expect(unavailable.repositoryUnavailable).toBe(true);
    expect(unavailable.detailLines[0]).toContain("현재 환경에서는");
  });

  it("POI별 중복을 제거해 상태 개수를 계산한다", () => {
    const summary = summarizePetEvidence(
      ["confirmed", "conditional", "unknown", "confirmed"],
      {
        confirmed: toPetEvidenceDisplay(baseRow),
        conditional: toPetEvidenceDisplay({ ...baseRow, availability: "CONDITIONAL" }),
      },
    );

    expect(summary).toEqual({ total: 3, confirmed: 1, conditional: 1, unknown: 1 });
  });
});
