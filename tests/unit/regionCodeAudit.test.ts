// @vitest-environment node
import { describe, expect, it } from "vitest";
import { auditRegionCodes, type RegionLike } from "@/lib/services/regionCodeAudit";

function region(overrides: Partial<RegionLike> & Pick<RegionLike, "code" | "name" | "level">): RegionLike {
  return { apiAreaCode: null, apiSigunguCode: null, ...overrides };
}

describe("auditRegionCodes", () => {
  it("SIGUNGU인데 apiSigunguCode가 없으면 코드 누락으로 탐지한다", () => {
    const regions = [region({ code: "SGG_X", name: "X시", level: "SIGUNGU", apiAreaCode: "30" })];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(), apiSignguCodes: new Set() });
    expect(result.issues).toEqual([
      expect.objectContaining({ type: "MISSING_CODE", regionCode: "SGG_X" }),
    ]);
    expect(result.okCount).toBe(0);
  });

  it("SIDO인데 apiAreaCode가 없으면 코드 누락으로 탐지한다", () => {
    const regions = [region({ code: "SIDO_X", name: "X도", level: "SIDO" })];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(), apiSignguCodes: new Set() });
    expect(result.issues.some((i) => i.type === "MISSING_CODE" && i.regionCode === "SIDO_X")).toBe(true);
  });

  it("apiAreaCode가 부모 SIDO 자식들 사이에 공유되는 것은 정상 구조라 중복으로 취급하지 않는다", () => {
    const regions = [
      region({ code: "SIDO_GANGWON", name: "강원", level: "SIDO", apiAreaCode: "51" }),
      region({ code: "SGG_GANGNEUNG", name: "강릉시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" }),
      region({ code: "SGG_YANGYANG", name: "양양군", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51830" }),
    ];
    const result = auditRegionCodes({
      regions,
      apiAreaCodes: new Set(["51"]),
      apiSignguCodes: new Set(["51150", "51830"]),
    });
    expect(result.issues.filter((i) => i.type === "DUPLICATE_CODE")).toEqual([]);
  });

  it("서로 다른 SIDO가 같은 apiAreaCode를 쓰면 중복으로 탐지한다", () => {
    const regions = [
      region({ code: "SIDO_A", name: "A도", level: "SIDO", apiAreaCode: "51" }),
      region({ code: "SIDO_B", name: "B도", level: "SIDO", apiAreaCode: "51" }),
    ];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(["51"]), apiSignguCodes: new Set() });
    const dup = result.issues.filter((i) => i.type === "DUPLICATE_CODE");
    expect(dup).toHaveLength(2);
    expect(dup.map((d) => d.regionCode).sort()).toEqual(["SIDO_A", "SIDO_B"]);
  });

  it("서로 다른 SIGUNGU가 같은 apiSigunguCode를 쓰면 중복으로 탐지한다", () => {
    const regions = [
      region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" }),
      region({ code: "SGG_B", name: "B시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" }),
    ];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(), apiSignguCodes: new Set(["51150"]) });
    expect(result.issues.filter((i) => i.type === "DUPLICATE_CODE")).toHaveLength(2);
  });

  it("자릿수가 틀린 코드를 형식 오류로 탐지한다", () => {
    const regions = [
      region({ code: "SIDO_A", name: "A도", level: "SIDO", apiAreaCode: "5" }), // 1자리(2자리 기대) — 형식 오류
      region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "5150" }), // apiAreaCode는 정상(2자리), apiSigunguCode가 4자리(5자리 기대) — 형식 오류
    ];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(), apiSignguCodes: new Set() });
    const formatIssues = result.issues.filter((i) => i.type === "INVALID_FORMAT");
    expect(formatIssues.map((i) => i.regionCode).sort()).toEqual(["SGG_A", "SIDO_A"]);
  });

  it("API 응답에는 있지만 Region에 없는 코드를 API_ONLY로 탐지한다", () => {
    const regions = [region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" })];
    const result = auditRegionCodes({
      regions,
      apiAreaCodes: new Set(["51"]),
      apiSignguCodes: new Set(["51150", "51830"]), // 51830은 Region에 없음
    });
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "API_ONLY", apiCode: "51830" }));
  });

  it("Region에는 있지만 API 응답에서 발견되지 않는 코드를 REGION_ONLY로 탐지한다", () => {
    const regions = [region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" })];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(["51"]), apiSignguCodes: new Set() }); // 51150이 API에 없음
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "REGION_ONLY", regionCode: "SGG_A", apiCode: "51150" }));
  });

  it("강릉·경주·제천 코드가 모두 정상 매핑이면 highlights가 전부 OK다", () => {
    const regions = [
      region({ code: "SGG_GANGNEUNG", name: "강릉시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" }),
      region({ code: "SGG_GYEONGJU", name: "경주시", level: "SIGUNGU", apiAreaCode: "47", apiSigunguCode: "47130" }),
      region({ code: "SGG_JECHEON", name: "제천시", level: "SIGUNGU", apiAreaCode: "43", apiSigunguCode: "43150" }),
    ];
    const result = auditRegionCodes({
      regions,
      apiAreaCodes: new Set(["51", "47", "43"]),
      apiSignguCodes: new Set(["51150", "47130", "43150"]),
    });
    expect(result.highlights).toEqual([
      expect.objectContaining({ regionCode: "SGG_GANGNEUNG", status: "OK" }),
      expect.objectContaining({ regionCode: "SGG_GYEONGJU", status: "OK" }),
      expect.objectContaining({ regionCode: "SGG_JECHEON", status: "OK" }),
    ]);
  });

  it("강릉·경주·제천 중 Region 자체가 없으면 NOT_FOUND로 표시한다", () => {
    const regions = [region({ code: "SGG_GYEONGJU", name: "경주시", level: "SIGUNGU", apiAreaCode: "47", apiSigunguCode: "47130" })];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(["47"]), apiSignguCodes: new Set(["47130"]) });
    const gangneung = result.highlights.find((h) => h.regionCode === "SGG_GANGNEUNG");
    expect(gangneung?.status).toBe("NOT_FOUND");
  });

  it("기초(signguCode) API가 오류였으면(null) signguCode 범위만 판정을 생략하고, areaCode 범위는 정상 검출한다", () => {
    const regions = [
      region({ code: "SIDO_A", name: "A도", level: "SIDO", apiAreaCode: "51" }),
      region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" }),
    ];
    // signguCode 범위(null, API 오류)는 51150이 API에 있는지 확인 불가 — 판정을 생략해야 한다.
    // areaCode 범위는 정상 조회됐지만 "51"이 그 응답에 없다 — REGION_ONLY로 정상 검출돼야 한다(오탐
    // 방지가 광역 범위의 진짜 탐지까지 함께 지워버리면 안 된다).
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(["99"]), apiSignguCodes: null });

    expect(result.signguCodeVerificationSkipped).toBe(true);
    expect(result.areaCodeVerificationSkipped).toBe(false);
    // signguCode(51150) 관련 API_ONLY/REGION_ONLY는 생략되어 나타나지 않는다.
    expect(result.issues.some((i) => i.apiCode === "51150")).toBe(false);
    // areaCode(51) 관련 REGION_ONLY는 정상적으로 검출된다.
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "REGION_ONLY", level: "SIDO", apiCode: "51" }));
  });

  it("광역(areaCode) API가 오류였으면(null) areaCode 범위만 판정을 생략하고, signguCode 범위는 정상 검출한다", () => {
    const regions = [
      region({ code: "SIDO_A", name: "A도", level: "SIDO", apiAreaCode: "51" }),
      region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" }),
    ];
    // signguCode 범위는 정상 조회됐지만 "51150"이 그 응답에 없다 — REGION_ONLY로 정상 검출돼야 한다.
    const result = auditRegionCodes({ regions, apiAreaCodes: null, apiSignguCodes: new Set(["99999"]) });

    expect(result.areaCodeVerificationSkipped).toBe(true);
    expect(result.signguCodeVerificationSkipped).toBe(false);
    // areaCode(51) 관련 API_ONLY/REGION_ONLY는 생략되어 나타나지 않는다.
    expect(result.issues.some((i) => i.apiCode === "51")).toBe(false);
    // signguCode(51150) 관련 REGION_ONLY는 정상적으로 검출된다.
    expect(result.issues).toContainEqual(expect.objectContaining({ type: "REGION_ONLY", level: "SIGUNGU", apiCode: "51150" }));
  });

  it("두 범위 모두 정상 응답이면 areaCode/signguCode 검증 스킵 플래그가 모두 false다", () => {
    const regions = [region({ code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "51", apiSigunguCode: "51150" })];
    const result = auditRegionCodes({ regions, apiAreaCodes: new Set(["51"]), apiSignguCodes: new Set(["51150"]) });
    expect(result.areaCodeVerificationSkipped).toBe(false);
    expect(result.signguCodeVerificationSkipped).toBe(false);
  });
});
