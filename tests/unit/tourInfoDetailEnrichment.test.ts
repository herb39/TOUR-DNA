import { describe, expect, it } from "vitest";
import {
  mergeTourInfoDetail,
  parseTourInfoDetailEnrichmentArgs,
  selectTourInfoDetailCandidates,
} from "@/lib/domain/tourInfoDetailEnrichment";

const poi = (overrides: Record<string, unknown> = {}) => ({
  id: "poi-1",
  externalId: "4067990",
  sourceType: "API",
  operatingHours: null,
  closedDays: null,
  rawPayload: { contenttypeid: "14", lclsSystm1: "VE", lclsSystm2: "VE07" },
  ...overrides,
});

describe("tourInfoDetailEnrichment — 제한적 VE07·LS 증분 반영", () => {
  it("region-code와 max-items를 모두 요구하고 양의 정수만 허용한다", () => {
    expect(parseTourInfoDetailEnrichmentArgs(["--region-code=SGG_JECHEON", "--max-items=3"])).toEqual({
      ok: true,
      value: { regionCode: "SGG_JECHEON", maxItems: 3 },
    });
    expect(parseTourInfoDetailEnrichmentArgs(["--region-code=SGG_JECHEON"])).toMatchObject({ ok: false });
    expect(parseTourInfoDetailEnrichmentArgs(["--region-code=SGG_JECHEON", "--max-items=0"])).toMatchObject({ ok: false });
    expect(parseTourInfoDetailEnrichmentArgs(["--region-code=SGG_JECHEON", "--max-items=101"])).toMatchObject({ ok: false });
  });

  it("VE07 문화시설만 고르고, 기존 값·상세 응답이 있는 POI는 재호출 후보에서 제외한다", () => {
    const candidates = selectTourInfoDetailCandidates(
      [
        poi({ id: "b" }),
        poi({ id: "a" }),
        poi({ id: "has-hours", operatingHours: "10:00~18:00" }),
        poi({ id: "has-detail", rawPayload: { contenttypeid: "14", lclsSystm2: "VE07", detailIntro2: {} } }),
        poi({ id: "other-theme", rawPayload: { contenttypeid: "14", lclsSystm2: "HS" } }),
        poi({ id: "other-type", rawPayload: { contenttypeid: "12", lclsSystm2: "VE07" } }),
      ],
      2,
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["a", "b"]);
  });

  it("LS 레포츠(28)도 공식 대분류가 확인된 경우 같은 제한 배치 후보로 선택한다", () => {
    const candidates = selectTourInfoDetailCandidates(
      [
        poi({
          id: "land",
          rawPayload: { contenttypeid: "28", lclsSystm1: "LS", lclsSystm2: "LS01" },
        }),
        poi({
          id: "water",
          rawPayload: { contenttypeid: "28", lclsSystm1: "LS", lclsSystm2: "LS02" },
        }),
        poi({
          id: "not-leisure",
          rawPayload: { contenttypeid: "28", lclsSystm1: "AC", lclsSystm2: "AC05" },
        }),
      ],
      10,
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["land", "water"]);
    expect(candidates.every((candidate) => candidate.contentTypeId === "28")).toBe(true);
  });

  it("기존 areaBasedList2 원본을 유지하고 detailIntro2 원본·정규화 결과를 병합한다", () => {
    const merged = mergeTourInfoDetail(
      poi({ rawPayload: { contenttypeid: "14", lclsSystm2: "VE07", title: "전시관" } }),
      {
        contentId: "4067990",
        contentTypeId: "14",
        operatingHours: "10:00~14:00",
        closedDays: "매주 월요일",
        rawPayload: { usetimeculture: "10:00~14:00", restdateculture: "매주 월요일" },
      },
      "2026-08-17T00:00:00.000Z",
    );

    expect(merged.operatingHours).toBe("10:00~14:00");
    expect(merged.closedDays).toBe("매주 월요일");
    expect(merged.rawPayload.title).toBe("전시관");
    expect(merged.rawPayload.detailIntro2).toMatchObject({ fetchedAt: "2026-08-17T00:00:00.000Z" });
  });
});
