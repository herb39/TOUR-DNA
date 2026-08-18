import { describe, expect, it } from "vitest";
import { filterFestivalAnchorItems } from "@/lib/domain/festivalAnchor";
import {
  buildFestivalAnchorConfirmation,
  getFestivalAnchorPlannedDates,
} from "@/lib/domain/festivalAnchorProject";

const provenance = {
  provider: "한국관광공사" as const,
  dataset: "행사정보 조회(searchFestival2)" as const,
  regionCode: "SGG_TEST",
  travelYear: 2026,
  travelMonth: 8,
  eventStartDate: "2026-08-01",
  eventEndDate: "2026-08-31",
  fetchedAt: "2026-08-18T08:00:00.000Z",
  apiItemCount: 1,
  matchedItemCount: 1,
  officialRegionCode: "43",
  officialSigunguCode: "150",
};

const [candidate] = filterFestivalAnchorItems({
  region: { lDongRegnCd: "43", lDongSignguCd: "150" },
  travelMonth: { start: "2026-08-01", end: "2026-08-31" },
  items: [
    {
      contentid: "official-1",
      contenttypeid: "15",
      title: "공식 여름 축제",
      eventstartdate: "20260820",
      eventenddate: "20260822",
      addr1: "테스트시 테스트구",
      mapx: 127.1,
      mapy: 36.1,
      lDongRegnCd: "43",
      lDongSignguCd: "150",
    },
  ],
});

describe("festivalAnchorProject", () => {
  it("행사 기간과 여행월의 교집합만 날짜로 제시하고 시작일을 추정하지 않는다", () => {
    expect(
      getFestivalAnchorPlannedDates({
        eventStartDate: "2026-08-20",
        eventEndDate: "2026-08-22",
        travelYear: 2026,
        travelMonth: 8,
      }),
    ).toEqual(["2026-08-20", "2026-08-21", "2026-08-22"]);
  });

  it("공식 후보 ID·최소 스냅샷·사용자 날짜·일차를 보존한다", () => {
    const result = buildFestivalAnchorConfirmation({
      candidate,
      input: {
        candidateId: candidate.id,
        plannedDate: "2026-08-21",
        plannedDayIndex: "2",
        timeStatus: "UNCONFIRMED",
      },
      regionCode: "SGG_TEST",
      travelYear: 2026,
      travelMonth: 8,
      duration: "TWO_NIGHTS_THREE_DAYS",
      provenance,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      source: "TOUR_API_FESTIVAL",
      sourceId: "official-1",
      contentTypeId: "15",
      plannedDate: "2026-08-21",
      plannedDayIndex: 2,
      timeStatus: "UNCONFIRMED",
      timeSlot: null,
      timeStart: null,
      timeEnd: null,
    });
    expect(result.value.sourceSnapshot).not.toHaveProperty("rawPayload");
    expect(result.value.provenance).toEqual(provenance);
  });

  it("날짜·일차·시간 조건이 없거나 범위를 벗어나면 확정하지 않는다", () => {
    const missingTime = buildFestivalAnchorConfirmation({
      candidate,
      input: { candidateId: candidate.id, plannedDate: "2026-08-21", plannedDayIndex: 1, timeStatus: "" },
      regionCode: "SGG_TEST",
      travelYear: 2026,
      travelMonth: 8,
      duration: "ONE_NIGHT_TWO_DAYS",
      provenance,
    });
    const outsideDate = buildFestivalAnchorConfirmation({
      candidate,
      input: { candidateId: candidate.id, plannedDate: "2026-08-01", plannedDayIndex: 1, timeStatus: "UNCONFIRMED" },
      regionCode: "SGG_TEST",
      travelYear: 2026,
      travelMonth: 8,
      duration: "ONE_NIGHT_TWO_DAYS",
      provenance,
    });

    expect(missingTime).toEqual({ ok: false, message: "행사 시간 조건을 명시적으로 선택해주세요." });
    expect(outsideDate).toEqual({ ok: false, message: "연계 날짜는 행사 기간과 여행월이 겹치는 날짜 중에서 선택해주세요." });
  });

  it("직접 입력 시간은 기획자 지정으로만 저장하고 잘못된 시간은 거부한다", () => {
    const valid = buildFestivalAnchorConfirmation({
      candidate,
      input: {
        candidateId: candidate.id,
        plannedDate: "2026-08-21",
        plannedDayIndex: 1,
        timeStatus: "USER_CONFIRMED",
        timeSlot: "CUSTOM",
        timeStart: "14:00",
        timeEnd: "18:00",
      },
      regionCode: "SGG_TEST",
      travelYear: 2026,
      travelMonth: 8,
      duration: "DAY_TRIP",
      provenance,
    });
    const invalid = buildFestivalAnchorConfirmation({
      candidate,
      input: {
        candidateId: candidate.id,
        plannedDate: "2026-08-21",
        plannedDayIndex: 1,
        timeStatus: "USER_CONFIRMED",
        timeSlot: "CUSTOM",
        timeStart: "18:00",
        timeEnd: "14:00",
      },
      regionCode: "SGG_TEST",
      travelYear: 2026,
      travelMonth: 8,
      duration: "DAY_TRIP",
      provenance,
    });

    expect(valid.ok && valid.value.timeStart).toBe("14:00");
    expect(invalid).toEqual({ ok: false, message: "직접 입력 시간은 HH:mm 형식으로 시작·종료 시각을 올바르게 입력해주세요." });
  });
});
