import { describe, expect, it } from "vitest";
import { DATA_PROVENANCE_LABEL_KO, PROVENANCE_UNKNOWN_LABEL_KO, provenanceLabel } from "@/lib/format";

describe("provenanceLabel — MISSING과 null/undefined를 서로 다른 문구로 구분한다(2026-08-01 보완)", () => {
  it("MISSING은 '근거 없음'이다(근거를 확인했으나 사용할 근거가 없는 경우)", () => {
    expect(provenanceLabel("MISSING")).toBe("근거 없음");
  });

  it("null은 '판정 정보 없음'이다(레거시 데이터·출처 판정 정보 자체가 없는 경우)", () => {
    expect(provenanceLabel(null)).toBe(PROVENANCE_UNKNOWN_LABEL_KO);
  });

  it("undefined도 '판정 정보 없음'이다", () => {
    expect(provenanceLabel(undefined)).toBe(PROVENANCE_UNKNOWN_LABEL_KO);
  });

  it("null과 MISSING은 서로 다른 문구를 반환한다", () => {
    expect(provenanceLabel(null)).not.toBe(provenanceLabel("MISSING"));
  });

  it("나머지 provenance 값은 각각 고유한 한글 라벨을 반환한다(LIVE_API/CACHED_API/CURATED/ESTIMATED)", () => {
    expect(provenanceLabel("LIVE_API")).toBe(DATA_PROVENANCE_LABEL_KO.LIVE_API);
    expect(provenanceLabel("CACHED_API")).toBe(DATA_PROVENANCE_LABEL_KO.CACHED_API);
    expect(provenanceLabel("CURATED")).toBe(DATA_PROVENANCE_LABEL_KO.CURATED);
    expect(provenanceLabel("ESTIMATED")).toBe(DATA_PROVENANCE_LABEL_KO.ESTIMATED);

    const labels = [
      provenanceLabel("LIVE_API"),
      provenanceLabel("CACHED_API"),
      provenanceLabel("CURATED"),
      provenanceLabel("ESTIMATED"),
      provenanceLabel("MISSING"),
      provenanceLabel(null),
    ];
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("내부 enum 이름을 화면 문구에 그대로 노출하지 않는다", () => {
    for (const value of ["LIVE_API", "CACHED_API", "CURATED", "ESTIMATED", "MISSING"] as const) {
      expect(provenanceLabel(value)).not.toBe(value);
    }
  });
});
