import { describe, expect, it } from "vitest";
import { normalizePetTourDetail, selectPetTourTargets } from "@/lib/domain/petTourEvidence";

describe("petTour evidence", () => {
  it("전구역 동반가능은 확인됨/전체로 정규화한다", () => {
    expect(
      normalizePetTourDetail({ contentid: "1", acmpyTypeCd: "전구역 동반가능", acmpyNeedMtr: "목줄 착용" }),
    ).toMatchObject({
      availability: "CONFIRMED",
      scope: "ALL",
      requirements: ["목줄 착용"],
    });
  });

  it("부분·조건 문구는 조건부로 남긴다", () => {
    expect(normalizePetTourDetail({ contentid: "1", acmpyTypeCd: "일부 구역 동반가능" })).toMatchObject({
      availability: "CONDITIONAL",
      scope: "PARTIAL",
    });
  });

  it("빈 원문은 UNKNOWN이며 불가로 추론하지 않는다", () => {
    expect(normalizePetTourDetail({ contentid: "1" })).toMatchObject({
      availability: "UNKNOWN",
      scope: "UNKNOWN",
      requirements: [],
      capacityNote: null,
      riskNote: null,
      facilityNote: null,
    });
  });

  it("공식 목록과 local externalId의 교집합만 선택하고 최신 modifiedtime cache를 재사용한다", () => {
    const result = selectPetTourTargets({
      officialItems: [
        { contentid: "1", modifiedtime: "20260819010101", showflag: "1" },
        { contentid: "2", modifiedtime: "20260819010101", showflag: "1" },
        { contentid: "3", modifiedtime: "20260819010101", showflag: "1" },
        { contentid: "4", modifiedtime: "20260819010101", showflag: "0" },
      ],
      localPois: [
        { id: "poi-1", externalId: "1", regionId: "r", sourceType: "API", category: "ATTRACTION", regionCode: "R", regionName: "지역" },
        { id: "poi-2", externalId: "2", regionId: "r", sourceType: "API", category: "FOOD", regionCode: "R", regionName: "지역" },
      ],
      existingEvidence: [
        { contentId: "1", status: "SUCCESS", sourceModifiedTime: "20260819010101", sourceShowFlag: "1" },
      ],
      maxItems: 10,
    });

    expect(result.officialItems.map((item) => item.contentid)).toEqual(["1", "2", "3"]);
    expect(result.hiddenItems.map((item) => item.contentid)).toEqual(["4"]);
    expect(result.cacheHits.map((item) => item.contentid)).toEqual(["1"]);
    expect(result.changedTargets.map((item) => item.contentid)).toEqual(["2"]);
    expect(result.unmatchedContentIds).toEqual(["3"]);
  });
});
