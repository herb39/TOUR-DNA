import { describe, expect, it } from "vitest";
import {
  classifyPoiRepresentation,
  decidePoiRecommendation,
  isAutoTourismCandidate,
  isVisibleRecommendationCandidate,
} from "@/lib/domain/poiRecommendation";

describe("poiRecommendation — 지역 비종속 대표성 분류", () => {
  it("이름이 아니라 공식 중분류로 보조 자원을 분류한다", () => {
    expect(classifyPoiRepresentation({ name: "어떤 공원", category: "ATTRACTION", lclsSystm2: "VE03" })).toBe("SUPPORT");
    expect(classifyPoiRepresentation({ name: "다른 캠핑장", category: "EXPERIENCE", lclsSystm2: "AC05" })).toBe("SUPPORT");
    expect(classifyPoiRepresentation({ name: "유명한 자연명소", category: "ATTRACTION", lclsSystm1: "NA", lclsSystm2: "NA01" })).toBe("DESTINATION");
  });

  it("미검수 보조 자원은 자동 코스에서 제외하지만 사용자 후보 패널에는 남긴다", () => {
    const poi = { name: "지역 공원", category: "ATTRACTION", lclsSystm2: "VE03" };
    expect(isAutoTourismCandidate(poi, ["NATURE"])).toBe(false);
    expect(isVisibleRecommendationCandidate(poi, ["NATURE"])).toBe(true);
    expect(decidePoiRecommendation(poi, ["NATURE"]).status).toBe("DEMOTE");
  });

  it("지역 검수 승인 목적지는 보조시설 분류를 덮어써 자동 후보가 된다", () => {
    expect(
      isAutoTourismCandidate(
        {
          name: "지역 대표 공원",
          category: "ATTRACTION",
          lclsSystm2: "VE03",
          curationStatus: "APPROVED",
          representation: "DESTINATION",
        },
        ["NATURE"],
      ),
    ).toBe(true);
  });

  it("지역 검수 제외 POI는 후보 패널에서도 숨긴다", () => {
    expect(
      isVisibleRecommendationCandidate(
        { name: "검수 제외 장소", category: "ATTRACTION", curationStatus: "REJECTED", representation: "SUPPORT" },
        [],
      ),
    ).toBe(false);
  });

  it("숙박은 일반 관광 후보가 아니라 별도 숙박 슬롯으로 분리한다", () => {
    expect(isAutoTourismCandidate({ name: "지역 호텔", category: "LODGING" }, [])).toBe(false);
  });

  it("레저 테마에서 공식 레포츠 분류는 보조시설 예외가 아니라 자동 후보가 된다", () => {
    expect(
      isAutoTourismCandidate(
        { name: "실내 스포츠센터", category: "EXPERIENCE", lclsSystm1: "LS", lclsSystm2: "LS01" },
        ["LEISURE_ACTIVITY"],
      ),
    ).toBe(true);
  });

  it("자연·웰니스 자동 후보에서는 공식 문화유산·일반 체험 분류를 제외한다", () => {
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
