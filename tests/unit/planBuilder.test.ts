import { describe, expect, it } from "vitest";
import { buildDraftCourse, type PoiDetail } from "@/lib/domain/planBuilder";

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
});
