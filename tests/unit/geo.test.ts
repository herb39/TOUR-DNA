import { describe, expect, it } from "vitest";
import {
  haversineDistanceKm,
  orderByNearestNeighbor,
  classifyTravelMinutes,
  estimateTravelMinutes,
  hasReasonableKoreanCoordinate,
  isReasonableKoreanCoordinate,
  CAUTION_TRAVEL_MINUTES,
  EXCESSIVE_TRAVEL_MINUTES,
} from "@/lib/domain/geo";

describe("haversineDistanceKm", () => {
  it("같은 좌표는 거리 0", () => {
    const p = { lat: 36.3504, lng: 127.3845 };
    expect(haversineDistanceKm(p, p)).toBe(0);
  });

  it("대전-제천 실좌표 거리(대략 60~70km)를 합리적 범위로 계산한다", () => {
    const daejeon = { lat: 36.3504, lng: 127.3845 };
    const jecheon = { lat: 37.1326, lng: 128.1909 };
    const d = haversineDistanceKm(daejeon, jecheon);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(120);
  });
});

describe("orderByNearestNeighbor", () => {
  it("빈 배열/단일 원소는 그대로 반환한다", () => {
    expect(orderByNearestNeighbor([])).toEqual([]);
    const single = [{ lat: 1, lng: 1 }];
    expect(orderByNearestNeighbor(single)).toEqual(single);
  });

  it("일직선상의 점들을 지그재그 입력에서도 거리 순서로 재정렬한다", () => {
    // 경도 0, 1, 2, 3에 일직선으로 배치했지만 입력 순서는 0, 2, 1, 3(지그재그)
    const p0 = { id: "0", lat: 0, lng: 0 };
    const p1 = { id: "1", lat: 0, lng: 1 };
    const p2 = { id: "2", lat: 0, lng: 2 };
    const p3 = { id: "3", lat: 0, lng: 3 };

    const ordered = orderByNearestNeighbor([p0, p2, p1, p3]);
    expect(ordered.map((p) => p.id)).toEqual(["0", "1", "2", "3"]);
  });

  it("동일 입력에 대해 항상 같은 순서를 반환한다(결정론)", () => {
    const points = [
      { id: "a", lat: 36.35, lng: 127.38 },
      { id: "b", lat: 36.36, lng: 127.4 },
      { id: "c", lat: 36.34, lng: 127.37 },
      { id: "d", lat: 36.37, lng: 127.42 },
    ];
    const first = orderByNearestNeighbor(points).map((p) => p.id);
    const second = orderByNearestNeighbor(points).map((p) => p.id);
    expect(first).toEqual(second);
  });
});

describe("classifyTravelMinutes — 장거리 구간 등급(2단계 정책 기준)", () => {
  it("좌표 없어 계산 불가(null)면 NORMAL로 본다(배제하지 않음)", () => {
    expect(classifyTravelMinutes(null)).toBe("NORMAL");
  });

  it("CAUTION_TRAVEL_MINUTES 미만은 NORMAL이다", () => {
    expect(classifyTravelMinutes(CAUTION_TRAVEL_MINUTES - 1)).toBe("NORMAL");
  });

  it("CAUTION_TRAVEL_MINUTES 이상 EXCESSIVE_TRAVEL_MINUTES 미만은 CAUTION이다", () => {
    expect(classifyTravelMinutes(CAUTION_TRAVEL_MINUTES)).toBe("CAUTION");
    expect(classifyTravelMinutes(EXCESSIVE_TRAVEL_MINUTES - 1)).toBe("CAUTION");
  });

  it("EXCESSIVE_TRAVEL_MINUTES 이상은 EXCESSIVE다", () => {
    expect(classifyTravelMinutes(EXCESSIVE_TRAVEL_MINUTES)).toBe("EXCESSIVE");
    expect(classifyTravelMinutes(EXCESSIVE_TRAVEL_MINUTES + 100)).toBe("EXCESSIVE");
  });
});

describe("estimateTravelMinutes", () => {
  it("교통수단이 빠를수록 같은 거리의 이동시간이 짧다", () => {
    const a = { lat: 36.35, lng: 127.38 };
    const b = { lat: 36.4, lng: 127.45 };
    const walk = estimateTravelMinutes(a, b, "WALK");
    const car = estimateTravelMinutes(a, b, "PRIVATE_VEHICLE");
    expect(car).toBeLessThan(walk);
  });
});

describe("isReasonableKoreanCoordinate", () => {
  it("국내 관광 좌표와 위·경도 순서가 정상인 좌표를 허용한다", () => {
    expect(isReasonableKoreanCoordinate({ lat: 36.5, lng: 127.2 })).toBe(true);
  });

  it("다른 국가 좌표·위경도 뒤바뀜·NaN을 차단한다", () => {
    expect(isReasonableKoreanCoordinate({ lat: 19.69442748, lng: 117.9925662504 })).toBe(false);
    expect(isReasonableKoreanCoordinate({ lat: 127.2, lng: 36.5 })).toBe(false);
    expect(isReasonableKoreanCoordinate({ lat: Number.NaN, lng: 127.2 })).toBe(false);
  });
});

describe("hasReasonableKoreanCoordinate", () => {
  it("좌표가 없거나 국내 범위 밖이면 false를 반환한다", () => {
    expect(hasReasonableKoreanCoordinate({})).toBe(false);
    expect(hasReasonableKoreanCoordinate({ lat: 19.69442748, lng: 117.9925662504 })).toBe(false);
    expect(hasReasonableKoreanCoordinate({ lat: 36.5, lng: 127.2 })).toBe(true);
  });
});
