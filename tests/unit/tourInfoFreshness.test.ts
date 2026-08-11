import { describe, expect, it } from "vitest";
import { classifyTourInfoFreshness, TOUR_INFO_FRESHNESS_TTL_DAYS } from "@/lib/domain/tourInfoFreshness";

const NOW = new Date("2026-08-12T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("classifyTourInfoFreshness — Phase 2-D(2026-08-12)", () => {
  it("이력이 전혀 없으면 NEVER_FETCHED다", () => {
    const result = classifyTourInfoFreshness({ lastSuccessOrEmptyFetchedAt: null }, NOW);
    expect(result).toBe("NEVER_FETCHED");
  });

  it("TTL 이내면 FRESH다", () => {
    const fetchedAt = new Date(NOW.getTime() - (TOUR_INFO_FRESHNESS_TTL_DAYS - 1) * DAY_MS);
    expect(classifyTourInfoFreshness({ lastSuccessOrEmptyFetchedAt: fetchedAt }, NOW)).toBe("FRESH");
  });

  it("TTL을 정확히 초과하면(경계값 +1일) STALE이다", () => {
    const fetchedAt = new Date(NOW.getTime() - (TOUR_INFO_FRESHNESS_TTL_DAYS + 1) * DAY_MS);
    expect(classifyTourInfoFreshness({ lastSuccessOrEmptyFetchedAt: fetchedAt }, NOW)).toBe("STALE");
  });

  it("TTL 경계값(정확히 TTL일 전)은 FRESH로 포함한다(<=)", () => {
    const fetchedAt = new Date(NOW.getTime() - TOUR_INFO_FRESHNESS_TTL_DAYS * DAY_MS);
    expect(classifyTourInfoFreshness({ lastSuccessOrEmptyFetchedAt: fetchedAt }, NOW)).toBe("FRESH");
  });

  it("시계 오차로 미래 timestamp가 들어와도 안전하게 FRESH로 처리한다", () => {
    const fetchedAt = new Date(NOW.getTime() + 5 * DAY_MS);
    expect(classifyTourInfoFreshness({ lastSuccessOrEmptyFetchedAt: fetchedAt }, NOW)).toBe("FRESH");
  });

  it("최근 ERROR가 있어도 이전 SUCCESS/EMPTY의 fetchedAt만 입력되면 그 시점 기준으로 판단한다(호출부 책임)", () => {
    // 이 함수는 "가장 최근 SUCCESS/EMPTY의 fetchedAt"만 입력으로 받으므로, 중간에 ERROR가 있었든 없었든
    // 이 값만으로 결정된다 — ERROR 시점 자체는 이 함수의 관심사가 아니다(호출부가 이미 걸러서 넘긴다).
    const oldSuccessFetchedAt = new Date(NOW.getTime() - 10 * DAY_MS);
    expect(classifyTourInfoFreshness({ lastSuccessOrEmptyFetchedAt: oldSuccessFetchedAt }, NOW)).toBe("FRESH");
  });
});
