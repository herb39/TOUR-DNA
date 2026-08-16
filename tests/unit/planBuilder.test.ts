import { describe, expect, it } from "vitest";
import {
  buildDraftCourse,
  buildKpis,
  buildOperationChecklist,
  buildRisks,
  recomputeDayItems,
  estimateTravel,
  parseTimeSlotToMinutes,
  minutesToTimeSlot,
  describeCourseItemPurpose,
  ceilToNext30Minutes,
  reorderCourseItemWithinDay,
  moveCourseItemToDay,
  insertPoiIntoDay,
  type PoiDetail,
  type CourseItemInput,
  type CourseDay,
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
    // 경도 0, 0.01, 0.02, 0.03(각 약 1.1km, 정상 이동 범위)에 일직선 배치, 입력은 0, 0.02, 0.01,
    // 0.03(지그재그) — 장거리 구간 제외 정책(2단계)과 섞이지 않도록 전 구간을 정상 이동 범위로 둔다.
    const pois = [poi("0", 0, 0), poi("2", 0, 0.02), poi("1", 0, 0.01), poi("3", 0, 0.03)];
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
    // 약 2.9km(도보 기준 정상 이동 범위) — 장거리 제외 정책과 섞이지 않도록 짧게 둔다.
    const pois = [poi("a", 36.35, 127.38), poi("b", 36.37, 127.4)];
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

describe("describeCourseItemPurpose — 실행안/인쇄 화면이 공용으로 쓰는 FOOD 목적 라벨(5단계)", () => {
  it("FOOD가 아니면 mealPurpose와 무관하게 카테고리만 반환한다", () => {
    expect(describeCourseItemPurpose({ category: "ATTRACTION" })).toBe("ATTRACTION");
    expect(describeCourseItemPurpose({ category: "EXPERIENCE", mealPurpose: "LUNCH" })).toBe("EXPERIENCE");
  });

  it("FOOD이고 mealPurpose가 있으면 목적을 붙인다", () => {
    expect(describeCourseItemPurpose({ category: "FOOD", mealPurpose: "LUNCH" })).toBe("FOOD · 점심");
    expect(describeCourseItemPurpose({ category: "FOOD", mealPurpose: "DINNER" })).toBe("FOOD · 저녁");
    expect(describeCourseItemPurpose({ category: "FOOD", mealPurpose: "GENERAL" })).toBe("FOOD · 카페/일반 방문");
  });

  it("FOOD인데 mealPurpose가 없으면(legacy 실행안) 카테고리만 반환한다 — 크래시하지 않는다", () => {
    expect(describeCourseItemPurpose({ category: "FOOD" })).toBe("FOOD");
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

  it("P0-3: 이동시간이 길어 기본 슬롯보다 늦게 도착하면, 자동 배정 항목의 시각이 실제 도착 시각(30분 올림)으로 밀린다", () => {
    // 도보로 약 96분 걸리는 거리(약 6.4km)를 만든다 — 운영에서 관찰된 "이동 약 96분" 사례를 재현.
    const items = [
      input({ poiId: "a", poiName: "A", timeSlot: "10:00", lat: 0, lng: 0 }),
      input({ poiId: "b", poiName: "B", lat: 0, lng: 0.064 }),
    ];
    const result = recomputeDayItems(items, "WALK", ["10:00", "11:00"]);
    // a: 10:00 시작 + 60분 체류 = 11:00 종료. 이동 약 96분 → 실제 도착 12:36 → 30분 올림 13:00.
    // 기존 방식이면 자리 기준 기본값(11:00)에 그대로 고정돼, 실제로는 도착 전인데도 이미 시작한
    // 것처럼 표시되고 여유시간이 음수가 됐다.
    expect(result[1].timeSlot).toBe("13:00");
  });

  it("P0-3: 이동시간이 짧으면(기본 슬롯보다 일찍 도착) 기존처럼 자리 기준 기본 슬롯을 그대로 쓴다(회귀 없음)", () => {
    const items = [
      input({ poiId: "a", poiName: "A", timeSlot: "10:00", lat: 0, lng: 0 }),
      input({ poiId: "b", poiName: "B", lat: 0, lng: 0.001 }),
    ];
    const result = recomputeDayItems(items, "WALK", ["10:00", "13:00"]);
    expect(result[1].timeSlot).toBe("13:00");
  });

  it("P0-3: 좌표 정보가 없으면(기존과 동일) 자리 기준 기본 슬롯을 그대로 쓴다", () => {
    const items = [
      input({ poiId: "a", poiName: "A", timeSlot: "10:00" }),
      input({ poiId: "b", poiName: "B" }),
    ];
    const result = recomputeDayItems(items, "WALK", ["10:00", "11:00"]);
    expect(result[1].timeSlot).toBe("11:00");
  });
});

describe("reorderCourseItemWithinDay / moveCourseItemToDay / insertPoiIntoDay — Drag & Drop 재정렬(Phase B 2단계, 2026-08-16)", () => {
  function makeDay(dayIndex: number, poiIds: string[]): CourseDay {
    return {
      dayIndex,
      items: poiIds.map((id, i) => ({
        order: i + 1,
        poiId: id,
        poiName: `POI-${id}`,
        category: "ATTRACTION",
        timeSlot: `${10 + i}:00`,
        stayMinutes: 60,
        travel: i === 0 ? "숙소/집결지에서 이동" : "이동 10분",
        lat: 36 + i * 0.01,
        lng: 127 + i * 0.01,
      })),
    };
  }

  function poiIdsOf(day: CourseDay): string[] {
    return day.items.map((it) => it.poiId);
  }

  it("같은 날짜 안에서 임의 자리로 옮긴다(A-B-C에서 C를 맨 앞으로 → C-A-B)", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    const result = reorderCourseItemWithinDay(days, 1, 2, 0, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["c", "a", "b"]);
  });

  it("인접 자리 이동은 위/아래 버튼(swap)과 동일한 결과를 낸다", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    // moveItem(dayIndex, 0, 1)과 동일한 호출(0번째를 1번째 자리로)
    const result = reorderCourseItemWithinDay(days, 1, 0, 1, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["b", "a", "c"]);
  });

  it("경계를 벗어나는 이동(첫 항목을 더 위로)은 버튼과 동일하게 변경 없이 그대로 반환한다", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    const result = reorderCourseItemWithinDay(days, 1, 0, -1, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["a", "b", "c"]);
  });

  it("존재하지 않는 fromIndex는 변경 없이 그대로 반환한다", () => {
    const days = [makeDay(1, ["a", "b"])];
    const result = reorderCourseItemWithinDay(days, 1, 5, 0, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["a", "b"]);
  });

  it("다른 날짜의 임의 자리로 옮긴다(1일차 B를 2일차 X·Y 사이로)", () => {
    const days = [makeDay(1, ["a", "b"]), makeDay(2, ["x", "y"])];
    // day1의 index1("b")을 day2의 index1(= x와 y 사이)로 이동
    const result = moveCourseItemToDay(days, 1, 1, 2, 1, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["a"]);
    expect(poiIdsOf(result[1])).toEqual(["x", "b", "y"]);
  });

  it("같은 날짜로 moveCourseItemToDay를 호출하면 reorderCourseItemWithinDay로 위임된다", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    const result = moveCourseItemToDay(days, 1, 2, 1, 0, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["c", "a", "b"]);
  });

  it("존재하지 않는 날짜로 이동을 시도하면 변경 없이 그대로 반환한다", () => {
    const days = [makeDay(1, ["a"])];
    const result = moveCourseItemToDay(days, 1, 0, 99, 0, "WALK");
    expect(result).toBe(days);
  });

  it("새 POI를 날짜의 임의 자리에 삽입한다(추천 후보 Drag 추가와 동일 경로)", () => {
    const days = [makeDay(1, ["a", "b"])];
    const newPoi = { id: "new", name: "새 장소", category: "ATTRACTION", lat: 36.5, lng: 127.5 };
    const result = insertPoiIntoDay(days, 1, newPoi, 1, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["a", "new", "b"]);
  });

  it("삽입 자리가 현재 길이를 넘으면(끝자리 추가와 동일) 맨 끝에 추가된다", () => {
    const days = [makeDay(1, ["a", "b"])];
    const newPoi = { id: "new", name: "새 장소", category: "ATTRACTION", lat: 36.5, lng: 127.5 };
    const result = insertPoiIntoDay(days, 1, newPoi, 999, "WALK");
    expect(poiIdsOf(result[0])).toEqual(["a", "b", "new"]);
  });

  it("결정론적이다 — 같은 입력을 여러 번 호출해도 같은 결과를 낸다", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    const r1 = reorderCourseItemWithinDay(days, 1, 2, 0, "WALK");
    const r2 = reorderCourseItemWithinDay(days, 1, 2, 0, "WALK");
    expect(poiIdsOf(r1[0])).toEqual(poiIdsOf(r2[0]));
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
    // P0-3(2026-07-27) 이후 자동 슬롯은 실제 이동시간을 반영해 뒤로 밀릴 수 있다 — 이 테스트의 관심사는
    // "숙박 분리 자체"이므로, 초과분(2일차에 몰림)이 누적돼도 하루 표시 범위를 넘지 않도록 좌표 간격을
    // 촘촘하게(같은 구역 취급 기준인 0.3km 미만) 둔다.
    const closeNonLodgingPois = Array.from({ length: 13 }, (_, i) => poi(`a-${i}`, 0, i * 0.002));
    const closeLodgingPois = Array.from({ length: 3 }, (_, i) => poi(`l-${i}`, 0, 0.03 + i * 0.002, "LODGING"));
    const pois = [...closeNonLodgingPois, ...closeLodgingPois];
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

  it("이동시간이 매우 커서 다른 후보와도 EXCESSIVE면 교환할 날짜가 없는 DAY_TRIP에서는 그대로 배제되고, 나머지는 시간이 역행하지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("attr-2", 0, 0.01, "ATTRACTION"),
      // 0.18도(약 20km) — 도보 기준 이동시간이 약 5시간(EXCESSIVE_TRAVEL_MINUTES 이상)으로, 같은 날짜의
      // 다른 어떤 장소와도 정상적으로 이어질 수 없다. DAY_TRIP은 교환할 다른 날짜가 없으므로(2단계) 이
      // 장소는 코스에서 제외된다 — 억지로 포함시켜 시각을 지어내지 않는다.
      poi("food-far", 0, 0.18, "FOOD"),
    ];
    let days: ReturnType<typeof buildDraftCourse> | undefined;
    expect(() => {
      days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    }).not.toThrow();

    const items = days![0].items;
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.poiId === "food-far")).toBe(false);
    expectChronological(items);
    expect(days![0].notices?.some((n) => n.includes("POI-food-far"))).toBe(true);
  });

  it("관광지를 하나 더 배치하면 점심 시간대를 명백히 놓치는 경우 FOOD가 먼저 배치된다", () => {
    // attr-1(day 시작점) → attr-2(약 0.55km, attr-1 바로 다음으로 정상 배치될 후보) → food-1(attr-1
    // 기준 약 5.5km, attr-2 기준 약 5km — 둘 다 CAUTION 대역(60~90분)이라 장거리 제외(2단계) 대상은
    // 아니다). attr-1만 먼저 넣으면 점심 시간대(13:30) 안에 food-1에 닿지만, attr-1과 attr-2를 순서대로
    // 다 넣은 뒤에 food-1로 가면 13:30을 넘긴다 — 그래서 food-1이 attr-2보다 먼저 배치돼야 한다.
    const pois = [poi("attr-1", 0, 0, "ATTRACTION"), poi("attr-2", 0, 0.005, "ATTRACTION"), poi("food-1", 0, 0.05, "FOOD")];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(3);
    expect(items[0].poiId).toBe("attr-1");
    expect(items[1].poiId).toBe("food-1");
    expect(items[2].poiId).toBe("attr-2");
    const lunchMinutes = parseTimeSlotToMinutes(items[1].timeSlot) as number;
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
      // d2-s1..s4 중 어느 쪽과 이웃이 되어도(도보 기준) CAUTION 대역(90분 미만)을 유지하도록 클러스터에
      // 충분히 가깝게 두되(장거리 제외 정책(2단계) 대상인 EXCESSIVE는 아님), 관광지 4곳을 순서대로 다
      // 지난 뒤에 가면 점심 시간대를 놓치는 거리로 유지한다.
      poi("d2-food", 10, 0.06, "FOOD"),
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
  it("EXCESSIVE 없이 CAUTION 대역 이동이 여러 번 누적돼 하루를 넘겨도, 23:59로 뭉개 겹치게 만들지 않고 그 날짜에서 더 이상 배치하지 않는다", () => {
    // food-1(시작점)에서 각 구간 약 75분(CAUTION 대역, EXCESSIVE_TRAVEL_MINUTES 미만이라 장거리 제외
    // 정책(2단계) 대상은 아님)씩 떨어진 관광지를 사슬처럼 이어 붙인다 — 개별 구간은 모두 정상 범위지만
    // 누적되면 하루 표시 범위(0~1439분)를 넘는다. 이때도 23:59로 뭉개 겹치는 항목을 만들지 않고, 더
    // 이상 들어갈 수 없는 항목부터는 배치를 멈춘다(기존 자정-랩 방어 로직 — 이번 장거리 정책과는 별개로
    // 여전히 필요하다: 장거리 제외는 "구간 하나가 비정상"일 때, 이 방어는 "정상 구간이 누적돼 하루가
    // 다 찼을 때" 대응한다).
    const pois = [
      poi("food-1", 0, 0, "FOOD"),
      poi("attr-1", 0, 0.045, "ATTRACTION"),
      poi("attr-2", 0, 0.09, "ATTRACTION"),
      poi("attr-3", 0, 0.135, "ATTRACTION"),
      poi("attr-4", 0, 0.18, "ATTRACTION"),
      poi("attr-5", 0, 0.225, "ATTRACTION"),
      poi("attr-6", 0, 0.27, "ATTRACTION"),
      poi("attr-7", 0, 0.315, "ATTRACTION"),
    ];
    let days: ReturnType<typeof buildDraftCourse> | undefined;
    expect(() => {
      days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    }).not.toThrow();

    const items = days![0].items;
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

describe("buildDraftCourse — 통영 사례를 본뜬 회귀 테스트(1일차 점심·저녁, 2일차 점심 총 3회 식사가 모두 보장된다)", () => {
  const LUNCH_START = parseTimeSlotToMinutes("11:30") as number;
  const LUNCH_END = parseTimeSlotToMinutes("13:30") as number;
  const DINNER_START = parseTimeSlotToMinutes("17:30") as number;
  const DINNER_END = parseTimeSlotToMinutes("19:30") as number;

  it("1박 2일(1일차 11:00~20:00 체크인, 2일차 09:30~오후)에 식사 가능 FOOD가 거리 조건 안에 충분하면 1일차 점심·저녁, 2일차 점심이 각각 서로 다른 곳에 배치되고 카페는 식사 슬롯에서 빠진다", () => {
    // 1일차 군집(위도 0): 관광지 1곳 + 카페(식사 불가) 1곳 + 식사 가능 음식점 2곳(점심·저녁용).
    // 2일차 군집(위도 10): 체험 2곳 + 식사 가능 음식점 1곳(점심용). 숙소는 1일차 군집 근처에 둔다.
    // 통영 재현 사례처럼 지역에 식사 가능 FOOD가 실제로 공급되면(selectPois의 식사 선점 + planService의
    // 지역 보충으로 확보되는 상황을 흉내낸다) 총 3회 식사가 각 날짜의 올바른 시간대에 모두 배치돼야 한다.
    const pois = [
      poi("d1-attr-1", 0, 0, "ATTRACTION"),
      foodPoi("d1-cafe", 0, 0.01, false),
      foodPoi("d1-food-lunch", 0, 0.02, true),
      foodPoi("d1-food-dinner", 0, 0.03, true),
      poi("d2-exp-1", 10, 0, "EXPERIENCE"),
      poi("d2-exp-2", 10, 0.01, "EXPERIENCE"),
      foodPoi("d2-food-lunch", 10, 0.02, true),
      poi("lodge-1", 0, 0.05, "LODGING"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days).toHaveLength(2);
    expect(days[0].items).toHaveLength(4);
    expect(days[1].items).toHaveLength(3);

    // 1일차: 점심 FOOD와 저녁 FOOD가 서로 다른 곳에, 각자의 시간대 안에 배치된다.
    const day1Lunch = days[0].items.find((i) => i.poiId === "d1-food-lunch");
    const day1Dinner = days[0].items.find((i) => i.poiId === "d1-food-dinner");
    expect(day1Lunch).toBeDefined();
    expect(day1Dinner).toBeDefined();
    const day1LunchMinutes = parseTimeSlotToMinutes(day1Lunch!.timeSlot) as number;
    const day1DinnerMinutes = parseTimeSlotToMinutes(day1Dinner!.timeSlot) as number;
    expect(day1LunchMinutes).toBeGreaterThanOrEqual(LUNCH_START);
    expect(day1LunchMinutes).toBeLessThanOrEqual(LUNCH_END);
    expect(day1DinnerMinutes).toBeGreaterThanOrEqual(DINNER_START);
    expect(day1DinnerMinutes).toBeLessThanOrEqual(DINNER_END);

    // 카페는 식사 슬롯에서 제외되지만(점심·저녁 시간대에 배치되지 않음) 일반 방문 일정에는 남는다.
    const day1Cafe = days[0].items.find((i) => i.poiId === "d1-cafe");
    expect(day1Cafe).toBeDefined();
    const day1CafeMinutes = parseTimeSlotToMinutes(day1Cafe!.timeSlot) as number;
    const cafeInLunch = day1CafeMinutes >= LUNCH_START && day1CafeMinutes <= LUNCH_END;
    const cafeInDinner = day1CafeMinutes >= DINNER_START && day1CafeMinutes <= DINNER_END;
    expect(cafeInLunch || cafeInDinner).toBe(false);

    // 2일차: 점심 FOOD가 배치되고, EXPERIENCE가 점심 시간대보다 먼저 그 자리를 차지하지 않는다.
    const day2Lunch = days[1].items.find((i) => i.poiId === "d2-food-lunch");
    expect(day2Lunch).toBeDefined();
    const day2LunchMinutes = parseTimeSlotToMinutes(day2Lunch!.timeSlot) as number;
    expect(day2LunchMinutes).toBeGreaterThanOrEqual(LUNCH_START);
    expect(day2LunchMinutes).toBeLessThanOrEqual(LUNCH_END);
    const day2ExperienceInLunchWindow = days[1].items.some((i) => {
      if (i.category !== "EXPERIENCE") return false;
      const m = parseTimeSlotToMinutes(i.timeSlot) as number;
      return m >= LUNCH_START && m <= LUNCH_END;
    });
    expect(day2ExperienceInLunchWindow).toBe(false);

    // 식사 3곳은 서로 다른 POI이며 중복 배치가 없다.
    const mealIds = [day1Lunch!.poiId, day1Dinner!.poiId, day2Lunch!.poiId];
    expect(new Set(mealIds).size).toBe(3);
    const allIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(new Set(allIds).size).toBe(allIds.length);

    // 관광지·체험 장소도 삭제되지 않고 모두 남아 있어야 한다.
    for (const id of ["d1-attr-1", "d2-exp-1", "d2-exp-2"]) {
      expect(allIds).toContain(id);
    }

    // 1일차 숙소 체크인이 실제로 계산되고, 하루 표시 범위(자정)를 넘기지 않는다.
    expect(days[0].lodging).not.toBeNull();
    expect(parseTimeSlotToMinutes(days[0].lodging!.timeSlot)).not.toBeNull();
    expect(days[1].lodging ?? null).toBeNull();

    // 모든 항목이 서로 겹치지 않고 시간순이며 하루 표시 범위를 넘지 않는다.
    for (const day of days) {
      for (let i = 1; i < day.items.length; i++) {
        const prevEnd = (parseTimeSlotToMinutes(day.items[i - 1].timeSlot) as number) + day.items[i - 1].stayMinutes;
        const curStart = parseTimeSlotToMinutes(day.items[i].timeSlot) as number;
        expect(curStart).toBeGreaterThanOrEqual(prevEnd);
      }
    }
  });

  it("최근접 이웃 정렬이 식사 가능 FOOD를 한 날짜에 몰아줘도(날짜별 목표상 3번째 이상이라 그 날짜에서는 제외된 후보), 실제로 도달 가능한 다른 날짜로 옮겨 점심을 채운다(날짜별 식사 보장 구조 검증)", () => {
    // 1일차 군집(위도 0)에 식사 가능 FOOD 3곳을 몰아넣는다 — 최근접 이웃 정렬만으로는 1일차가 이미
    // 필요한 점심·저녁을 채우고(첫 2곳), 세 번째는 "그 날짜의 3번째 이상"이라 그대로 제외된다(기존
    // 정책 그대로 보존). 2일차 군집(위도 0.06 — 실제로 걸어서 도달 가능한 가까운 거리)에는 식사 가능
    // FOOD가 하나도 없다 — 공급 단계(selectPois/planService)가 놓친 경우를 흉내낸다. 날짜별 식사 보장
    // 로직이 1일차에서 쓰이지 않은 세 번째 FOOD를 2일차로 옮겨 점심을 채워야 한다.
    const pois = [
      poi("d1-attr", 0, 0, "ATTRACTION"),
      foodPoi("d1-food-lunch", 0, 0.01, true),
      foodPoi("d1-food-dinner", 0, 0.02, true),
      foodPoi("d1-food-extra", 0, 0.03, true), // 1일차 세 번째 식사 가능 FOOD — 그대로면 어디에도 안 쓰인다.
      poi("d2-attr-1", 0.06, 0, "ATTRACTION"),
      poi("d2-attr-2", 0.06, 0.01, "ATTRACTION"),
      poi("d2-attr-3", 0.06, 0.02, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days).toHaveLength(2);

    // 1일차는 기존 정책 그대로: 첫 두 FOOD만 점심·저녁으로 쓰이고, d1-food-extra는 1일차에는 없다.
    expect(days[0].items.some((i) => i.poiId === "d1-food-lunch")).toBe(true);
    expect(days[0].items.some((i) => i.poiId === "d1-food-dinner")).toBe(true);
    expect(days[0].items.some((i) => i.poiId === "d1-food-extra")).toBe(false);

    // 2일차는 원래 FOOD가 하나도 없었지만, 실제로 도달 가능한 d1-food-extra가 옮겨져 점심으로 배치된다.
    const day2Food = days[1].items.find((i) => i.poiId === "d1-food-extra");
    expect(day2Food).toBeDefined();
    const day2FoodMinutes = parseTimeSlotToMinutes(day2Food!.timeSlot) as number;
    expect(day2FoodMinutes).toBeGreaterThanOrEqual(LUNCH_START);
    expect(day2FoodMinutes).toBeLessThanOrEqual(LUNCH_END);

    // 옮겨진 FOOD도 다른 곳과 중복 배치되지 않는다.
    const allIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(allIds)).toEqual(new Set(pois.map((p) => p.id)));
  });

  it("옮길 만한 후보가 실제로 도달 불가능할 만큼 멀면 억지로 옮기지 않고 안전하게 식사를 생략한다", () => {
    // 2일차 군집(위도 20)이 1일차 군집(위도 0)에서 도보로 도달 불가능할 만큼 멀다 — 이 경우 1일차의
    // 쓰이지 않은 세 번째 FOOD가 있어도 2일차로 옮기지 않는다(실제로 배치 가능한 후보가 없을 때만
    // 생략한다는 원칙 — 무조건 우겨넣지 않는다).
    const pois = [
      poi("d1-attr", 0, 0, "ATTRACTION"),
      foodPoi("d1-food-lunch", 0, 0.01, true),
      foodPoi("d1-food-dinner", 0, 0.02, true),
      foodPoi("d1-food-extra", 0, 0.03, true),
      poi("d2-attr-1", 20, 0, "ATTRACTION"),
      poi("d2-attr-2", 20, 0.01, "ATTRACTION"),
      poi("d2-attr-3", 20, 0.02, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    expect(days).toHaveLength(2);
    expect(days[1].items.some((i) => i.category === "FOOD")).toBe(false);
    // 억지로 옮기지 않았으므로 d1-food-extra는 어디에도 배치되지 않는다(기존 3번째 이상 제외 정책과 동일).
    const allIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(allIds).not.toContain("d1-food-extra");
    expect(() => buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK")).not.toThrow();
  });
});

describe("buildDraftCourse — 강릉 사례를 본뜬 회귀 테스트(연속 FOOD 방지, 공백 후보 활용, 목적 라벨)", () => {
  it("1일차: 카페가 점심 바로 앞/뒤에 붙지 않고, 도달 가능한 추가 관광 후보가 점심·저녁 사이 공백을 채운다", () => {
    // 1일차 군집(위도 0): 오전 카페(mealEligible=false), 점심용 FOOD, 오후 관광지, 저녁용 FOOD,
    // 공백을 메울 추가 관광 후보 2곳. 2일차 군집(위도 10)은 단순 채움용 관광지 4곳뿐이다(날짜별 개수
    // 분배가 군집을 그대로 보존하도록 총량을 맞췄다. 30분 올림으로 하루 안에 들어가는 항목 수가
    // 줄어들 수 있어(6단계) 이전보다 항목을 하나 줄였다).
    const pois = [
      foodPoi("cafe-am", 0, 0, false),
      foodPoi("lunch-food", 0, 0.01, true),
      poi("attr-pm", 0, 0.02, "ATTRACTION"),
      foodPoi("dinner-food", 0, 0.03, true),
      poi("extra-attr", 0, 0.04, "ATTRACTION"),
      poi("extra-attr-2", 0, 0.05, "ATTRACTION"),
      poi("d2-a", 10, 0, "ATTRACTION"),
      poi("d2-b", 10, 0.01, "ATTRACTION"),
      poi("d2-c", 10, 0.02, "ATTRACTION"),
      poi("d2-d", 10, 0.03, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const items = days[0].items;

    // 아무것도 삭제되지 않는다 — 카페와 추가 관광 후보 모두 그대로 남아 있어야 한다.
    const day1Ids = items.map((i) => i.poiId);
    expect(day1Ids).toContain("cafe-am");
    expect(day1Ids).toContain("extra-attr");
    expect(day1Ids).toContain("attr-pm");
    expect(new Set(day1Ids).size).toBe(day1Ids.length);

    // 점심·저녁은 실제 식사 가능 FOOD여야 한다.
    const lunchItem = items.find((i) => i.poiId === "lunch-food")!;
    const dinnerItem = items.find((i) => i.poiId === "dinner-food")!;
    expect(lunchItem.mealPurpose).toBe("LUNCH");
    expect(dinnerItem.mealPurpose).toBe("DINNER");

    // 카페(비식사용 FOOD)는 실제 점심 바로 앞이나 뒤에 붙지 않는다(연속 FOOD 방지의 핵심 재현 대상 —
    // 강릉 사례의 실제 버그가 "카페 직후 점심"이었다). 대체 가능한 관광 후보가 있으므로 카페가 점심
    // 자리를 침범하지 않는다.
    const cafeIndex = items.findIndex((i) => i.poiId === "cafe-am");
    const lunchIndex = items.findIndex((i) => i.poiId === "lunch-food");
    const dinnerIndex = items.findIndex((i) => i.poiId === "dinner-food");
    expect(Math.abs(cafeIndex - lunchIndex)).toBeGreaterThan(1);
    // 저녁 이후에는 대체 가능한 관광 후보가 모두 소진돼 카페가 마지막 자리를 차지할 수 있다 — 이는
    // "대체 후보가 없으면 카페라도 그대로 배치한다"는 정책상 허용된 예외다(무조건 모든 연속 배치를
    // 금지하지는 않음). 다만 그 예외가 실제로 "대체 후보 소진" 때문인지 — extra-attr/extra-attr-2가
    // 이미 카페보다 앞서 배치됐는지로 확인한다(대체 후보를 두고도 건너뛴 것이 아님을 검증).
    if (Math.abs(cafeIndex - dinnerIndex) <= 1) {
      const extraIndex = items.findIndex((i) => i.poiId === "extra-attr");
      const extra2Index = items.findIndex((i) => i.poiId === "extra-attr-2");
      expect(extraIndex).toBeLessThan(cafeIndex);
      expect(extra2Index).toBeLessThan(cafeIndex);
    }

    // 추가 관광 후보는 실제로 배치돼(생략되지 않고) 점심 이후·저녁 이전 공백을 채우는 데 쓰인다.
    const lunchMinutes = parseTimeSlotToMinutes(lunchItem.timeSlot) as number;
    const dinnerMinutes = parseTimeSlotToMinutes(dinnerItem.timeSlot) as number;
    const extraItem = items.find((i) => i.poiId === "extra-attr")!;
    const extraMinutes = parseTimeSlotToMinutes(extraItem.timeSlot) as number;
    expect(extraMinutes).toBeGreaterThan(lunchMinutes);
    expect(extraMinutes).toBeLessThan(dinnerMinutes);

    // 시간 역행·중첩이 없다.
    for (let i = 1; i < items.length; i++) {
      const prevEnd = (parseTimeSlotToMinutes(items[i - 1].timeSlot) as number) + items[i - 1].stayMinutes;
      const curStart = parseTimeSlotToMinutes(items[i].timeSlot) as number;
      expect(curStart).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it("20:00 숙소 체크인은 그 날짜 마지막 일반 일정 종료 이후로 계산되고, 절대 그보다 앞서지 않는다", () => {
    const pois = [
      poi("attr-pm", 0, 0, "ATTRACTION"),
      foodPoi("lunch-food", 0, 0.01, true),
      foodPoi("dinner-food", 0, 0.02, true),
      poi("lodge-1", 0, 0.03, "LODGING"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const items = days[0].items;

    expect(days[0].lodging).not.toBeNull();
    const lastEnd = (parseTimeSlotToMinutes(items[items.length - 1].timeSlot) as number) + items[items.length - 1].stayMinutes;
    const checkinMinutes = parseTimeSlotToMinutes(days[0].lodging!.timeSlot) as number;
    expect(checkinMinutes).toBeGreaterThanOrEqual(lastEnd);
  });

  it("대체 가능한 일반 관광 후보가 전혀 없으면(카페뿐이면) 카페라도 그대로 배치한다 — 방문 자체를 생략하지 않는다", () => {
    const pois = [foodPoi("lunch-food", 0, 0, true), foodPoi("cafe-only", 0, 0.01, false)];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(2);
    expect(items.some((i) => i.poiId === "cafe-only")).toBe(true);
  });
});

describe("buildDraftCourse — FOOD 연속배치 방지 일반화(2026-07-27, 경주/강릉 카페-카페 연속배치 재현 보완)", () => {
  it("카페(mealEligible=false) 두 곳이 연속 배치되지 않는다 — 실제 식사와 무관하게 대체 가능한 비-FOOD 후보가 있으면 그 사이에 끼워 넣는다", () => {
    // 기존 연속배치 방지(5단계)는 "실제 식사(lunch/dinner) 바로 앞/뒤" 기준으로만 판단해, 식사와
    // 무관한 카페 두 곳이 연달아 배치되는 경우(예: 경주 "오미토리 커피상점→가람집옹심이")는 막지
    // 못했다. FOOD가 전부 mealEligible=false(카페)라 lunch/dinner 자체가 없는 상황에서도, 대체 가능한
    // 관광지가 있으면 카페끼리 연속 배치되지 않아야 한다.
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      foodPoi("cafe-1", 0, 0.01, false),
      foodPoi("cafe-2", 0, 0.02, false),
      poi("attr-2", 0, 0.03, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items.map((i) => i.poiId)).toEqual(["attr-1", "cafe-1", "attr-2", "cafe-2"]);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].category === "FOOD" && items[i].category === "FOOD").toBe(false);
    }
  });

  it("대체 가능한 비-FOOD 후보가 전혀 없으면(카페뿐이면) 카페끼리도 연속 배치를 허용한다 — 방문 자체를 생략하지 않는다", () => {
    const pois = [foodPoi("cafe-1", 0, 0, false), foodPoi("cafe-2", 0, 0.01, false)];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.poiId).sort()).toEqual(["cafe-1", "cafe-2"]);
  });
});

describe("buildDraftCourse — 장거리 구간 처리(2단계, 경주 87분·127분 이동 재현 보완)", () => {
  it("날짜별 목표 개수 경계 때문에 다른 군집(EXCESSIVE 거리)에 잘못 섞인 후보는 실제로 가까운 날짜로 옮겨진다", () => {
    // 위도 0 부근에 5곳(군집 A), 위도 10 부근에 2곳(군집 B) — 최근접 이웃 정렬은 [a1..a5, b1, b2] 순이
    // 되고, ONE_NIGHT_TWO_DAYS의 날짜별 목표 개수([4, 3])로 그대로 자르면 a5가 1일차 목표를 넘겨
    // 2일차([a5, b1, b2])로 밀려난다 — a5는 군집 A 소속인데 군집 B와 한 날짜에 묶여 실행 불가능한
    // 이동(약 1,112km)이 생긴다. 이 경우 a5를 실제로 가까운 날짜(1일차)로 재배정해서 해결해야 한다
    // (코스에서 제외하는 것은 최후 수단이다).
    const pois = [
      poi("a1", 0, 0, "ATTRACTION"),
      poi("a2", 0, 0.01, "ATTRACTION"),
      poi("a3", 0, 0.02, "ATTRACTION"),
      poi("a4", 0, 0.03, "ATTRACTION"),
      poi("a5", 0, 0.04, "ATTRACTION"),
      poi("b1", 10, 0, "ATTRACTION"),
      poi("b2", 10, 0.01, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");

    // a5는 코스에서 제외되지 않고, 군집 A와 같은 날짜(1일차)로 재배정된다.
    expect(days[0].items.map((i) => i.poiId).sort()).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(days[1].items.map((i) => i.poiId).sort()).toEqual(["b1", "b2"]);
    expect(days[0].notices ?? []).toHaveLength(0);
    expect(days[1].notices ?? []).toHaveLength(0);

    // 결과 코스 안에는 EXCESSIVE(90분 이상) 인접 구간이 남아있지 않다.
    for (const day of days) {
      for (let i = 1; i < day.items.length; i++) {
        const minutesMatch = day.items[i].travel.match(/약 (\d+)분/);
        if (minutesMatch) expect(Number(minutesMatch[1])).toBeLessThan(90);
      }
    }
  });

  it("옮길 수 있는 날짜가 전혀 없으면(고립된 장거리 후보) 코스에서 제외하고 사유를 notices에 남긴다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      poi("attr-2", 0, 0.01, "ATTRACTION"),
      poi("isolated", 50, 50, "ATTRACTION"), // 다른 어떤 날짜와도 EXCESSIVE
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items.some((i) => i.poiId === "isolated")).toBe(false);
    expect(items.map((i) => i.poiId).sort()).toEqual(["attr-1", "attr-2"]);
    expect(days[0].notices?.some((n) => n.includes("POI-isolated"))).toBe(true);
  });

  it("점심/저녁 시간대 배치(3단계) 이후 새로 생긴 EXCESSIVE 인접도 제거한다(2026-08-14, 경주 실 운영 106분 구간 재현)", () => {
    // 2단계(repairExcessiveTravelSegments)는 scheduleDayPois가 FOOD를 점심/저녁 시간대에 맞춰
    // 재배치하기 전의(최근접 이웃) 순서만 검사한다. 실제 운영(경주 문화·역사 실행안, MIXED 교통)에서는
    // 이 재배치 이후 최종 순서에 90분 기준을 넘는 구간(황남밀면→감포공설시장 106분)이 새로 생겼는데도
    // 화면에 그대로 남아 있었다 — 이 테스트는 그 실제 좌표 데이터를 그대로 재현한다(수정 전에는 실패,
    // 수정 후에는 통과하는 것을 직접 확인했다). 경주 시내 군집(대부분) + 동떨어진 감포 군집(감포공설
    // 시장·감포항) 조합에서, 3단계 재배치가 감포 군집을 시내 FOOD 바로 뒤에 붙여 EXCESSIVE 구간을
    // 새로 만든다.
    const pois: PoiDetail[] = [
      poi("gulbulsa", 35.8578720995, 129.2303433362, "ATTRACTION"),
      { ...poi("hwasan", 35.9275264313, 129.2877918634, "FOOD"), mealEligible: true } as PoiDetail,
      poi("youth-center", 35.8544694288, 129.2156919397, "EXPERIENCE"),
      poi("camping", 35.9810480877, 129.1373340915, "EXPERIENCE"),
      { ...poi("hwangnam-milmyeon", 35.8360160961, 129.2106830176, "FOOD"), mealEligible: true } as PoiDetail,
      { ...poi("onui", 35.8567625191, 129.225773146, "FOOD"), mealEligible: true } as PoiDetail,
      poi("sonokam", 35.8467893529, 129.2817014891, "LODGING"),
      poi("waterpark", 35.8179335881, 129.3056850979, "ATTRACTION"),
      { ...poi("hwangnam-bibimbap", 35.8340799622, 129.2102846606, "FOOD"), mealEligible: true } as PoiDetail,
      poi("gampo-market", 35.8041527624, 129.5020460934, "SHOPPING"),
      poi("gampo-port", 35.8078329413, 129.5040374805, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "MIXED");
    const allItems = days.flatMap((d) => d.items);

    // 결과 코스 안에는 EXCESSIVE(90분 이상) 인접 구간이 남아있지 않다 — 3단계 재배치 이후에도 보장된다.
    for (const day of days) {
      for (let i = 1; i < day.items.length; i++) {
        const minutesMatch = day.items[i].travel.match(/약 (\d+)분/);
        if (minutesMatch) expect(Number(minutesMatch[1])).toBeLessThan(90);
      }
    }
    // FOOD는 이 정리 과정에서 제외되지 않는다(필수 슬롯 보호).
    expect(allItems.some((i) => i.category === "FOOD")).toBe(true);
  });
});

describe("buildDraftCourse — 2일차(09:30 시작, 오후 종료) 회귀 테스트: 점심이 가로채이지 않고, 도달 가능한 후보가 있으면 조기 종료하지 않는다", () => {
  it("오전 카페·체험이 있어도 점심은 실제 식사 가능 FOOD로 배치되고, 체험이 점심 시간대를 가로채지 않으며, 점심 이후에도 일정이 이어진다", () => {
    // 1일차 군집(위도 0, 6곳)은 단순 채움용이다. 2일차 군집(위도 10)에 "09:30 시작, 오후 종료"
    // 조건의 실제 검증 대상(카페/체험/점심/관광지 2곳, 5곳)을 둔다 — 날짜별 개수 분배가 두 군집을
    // 정확히 6/5로 나누도록(초과분 재배분 없이) 총량을 맞췄다.
    const pois = [
      poi("d1-a", 0, 0, "ATTRACTION"),
      poi("d1-b", 0, 0.01, "ATTRACTION"),
      poi("d1-c", 0, 0.02, "ATTRACTION"),
      poi("d1-d", 0, 0.03, "ATTRACTION"),
      poi("d1-e", 0, 0.04, "ATTRACTION"),
      poi("d1-f", 0, 0.05, "ATTRACTION"),
      foodPoi("d2-cafe-am", 10, 0, false),
      poi("d2-experience", 10, 0.01, "EXPERIENCE"),
      foodPoi("d2-lunch", 10, 0.02, true),
      poi("d2-attr-1", 10, 0.03, "ATTRACTION"),
      poi("d2-attr-2", 10, 0.04, "ATTRACTION"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    expect(days[0].items).toHaveLength(6);
    const day2Items = days[1].items;
    expect(day2Items).toHaveLength(5);

    // 점심은 실제 식사 가능 FOOD여야 하고, 체험이 점심 시간대를 가로채지 않는다.
    const lunchItem = day2Items.find((i) => i.poiId === "d2-lunch")!;
    expect(lunchItem.mealPurpose).toBe("LUNCH");
    const lunchMinutes = parseTimeSlotToMinutes(lunchItem.timeSlot) as number;
    const LUNCH_START = parseTimeSlotToMinutes("11:30") as number;
    const LUNCH_END = parseTimeSlotToMinutes("13:30") as number;
    expect(lunchMinutes).toBeGreaterThanOrEqual(LUNCH_START);
    expect(lunchMinutes).toBeLessThanOrEqual(LUNCH_END);
    // 체험(EXPERIENCE)이 점심 자리를 대신 차지하지 않는다 — mealPurpose="LUNCH"는 오직 실제 식사 가능
    // FOOD 하나에만 부여된다(장소명·시각이 아니라 splitMealCandidates가 결정한 값을 그대로 확인한다).
    expect(day2Items.filter((i) => i.mealPurpose === "LUNCH")).toHaveLength(1);
    expect(day2Items.find((i) => i.mealPurpose === "LUNCH")!.poiId).toBe("d2-lunch");
    expect(day2Items.some((i) => i.category === "EXPERIENCE" && i.mealPurpose === "LUNCH")).toBe(false);

    // 카페는 점심으로 계산되지 않는다.
    const cafeItem = day2Items.find((i) => i.poiId === "d2-cafe-am")!;
    expect(cafeItem.mealPurpose).not.toBe("LUNCH");

    // 일정이 점심 직후(13:30) 바로 끝나지 않는다 — 도달 가능한 후보가 있으면 오후 시간대도 채운다.
    const lastItem = day2Items[day2Items.length - 1];
    const lastEnd = (parseTimeSlotToMinutes(lastItem.timeSlot) as number) + lastItem.stayMinutes;
    expect(lastEnd).toBeGreaterThan(LUNCH_END);

    // 모든 항목의 시작 시각이 00분 또는 30분이다(6단계 — 날짜별 슬롯의 마지막 값(15:00)은 저녁
    // 도달 가능 여부 판단에만 쓰이는 값이라, 일반 항목이 그 이후로 이어지는 것 자체는 기존에도
    // 허용됐다 — 하루 절대 범위 초과 여부는 fitsWithinDisplayableDay가 별도로 판단한다).
    for (const item of day2Items) {
      const minutes = parseTimeSlotToMinutes(item.timeSlot) as number;
      expect(minutes % 30 === 0).toBe(true);
    }

    // 시간 역행·중첩이 없고, 중복 배치가 없다.
    for (let i = 1; i < day2Items.length; i++) {
      const prevEnd = (parseTimeSlotToMinutes(day2Items[i - 1].timeSlot) as number) + day2Items[i - 1].stayMinutes;
      const curStart = parseTimeSlotToMinutes(day2Items[i].timeSlot) as number;
      expect(curStart).toBeGreaterThanOrEqual(prevEnd);
    }
    const allIds = days.flatMap((d) => d.items.map((i) => i.poiId));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe("buildDraftCourse — 후보 부족 시 안전한 생략(강릉 사례 보완)", () => {
  it("점심·저녁 외에 추가 후보가 없으면 억지로 채우지 않고, 시간 제약을 위반하지 않으며, 식사 보장은 유지된다", () => {
    const pois = [foodPoi("lunch-only", 0, 0, true), foodPoi("dinner-only", 0, 0.01, true)];
    expect(() => buildDraftCourse(pois, "DAY_TRIP", "WALK")).not.toThrow();
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items.some((i) => i.mealPurpose === "LUNCH")).toBe(true);
    expect(items.some((i) => i.mealPurpose === "DINNER")).toBe(true);
    expect(items).toHaveLength(2); // 억지로 추가 항목을 만들지 않는다.

    for (let i = 1; i < items.length; i++) {
      const prevEnd = (parseTimeSlotToMinutes(items[i - 1].timeSlot) as number) + items[i - 1].stayMinutes;
      const curStart = parseTimeSlotToMinutes(items[i].timeSlot) as number;
      expect(curStart).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it("거리상 도달 가능한 추가 후보가 없으면(모두 하루 범위를 벗어나면) 억지로 삽입하지 않고 안전하게 생략한다", () => {
    const pois = [
      foodPoi("lunch-food", 0, 0, true),
      foodPoi("dinner-food", 0, 0.01, true),
      poi("unreachable-attr", 60, 0, "ATTRACTION"), // 도보로 도달 불가능할 만큼 먼 거리
    ];
    expect(() => buildDraftCourse(pois, "DAY_TRIP", "WALK")).not.toThrow();
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    expect(items.some((i) => i.mealPurpose === "LUNCH")).toBe(true);
    expect(items.some((i) => i.mealPurpose === "DINNER")).toBe(true);
    for (const item of items) {
      expect(parseTimeSlotToMinutes(item.timeSlot) as number).toBeLessThanOrEqual(parseTimeSlotToMinutes("23:00") as number);
    }
  });

  it("체크인까지 남은 시간이 부족해도 함수가 예외 없이 완료되고 체크인은 안전하게 생략되거나 유효한 시각을 유지한다", () => {
    const pois = [
      foodPoi("dinner-food", 0, 0, true),
      poi("far-lodge", 30, 0, "LODGING"), // 저녁 이후 매우 먼 숙소
    ];
    expect(() => buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK")).not.toThrow();
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    // lodging은 null(안전한 생략)이거나, 있다면 반드시 유효하게 파싱되는 시각이어야 한다 — 거짓 시각을 지어내지 않는다.
    if (days[0].lodging) {
      expect(parseTimeSlotToMinutes(days[0].lodging.timeSlot)).not.toBeNull();
    }
  });
});

describe("ceilToNext30Minutes — 일정 시작 시각 30분 단위 올림(6단계, 2026-07-26 강릉 시각 정돈 보완)", () => {
  it("A. 이미 00분/30분이면 그대로 유지하고, 그 외에는 항상 다음 30분 단위로 올림한다(내림 금지)", () => {
    const cases: [string, string][] = [
      ["09:00", "09:00"],
      ["09:01", "09:30"],
      ["09:29", "09:30"],
      ["09:30", "09:30"],
      ["09:31", "10:00"],
      ["12:09", "12:30"],
      ["14:42", "15:00"],
    ];
    for (const [input, expected] of cases) {
      const minutes = parseTimeSlotToMinutes(input) as number;
      expect(minutesToTimeSlot(ceilToNext30Minutes(minutes))).toBe(expected);
    }
  });
});

describe("buildDraftCourse — 30분 단위 정렬이 실제 일정 시각·이후 계산에 반영된다(6단계 회귀)", () => {
  it("B. 이동 완료 시각이 정각·30분이 아니면(예: 11:09) 다음 30분(11:30)으로 올림되고, 내려가거나 원시 시각 그대로 저장되지 않는다", () => {
    // attr1(첫 항목, 무료 이동)→attr2: 실제 이동시간이 정확히 9분이 되도록 좌표를 보정했다(도보 기준).
    // 원시 도착(11:00+9분=11:09)이 그대로 저장되거나 11:00으로 내려가면 실패해야 한다.
    const pois = [
      poi("attr1", 0, 0, "ATTRACTION"),
      poi("attr2", 0, 0.0055, "ATTRACTION"),
      foodPoi("lunch-food", 0, 0.006, true),
    ];
    const travel = estimateTravel(pois[0], pois[1], "WALK");
    expect(travel.minutes).toBe(9); // 보정 전제 확인(좌표가 실제로 9분 이동을 만드는지).

    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const attr2Item = days[0].items.find((i) => i.poiId === "attr2")!;
    expect(attr2Item.timeSlot).toBe("11:30");
    expect(attr2Item.timeSlot).not.toBe("11:00"); // 내림 금지 — 이동 완료 전으로 당기면 안 된다.
    expect(attr2Item.timeSlot).not.toBe("11:09"); // 원시 시각 그대로 저장 금지.
  });

  it("C. 앞 일정이 정렬되어 늦어진 시간이 그 뒤 모든 일정에도 그대로 전파된다(연쇄 계산)", () => {
    // attr1→attr2(9분 이동, 11:09→11:30 올림)→attr3(추가로 9분 더 이동). attr3의 시작이 "정렬 전
    // attr2 도착(11:09)+9분=11:18"이 아니라 "정렬 후 attr2 시작(11:30)+체류60분+이동9분=12:39→13:00"으로
    // 계산돼야 한다 — 정렬 이전 시각을 기준으로 뒤 일정을 계산하면 잘못된 구현이다.
    const pois = [
      poi("attr1", 0, 0, "ATTRACTION"),
      poi("attr2", 0, 0.0055, "ATTRACTION"),
      poi("attr3", 0, 0.011, "ATTRACTION"),
      foodPoi("lunch-food", 0, 0.012, true),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const attr2Item = days[0].items.find((i) => i.poiId === "attr2")!;
    const attr3Item = days[0].items.find((i) => i.poiId === "attr3")!;
    expect(attr2Item.timeSlot).toBe("11:30");
    // attr3는 정렬 전 attr2 도착(11:09) 기준이 아니라, 정렬된 attr2 시작(11:30)+체류(60분) 기준으로
    // 계산된 시각이어야 하므로 11:30보다 뒤여야 하고, 여전히 00분/30분이어야 한다.
    const attr3Minutes = parseTimeSlotToMinutes(attr3Item.timeSlot) as number;
    const attr2Minutes = parseTimeSlotToMinutes(attr2Item.timeSlot) as number;
    expect(attr3Minutes).toBeGreaterThan(attr2Minutes + 60 - 1);
    expect(attr3Minutes % 30).toBe(0);
  });

  it("D. 30분 정렬 이후에도 점심·저녁은 각자의 허용 시간대 안에 배치되고, 카페와 체험은 식사 자리를 차지하지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      foodPoi("cafe-1", 0, 0.01, false),
      foodPoi("lunch-food", 0, 0.02, true),
      poi("experience-1", 0, 0.03, "EXPERIENCE"),
      foodPoi("dinner-food", 0, 0.04, true),
    ];
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const items = days[0].items;

    const lunchItem = items.find((i) => i.mealPurpose === "LUNCH")!;
    const dinnerItem = items.find((i) => i.mealPurpose === "DINNER")!;
    expect(lunchItem.poiId).toBe("lunch-food");
    expect(dinnerItem.poiId).toBe("dinner-food");
    const lunchMinutes = parseTimeSlotToMinutes(lunchItem.timeSlot) as number;
    const dinnerMinutes = parseTimeSlotToMinutes(dinnerItem.timeSlot) as number;
    expect(lunchMinutes).toBeGreaterThanOrEqual(parseTimeSlotToMinutes("11:30") as number);
    expect(lunchMinutes).toBeLessThanOrEqual(parseTimeSlotToMinutes("13:30") as number);
    expect(dinnerMinutes).toBeGreaterThanOrEqual(parseTimeSlotToMinutes("17:30") as number);
    expect(dinnerMinutes).toBeLessThanOrEqual(parseTimeSlotToMinutes("19:30") as number);
    expect(items.some((i) => i.poiId === "cafe-1" && i.mealPurpose === "LUNCH")).toBe(false);
    expect(items.some((i) => i.poiId === "cafe-1" && i.mealPurpose === "DINNER")).toBe(false);
    expect(items.some((i) => i.poiId === "experience-1" && (i.mealPurpose === "LUNCH" || i.mealPurpose === "DINNER"))).toBe(
      false,
    );
  });

  it("E. 정렬로 마지막 일정이 늦어져도 숙소 체크인은 그 종료·이동시간 이후로만 계산되고, 무리하게 앞당겨지지 않는다", () => {
    const pois = [
      poi("attr-1", 0, 0, "ATTRACTION"),
      foodPoi("lunch-food", 0, 0.01, true),
      foodPoi("dinner-food", 0, 0.02, true),
      poi("lodge-1", 0, 0.03, "LODGING"),
    ];
    const days = buildDraftCourse(pois, "ONE_NIGHT_TWO_DAYS", "WALK");
    const items = days[0].items;
    for (const item of items) {
      expect((parseTimeSlotToMinutes(item.timeSlot) as number) % 30).toBe(0);
    }
    expect(days[0].lodging).not.toBeNull();
    const lastEnd = (parseTimeSlotToMinutes(items[items.length - 1].timeSlot) as number) + items[items.length - 1].stayMinutes;
    const checkinMinutes = parseTimeSlotToMinutes(days[0].lodging!.timeSlot) as number;
    expect(checkinMinutes).toBeGreaterThanOrEqual(lastEnd);
  });

  it("F. 30분 올림 전에는 하루 범위 안에 들어가지만 올림 후에는 넘치는 후보는 억지로 삽입하지 않고 안전하게 제외한다", () => {
    // cafe-am은 이 배치 시점에 원시 도착(하루 범위 안)은 성립하지만, 30분 올림을 적용하면 하루 표시
    // 범위(0~1439분)를 넘긴다 — 억지로 삽입하지 않고 안전하게 제외돼야 한다(예외 발생 없이).
    const pois = [
      foodPoi("cafe-am", 0, 0, false),
      foodPoi("lunch-food", 0, 0.01, true),
      poi("attr-pm", 0, 0.02, "ATTRACTION"),
      foodPoi("dinner-food", 0, 0.03, true),
      poi("extra-attr", 0, 0.04, "ATTRACTION"),
      poi("extra-attr-2", 0, 0.05, "ATTRACTION"),
      poi("extra-attr-3", 0, 0.06, "ATTRACTION"),
    ];
    expect(() => buildDraftCourse(pois, "DAY_TRIP", "WALK")).not.toThrow();
    const days = buildDraftCourse(pois, "DAY_TRIP", "WALK");
    const allIds = days.flatMap((d) => d.items.map((i) => i.poiId));

    expect(allIds).not.toContain("cafe-am"); // 억지로 삽입하지 않고 안전하게 제외됐다.
    expect(new Set(allIds).size).toBe(allIds.length); // 중복 없음.
    for (const item of days[0].items) {
      expect((parseTimeSlotToMinutes(item.timeSlot) as number) % 30).toBe(0);
      expect((parseTimeSlotToMinutes(item.timeSlot) as number) + item.stayMinutes).toBeLessThanOrEqual(24 * 60 - 1);
    }
  });

  it("G. 통영·강릉형 등 여러 시나리오에서 자동 생성된 모든 일반 일정의 시작 시각이 00분 또는 30분이다(특정 지역·장소에 한정하지 않는 일반 검증)", () => {
    const scenarios: [PoiDetail[], "DAY_TRIP" | "ONE_NIGHT_TWO_DAYS" | "TWO_NIGHTS_THREE_DAYS"][] = [
      [
        [
          poi("a1", 0, 0, "ATTRACTION"),
          foodPoi("f1", 0, 0.013, false),
          foodPoi("f2", 0, 0.027, true),
          poi("e1", 0, 0.041, "EXPERIENCE"),
          foodPoi("f3", 0, 0.059, true),
        ],
        "DAY_TRIP",
      ],
      [
        [
          foodPoi("g1", 0, 0, false),
          foodPoi("g2", 0, 0.017, true),
          poi("g3", 0, 0.033, "ATTRACTION"),
          foodPoi("g4", 0, 0.049, true),
          poi("g5", 0, 0.063, "ATTRACTION"),
          poi("h1", 10, 0, "ATTRACTION"),
          foodPoi("h2", 10, 0.021, false),
          poi("h3", 10, 0.038, "EXPERIENCE"),
          foodPoi("h4", 10, 0.052, true),
        ],
        "ONE_NIGHT_TWO_DAYS",
      ],
    ];
    for (const [pois, duration] of scenarios) {
      const days = buildDraftCourse(pois, duration, "WALK");
      for (const day of days) {
        for (const item of day.items) {
          const minutes = parseTimeSlotToMinutes(item.timeSlot) as number;
          expect(minutes % 30 === 0).toBe(true);
        }
      }
    }
  });
});

/** Phase 4: 실행안 체크리스트/위험요인에 역할·국적·테마·여행월이 실제로 반영되는지 검증한다. */
describe("buildOperationChecklist / buildRisks — Phase 4 컨텍스트 반영", () => {
  it("컨텍스트 없이 호출해도(레거시 프로젝트) 오류 없이 기본 체크리스트만 반환한다", () => {
    const checklist = buildOperationChecklist("NATURE_WELLNESS");
    expect(checklist).toContain("출발 3일 전 예약 인원 최종 확정");
    expect(checklist.length).toBeGreaterThan(0);
  });

  it("역할에 따라 체크리스트에 서로 다른 항목이 추가된다", () => {
    const localGov = buildOperationChecklist("NATURE_WELLNESS", { role: "LOCAL_GOV" });
    const travelAgency = buildOperationChecklist("NATURE_WELLNESS", { role: "TRAVEL_AGENCY" });
    expect(localGov).toContain("정책 보고용 정량 지표(KPI) 수집 방법 사전 확정 필요");
    expect(travelAgency).toContain("예약/판매 채널(OTA 등) 연동 및 가격 정책 사전 확정 필요");
    expect(localGov).not.toEqual(travelAgency);
  });

  it("외국인 대상이면 다국어 안내 체크리스트가 추가되고, 내국인이면 추가되지 않는다", () => {
    const foreign = buildOperationChecklist("CULTURE_HISTORY", { nationality: "FOREIGN" });
    const domestic = buildOperationChecklist("CULTURE_HISTORY", { nationality: "DOMESTIC" });
    expect(foreign).toContain("다국어 안내판/메뉴판 준비 여부 확인 필요(외국인 대상, 서비스 준비도 기준)");
    expect(domestic).not.toContain("다국어 안내판/메뉴판 준비 여부 확인 필요(외국인 대상, 서비스 준비도 기준)");
  });

  it("반려동물 테마는 전용 템플릿 부재 안내를, 레저·액티비티 테마는 실외 템플릿에서 안전장비 안내를 추가한다", () => {
    const pet = buildOperationChecklist("NATURE_WELLNESS", { preferredThemes: ["반려동물 동반"] });
    expect(pet).toContain("반려동물 동반 가능 여부는 업체별로 사전에 직접 확인 필요(전용 코스 템플릿 없음)");

    const leisure = buildOperationChecklist("NATURE_WELLNESS", { preferredThemes: ["레저 액티비티"] });
    expect(leisure).toContain("레저·액티비티 실외 활동 안전장비·보험 가입 여부 사전 확인 필요");
  });

  it("장마철(6~7월)에는 실외 비중이 큰 템플릿에 우천 관련 위험요인이 추가되고, 비수기 실내 템플릿에는 추가되지 않는다", () => {
    const rainySeasonOutdoor = buildRisks("NATURE_WELLNESS", { travelMonth: 7 });
    expect(rainySeasonOutdoor.some((r) => r.risk.includes("장마철"))).toBe(true);

    const otherMonthOutdoor = buildRisks("NATURE_WELLNESS", { travelMonth: 3 });
    expect(otherMonthOutdoor.some((r) => r.risk.includes("장마철"))).toBe(false);
  });

  it("여행월이 없거나(레거시) 잘못된 값이면 계절 위험요인을 추가하지 않는다(근거 없이 지어내지 않음)", () => {
    const noMonth = buildRisks("NATURE_WELLNESS");
    const invalidMonth = buildRisks("NATURE_WELLNESS", { travelMonth: 13 });
    const base = buildRisks("NATURE_WELLNESS");
    expect(noMonth).toEqual(base);
    expect(invalidMonth).toEqual(base);
  });

  it("buildKpis는 템플릿 고유 KPI를 그대로 반환한다(컨텍스트 없이 호출해도 회귀 없음)", () => {
    const kpis = buildKpis("LOCAL_FOOD_MARKET");
    expect(kpis.length).toBeGreaterThan(0);
    expect(kpis[0]).toHaveProperty("name");
    expect(kpis[0]).toHaveProperty("method");
  });

  it("buildKpis는 같은 템플릿이라도 역할·국적에 따라 KPI 관점이 추가돼 목록이 달라진다", () => {
    const base = buildKpis("NIGHT_STAY_EXTENSION");
    const localGov = buildKpis("NIGHT_STAY_EXTENSION", { role: "LOCAL_GOV" });
    const travelAgencyForeign = buildKpis("NIGHT_STAY_EXTENSION", { role: "TRAVEL_AGENCY", nationality: "FOREIGN" });
    expect(localGov.length).toBeGreaterThan(base.length);
    expect(travelAgencyForeign.length).toBeGreaterThan(localGov.length);
    expect(localGov).not.toEqual(travelAgencyForeign);
    for (const k of base) {
      expect(localGov).toContainEqual(k);
      expect(travelAgencyForeign).toContainEqual(k);
    }
  });
});
