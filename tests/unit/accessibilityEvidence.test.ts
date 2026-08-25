import { describe, expect, it } from "vitest";
import {
  normalizeAccessibilityDetail,
  selectAccessibilityTargets,
} from "@/lib/domain/accessibilityEvidence";
import { orderTargetedAccessibilityRows } from "@/lib/domain/accessibilityTargeting";

describe("accessibility evidence", () => {
  it("차원별 가능·불가·조건부·unknown을 분리한다", () => {
    const result = normalizeAccessibilityDetail({
      contentid: "1",
      wheelchair: "휠체어 접근 가능",
      exit: "출입구 있음",
      restroom: "없음",
      parking: "사전 문의 필요",
      route: "확인 필요",
      handicapetc: "자유로운 안내 문구",
    });

    expect(result.wheelchair).toMatchObject({ status: "AVAILABLE" });
    expect(result.entranceExit).toMatchObject({ status: "AVAILABLE" });
    expect(result.restroom).toMatchObject({ status: "UNAVAILABLE" });
    expect(result.parking).toMatchObject({ status: "CONDITIONAL" });
    expect(result.route).toMatchObject({ status: "CONDITIONAL" });
    expect(result.otherSupport).toMatchObject({ status: "UNKNOWN" });
    expect(result.visualGuide.status).toBe("UNKNOWN");
    expect(result.strollerFamily.status).toBe("UNKNOWN");
  });

  it("한 차원에 가능·불가가 함께 있으면 조건부로 남긴다", () => {
    const result = normalizeAccessibilityDetail({
      contentid: "1",
      blindhandicapetc: "안내 가능",
      braileblock: "점자블록 없음",
    });

    expect(result.visualGuide.status).toBe("CONDITIONAL");
    expect(result.visualGuide.rawText).toContain("blindhandicapetc");
    expect(result.visualGuide.rawText).toContain("braileblock");
  });

  it("공식 목록과 local externalId의 교집합만 처리하고 최신 cache를 재사용한다", () => {
    const result = selectAccessibilityTargets({
      officialItems: [
        { contentid: "1", modifiedtime: "20260819010101", showflag: "1" },
        { contentid: "2", modifiedtime: "20260819010101", showflag: "1" },
        { contentid: "3", modifiedtime: "20260819010101", showflag: "1" },
        { contentid: "4", modifiedtime: "20260819010101", showflag: "0" },
      ],
      localPois: [
        { id: "poi-1", externalId: "1", category: "ATTRACTION" },
        { id: "poi-2", externalId: "2", category: "FOOD" },
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
    expect(result.fetchTargets.map((item) => item.contentid)).toEqual(["2"]);
    expect(result.unmatchedContentIds).toEqual(["3"]);
  });

  it("modifiedtime·showflag 변경과 ERROR evidence는 재수집 대상으로 분류한다", () => {
    const result = selectAccessibilityTargets({
      officialItems: [
        { contentid: "1", modifiedtime: "new", showflag: "1" },
        { contentid: "2", modifiedtime: "same", showflag: "0" },
        { contentid: "3", modifiedtime: "same", showflag: "1" },
      ],
      localPois: [
        { id: "poi-1", externalId: "1", category: "ATTRACTION" },
        { id: "poi-2", externalId: "2", category: "FOOD" },
        { id: "poi-3", externalId: "3", category: "LODGING" },
      ],
      existingEvidence: [
        { contentId: "1", status: "SUCCESS", sourceModifiedTime: "old", sourceShowFlag: "1" },
        { contentId: "3", status: "ERROR", sourceModifiedTime: "same", sourceShowFlag: "1" },
      ],
      maxItems: 1,
    });

    expect(result.cacheHits).toHaveLength(0);
    expect(result.changedTargets.map((item) => item.contentid)).toEqual(["1", "3"]);
    expect(result.fetchTargets.map((item) => item.contentid)).toEqual(["1"]);
    expect(result.hiddenItems.map((item) => item.contentid)).toEqual(["2"]);
  });

  it("targeted 모드는 명시한 contentId 범위만 보고 category 우선순위를 따른다", () => {
    const result = selectAccessibilityTargets({
      officialItems: [
        { contentid: "a", modifiedtime: "same", showflag: "1" },
        { contentid: "b", modifiedtime: "same", showflag: "1" },
        { contentid: "c", modifiedtime: "same", showflag: "1" },
      ],
      localPois: [
        { id: "poi-a", externalId: "a", category: "ATTRACTION" },
        { id: "poi-b", externalId: "b", category: "FOOD" },
        { id: "poi-c", externalId: "c", category: "LODGING" },
      ],
      existingEvidence: [
        { contentId: "a", status: "SUCCESS", sourceModifiedTime: "same", sourceShowFlag: "1" },
      ],
      maxItems: 1,
      priorityContentIds: ["a", "b"],
      restrictToPriorityContentIds: true,
    });

    expect(result.cacheHits.map((item) => item.contentid)).toEqual(["a"]);
    expect(result.changedTargets.map((item) => item.contentid)).toEqual(["b"]);
    expect(result.fetchTargets.map((item) => item.contentid)).toEqual(["b"]);
  });

  it("targeted 노출 대상은 후보 우선·category round-robin으로 정렬한다", () => {
    const ordered = orderTargetedAccessibilityRows([
      { id: "a1", name: "관광지", category: "ATTRACTION", externalId: "a1", projectId: "p", regionCode: "R", collection: "CANDIDATE" },
      { id: "a2", name: "관광지2", category: "ATTRACTION", externalId: "a2", projectId: "p", regionCode: "R", collection: "CANDIDATE" },
      { id: "f1", name: "식당", category: "FOOD", externalId: "f1", projectId: "p", regionCode: "R", collection: "CANDIDATE" },
      { id: "l1", name: "숙박", category: "LODGING", externalId: "l1", projectId: "p", regionCode: "R", collection: "COURSE" },
      { id: "x1", name: "체험", category: "EXPERIENCE", externalId: "x1", projectId: "p", regionCode: "R", collection: "ANCHOR_CANDIDATE" },
    ]);

    expect(ordered.map((row) => row.id)).toEqual(["a1", "f1", "a2", "l1", "x1"]);
  });
});
