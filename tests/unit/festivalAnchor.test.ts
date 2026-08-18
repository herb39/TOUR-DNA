import { describe, expect, it } from "vitest";
import {
  filterFestivalAnchorItems,
  getTravelMonthRange,
  matchesFestivalRegion,
  normalizeFestivalDate,
  overlapsTravelMonth,
} from "@/lib/domain/festivalAnchor";

describe("festivalAnchor", () => {
  it("여행월의 시작·종료일을 정확히 계산한다", () => {
    expect(getTravelMonthRange(2026, 2)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(getTravelMonthRange(2028, 2)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("잘못된 날짜와 잘못된 여행월을 후보로 만들지 않는다", () => {
    expect(normalizeFestivalDate("20260230")).toBeNull();
    expect(normalizeFestivalDate("20260201")).toBe("2026-02-01");
    expect(getTravelMonthRange(2026, 13)).toBeNull();
    expect(overlapsTravelMonth("2026-01-31", "2026-02-01", { start: "2026-02-01", end: "2026-02-28" })).toBe(true);
  });

  it("법정동 시도·시군구를 모두 확인하고 기간이 겹치는 행사만 반환한다", () => {
    const region = { lDongRegnCd: "43", lDongSignguCd: "150" };
    expect(matchesFestivalRegion({ lDongRegnCd: "43", lDongSignguCd: "150" }, region)).toBe(true);
    expect(matchesFestivalRegion({ lDongRegnCd: "43", lDongSignguCd: "130" }, region)).toBe(false);

    const candidates = filterFestivalAnchorItems({
      region,
      travelMonth: { start: "2026-08-01", end: "2026-08-31" },
      items: [
        { contentid: "1", contenttypeid: "15", title: "월간 축제", eventstartdate: "20260729", eventenddate: "20260829", lDongRegnCd: "43", lDongSignguCd: "150" },
        { contentid: "2", contenttypeid: "15", title: "다음 지역", eventstartdate: "20260801", eventenddate: "20260802", lDongRegnCd: "43", lDongSignguCd: "130" },
        { contentid: "3", contenttypeid: "15", title: "지난 행사", eventstartdate: "20260701", eventenddate: "20260702", lDongRegnCd: "43", lDongSignguCd: "150" },
        { contentid: "4", contenttypeid: "12", title: "관광지", eventstartdate: "20260801", eventenddate: "20260802", lDongRegnCd: "43", lDongSignguCd: "150" },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: "tourapi-festival-1", name: "월간 축제", startDate: "2026-07-29", endDate: "2026-08-29" });
  });

  it("같은 contentid 중복은 하나로 합치고 시작일 순으로 정렬한다", () => {
    const candidates = filterFestivalAnchorItems({
      region: { lDongRegnCd: "26" },
      travelMonth: { start: "2026-08-01", end: "2026-08-31" },
      items: [
        { contentid: "2", title: "나중 행사", eventstartdate: "20260820", eventenddate: "20260821", lDongRegnCd: "26" },
        { contentid: "1", title: "먼저 행사", eventstartdate: "20260801", eventenddate: "20260802", lDongRegnCd: "26" },
        { contentid: "1", title: "먼저 행사", eventstartdate: "20260801", eventenddate: "20260802", lDongRegnCd: "26" },
      ],
    });
    expect(candidates.map((candidate) => candidate.externalId)).toEqual(["1", "2"]);
  });
});
