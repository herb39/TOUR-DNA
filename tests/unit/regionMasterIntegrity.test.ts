import { describe, expect, it } from "vitest";
import {
  checkRegionMasterIntegrity,
  isRegionMasterHealthy,
  type RegionMasterEntry,
} from "@/lib/services/regionMasterIntegrity";
import { REGION_SEED } from "@/lib/fixtures/regions";

const SIDO: RegionMasterEntry = {
  code: "SIDO_A",
  name: "가상시도",
  level: "SIDO",
  parentCode: null,
  apiAreaCode: "90",
  apiSigunguCode: null,
  tourApiLdongRegnCd: "90",
  tourApiLdongSignguCd: null,
};

const SGG: RegionMasterEntry = {
  code: "SGG_A",
  name: "가상시",
  level: "SIGUNGU",
  parentCode: "SIDO_A",
  apiAreaCode: "90",
  apiSigunguCode: "90100",
  tourApiLdongRegnCd: "90",
  tourApiLdongSignguCd: "100",
};

describe("checkRegionMasterIntegrity — 합성 데이터로 각 결함 유형을 개별 검증", () => {
  it("정상 데이터는 아무 결함도 검출하지 않는다", () => {
    const result = checkRegionMasterIntegrity([SIDO, SGG]);
    expect(result.totalSido).toBe(1);
    expect(result.totalSigungu).toBe(1);
    expect(isRegionMasterHealthy(result)).toBe(true);
  });

  it("Region.code 중복을 검출한다", () => {
    const dupe = { ...SGG, apiSigunguCode: "90200", tourApiLdongSignguCd: "200" };
    const result = checkRegionMasterIntegrity([SIDO, SGG, dupe]);
    expect(result.duplicateRegionCodes).toEqual(["SGG_A"]);
    expect(isRegionMasterHealthy(result)).toBe(false);
  });

  it("parentCode가 null인 SIGUNGU를 검출한다", () => {
    const orphan = { ...SGG, code: "SGG_B", parentCode: null };
    const result = checkRegionMasterIntegrity([SIDO, orphan]);
    expect(result.sigunguWithoutValidParent).toEqual(["SGG_B"]);
  });

  it("parentCode가 존재하지 않는 SIDO를 가리키는 SIGUNGU를 검출한다", () => {
    const orphan = { ...SGG, code: "SGG_B", parentCode: "SIDO_NOT_EXIST" };
    const result = checkRegionMasterIntegrity([SIDO, orphan]);
    expect(result.sigunguWithoutValidParent).toEqual(["SGG_B"]);
  });

  it("apiAreaCode 또는 apiSigunguCode가 없는 SIGUNGU를 검출한다", () => {
    const noArea = { ...SGG, code: "SGG_B", apiAreaCode: null };
    const noSgg = { ...SGG, code: "SGG_C", apiSigunguCode: null };
    const result = checkRegionMasterIntegrity([SIDO, noArea, noSgg]);
    expect(result.sigunguMissingStatCode.sort()).toEqual(["SGG_B", "SGG_C"]);
  });

  it("tourApiLdongRegnCd가 없는 SIGUNGU는 참고 목록에만 잡히고 치명적 결함으로 취급하지 않는다", () => {
    const noLdong = { ...SGG, code: "SGG_B", apiSigunguCode: "90200", tourApiLdongSignguCd: "200", tourApiLdongRegnCd: null };
    const result = checkRegionMasterIntegrity([SIDO, SGG, noLdong]);
    expect(result.sigunguMissingLdongCode).toEqual(["SGG_B"]);
    expect(isRegionMasterHealthy(result)).toBe(true);
  });

  it("apiSigunguCode(5자리 전체) 중복을 검출한다", () => {
    const dupeCode = { ...SGG, code: "SGG_B" }; // apiSigunguCode를 그대로 재사용
    const result = checkRegionMasterIntegrity([SIDO, SGG, dupeCode]);
    expect(result.duplicateApiSigunguCode).toEqual(["90100"]);
  });

  it("같은 SIDO 안에서 tourApiLdongSignguCd(시군구 3자리) 중복을 검출한다", () => {
    const dupeSignguCd = { ...SGG, code: "SGG_B", apiSigunguCode: "90100X" };
    const result = checkRegionMasterIntegrity([SIDO, SGG, dupeSignguCd]);
    expect(result.duplicateSigunguCodeWithinSido).toEqual(["SIDO_A:100"]);
  });

  it("다른 SIDO에서 같은 tourApiLdongSignguCd를 쓰는 것은 정상이라 검출하지 않는다(예: 강릉시·양양군이 둘 다 시군구 3자리를 공유해도 SIDO가 다르면 무관)", () => {
    const otherSido: RegionMasterEntry = { ...SIDO, code: "SIDO_B", apiAreaCode: "91", tourApiLdongRegnCd: "91" };
    const sggInOtherSido: RegionMasterEntry = {
      ...SGG,
      code: "SGG_B",
      parentCode: "SIDO_B",
      apiAreaCode: "91",
      apiSigunguCode: "91100",
      tourApiLdongRegnCd: "91",
    };
    const result = checkRegionMasterIntegrity([SIDO, SGG, otherSido, sggInOtherSido]);
    expect(result.duplicateSigunguCodeWithinSido).toEqual([]);
  });
});

describe("checkRegionMasterIntegrity — 실제 REGION_SEED 전국 무결성(2026-08-09 전국 확장)", () => {
  /** 2026-08-09 전남광주통합 통계 코드 완성 — 27개 SIGUNGU 전부 실응답 기반으로 apiAreaCode/
   * apiSigunguCode를 확보했다(regions.ts의 SIDO_JEONNAM_GWANGJU 주석 참고: 대표 2곳은 4개 통계
   * 소스 직접 조회, 나머지 25곳은 VISITOR_CNT 전국 응답 이름 대조 + 대표 4곳 교차검증). 따라서
   * sigunguMissingStatCode는 이제 완전히 비어 있어야 하고, 무결성 전체가 통과해야 한다. */
  it("실제 REGION_SEED는 전남광주통합 27곳을 포함해 모든 무결성 검사를 통과한다(알려진 예외 없음)", () => {
    const result = checkRegionMasterIntegrity(REGION_SEED);
    const jeonnamGwangjuSigungu = REGION_SEED.filter((r) => r.parentCode === "SIDO_JEONNAM_GWANGJU").map((r) => r.code);
    expect(jeonnamGwangjuSigungu).toHaveLength(27);

    expect(result.duplicateRegionCodes).toEqual([]);
    expect(result.sigunguWithoutValidParent).toEqual([]);
    expect(result.sigunguMissingStatCode).toEqual([]);
    expect(result.duplicateSigunguCodeWithinSido).toEqual([]);
    expect(result.duplicateApiSigunguCode).toEqual([]);
    expect(isRegionMasterHealthy(result)).toBe(true);
  });

  it("실제 조회된 REGION_SEED 기준 SIDO/SIGUNGU 수를 보고한다(하드코딩된 추정치가 아니라 실제 배열 길이)", () => {
    const result = checkRegionMasterIntegrity(REGION_SEED);
    expect(result.totalSido).toBe(REGION_SEED.filter((r) => r.level === "SIDO").length);
    expect(result.totalSigungu).toBe(REGION_SEED.filter((r) => r.level === "SIGUNGU").length);
  });

  it("세종(SGG_SEJONG)은 tourApiLdongRegnCd가 없는 참고 목록에 잡히지 않는다(TourAPI가 5자리 전체 코드를 자체 lDongRegnCd로 쓰기 때문)", () => {
    const result = checkRegionMasterIntegrity(REGION_SEED);
    expect(result.sigunguMissingLdongCode).not.toContain("SGG_SEJONG");
  });
});
