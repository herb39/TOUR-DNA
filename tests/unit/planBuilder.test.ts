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
    // 앞 4자리는 고정 슬롯, 5번째부터는 마지막 슬롯(18:30)에서 150분씩 이어간다
    expect(days[0].items.map((i) => i.timeSlot)).toEqual(["10:00", "13:00", "16:00", "18:30", "21:00", "23:30"]);
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
