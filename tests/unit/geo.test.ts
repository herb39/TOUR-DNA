import { describe, expect, it } from "vitest";
import { haversineDistanceKm, orderByNearestNeighbor } from "@/lib/domain/geo";

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
