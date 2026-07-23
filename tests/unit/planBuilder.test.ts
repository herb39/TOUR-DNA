import { describe, expect, it } from "vitest";
import {
  buildDraftCourse,
  recomputeDayItems,
  estimateTravel,
  parseTimeSlotToMinutes,
  minutesToTimeSlot,
  type PoiDetail,
  type CourseItemInput,
} from "@/lib/domain/planBuilder";

function poi(id: string, lat: number, lng: number, category = "ATTRACTION"): PoiDetail {
  return {
    id,
    name: `POI-${id}`,
    category,
    address: "",
    lat,
    lng,
    operatingHours: null,
    closedDays: null,
  };
}

describe("buildDraftCourse", () => {
  it("입력이 지그재그 순서여도 하루 안에서는 거리 순서로 재배열한다", () => {
    // 경도 0, 1, 2, 3에 일직선 배치, 입력은 0, 2, 1, 3(지그재그)
    const pois = [poi("0", 0, 0), poi("2", 0, 2), poi("1", 0, 1), poi("3", 0, 3)];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");

    expect(days).toHaveLength(1);
    expect(days[0].items.map((i) => i.poiId)).toEqual(["0", "1", "2", "3"]);
  });

  it("첫 항목은 '숙소/집결지에서 이동', 이후는 거리 기반 이동 텍스트를 쓴다", () => {
    const pois = [poi("a", 36.35, 127.38), poi("b", 36.36, 127.4)];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");

    expect(days[0].items[0].travel).toBe("숙소/집결지에서 이동");
    expect(days[0].items[1].travel).toMatch(/이동 약 \d+분\(약 \d+(\.\d+)?km, 도보 기준\)/);
  });

  it("교통수단에 따라 같은 거리라도 다른 소요시간을 보여준다", () => {
    const pois = [poi("a", 36.35, 127.38), poi("b", 36.4, 127.45)];
    const walkDays = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const carDays = buildDraftCourse(pois, "DAY_TRIP", "PRIVATE_VEHICLE");

    const walkMinutes = Number(walkDays[0].items[1].travel.match(/약 (\d+)분/)?.[1]);
    const carMinutes = Number(carDays[0].items[1].travel.match(/약 (\d+)분/)?.[1]);

    expect(carMinutes).toBeLessThan(walkMinutes);
  });

  it("여러 날짜에 걸쳐서도 poi 개수만큼만 배치하고 초과 슬롯을 만들지 않는다", () => {
    const pois = [poi("1", 0, 0), poi("2", 0, 0.01), poi("3", 0, 0.02)];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "PUBLIC_TRANSPORT");
    const totalItems = days.reduce((sum, d) => sum + d.items.length, 0);
    expect(totalItems).toBe(3);
  });

  it("하루에 4곳을 넘겨도(최대치 제한 없음) 전부 배치한다", () => {
    const pois = Array.from({ length: 6 }, (_, i) => poi(String(i), 0, i * 0.01));
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");

    expect(days).toHaveLength(1);
    expect(days[0].items).toHaveLength(6);
    // 앞 4자리는 DAY_TRIP 전용 고정 슬롯(2단계: 날짜별 시간대 분리), 5번째부터는 마지막 슬롯(17:30)에서
    // 150분씩 이어간다
    expect(days[0].items.map((i) => i.timeSlot)).toEqual(["10:00", "12:30", "15:00", "17:30", "20:00", "22:30"]);
  });
});

describe("parseTimeSlotToMinutes / minutesToTimeSlot", () => {
  it("정상 형식은 분 단위로 변환하고 다시 원래 문자열로 되돌아온다", () => {
    expect(parseTimeSlotToMinutes("10:00")).toBe(600);
    expect(parseTimeSlotToMinutes("18:30")).toBe(1110);
    expect(minutesToTimeSlot(600)).toBe("10:00");
    expect(minutesToTimeSlot(1110)).toBe("18:30");
  });

  it("형식이 잘못되면 null을 반환한다", () => {
    expect(parseTimeSlotToMinutes("abc")).toBeNull();
    expect(parseTimeSlotToMinutes("10:70")).toBeNull();
  });
});

describe("estimateTravel", () => {
  it("좌표가 없으면 minutes는 null이고 안내 문구를 반환한다", () => {
    const result = estimateTravel({}, { lat: 36.35, lng: 127.38 }, "WALK");
    expect(result.minutes).toBeNull();
    expect(result.label).toContain("좌표 정보 없음");
  });

  it("좌표가 있으면 분 단위 숫자와 설명 문구를 함께 반환한다", () => {
    const result = estimateTravel({ lat: 36.35, lng: 127.38 }, { lat: 36.4, lng: 127.45 }, "WALK");
    expect(result.minutes).toBeGreaterThan(0);
    expect(result.label).toContain(`${result.minutes}분`);
  });
});

describe("recomputeDayItems", () => {
  function input(overrides: Partial<CourseItemInput> & Pick<CourseItemInput, "poiId" | "poiName">): CourseItemInput {
    return { category: "ATTRACTION", stayMinutes: 60, ...overrides };
  }

  it("이미 timeSlot이 있는 항목은 그대로 유지하고, 없는 항목만 자리 기준 기본값을 받는다", () => {
    const items = [
      input({ poiId: "a", poiName: "A", timeSlot: "11:15" }),
      input({ poiId: "b", poiName: "B" }),
    ];
    const result = recomputeDayItems(items, "WALK");

    expect(result[0].timeSlot).toBe("11:15");
    expect(result[1].timeSlot).toBe("13:00"); // 자리(index 1) 기준 기본값
  });

  it("최대 개수 제한 없이 5개 이상도 그대로 처리한다", () => {
    const items = Array.from({ length: 5 }, (_, i) => input({ poiId: `p${i}`, poiName: `P${i}` }));
    const result = recomputeDayItems(items, "WALK");
    expect(result).toHaveLength(5);
  });
});

/** 지정한 개수만큼 비숙박(ATTRACTION) POI를 만든다. lng를 늘려가며 배치해 최근접 이웃 정렬 결과가
 * 입력 순서와 같아지도록 한다(테스트 검증을 단순하게 하기 위함). */
function makeNonLodgingPois(prefix: string, count: number): PoiDetail[] {
  return Array.from({ length: count }, (_, i) => poi(`${prefix}-${i}`, 0, i * 0.01));
}

function makeLodgingPois(prefix: string, count: number): PoiDetail[] {
  return Array.from({ length: count }, (_, i) => poi(`${prefix}-${i}`, 0, 100 + i * 0.01, "LODGING"));
}

describe("buildDraftCourse — 숙박 분리와 날짜별 배치(개선 2단계)", () => {
  it("당일치기는 숙박 후보가 있어도 lodging이 없고, 그 후보가 일반 items에도 들어가지 않는다", () => {
    const pois = [...makeNonLodgingPois("a", 4), ...makeLodgingPois("l", 1)];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");

    expect(days).toHaveLength(1);
    expect(days[0].lodging ?? null).toBeNull();
    expect(days[0].items.some((i) => i.category === "LODGING")).toBe(false);
    expect(days[0].items).toHaveLength(4);
  });

  it("1박 2일은 1일차에만 숙박 1개를 배치하고 2일차는 숙박이 없다", () => {
    const pois = [...makeNonLodgingPois("a", 10), ...makeLodgingPois("l", 2)];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days).toHaveLength(2);
    expect(days[0].lodging).not.toBeNull();
    expect(days[0].lodging?.category).toBe("LODGING");
    expect(days[1].lodging ?? null).toBeNull();
    for (const day of days) {
      expect(day.items.some((i) => i.category === "LODGING")).toBe(false);
    }
  });

  it("2박 3일은 1·2일차에 숙박 1개씩 배치하고 마지막 날에는 숙박이 없으며, 두 숙박은 서로 다른 POI다", () => {
    const pois = [...makeNonLodgingPois("a", 15), ...makeLodgingPois("l", 3)];
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    expect(days).toHaveLength(3);
    expect(days[0].lodging).not.toBeNull();
    expect(days[1].lodging).not.toBeNull();
    expect(days[2].lodging ?? null).toBeNull();
    expect(days[0].lodging?.poiId).not.toBe(days[1].lodging?.poiId);
    for (const day of days) {
      expect(day.items.some((i) => i.category === "LODGING")).toBe(false);
    }

    const allPoiIds = days.flatMap((d) => [...d.items.map((i) => i.poiId), ...(d.lodging ? [d.lodging.poiId] : [])]);
    expect(new Set(allPoiIds).size).toBe(allPoiIds.length);
  });

  it("후보가 목표 개수와 정확히 같을 때 여행 기간별 날짜별 목표 밀도를 정확히 채운다", () => {
    // 후보 수를 각 기간의 목표 합과 똑같이 맞춰, 초과분 배분 로직이 끼어들지 않는 "정확히 충분한" 상태를 검증한다.
    const dayTrip = buildDraftCourse(makeNonLodgingPois("a", 4), "DAY_TRIP", "WALK");
    expect(dayTrip.map((d) => d.items.length)).toEqual([4]);

    const oneNight = buildDraftCourse(makeNonLodgingPois("b", 7), "ONE_NIGHT_TWO_DAYS", "WALK");
    expect(oneNight.map((d) => d.items.length)).toEqual([4, 3]);

    const twoNights = buildDraftCourse(makeNonLodgingPois("c", 11), "TWO_NIGHTS_THREE_DAYS", "WALK");
    expect(twoNights.map((d) => d.items.length)).toEqual([3, 5, 3]);
  });

  it("2박 3일 날짜별 시간대가 첫날 늦게 시작, 마지막 날 일찍 끝나도록 지정된 슬롯과 일치한다", () => {
    const days = buildDraftCourse(makeNonLodgingPois("a", 11), "TWO_NIGHTS_THREE_DAYS", "WALK");

    expect(days[0].items[0].timeSlot).toBe("12:00");
    expect(days[1].items[0].timeSlot).toBe("09:30");
    expect(days[2].items[0].timeSlot).toBe("09:30");
    expect(days[2].items[days[2].items.length - 1].timeSlot).toBe("14:30");
  });

  it("2박 3일에 비숙박 8개가 들어와도 마지막 날이 비지 않는다", () => {
    const pois = makeNonLodgingPois("a", 8);
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    const counts = days.map((d) => d.items.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(8);
    expect(days[days.length - 1].items.length).toBeGreaterThan(0);

    const knownIds = new Set(pois.map((p) => p.id));
    const placedIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    for (const id of placedIds) expect(knownIds.has(id)).toBe(true);
    expect(new Set(placedIds).size).toBe(placedIds.length);
  });

  it("2박 3일에 비숙박 2개만 있으면 [1, 1, 0]으로 배치하고 가짜 ID나 중복 없이 개수 합이 일치한다", () => {
    const pois = makeNonLodgingPois("a", 2);
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    expect(days.map((d) => d.items.length)).toEqual([1, 1, 0]);
    const placedIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(new Set(placedIds)).toEqual(new Set(pois.map((p) => p.id)));
    expect(new Set(placedIds).size).toBe(placedIds.length);
  });

  it("목표보다 많은 비숙박 POI가 들어와도 잘라내지 않고 전부 정확히 한 번씩 배치하며 모든 항목이 유효한 timeSlot을 갖는다", () => {
    const pois = makeNonLodgingPois("a", 14); // TWO_NIGHTS_THREE_DAYS 목표 합(11)보다 많음
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    const placedIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(placedIds).toHaveLength(14);
    expect(new Set(placedIds).size).toBe(14);
    expect(new Set(placedIds)).toEqual(new Set(pois.map((p) => p.id)));

    for (const day of days) {
      for (const item of day.items) {
        expect(parseTimeSlotToMinutes(item.timeSlot)).not.toBeNull();
      }
    }
    // 초과분은 중간 날짜(2일차) 우선으로 분배된다
    const counts = days.map((d) => d.items.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(14);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[0]);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[2]);
  });

  it("lodging 필드가 없는 기존 CourseDay 데이터도 recomputeDayItems 등 관련 함수에서 오류 없이 처리된다", () => {
    const legacyDay = {
      dayIndex: 1,
      items: [{ order: 1, poiId: "x", poiName: "X", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" }],
      // lodging 필드 자체가 없음(2026-07-23 이전 저장 데이터를 흉내)
    };
    expect(() => {
      const recomputed = recomputeDayItems(
        legacyDay.items.map((i) => ({ poiId: i.poiId, poiName: i.poiName, category: i.category, stayMinutes: i.stayMinutes, timeSlot: i.timeSlot })),
        "WALK",
      );
      expect(recomputed).toHaveLength(1);
    }).not.toThrow();
  });

  it("buildDraftCourse는 전달받은 POI 배열이나 개별 POI 객체를 변경하지 않는다", () => {
    const pois = [...makeNonLodgingPois("a", 15), ...makeLodgingPois("l", 3)];
    const before = JSON.parse(JSON.stringify(pois));

    buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    expect(pois).toEqual(before);
  });
});

describe("buildDraftCourse — 숙박 체크인 시각에 이동시간 반영(2.5단계)", () => {
  it("마지막 일정 종료 후 이동해도 20시 이전이면 체크인은 기본값 20:00이다", () => {
    // ONE_NIGHT_TWO_DAYS 1일차 첫 슬롯 11:00 + 체류 60분 = 12:00 종료. 숙소가 아주 가까우면(0.3km 이내
    // 고정 5분) 12:05로, 여전히 20시 이전이다.
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.001, "LODGING");
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days[0].lodging).not.toBeNull();
    expect(days[0].lodging?.timeSlot).toBe("20:00");
  });

  it("마지막 일정 종료와 이동시간을 합친 도착 시각이 20시 이후면 그 도착 시각을 체크인으로 쓴다", () => {
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.5, "LODGING"); // 충분히 멀어 도보 이동시간이 커지도록
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");

    const lastItem = days[0].items[days[0].items.length - 1];
    const travel = estimateTravel(dayPoi, lodgingPoi, "WALK");
    expect(travel.minutes).not.toBeNull();

    const arrivalMinutes = (parseTimeSlotToMinutes(lastItem.timeSlot) ?? 0) + lastItem.stayMinutes + (travel.minutes ?? 0);
    const defaultMinutes = parseTimeSlotToMinutes("20:00") ?? 1200;
    // 이 테스트가 의미를 가지려면 실제로 20시를 넘기는 케이스여야 한다.
    expect(arrivalMinutes).toBeGreaterThan(defaultMinutes);
    expect(days[0].lodging?.timeSlot).toBe(minutesToTimeSlot(arrivalMinutes));
  });

  it("숙박 이동정보 문구(travel)와 체크인 시각 계산에 동일한 이동시간 값이 쓰인다", () => {
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.5, "LODGING");
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");
    const travel = estimateTravel(dayPoi, lodgingPoi, "WALK");

    expect(days[0].lodging?.travel).toBe(travel.label);
    const lastItem = days[0].items[days[0].items.length - 1];
    const arrivalMinutes = (parseTimeSlotToMinutes(lastItem.timeSlot) ?? 0) + lastItem.stayMinutes + (travel.minutes ?? 0);
    expect(days[0].lodging?.timeSlot).toBe(minutesToTimeSlot(arrivalMinutes));
  });

  it("이동시간이 실제로 timeSlot 계산에 반영된다(먼 숙소일수록 체크인이 늦어진다)", () => {
    // 0.3도(약 33km)로 설정해 자정을 넘기지 않으면서(당일 20시 이후) 비교가 가능하도록 한다.
    const dayPoi = poi("a", 0, 0);
    const nearLodging = poi("near", 0, 0.001, "LODGING");
    const farLodging = poi("far", 0, 0.3, "LODGING");

    const nearDays = buildDraftCourse([dayPoi, nearLodging], "ONE_NIGHT_TWO_DAYS", "WALK");
    const farDays = buildDraftCourse([dayPoi, farLodging], "ONE_NIGHT_TWO_DAYS", "WALK");

    const nearMinutes = parseTimeSlotToMinutes(nearDays[0].lodging!.timeSlot)!;
    const farMinutes = parseTimeSlotToMinutes(farDays[0].lodging!.timeSlot)!;
    expect(farMinutes).toBeGreaterThan(nearMinutes);
  });

  it("일반 일정이 없는 날의 숙박은 이동시간과 무관하게 기본값 20:00과 기존 안내 문구를 유지한다", () => {
    // TWO_NIGHTS_THREE_DAYS, 비숙박 후보 0개 → 모든 날짜가 빈 items. 숙박 후보 2개 → 1·2일차에 배치.
    const days = buildDraftCourse(makeLodgingPois("l", 2), "TWO_NIGHTS_THREE_DAYS", "WALK");

    expect(days[0].items).toHaveLength(0);
    expect(days[0].lodging?.timeSlot).toBe("20:00");
    expect(days[0].lodging?.travel).toBe("당일 마지막 일정 이후 숙소로 이동(그날 일반 일정 없음)");
  });

  it("체크인 시각 계산 과정에서 입력 POI 배열이나 객체를 직접 변경하지 않는다", () => {
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.5, "LODGING");
    const pois = [dayPoi, lodgingPoi];
    const before = JSON.parse(JSON.stringify(pois));

    buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(pois).toEqual(before);
  });
});
