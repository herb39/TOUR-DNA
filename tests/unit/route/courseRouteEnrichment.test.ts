// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseDay, CourseItem } from "@/lib/domain/planBuilder";

const getRoute = vi.fn();
vi.mock("@/lib/services/route/routeService", () => ({
  getRoute: (...args: unknown[]) => getRoute(...args),
}));

import { enrichCourseDaysWithRealRoutes } from "@/lib/services/route/courseRouteEnrichment";

function item(overrides: Partial<CourseItem> & Pick<CourseItem, "poiId">): CourseItem {
  return {
    order: 1,
    poiName: overrides.poiId,
    category: "ATTRACTION",
    timeSlot: "10:00",
    stayMinutes: 60,
    travel: "이동 약 10분(약 1.0km, 차량 기준)",
    lat: 37.0,
    lng: 128.0,
    ...overrides,
  };
}

function liveResult(distanceKm: number, minutes: number) {
  return { distanceKm, minutes, source: "LIVE_API" as const, provider: "KAKAO_MOBILITY" as const, calculatedAt: "2026-08-05T00:00:00.000Z" };
}

describe("courseRouteEnrichment — PRIVATE_VEHICLE 인접 구간만 실제 경로로 채우고, 변경 없는 구간은 재호출하지 않는다", () => {
  beforeEach(() => {
    getRoute.mockReset();
  });

  it("PRIVATE_VEHICLE이 아니면 아무 것도 하지 않고 입력을 그대로 반환한다(카카오 호출 없음)", async () => {
    const days: CourseDay[] = [{ dayIndex: 1, items: [item({ poiId: "a" }), item({ poiId: "b" })] }];
    const result = await enrichCourseDaysWithRealRoutes(days, "MIXED", null);
    expect(result).toBe(days);
    expect(getRoute).not.toHaveBeenCalled();
  });

  it("이전 실행안이 없으면(최초 생성) 모든 인접 구간을 호출한다", async () => {
    getRoute.mockResolvedValue(liveResult(8.3, 12));
    const days: CourseDay[] = [
      { dayIndex: 1, items: [item({ poiId: "a" }), item({ poiId: "b" }), item({ poiId: "c" })] },
    ];
    const result = await enrichCourseDaysWithRealRoutes(days, "PRIVATE_VEHICLE", null);

    expect(getRoute).toHaveBeenCalledTimes(2); // a→b, b→c (첫 항목은 호출 대상 아님)
    expect(result[0].items[0].travelSource).toBeUndefined(); // 첫 항목은 그대로
    expect(result[0].items[1].travelSource).toBe("LIVE_API");
    expect(result[0].items[1].travel).toBe("8.3km · 약 12분");
    expect(result[0].items[2].travelSource).toBe("LIVE_API");
  });

  it("이전 실행안과 인접 POI 쌍이 동일하면(시간·체류시간만 변경) 재호출하지 않고 이전 결과를 그대로 이어받는다", async () => {
    const previous: CourseDay[] = [
      {
        dayIndex: 1,
        items: [
          item({ poiId: "a" }),
          item({ poiId: "b", travelSource: "LIVE_API", travelProvider: "KAKAO_MOBILITY", travelDistanceKm: 8.3, travelMinutes: 12, travel: "8.3km · 약 12분" }),
        ],
      },
    ];
    // 사용자가 시간(timeSlot)만 09:30으로 바꾼 새 course — 인접 POI 쌍(a→b)은 그대로다.
    const next: CourseDay[] = [
      { dayIndex: 1, items: [item({ poiId: "a" }), item({ poiId: "b", timeSlot: "09:30" })] },
    ];

    const result = await enrichCourseDaysWithRealRoutes(next, "PRIVATE_VEHICLE", previous);

    expect(getRoute).not.toHaveBeenCalled();
    expect(result[0].items[1].travelSource).toBe("LIVE_API");
    expect(result[0].items[1].travel).toBe("8.3km · 약 12분");
    expect(result[0].items[1].timeSlot).toBe("09:30"); // 시간 변경은 그대로 유지
  });

  it("순서가 바뀌어 인접 POI 쌍이 달라지면 그 구간만 새로 호출한다", async () => {
    const previous: CourseDay[] = [
      {
        dayIndex: 1,
        items: [
          item({ poiId: "a" }),
          item({ poiId: "b", travelSource: "LIVE_API", travelProvider: "KAKAO_MOBILITY", travelDistanceKm: 8.3, travelMinutes: 12 }),
          item({ poiId: "c", travelSource: "LIVE_API", travelProvider: "KAKAO_MOBILITY", travelDistanceKm: 3.0, travelMinutes: 6 }),
        ],
      },
    ];
    // b와 c 순서를 바꿔 인접 쌍이 a→c, c→b로 바뀜(둘 다 이전에 없던 새 쌍)
    const next: CourseDay[] = [
      { dayIndex: 1, items: [item({ poiId: "a" }), item({ poiId: "c" }), item({ poiId: "b" })] },
    ];
    getRoute.mockResolvedValue(liveResult(5.0, 9));

    const result = await enrichCourseDaysWithRealRoutes(next, "PRIVATE_VEHICLE", previous);

    expect(getRoute).toHaveBeenCalledTimes(2);
    expect(result[0].items[1].travelSource).toBe("LIVE_API");
    expect(result[0].items[1].travelDistanceKm).toBe(5.0);
  });

  it("숙박 구간(마지막 항목→숙박)도 인접 구간으로 취급해 호출/재사용 로직을 동일하게 적용한다", async () => {
    getRoute.mockResolvedValue(liveResult(2.0, 8));
    const days: CourseDay[] = [
      {
        dayIndex: 1,
        items: [item({ poiId: "a" })],
        lodging: item({ poiId: "hotel", category: "LODGING", timeSlot: "20:00" }),
      },
    ];
    const result = await enrichCourseDaysWithRealRoutes(days, "PRIVATE_VEHICLE", null);
    expect(getRoute).toHaveBeenCalledTimes(1);
    expect(result[0].lodging?.travelSource).toBe("LIVE_API");
  });

  it("좌표가 없는 항목이 섞여 있어도 routeService.getRoute에 위임하고 여기서는 예외를 던지지 않는다", async () => {
    getRoute.mockResolvedValue({ distanceKm: 0, minutes: 5, source: "ESTIMATED" as const, provider: "HAVERSINE" as const, calculatedAt: "t" });
    const days: CourseDay[] = [
      { dayIndex: 1, items: [item({ poiId: "a" }), item({ poiId: "b", lat: undefined, lng: undefined })] },
    ];
    const result = await enrichCourseDaysWithRealRoutes(days, "PRIVATE_VEHICLE", null);
    expect(result[0].items[1].travelSource).toBe("ESTIMATED");
  });

  /** 2026-08-13(로딩 성능 개선) — 하루 코스 안의 재사용 불가 구간들은 이제 순차 await가 아니라
   * Promise.all로 동시에 요청된다. 결과값이 같아도 "실행 방식"이 실제로 병렬인지는 결과만으로는
   * 검증되지 않으므로, getRoute가 아직 끝나지 않은 동시 호출 수(최대 동시성)를 직접 관찰해 1보다
   * 큰 시점이 있었는지 확인한다 — 순차 실행이었다면 동시성은 항상 1이다. */
  it("한 날짜 안의 여러 신규 구간을 동시에(순차가 아니라 병렬로) 요청한다", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    getRoute.mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent -= 1;
      return liveResult(1.0, 5);
    });
    const days: CourseDay[] = [
      {
        dayIndex: 1,
        items: [item({ poiId: "a" }), item({ poiId: "b" }), item({ poiId: "c" }), item({ poiId: "d" })],
      },
    ];
    await enrichCourseDaysWithRealRoutes(days, "PRIVATE_VEHICLE", null);
    expect(getRoute).toHaveBeenCalledTimes(3); // a→b, b→c, c→d
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it("서로 다른 날짜(day)도 동시에 처리한다(날짜 간 병렬화)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    getRoute.mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent -= 1;
      return liveResult(1.0, 5);
    });
    const days: CourseDay[] = [
      { dayIndex: 1, items: [item({ poiId: "a" }), item({ poiId: "b" })] },
      { dayIndex: 2, items: [item({ poiId: "c" }), item({ poiId: "d" })] },
    ];
    await enrichCourseDaysWithRealRoutes(days, "PRIVATE_VEHICLE", null);
    expect(getRoute).toHaveBeenCalledTimes(2); // a→b, c→d
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
