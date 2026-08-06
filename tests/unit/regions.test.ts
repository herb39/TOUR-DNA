import { describe, expect, it } from "vitest";
import { REGION_SEED } from "@/lib/fixtures/regions";

/** 지원지역 확대(2026-08-07) — REGION_SEED 자체의 무결성을 코드로 보장한다. 실제 공공데이터 API
 * 응답과의 일치 여부(지역명 대조 등)는 이 파일 범위 밖이다 — 그건 `verify:region` 스크립트와 실제
 * 동기화 실행 시점에 사람이 실 서비스키로 확인한다(docs/public-api-status.md, docs/data-dictionary.md
 * 참고). 여기서는 "코드가 코드 자체로서 일관적인가"만 검증한다. */
describe("REGION_SEED — 무결성", () => {
  it("code가 중복되지 않는다", () => {
    const codes = REGION_SEED.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("모든 SIGUNGU는 실제 존재하는 SIDO code를 parentCode로 가진다", () => {
    const sidoCodes = new Set(REGION_SEED.filter((r) => r.level === "SIDO").map((r) => r.code));
    for (const r of REGION_SEED.filter((r) => r.level === "SIGUNGU")) {
      expect(sidoCodes.has(r.parentCode!)).toBe(true);
    }
  });

  it("SIDO는 parentCode가 null이다", () => {
    for (const r of REGION_SEED.filter((r) => r.level === "SIDO")) {
      expect(r.parentCode).toBeNull();
    }
  });

  it("SIGUNGU code는 SGG_ 접두사, SIDO code는 SIDO_ 접두사를 쓴다", () => {
    for (const r of REGION_SEED) {
      if (r.level === "SIGUNGU") expect(r.code.startsWith("SGG_")).toBe(true);
      else expect(r.code.startsWith("SIDO_")).toBe(true);
    }
  });

  it("apiSigunguCode가 있으면 apiAreaCode + 뒤 3자리가 일치한다(통계청 코드 체계 자체 검증)", () => {
    for (const r of REGION_SEED.filter((r) => r.level === "SIGUNGU")) {
      if (r.apiSigunguCode && r.apiAreaCode) {
        expect(r.apiSigunguCode.startsWith(r.apiAreaCode)).toBe(true);
        expect(r.apiSigunguCode.slice(r.apiAreaCode.length)).toBe(r.tourApiLdongSignguCd);
      }
    }
  });

  it("tourApiLdongRegnCd는 apiAreaCode와 항상 같다(문서에 기록된 코드 체계 동일성 전제)", () => {
    for (const r of REGION_SEED) {
      if (r.apiAreaCode && r.tourApiLdongRegnCd) {
        expect(r.tourApiLdongRegnCd).toBe(r.apiAreaCode);
      }
    }
  });

  it("SIGUNGU 지역명이 서로 중복되지 않는다(같은 이름의 다른 지역을 혼동하지 않도록)", () => {
    const names = REGION_SEED.filter((r) => r.level === "SIGUNGU").map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /** 2026-08-07 지원지역 확대 Batch 1 — 유사지역 비교 모집단을 기존 7곳에서 넓히는 첫 단계. 정확한
   * 최종 개수는 이 테스트가 "최소 N개"만 보장해, Batch 2·3에서 지역이 더 늘어도 이 테스트를 깨지
   * 않는다. */
  it("지원지역이 기존 7곳보다 늘어났다(Batch 1 이상 반영)", () => {
    const sigunguCount = REGION_SEED.filter((r) => r.level === "SIGUNGU").length;
    expect(sigunguCount).toBeGreaterThanOrEqual(17);
  });
});
