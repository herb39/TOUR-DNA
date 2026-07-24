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

/** FOOD POI를 mealEligible 명시와 함께 만든다(3단계 카페 구분) — 실제 서비스 경로(poiDetails.ts의
 * deriveMealEligible)가 Poi.rawPayload의 cat3를 기준으로 채워 넣는 것과 같은 필드를 그대로 흉내낸다. */
function foodPoi(id: string, lat: number, lng: number, mealEligible: boolean): PoiDetail {
  return { ...poi(id, lat, lng, "FOOD"), mealEligible };
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

/** 숙박 후보는 비숙박 POI와 지리적으로만 구분되면 되고(최근접 이웃 정렬에는 관여하지 않음 — 숙박은
 * 정렬 전에 분리된다), 실제 도보 이동시간이 하루 범위를 넘지 않을 정도로 가까운 거리를 쓴다(예전에는
 * lng+100 같은 비현실적인 거리를 썼는데, 이제 자정 초과를 실제로 감지하는 안전한 생략 로직이 생겨
 * 그런 거리는 오히려 lodging을 생략시켜버린다 — 이 테스트들의 의도는 숙박 분리 자체를 확인하는
 * 것이므로 도착 가능한 거리를 쓴다). */
function makeLodgingPois(prefix: string, count: number): PoiDetail[] {
  return Array.from({ length: count }, (_, i) => poi(`${prefix}-${i}`, 0, 0.1 + i * 0.01, "LODGING"));
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
    // 목표 합(7)에 정확히 맞춰(1일차 4 + 2일차 3) 초과분 재배분(overflow) 로직이 끼어들지 않게 한다 —
    // 초과분이 생기면 1일차가 6개 이상을 받아 기존 위치 기반 시간 계산(defaultTimeSlotFor)의 오버플로
    // 규칙상 마지막 항목 시작이 23:30을 넘겨, 이 테스트의 본래 의도(날짜별 숙박 분리 정책)와 무관하게
    // 자정 초과 안전장치가 끼어들 수 있다.
    const pois = [...makeNonLodgingPois("a", 7), ...makeLodgingPois("l", 2)];
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
    // 0.3도(약 33km) — 20시는 넘기지만 하루 표시 범위(24시)는 넘지 않는 모더레이트한 거리.
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.3, "LODGING");
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");

    const lastItem = days[0].items[days[0].items.length - 1];
    const travel = estimateTravel(dayPoi, lodgingPoi, "WALK");
    expect(travel.minutes).not.toBeNull();

    const arrivalMinutes = (parseTimeSlotToMinutes(lastItem.timeSlot) ?? 0) + lastItem.stayMinutes + (travel.minutes ?? 0);
    const defaultMinutes = parseTimeSlotToMinutes("20:00") ?? 1200;
    // 이 테스트가 의미를 가지려면 실제로 20시를 넘기되, 하루 표시 범위(24시)는 넘지 않는 케이스여야 한다.
    expect(arrivalMinutes).toBeGreaterThan(defaultMinutes);
    expect(arrivalMinutes).toBeLessThan(24 * 60);
    expect(days[0].lodging?.timeSlot).toBe(minutesToTimeSlot(arrivalMinutes));
  });

  it("숙박 이동정보 문구(travel)와 체크인 시각 계산에 동일한 이동시간 값이 쓰인다", () => {
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.3, "LODGING");
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");
    const travel = estimateTravel(dayPoi, lodgingPoi, "WALK");

    expect(days[0].lodging?.travel).toBe(travel.label);
    const lastItem = days[0].items[days[0].items.length - 1];
    const arrivalMinutes = (parseTimeSlotToMinutes(lastItem.timeSlot) ?? 0) + lastItem.stayMinutes + (travel.minutes ?? 0);
    expect(arrivalMinutes).toBeLessThan(24 * 60);
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

describe("buildDraftCourse — FOOD 점심·저녁 시간대 우선 배치(3단계)", () => {
  const LUNCH_START = parseTimeSlotToMinutes("11:30") as number;
  const LUNCH_END = parseTimeSlotToMinutes("13:30") as number;
  const DINNER_START = parseTimeSlotToMinutes("17:30") as number;
  const DINNER_END = parseTimeSlotToMinutes("19:30") as number;

  /** items 전체가 겹치거나 역행 없이 시간순인지 확인한다(각 항목의 시작이 이전 항목의 종료 이상). */
  function expectChronological(items: { timeSlot: string; stayMinutes: number }[]) {
    for (let i = 1; i < items.length; i++) {
      const prevEnd = (parseTimeSlotToMinutes(items[i - 1].timeSlot) ?? 0) + items[i - 1].stayMinutes;
      const curStart = parseTimeSlotToMinutes(items[i].timeSlot) ?? 0;
      expect(curStart).toBeGreaterThanOrEqual(prevEnd);
    }
  }

  it("FOOD가 2개 이상이면 점심·저녁 시간대에 서로 다른 장소로 배치되고, 그 사이·전후에 관광 일정이 자연스럽게 놓이며 전체가 시간순을 유지한다", () => {
    // 일직선 배치(같은 위도, 경도 증가) → 최근접 이웃 순서가 입력 순서와 같아진다.
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-lunch", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("food-dinner", 0, 0.03, "FOOD"),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(4);
    expectChronological(items);

    const foodItems = items.filter((i) => i.category === "FOOD");
    expect(foodItems).toHaveLength(2);
    expect(foodItems[0].poiId).not.toBe(foodItems[1].poiId);

    const [first, second] = foodItems
      .map((i) => ({ ...i, minutes: parseTimeSlotToMinutes(i.timeSlot) as number }))
      .sort((a, b) => a.minutes - b.minutes);
    expect(first.minutes).toBeGreaterThanOrEqual(LUNCH_START);
    expect(first.minutes).toBeLessThanOrEqual(LUNCH_END);
    expect(second.minutes).toBeGreaterThanOrEqual(DINNER_START);
    expect(second.minutes).toBeLessThanOrEqual(DINNER_END);

    // 관광 일정 2곳 모두 그대로 남아 있어야 한다(삭제되지 않음).
    expect(items.some((i) => i.poiId === "attr-1")).toBe(true);
    expect(items.some((i) => i.poiId === "attr-2")).toBe(true);
  });

  it("FOOD 후보가 1개면 한 번만 배치되고, 두 번째(저녁) 식사가 강제로 만들어지지 않는다", () => {
    const pois = [poi("attr-1", 0, 0, "ATTRACTION"), poi("food-1", 0, 0.01, "FOOD")];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(2);
    const foodItems = items.filter((i) => i.category === "FOOD");
    expect(foodItems).toHaveLength(1);
    const minutes = parseTimeSlotToMinutes(foodItems[0].timeSlot) as number;
    const inLunchWindow = minutes >= LUNCH_START && minutes <= LUNCH_END;
    const inDinnerWindow = minutes >= DINNER_START && minutes <= DINNER_END;
    expect(inLunchWindow || inDinnerWindow).toBe(true);
    expectChronological(items);
  });

  it("FOOD 후보가 없어도 실행안 생성이 실패하지 않고 기존과 같은 관광 일정만 만들어진다", () => {
    const pois = [poi("attr-1", 0, 0, "ATTRACTION"), poi("attr-2", 0, 0.01, "ATTRACTION")];
    expect(() => buildDraftCourse(pois, "DAY_TRIP", "WALK")).not.toThrow();

    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    expect(days[0].items.filter((i) => i.category === "FOOD")).toHaveLength(0);
    expect(days[0].items).toHaveLength(2);
  });

  it("일정 시작이 이미 점심 시간대 안이어도 지나간 슬롯을 강제로 만들지 않고 자연스러운 시각을 쓴다", () => {
    // TWO_NIGHTS_THREE_DAYS 1일차 시작은 12:00 — 이미 점심 시간대(11:30~13:30) 안에서 시작한다.
    const pois = [
      poi("food-1", 0, 0, "FOOD"),
      poi("attr-1", 0, 0.01, "ATTRACTION"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      // 2·3일차용 채움 POI(자체 검증 대상 아님) — 목표(3,5,3)를 채워 day1이 정확히 3개만 받도록 한다.
      ...Array.from({ length: 8 }, (_, i) => poi(`filler-${i}`, 10, i * 0.01, "ATTRACTION")),
    ];
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");
    const day1Items = days[0].items;

    expect(day1Items).toHaveLength(3);
    expectChronological(day1Items);
    const foodItem = day1Items.find((i) => i.category === "FOOD");
    expect(foodItem).toBeDefined();
    const minutes = parseTimeSlotToMinutes(foodItem!.timeSlot) as number;
    // 강제로 역행시키지 않았는지만 확인한다 — 하루 시작(12:00)보다 이르지 않아야 한다.
    expect(minutes).toBeGreaterThanOrEqual(parseTimeSlotToMinutes("12:00") as number);
  });

  it("이동시간이 매우 커서 선호 시간대에 도착할 수 없어도 시간이 역행하지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("attr-2", 0, 0.01, "ATTRACTION"),
      // 0.18도(약 20km) — 도보 기준 이동시간이 약 5시간으로 커져 선호 시간대 도착이 사실상 불가능해진다.
      // (24시간을 넘는 극단적 거리는 minutesToTimeSlot의 자정-랩 정책상 문자열 비교로 순서를 판별할 수
      // 없어지므로, 기존 시간 표현 정책 범위 안에서 "이동시간이 크다"는 의도만 재현한다.)
      poi("food-far", 0, 0.18, "FOOD"),
    ];
    let days: ReturnType<typeof buildDraftCourse> | undefined;
    expect(() => {
      days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    }).not.toThrow();

    const items = days![0].items;
    expect(items).toHaveLength(3);
    expectChronological(items);
    expect(items.some((i) => i.category === "FOOD")).toBe(true);
  });

  it("관광지를 하나 더 배치하면 점심 시간대를 명백히 놓치는 경우 FOOD가 먼저 배치된다", () => {
    // attr-1과 food-1 사이 거리가 아주 멀어서, attr-1을 먼저 넣으면 food-1 도착이 점심 시간대 종료(13:30)를
    // 한참 넘긴다 — 이 경우 food-1이 attr-1보다 먼저 배치되어야 한다.
    const pois = [poi("attr-1", 0, 0.2, "ATTRACTION"), poi("food-1", 0, 0, "FOOD")];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(2);
    expect(items[0].category).toBe("FOOD");
    expect(items[0].poiId).toBe("food-1");
    const lunchMinutes = parseTimeSlotToMinutes(items[0].timeSlot) as number;
    expect(lunchMinutes).toBeGreaterThanOrEqual(LUNCH_START);
    expect(lunchMinutes).toBeLessThanOrEqual(LUNCH_END);
    expectChronological(items);
  });

  it("2박 3일 전체에서 같은 FOOD 장소가 다른 날짜에도 중복 배치되지 않는다", () => {
    const pois = [
      poi("a1", 0, 0, "ATTRACTION"),
      poi("a2", 0, 0.01, "ATTRACTION"),
      poi("a3", 0, 0.02, "ATTRACTION"),
      poi("b1", 0, 0.03, "ATTRACTION"),
      poi("food-lunch", 0, 0.04, "FOOD"),
      poi("b2", 0, 0.05, "ATTRACTION"),
      poi("food-dinner", 0, 0.06, "FOOD"),
      poi("b3", 0, 0.07, "ATTRACTION"),
      poi("c1", 0, 0.08, "ATTRACTION"),
      poi("c2", 0, 0.09, "ATTRACTION"),
      poi("c3", 0, 0.1, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    const allPoiIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(new Set(allPoiIds).size).toBe(allPoiIds.length);
    expect(allPoiIds).toHaveLength(11);

    const day2FoodCount = days[1].items.filter((i) => i.category === "FOOD").length;
    expect(day2FoodCount).toBe(2);
  });

  it("FOOD 개선 후에도 숙박은 일반 items와 분리되고, 재배치된 마지막 일정 기준으로 체크인 이동시간이 계산된다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-1", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("lodge-1", 0, 0.03, "LODGING"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const day1 = days[0];

    expect(day1.items.some((i) => i.category === "LODGING")).toBe(false);
    expect(day1.lodging).not.toBeNull();
    expect(day1.lodging?.poiId).toBe("lodge-1");

    const lastGeneralItem = day1.items[day1.items.length - 1];
    const expectedTravel = estimateTravel(
      { lat: lastGeneralItem.lat, lng: lastGeneralItem.lng },
      { lat: 0, lng: 0.03 },
      "WALK",
    );
    expect(day1.lodging?.travel).toBe(expectedTravel.label);

    expect(days[1].lodging ?? null).toBeNull();
    expect(days[1].items.some((i) => i.category === "LODGING")).toBe(false);
  });

  it("dayIndex는 FOOD가 있어도 계속 1부터 시작하고, 동일 입력에는 동일 결과를 반환한다(결정론성)", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-lunch", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("food-dinner", 0, 0.03, "FOOD"),
      poi("lodge-1", 0, 0.04, "LODGING"),
    ];
    const days1 = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const days2 = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days1.map((d) => d.dayIndex)).toEqual([1, 2]);
    expect(days1).toEqual(days2);
  });

  it("FOOD가 포함된 날짜를 계산하는 과정에서 입력 POI 배열이나 객체를 직접 변경하지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-lunch", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("food-dinner", 0, 0.03, "FOOD"),
    ];
    const before = JSON.parse(JSON.stringify(pois));

    buildDraftCourse(pois, "DAY_TRIP", "WALK");

    expect(pois).toEqual(before);
  });
});

describe("buildDraftCourse — FOOD 3개 이상 처리(3단계 보완)", () => {
  it("FOOD가 3개면 최대 2개만 식사로 배치되고, 세 번째는 관광 일정으로도 배치되지 않으며, 일반 관광지는 그대로 유지된다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-1", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("food-2", 0, 0.03, "FOOD"),
      poi("food-3", 0, 0.04, "FOOD"),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    // food-3는 어디에도 배치되지 않는다 — 관광지 큐에도 들어가지 않는다.
    expect(items.some((i) => i.poiId === "food-3")).toBe(false);
    expect(items).toHaveLength(4);

    const foodItems = items.filter((i) => i.category === "FOOD");
    expect(foodItems).toHaveLength(2);
    expect(foodItems.map((i) => i.poiId).sort()).toEqual(["food-1", "food-2"]);
    expect(foodItems[0].poiId).not.toBe(foodItems[1].poiId);

    expect(items.some((i) => i.poiId === "attr-1")).toBe(true);
    expect(items.some((i) => i.poiId === "attr-2")).toBe(true);
  });
});

describe("buildDraftCourse — 짧은 일정의 저녁 강제 생성 방지(3단계 보완)", () => {
  /** 날짜별 3개 군집(위도로 분리)을 만들어 1일차/2일차/3일차에 각각 배정되도록 한다. */
  function threeDayClusteredPois(day3Extra: PoiDetail[]): PoiDetail[] {
    return [
      poi("d1-a", 0, 0, "ATTRACTION"),
      poi("d1-b", 0, 0.01, "ATTRACTION"),
      poi("d1-c", 0, 0.02, "ATTRACTION"),
      poi("d2-a", 10, 0, "ATTRACTION"),
      poi("d2-b", 10, 0.01, "ATTRACTION"),
      poi("d2-c", 10, 0.02, "ATTRACTION"),
      poi("d2-d", 10, 0.03, "ATTRACTION"),
      poi("d2-e", 10, 0.04, "ATTRACTION"),
      ...day3Extra,
    ];
  }

  it("FOOD가 2개 있어도 마지막 날짜가 저녁 전에 끝나는 짧은 일정이면 저녁 FOOD는 배치되지 않는다", () => {
    // TWO_NIGHTS_THREE_DAYS 3일차 슬롯은 ["09:30","12:00","14:30"] — 마지막 슬롯(14:30)이 저녁
    // 시간대(17:30) 전에 끝나는 "저녁 전에 끝나는 일정"이다.
    const pois = threeDayClusteredPois([
      poi("d3-attr", 20, 0, "ATTRACTION"),
      poi("d3-food-lunch", 20, 0.01, "FOOD"),
      poi("d3-food-dinner", 20, 0.02, "FOOD"),
    ]);
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");
    const day3Items = days[2].items;

    expect(day3Items).toHaveLength(2);
    const foodItems = day3Items.filter((i) => i.category === "FOOD");
    expect(foodItems).toHaveLength(1);
    expect(foodItems[0].poiId).toBe("d3-food-lunch");
    expect(day3Items.some((i) => i.poiId === "d3-food-dinner")).toBe(false);
    expect(day3Items.some((i) => i.poiId === "d3-attr")).toBe(true);

    // 저녁을 억지로 넣기 위해 17:30으로 시각을 크게 점프시키지 않았는지 확인한다.
    for (const item of day3Items) {
      expect(parseTimeSlotToMinutes(item.timeSlot) as number).toBeLessThan(parseTimeSlotToMinutes("17:30") as number);
    }
    expect(days).toHaveLength(3);
    expect(days.map((d) => d.dayIndex)).toEqual([1, 2, 3]);
  });

  it("저녁 FOOD를 생략해도 실행안 생성이 정상 완료되고, 다른 날짜의 일반 일정·lodging 계산에는 영향이 없다", () => {
    const pois = [
      ...threeDayClusteredPois([
        poi("d3-attr", 20, 0, "ATTRACTION"),
        poi("d3-food-lunch", 20, 0.01, "FOOD"),
        poi("d3-food-dinner", 20, 0.02, "FOOD"),
      ]),
      poi("lodge-1", 0, 0.03, "LODGING"),
      poi("lodge-2", 10, 0.05, "LODGING"),
    ];
    expect(() => buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK")).not.toThrow();

    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");
    expect(days[0].lodging).not.toBeNull();
    expect(days[1].lodging).not.toBeNull();
    expect(days[2].lodging ?? null).toBeNull();
    expect(days[0].items.length).toBeGreaterThan(0);
    expect(days[1].items.length).toBeGreaterThan(0);
  });
});

describe("buildDraftCourse — FOOD 1개의 자연스러운 슬롯 선택(3단계 보완)", () => {
  // 참고: 현재 모든 DurationCode의 날짜 시작 슬롯(예: DAY_TRIP 10:00, TWO_NIGHTS_THREE_DAYS 1일차
  // 12:00)이 점심 종료(13:30)보다 이르다. 따라서 buildDraftCourse의 실제 경로에서 "일정이 점심 이후
  // 시작"하는 상황 자체는 현재 도메인 정책상 발생하지 않는다 — 존재하지 않는 시나리오를 억지로
  // 재현하지 않는다. FOOD 1개는 2개 이상일 때와 동일한 shouldPlaceMealNow/computeMealArrivalMinutes
  // 로직을 그대로 타므로(전용 분기 없음), "도달 가능성"은 아래처럼 실제 buildDraftCourse 결과로
  // 검증한다.

  it("오전부터 시작하는 일정이면 점심 시간대에 한 번 배치된다", () => {
    const pois = [poi("attr-1", 0, 0, "ATTRACTION"), poi("food-1", 0, 0.01, "FOOD")];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK"); // DAY_TRIP 시작 10:00
    const foodItems = days[0].items.filter((i) => i.category === "FOOD");

    expect(foodItems).toHaveLength(1);
    const minutes = parseTimeSlotToMinutes(foodItems[0].timeSlot) as number;
    expect(minutes).toBeGreaterThanOrEqual(parseTimeSlotToMinutes("11:30") as number);
    expect(minutes).toBeLessThanOrEqual(parseTimeSlotToMinutes("13:30") as number);
  });

  it("단순히 '일정 시작이 오전인지'만 보지 않고 이동시간을 반영해 점심 도달 가능성을 판단한다 — 관광지를 순서대로 다 넣으면 점심을 놓칠 상황에서는 FOOD를 그 전에 끼워 넣어 실제로 점심 시간대 안에 도착시킨다", () => {
    // 2일차(목표 5개, 09:30 시작)에 서로 가까운 관광지 4곳과, 그보다 떨어진 FOOD 1곳을 배치한다.
    // "일정 시작이 오전"이라는 정적 조건만 보면 점심에 문제없어 보이지만, 관광지를 순서대로 전부
    // 먼저 넣으면 실제 FOOD 도착은 점심 시간대(13:30)를 넘긴다 — 그래서 이동시간까지 반영해 판단해야
    // FOOD가 관광지 일부보다 먼저 배치된다.
    const pois = [
      poi("d1-a", 0, 0, "ATTRACTION"),
      poi("d1-b", 0, 0.01, "ATTRACTION"),
      poi("d1-c", 0, 0.02, "ATTRACTION"),
      poi("d2-s1", 10, 0.01, "ATTRACTION"),
      poi("d2-s2", 10, 0.02, "ATTRACTION"),
      poi("d2-s3", 10, 0.03, "ATTRACTION"),
      poi("d2-s4", 10, 0.04, "ATTRACTION"),
      poi("d2-food", 10, 0.1, "FOOD"),
      poi("d3-a", 20, 0, "ATTRACTION"),
      poi("d3-b", 20, 0.01, "ATTRACTION"),
      poi("d3-c", 20, 0.02, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");
    const day2Items = days[1].items;

    expect(day2Items).toHaveLength(5);
    const foodIndex = day2Items.findIndex((i) => i.category === "FOOD");
    expect(foodIndex).toBeGreaterThanOrEqual(0);

    const foodMinutes = parseTimeSlotToMinutes(day2Items[foodIndex].timeSlot) as number;
    expect(foodMinutes).toBeGreaterThanOrEqual(parseTimeSlotToMinutes("11:30") as number);
    expect(foodMinutes).toBeLessThanOrEqual(parseTimeSlotToMinutes("13:30") as number);

    // 관광지 4곳을 순서대로 다 배치했다면 FOOD가 마지막(5번째)이 됐을 텐데, 이동시간을 반영해 도달
    // 가능성을 판단했기 때문에 FOOD가 마지막 자리에 있지 않다(적어도 하나의 관광지보다 먼저 배치됨).
    expect(foodIndex).toBeLessThan(4);

    // 겹침·역행 없이 시간순을 유지한다.
    for (let i = 1; i < day2Items.length; i++) {
      const prevEnd = (parseTimeSlotToMinutes(day2Items[i - 1].timeSlot) as number) + day2Items[i - 1].stayMinutes;
      const curStart = parseTimeSlotToMinutes(day2Items[i].timeSlot) as number;
      expect(curStart).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it("어느 경우든 FOOD 1개는 한 번만 배치되며 중복되지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("attr-2", 0, 0.01, "ATTRACTION"),
      poi("food-1", 0, 0.02, "FOOD"),
    ];
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");
    const allFoodPlacements = days.flatMap((d) => d.items.filter((i) => i.poiId === "food-1"));
    expect(allFoodPlacements).toHaveLength(1);
  });
});

/** item 배열 전체에 대해 "이전 항목 종료(시작+체류시간) 이후에만 다음 항목이 시작한다"는 비중첩
 * 불변식과, 모든 항목의 시작+체류시간이 하루 표시 범위(0~1439분) 안에 있다는 것을 검증한다. */
function expectNonOverlappingWithinDisplayableDay(items: { timeSlot: string; stayMinutes: number }[]) {
  for (let i = 0; i < items.length; i++) {
    const start = parseTimeSlotToMinutes(items[i].timeSlot) as number;
    expect(start).not.toBeNull();
    const end = start + items[i].stayMinutes;
    expect(end).toBeLessThanOrEqual(24 * 60 - 1);
    if (i > 0) {
      const prevEnd = (parseTimeSlotToMinutes(items[i - 1].timeSlot) as number) + items[i - 1].stayMinutes;
      expect(start).toBeGreaterThanOrEqual(prevEnd);
    }
  }
  // 서로 다른 두 항목이 같은 23:59로 뭉개져 겹치지 않는다.
  const atEndOfDay = items.filter((i) => i.timeSlot === "23:59");
  expect(atEndOfDay.length).toBeLessThanOrEqual(1);
}

describe("buildDraftCourse — 하루 범위 초과 후보는 건너뛰고 뒤 후보를 계속 검토(3단계 재보완)", () => {
  it("첫 번째로 검토한 후보가 멀어서 하루를 초과해도, 그 뒤의 가깝고 짧은 후보는 정상 배치된다", () => {
    // food(0,0)를 먼저 배치하게 만든 뒤(관광지를 그대로 두면 점심 시간대를 놓치므로), attr-far(food에서
    // 약 5,550km)는 하루 범위를 넘어 제외되지만, 그 다음 attr-near(food에서 약 1.1km)는 남은 시간
    // 안에 정상적으로 들어간다 — "먼저 걸린 후보 하나 때문에 나머지 전체를 포기하지 않는다"를 검증한다.
    const attrFar = poi("attr-far", 0, 50, "ATTRACTION");
    const food = poi("food-1", 0, 0, "FOOD");
    const attrNear = poi("attr-near", 0, 0.01, "ATTRACTION");
    const pois = [attrFar, food, attrNear];
    const before = JSON.parse(JSON.stringify(pois));

    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    // 뒤 후보(attr-near)는 정상적으로 배치된다.
    expect(items.some((i) => i.poiId === "attr-near")).toBe(true);
    // 하루를 초과한 첫 번째 후보(attr-far)는 배치되지 않는다.
    expect(items.some((i) => i.poiId === "attr-far")).toBe(false);
    // FOOD도 정상 배치된다(점심 시간대 안).
    const foodItem = items.find((i) => i.poiId === "food-1");
    expect(foodItem).toBeDefined();
    const foodMinutes = parseTimeSlotToMinutes(foodItem!.timeSlot) as number;
    expect(foodMinutes).toBeGreaterThanOrEqual(parseTimeSlotToMinutes("11:30") as number);
    expect(foodMinutes).toBeLessThanOrEqual(parseTimeSlotToMinutes("13:30") as number);

    expectNonOverlappingWithinDisplayableDay(items);
    expect(pois).toEqual(before); // 입력 POI 배열·객체는 변경되지 않는다.

    // 동일 입력에는 동일 결과(결정론성).
    const days2 = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    expect(days2).toEqual(days);
  });
});

describe("buildDraftCourse — 자정 wrap 방어(3단계 보완)", () => {
  it("극단적인 이동시간에서는 23:59로 뭉개 겹치게 만들지 않고, 그 날짜에서 더 이상 배치하지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("attr-2", 0, 0.01, "ATTRACTION"),
      poi("food-far", 0, 5, "FOOD"), // 약 555km — 극단적으로 먼 거리
    ];
    let days: ReturnType<typeof buildDraftCourse> | undefined;
    expect(() => {
      days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    }).not.toThrow();

    const items = days![0].items;
    // food-far는 이동시간을 반영한 판단으로 attr-1보다 먼저(점심 시간대 안에) 배치되지만, 그 다음
    // attr-1로 가는 이동시간이 극단적으로 커서 하루 표시 범위를 넘는다 — 그 시점부터는 더 배치하지
    // 않는다(23:59로 뭉개서 겹치게 만들지 않음). 그 결과 이 날짜에는 food-far 1건만 남는다.
    expect(items.length).toBeLessThan(pois.length);
    expect(items.some((i) => i.category === "FOOD")).toBe(true);
    expectNonOverlappingWithinDisplayableDay(items);
  });

  it("숙박 체크인 시각은 마지막 일정 종료 및 숙소까지 실제 이동시간을 더한 도착 시각보다 앞서지 않는다(모더레이트한 거리)", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-1", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("lodge-1", 0, 0.03, "LODGING"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const day1 = days[0];
    const lastItem = day1.items[day1.items.length - 1];
    const travelToLodging = estimateTravel(
      { lat: lastItem.lat, lng: lastItem.lng },
      { lat: 0, lng: 0.03 },
      "WALK",
    );

    // 마지막 item의 시작·종료만 비교하지 않고, 숙소까지 실제 이동시간까지 더한 도착 시각과 비교한다.
    const expectedArrival =
      (parseTimeSlotToMinutes(lastItem.timeSlot) as number) + lastItem.stayMinutes + (travelToLodging.minutes ?? 0);
    const checkinMinutes = parseTimeSlotToMinutes(day1.lodging!.timeSlot) as number;
    expect(checkinMinutes).toBeGreaterThanOrEqual(expectedArrival);
  });

  it("정상적으로 하루 안에 도착 가능한 경우, 체크인 시각은 실제 도착 시각(마지막 일정 시작+체류시간+숙소 이동시간)보다 빠르지 않다", () => {
    // 0.3도(약 33km) — 20시는 넘기지만 하루 표시 범위(24시)는 넘지 않는 모더레이트한 거리.
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 0.3, "LODGING");
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");
    const day1 = days[0];
    const lastItem = day1.items[day1.items.length - 1];
    const travel = estimateTravel(dayPoi, lodgingPoi, "WALK");

    const lastStartMinutes = parseTimeSlotToMinutes(lastItem.timeSlot) as number;
    const expectedArrival = lastStartMinutes + lastItem.stayMinutes + (travel.minutes ?? 0);
    expect(expectedArrival).toBeLessThan(24 * 60); // 이 테스트는 표시 가능한 범위 안의 케이스여야 의미가 있다.

    expect(day1.lodging).not.toBeNull();
    const checkinMinutes = parseTimeSlotToMinutes(day1.lodging!.timeSlot) as number;
    // 마지막 일정 시작·체류시간·실제 숙소 이동시간을 모두 더한 실제 도착 시각보다 빠르면 안 된다
    // (마지막 일정의 시작·종료 시각만 비교하는 것으로는 부족하다 — 이동시간까지 포함해 비교한다).
    expect(checkinMinutes).toBeGreaterThanOrEqual(expectedArrival);
  });

  it("실제 도착 시각(마지막 일정+체류시간+숙소 이동시간)이 하루 표시 범위를 넘는 극단적 입력에서는 23:59 같은 시각을 지어내지 않고 그 날짜의 숙박을 안전하게 생략한다", () => {
    // 숙소가 아주 멀어(약 111km) 도보 기준 이동시간이 커지도록 한다 — 실제 도착 시각이 24시간(1440분)을
    // 넘어 "HH:MM" 하나로 정확히 표현할 수 없다.
    const dayPoi = poi("a", 0, 0);
    const lodgingPoi = poi("l", 0, 1, "LODGING");
    const days = buildDraftCourse([dayPoi, lodgingPoi], "ONE_NIGHT_TWO_DAYS", "WALK");
    const day1 = days[0];
    const lastItem = day1.items[day1.items.length - 1];
    const travel = estimateTravel(dayPoi, lodgingPoi, "WALK");

    const lastStartMinutes = parseTimeSlotToMinutes(lastItem.timeSlot) as number;
    const expectedArrival = lastStartMinutes + lastItem.stayMinutes + (travel.minutes ?? 0);
    // 이 테스트가 의미를 가지려면 실제로 24시간을 넘기는 케이스여야 한다.
    expect(expectedArrival).toBeGreaterThan(24 * 60);

    // 표현 불가능한 도착 시각을 23:59 등으로 지어내지 않고, 그 날짜의 숙박 카드 자체를 생략한다.
    expect(day1.lodging ?? null).toBeNull();
    // 일반 일정 자체는 정상적으로 생성된다(실행안 생성 실패 없음).
    expect(day1.items.length).toBeGreaterThan(0);
    // 마지막 날에는 lodging을 만들지 않는 기존 정책은 그대로 유지된다.
    expect(days[1].lodging ?? null).toBeNull();
    // items/lodging 분리 구조도 그대로 유지된다(숙박이 생략됐다고 items에 섞여 들어가지 않음).
    expect(day1.items.some((i) => i.category === "LODGING")).toBe(false);
  });

  it("FOOD가 포함된 일정 전체가 겹치거나 역행하지 않고 시간순을 유지한다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-lunch", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("food-dinner", 0, 0.03, "FOOD"),
      poi("attr-3", 0, 0.04, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "TWO_NIGHTS_THREE_DAYS", "WALK");

    for (const day of days) {
      expectNonOverlappingWithinDisplayableDay(day.items);
    }
  });

  it("동일 입력에 대해 결정적으로 동일한 결과를 반환하고, 입력 POI는 변경되지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("food-1", 0, 0.01, "FOOD"),
      poi("attr-2", 0, 0.02, "ATTRACTION"),
      poi("lodge-1", 0, 0.03, "LODGING"),
    ];
    const before = JSON.parse(JSON.stringify(pois));

    const days1 = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const days2 = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days1).toEqual(days2);
    expect(pois).toEqual(before);
  });
});

describe("buildDraftCourse — 카페 등 비식사 FOOD는 식사 슬롯에서 제외하되 일반 일정으로 유지(3단계 카페 구분)", () => {
  it("일반 음식점 1개와 카페 1개가 있으면 음식점만 식사 슬롯에 배치되고 카페는 일반 방문 일정에 유지된다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      foodPoi("cafe-1", 0, 0.01, false),
      foodPoi("restaurant-1", 0, 0.02, true),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(3);
    expect(items.some((i) => i.poiId === "attr-1")).toBe(true);
    expect(items.some((i) => i.poiId === "cafe-1")).toBe(true); // 카페는 삭제되지 않는다.

    const restaurantItem = items.find((i) => i.poiId === "restaurant-1");
    expect(restaurantItem).toBeDefined();
    const minutes = parseTimeSlotToMinutes(restaurantItem!.timeSlot) as number;
    const inLunch =
      minutes >= (parseTimeSlotToMinutes("11:30") as number) && minutes <= (parseTimeSlotToMinutes("13:30") as number);
    const inDinner =
      minutes >= (parseTimeSlotToMinutes("17:30") as number) && minutes <= (parseTimeSlotToMinutes("19:30") as number);
    expect(inLunch || inDinner).toBe(true);

    expect(new Set(items.map((i) => i.poiId)).size).toBe(items.length); // 중복 없음
  });

  it("당일 FOOD 중 식사 가능한 곳이 하나도 없으면(카페만 있으면) 점심·저녁을 억지로 만들지 않고, 카페는 일반 관광지와 동일한 기준으로 배치된다", () => {
    // hasFood(=scheduleDayWithMeals 진입 여부)가 두 빌드에서 동일하게 유지되도록, 식사 가능한
    // restaurant-1을 양쪽 모두에 공통으로 두고 "그 다음 한 자리"만 카페 vs 일반 관광지로 바꿔 비교한다
    // (카페 유무로 아예 다른 스케줄러 경로를 타 버리면 공정한 비교가 안 된다).
    const withCafeExtra = buildDraftCourse(
      [poi("attr-1", 0, 0, "ATTRACTION"), foodPoi("restaurant-1", 0, 0.01, true), foodPoi("cafe-1", 0, 0.02, false)],
      "DAY_TRIP",
      "WALK",
    );
    const withAttractionExtra = buildDraftCourse(
      [poi("attr-1", 0, 0, "ATTRACTION"), foodPoi("restaurant-1", 0, 0.01, true), poi("attr-2", 0, 0.02, "ATTRACTION")],
      "DAY_TRIP",
      "WALK",
    );

    // 카페(mealEligible:false)를 같은 위치의 일반 관광지로 바꿔도 그 자리의 시각 배치가 완전히
    // 같다 — 식사 시간대에 맞추려는 어떤 특별 취급도 받지 않았다는 뜻이다(점심·저녁 강제 생성 없음).
    const cafeItem = withCafeExtra[0].items.find((i) => i.poiId === "cafe-1");
    const attrItem = withAttractionExtra[0].items.find((i) => i.poiId === "attr-2");
    expect(cafeItem).toBeDefined();
    expect(attrItem).toBeDefined();
    expect(cafeItem!.timeSlot).toBe(attrItem!.timeSlot);
  });

  it("일반 음식점 3개와 카페 1개가 있으면 음식점은 최대 2개만 식사 슬롯에 배치되고, 카페가 배열상 첫 번째 FOOD여도 식사 후보가 되지 않는다", () => {
    const pois = [
      foodPoi("cafe-1", 0, 0, false), // 첫 번째 FOOD지만 카페 — 식사 후보가 되면 안 된다.
      foodPoi("restaurant-1", 0, 0.01, true),
      foodPoi("restaurant-2", 0, 0.02, true),
      foodPoi("restaurant-3", 0, 0.03, true),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    // 세 번째 식사 가능 장소(restaurant-3)는 기존 정책대로 제외된다.
    expect(items.some((i) => i.poiId === "restaurant-3")).toBe(false);
    // 카페는 삭제되지 않고 유지된다.
    expect(items.some((i) => i.poiId === "cafe-1")).toBe(true);
    // 식사 가능 장소는 최대 2개(restaurant-1, restaurant-2)만 남는다.
    expect(items.some((i) => i.poiId === "restaurant-1")).toBe(true);
    expect(items.some((i) => i.poiId === "restaurant-2")).toBe(true);
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.poiId)).size).toBe(items.length); // 중복 없음
  });

  it("분류 정보가 없어 식사 가능 여부를 알 수 없는 FOOD는 안전하게 식사 후보에서 제외된다(삭제는 아님)", () => {
    // poiDetails.ts의 deriveMealEligible이 cat3가 없거나 알 수 없을 때 내려주는 값(false)과 동일하게
    // 구성한다 — 이름 기반이 아니라 실제 서비스 경로가 채우는 필드 그대로다. restaurant-1을 양쪽
    // 빌드에 공통으로 둬 hasFood 경로를 동일하게 유지한 채(공정한 비교) "그 다음 한 자리"만 바꾼다.
    const withUnknownFood = buildDraftCourse(
      [
        poi("attr-1", 0, 0, "ATTRACTION"),
        foodPoi("restaurant-1", 0, 0.01, true),
        foodPoi("unknown-food-1", 0, 0.02, false),
      ],
      "DAY_TRIP",
      "WALK",
    );
    const withAttractionExtra = buildDraftCourse(
      [
        poi("attr-1", 0, 0, "ATTRACTION"),
        foodPoi("restaurant-1", 0, 0.01, true),
        poi("attr-2", 0, 0.02, "ATTRACTION"),
      ],
      "DAY_TRIP",
      "WALK",
    );

    const unknownItem = withUnknownFood[0].items.find((i) => i.poiId === "unknown-food-1");
    expect(unknownItem).toBeDefined(); // 삭제되지 않는다.

    const attrItem = withAttractionExtra[0].items.find((i) => i.poiId === "attr-2");
    // 일반 관광지로 바꿔도 그 자리의 배치 시각이 동일하다 — 식사 슬롯으로 쓰이지 않았다는 뜻이다.
    expect(unknownItem!.timeSlot).toBe(attrItem!.timeSlot);
  });

  it("동일 입력에는 동일 결과가 나오고, 입력 POI 배열·객체는 변경되지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      foodPoi("cafe-1", 0, 0.01, false),
      foodPoi("restaurant-1", 0, 0.02, true),
    ];
    const before = JSON.parse(JSON.stringify(pois));

    const days1 = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const days2 = buildDraftCourse(pois, "DAY_TRIP", "WALK");

    expect(days1).toEqual(days2);
    expect(pois).toEqual(before);
  });
});
