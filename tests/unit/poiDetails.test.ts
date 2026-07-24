// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// poiDetails.ts는 @/lib/db(prisma)를 import한다 — 이 테스트는 DB와 무관한 순수 함수만 검증하지만,
// 기존 프로젝트 관례(syncService.test.ts 등)를 따라 실제 Prisma 클라이언트가 생성/연결되지 않도록
// mock으로 대체한다(공유 Neon DB에 절대 접속하지 않기 위함).
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { deriveMealEligible, extractCat3FromRawPayload } from "@/lib/services/poiDetails";

describe("extractCat3FromRawPayload", () => {
  it("rawPayload 객체에서 cat3 문자열을 그대로 꺼낸다", () => {
    expect(extractCat3FromRawPayload({ cat1: "A05", cat2: "A0502", cat3: "A05020900" })).toBe("A05020900");
  });

  it("rawPayload가 없거나 cat3가 없으면 null을 반환한다", () => {
    expect(extractCat3FromRawPayload(null)).toBeNull();
    expect(extractCat3FromRawPayload(undefined)).toBeNull();
    expect(extractCat3FromRawPayload({})).toBeNull();
    expect(extractCat3FromRawPayload({ cat3: 12345 })).toBeNull(); // 문자열이 아니면 무시
  });
});

describe("deriveMealEligible — Poi.rawPayload 기준 식사 가능 여부 판별(3단계 카페 구분)", () => {
  it("FIXTURE(큐레이션 데모 데이터)는 TourAPI 분류 개념이 없으므로 식사 가능으로 본다", () => {
    expect(deriveMealEligible({ sourceType: "FIXTURE", rawPayload: null })).toBe(true);
  });

  it("API로 동기화된 일반 음식점(한식 등)은 식사 가능으로 판별한다", () => {
    expect(deriveMealEligible({ sourceType: "API", rawPayload: { cat3: "A05020100" } })).toBe(true);
  });

  it("API로 동기화된 카페/전통찻집은 식사 불가로 판별한다", () => {
    expect(deriveMealEligible({ sourceType: "API", rawPayload: { cat3: "A05020900" } })).toBe(false);
  });

  it("API로 동기화됐지만 cat3가 없거나 알 수 없으면 안전하게 식사 불가로 본다", () => {
    expect(deriveMealEligible({ sourceType: "API", rawPayload: null })).toBe(false);
    expect(deriveMealEligible({ sourceType: "API", rawPayload: {} })).toBe(false);
    expect(deriveMealEligible({ sourceType: "API", rawPayload: { cat3: "UNKNOWN" } })).toBe(false);
  });
});
