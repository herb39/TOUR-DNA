import { describe, expect, it } from "vitest";
import { isAutoTourismCandidate, isGenericLocalSupportPoi } from "@/lib/domain/poiRecommendation";

describe("poiRecommendation — 자동 후보 대표성 보수화", () => {
  it("도시공원·캠핑장·가로수길은 공식 테마 분류와 별개로 보조시설로 분류한다", () => {
    expect(isGenericLocalSupportPoi({ name: "청주 발산공원", category: "ATTRACTION", lclsSystm1: "VE", lclsSystm2: "VE03" })).toBe(true);
    expect(isGenericLocalSupportPoi({ name: "문암생태공원캠핑장", category: "EXPERIENCE", lclsSystm1: "AC", lclsSystm2: "AC05" })).toBe(true);
    expect(isGenericLocalSupportPoi({ name: "청주 가로수길", category: "ATTRACTION", lclsSystm1: "NA", lclsSystm2: "NA05" })).toBe(true);
    expect(isGenericLocalSupportPoi({ name: "바른스포츠월드", category: "ATTRACTION", lclsSystm1: "EX", lclsSystm2: "EX07" })).toBe(true);
  });

  it("숙박은 일반 관광 후보가 아니며, 사용자가 직접 추가하는 수동 경로와 분리할 수 있다", () => {
    expect(isAutoTourismCandidate({ name: "지역 호텔", category: "LODGING" }, [])).toBe(false);
  });

  it("레저 테마에서 공식 레포츠 신호가 있는 체험은 보조시설 예외로 자동 후보가 된다", () => {
    expect(
      isAutoTourismCandidate(
        { name: "실내 스포츠센터", category: "EXPERIENCE", lclsSystm1: "LS", lclsSystm2: "LS01" },
        ["LEISURE_ACTIVITY"],
      ),
    ).toBe(true);
  });

  it("자연·웰니스 자동 후보에서 문화유산·일반 체험시설은 제외한다", () => {
    expect(
      isAutoTourismCandidate({ name: "지역 역사유적", category: "ATTRACTION", lclsSystm1: "HS", lclsSystm2: "HS01" }, [
        "NATURE",
        "WELLNESS",
      ]),
    ).toBe(false);
    expect(
      isAutoTourismCandidate({ name: "일반 체험장", category: "EXPERIENCE", lclsSystm1: "EX", lclsSystm2: "EX02" }, [
        "NATURE",
        "WELLNESS",
      ]),
    ).toBe(false);
  });
});
