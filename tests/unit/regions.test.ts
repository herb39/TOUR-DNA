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

  /** 세종특별자치시(SGG_SEJONG)는 예외다 — TourAPI ldongCode2가 시/도 목록 단계에서 이미 세종을
   * 5자리 전체 코드("36110")로 반환하고, 그 코드로 하위 목록을 다시 조회해도 자기 자신만 돌아온다
   * (실 서비스키로 확인, 2026-08-09). 즉 세종은 시군구 하위분류 자체가 없는 TourAPI 조회 단위라
   * apiSigunguCode(36110)를 apiAreaCode(36) + 시군구 3자리로 분해할 수 없다(뒤 3자리가 없음).
   *
   * 전남광주통합 산하 검증된 2곳(SGG_JEONNAM_GWANGJU_110=목포시, SGG_JEONNAM_GWANGJU_210=동구)도
   * 예외다 — TourAPI 통합체계(tourApiLdongRegnCd=12)가 실제 통계청 코드(각각 46/29)와 완전히 다른
   * 번호 체계를 쓴다는 것이 2026-08-09 baseYm=202606 실 서비스키 검증으로 확인됐다(동구의
   * tourApiLdongSignguCd="210" ≠ 통계청 코드 뒤 3자리 "110" — regions.ts의 SGG_JEONNAM_GWANGJU_210
   * 주석 참고). 다른 모든 지역은 이 동일성이 성립해야 한다. */
  it("apiSigunguCode가 있으면 apiAreaCode + 뒤 3자리가 일치한다(통계청 코드 체계 자체 검증, 세종·전남광주통합 예외)", () => {
    const EXCEPTIONS = new Set(["SGG_SEJONG", "SGG_JEONNAM_GWANGJU_110", "SGG_JEONNAM_GWANGJU_210"]);
    for (const r of REGION_SEED.filter((r) => r.level === "SIGUNGU" && !EXCEPTIONS.has(r.code))) {
      if (r.apiSigunguCode && r.apiAreaCode) {
        expect(r.apiSigunguCode.startsWith(r.apiAreaCode)).toBe(true);
        expect(r.apiSigunguCode.slice(r.apiAreaCode.length)).toBe(r.tourApiLdongSignguCd);
      }
    }
  });

  it("세종특별자치시는 apiSigunguCode 자체가 5자리 전체 코드(36110)와 같다(시군구 하위분류 없음, 실 API 확인)", () => {
    const sejong = REGION_SEED.find((r) => r.code === "SGG_SEJONG");
    expect(sejong?.apiSigunguCode).toBe("36110");
    expect(sejong?.tourApiLdongSignguCd).toBeNull();
  });

  it("tourApiLdongRegnCd는 apiAreaCode와 항상 같다(문서에 기록된 코드 체계 동일성 전제, 세종·전남광주통합 예외)", () => {
    const EXCEPTIONS = new Set([
      "SIDO_SEJONG",
      "SGG_SEJONG",
      "SIDO_JEONNAM_GWANGJU",
      "SGG_JEONNAM_GWANGJU_110",
      "SGG_JEONNAM_GWANGJU_210",
    ]);
    for (const r of REGION_SEED) {
      if (EXCEPTIONS.has(r.code)) continue;
      if (r.apiAreaCode && r.tourApiLdongRegnCd) {
        expect(r.tourApiLdongRegnCd).toBe(r.apiAreaCode);
      }
    }
  });

  /** 전국 단위로 보면 "중구"/"동구"/"서구"/"남구"/"북구" 같은 이름이 여러 SIDO에 걸쳐 실제로
   * 반복된다(2026-08-09 전국 확장 시 실 API로 확인 — 예: 서울/부산/대구/울산/대전에 모두 "중구"가
   * 있다). 이름 자체의 전국 유일성은 더 이상 성립하지 않으므로, 실제로 지켜야 하는 불변조건인
   * "같은 SIDO 아래에서는 이름이 겹치지 않는다"로 좁혀 검증한다 — 지역 식별은 이름이 아니라 항상
   * Region.code/parentCode 조합으로 한다는 원칙(사용자 요구사항)과 일치한다. */
  it("같은 SIDO 안에서는 SIGUNGU 지역명이 중복되지 않는다(전국 단위 동일 이름은 SIDO로 구분)", () => {
    const bySido = new Map<string, string[]>();
    for (const r of REGION_SEED.filter((r) => r.level === "SIGUNGU")) {
      const arr = bySido.get(r.parentCode!) ?? [];
      arr.push(r.name);
      bySido.set(r.parentCode!, arr);
    }
    for (const [sidoCode, names] of bySido) {
      expect(new Set(names).size, `${sidoCode} 안에서 지역명 중복`).toBe(names.length);
    }
  });

  /** 2026-08-07 지원지역 확대 Batch 1·2 — 유사지역 비교 모집단을 기존 7곳에서 넓히는 단계.
   * 정확한 최종 개수는 이 테스트가 "최소 N개"만 보장해, Batch 3에서 지역이 더 늘어도 이 테스트를
   * 깨지 않는다. */
  it("지원지역이 기존 7곳보다 늘어났다(Batch 2 이상 반영)", () => {
    const sigunguCount = REGION_SEED.filter((r) => r.level === "SIGUNGU").length;
    expect(sigunguCount).toBeGreaterThanOrEqual(27);
  });

  /** 2026-08-09 전국 Region 마스터 확장 — 실 서비스키로 ldongCode2 전체 목록을 조회해 확인한
   * 전국 16개 SIDO(서울/전남광주통합/부산/대구/인천/대전/울산/경기/충북/충남/경북/경남/제주/
   * 강원/전북/세종)를 전부 등록했는지 회귀 검증한다. 목록이 실제 API 응답과 다르면(예: 명칭이
   * 다시 개편되는 등) 이 테스트가 실패해 조용히 놓치지 않게 한다. */
  it("전국 SIDO 16개가 모두 등록되어 있다(2026-08-09 실 서비스키 ldongCode2 조회 기준)", () => {
    const sidoNames = REGION_SEED.filter((r) => r.level === "SIDO")
      .map((r) => r.name)
      .sort();
    // "전남광주통합특별시"는 광주광역시+전라남도가 통합된 실제 행정구역명이다(실 서비스키 ldongCode2
    // 응답으로 확인, 2026-08-09 — 별도의 "광주광역시"/"전라남도" 항목은 존재하지 않는다).
    expect(sidoNames).toEqual(
      [
        "강원특별자치도",
        "경기도",
        "경상남도",
        "경상북도",
        "대구광역시",
        "대전광역시",
        "부산광역시",
        "서울특별시",
        "세종특별자치시",
        "울산광역시",
        "인천광역시",
        "전남광주통합특별시",
        "전북특별자치도",
        "제주특별자치도",
        "충청남도",
        "충청북도",
      ].sort(),
    );
  });

  /** 전남광주통합특별시(SIDO_JEONNAM_GWANGJU) 산하 27곳 중 25곳은 알려진 예외다 — TourAPI ldongCode2가
   * 반환하는 시/도 코드(12)가 통계청 API에서는 항상 빈 응답을 내고, 실제 통계청 코드(전남 46/
   * 광주 29)는 개별 검증 전까지 "코드를 추측하지 않는다"는 원칙에 따라 null로 남겨뒀다
   * (docs/public-api-status.md에 이미 문서화된 사실, regions.ts의 SIDO_JEONNAM_GWANGJU 주석 참고).
   * 표본 2곳(구 광주 동구·구 전남 목포시)은 2026-08-09에 baseYm=202606 실 서비스키로 개별 검증해
   * 값을 채웠다. 그 외 모든 SIGUNGU는 여전히 누락이 없어야 한다. */
  it("전남광주통합 미검증 25곳을 제외한 모든 SIGUNGU에 apiAreaCode/apiSigunguCode(통계청 코드)가 채워져 있다", () => {
    const missing = REGION_SEED.filter(
      (r) => r.level === "SIGUNGU" && r.parentCode !== "SIDO_JEONNAM_GWANGJU" && (!r.apiAreaCode || !r.apiSigunguCode),
    );
    expect(missing).toEqual([]);

    const jeonnamGwangjuVerified = REGION_SEED.filter(
      (r) => r.parentCode === "SIDO_JEONNAM_GWANGJU" && r.apiAreaCode && r.apiSigunguCode,
    );
    expect(jeonnamGwangjuVerified.map((r) => r.code).sort()).toEqual(
      ["SGG_JEONNAM_GWANGJU_110", "SGG_JEONNAM_GWANGJU_210"].sort(),
    );

    const jeonnamGwangjuMissing = REGION_SEED.filter(
      (r) => r.parentCode === "SIDO_JEONNAM_GWANGJU" && (!r.apiAreaCode || !r.apiSigunguCode),
    );
    expect(jeonnamGwangjuMissing).toHaveLength(25);
  });

  it("검증된 2곳(구 광주 동구·구 전남 목포시)의 통계청 코드가 정확히 반영되어 있다", () => {
    const dongGu = REGION_SEED.find((r) => r.code === "SGG_JEONNAM_GWANGJU_210");
    expect(dongGu?.name).toBe("동구");
    expect(dongGu?.apiAreaCode).toBe("29");
    expect(dongGu?.apiSigunguCode).toBe("29110");

    const mokpo = REGION_SEED.find((r) => r.code === "SGG_JEONNAM_GWANGJU_110");
    expect(mokpo?.name).toBe("목포시");
    expect(mokpo?.apiAreaCode).toBe("46");
    expect(mokpo?.apiSigunguCode).toBe("46110");
  });
});
