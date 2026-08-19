import { describe, expect, it } from "vitest";
import { resolvePetTourRegionCodes } from "@/lib/domain/petTourRegion";
import { parsePetTourEnrichmentArgs } from "@/lib/domain/petTourEnrichment";

describe("petTour enrichment CLI", () => {
  it("전국 sync와 소량 상한을 파싱한다", () => {
    const parsed = parsePetTourEnrichmentArgs(["--all-regions", "--max-items=10", "--delay-ms=0"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toMatchObject({ allRegions: true, mode: "sync", maxItems: 10, delayMs: 0 });
  });

  it("area 모드는 단일 지역만 허용한다", () => {
    expect(parsePetTourEnrichmentArgs(["--mode=area", "--region-code=SGG_GYEONGJU", "--max-items=10"]).ok).toBe(true);
    expect(parsePetTourEnrichmentArgs(["--mode=area", "--all-regions", "--max-items=10"])).toMatchObject({ ok: false });
  });

  it("상세 호출과 목록 페이지 상한을 거부한다", () => {
    expect(parsePetTourEnrichmentArgs(["--all-regions", "--max-items=101"])).toMatchObject({ ok: false });
    expect(parsePetTourEnrichmentArgs(["--all-regions", "--max-items=10", "--max-list-pages=21"])).toMatchObject({ ok: false });
  });
});

describe("petTour region code mapping", () => {
  it("단일 5자리 행정단위는 동일 코드를 두 공식 API 파라미터에 사용한다", () => {
    expect(
      resolvePetTourRegionCodes({
        apiAreaCode: "36",
        apiSigunguCode: "36110",
        tourApiLdongRegnCd: "36110",
        tourApiLdongSignguCd: null,
      }),
    ).toEqual({ lDongRegnCd: "36110", lDongSignguCd: "36110" });
  });

  it("일반 시군구는 기존 시도·시군구 매핑을 유지한다", () => {
    expect(
      resolvePetTourRegionCodes({
        apiAreaCode: "43",
        apiSigunguCode: "43150",
        tourApiLdongRegnCd: "43",
        tourApiLdongSignguCd: "150",
      }),
    ).toEqual({ lDongRegnCd: "43", lDongSignguCd: "150" });
  });
});
