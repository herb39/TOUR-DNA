import { describe, expect, it } from "vitest";
import {
  classifyFoodSubcategory,
  classifyFoodSubcategoryByLclsSystm3,
  classifyFoodSubcategoryByLegacyCat3,
  classifyFoodSubcategoryByKeyword,
  isMealEligibleFoodSubcategory,
} from "@/lib/domain/foodClassification";

// 2026-07-28: 신 분류체계(lclsSystm3) 실제 코드값을 실 서비스키로 확인했다(tourInfo.ts 참고).
describe("classifyFoodSubcategoryByLclsSystm3 — 신 분류체계(실 코드값 확인됨, 2026-07-28)", () => {
  it("한식/외국식/간이음식(제과 제외) lclsSystm3는 MEAL로 분류한다", () => {
    for (const code of ["FD010100", "FD010200", "FD020100", "FD020200", "FD020300", "FD030300", "FD030400"]) {
      expect(classifyFoodSubcategoryByLclsSystm3(code)).toBe("MEAL");
    }
  });

  it("카페/찻집(FD05)·주점(FD04)·제과(FD030100) lclsSystm3는 CAFE로 분류한다", () => {
    expect(classifyFoodSubcategoryByLclsSystm3("FD050100")).toBe("CAFE"); // 카페
    expect(classifyFoodSubcategoryByLclsSystm3("FD040300")).toBe("CAFE"); // 클럽
    expect(classifyFoodSubcategoryByLclsSystm3("FD030100")).toBe("CAFE"); // 제과
  });

  it("lclsSystm3가 없거나 알 수 없으면 null(판정 불가)을 반환한다", () => {
    expect(classifyFoodSubcategoryByLclsSystm3(null)).toBeNull();
    expect(classifyFoodSubcategoryByLclsSystm3(undefined)).toBeNull();
    expect(classifyFoodSubcategoryByLclsSystm3("FD999999")).toBeNull();
  });
});

describe("classifyFoodSubcategoryByLegacyCat3 — 구형 저장 데이터(cat3) 호환 전용", () => {
  it("한식/서양식/일식/중식/이색음식점 cat3는 MEAL로 분류한다", () => {
    for (const cat3 of ["A05020100", "A05020200", "A05020300", "A05020400", "A05020700"]) {
      expect(classifyFoodSubcategoryByLegacyCat3(cat3)).toBe("MEAL");
    }
  });

  it("카페/전통찻집·클럽 cat3는 CAFE로 분류한다", () => {
    expect(classifyFoodSubcategoryByLegacyCat3("A05020900")).toBe("CAFE");
    expect(classifyFoodSubcategoryByLegacyCat3("A05021000")).toBe("CAFE");
  });

  it("cat3가 없거나 알 수 없으면 null(판정 불가)을 반환한다", () => {
    expect(classifyFoodSubcategoryByLegacyCat3(null)).toBeNull();
    expect(classifyFoodSubcategoryByLegacyCat3(undefined)).toBeNull();
    expect(classifyFoodSubcategoryByLegacyCat3("UNKNOWN_CODE")).toBeNull();
  });
});

describe("classifyFoodSubcategoryByKeyword", () => {
  it("카페/커피/디저트/베이커리/빵/찻집 등 이름 키워드는 CAFE로 판정한다", () => {
    expect(classifyFoodSubcategoryByKeyword("동네카페")).toBe("CAFE");
    expect(classifyFoodSubcategoryByKeyword("스타 커피")).toBe("CAFE");
    expect(classifyFoodSubcategoryByKeyword("행복 디저트공방")).toBe("CAFE");
    expect(classifyFoodSubcategoryByKeyword("성심 베이커리")).toBe("CAFE");
    expect(classifyFoodSubcategoryByKeyword("옛날 찻집")).toBe("CAFE");
  });

  it("한식/중식/일식/양식/음식점 등 이름 키워드는 MEAL로 판정한다", () => {
    expect(classifyFoodSubcategoryByKeyword("전통 한식당")).toBe("MEAL");
    expect(classifyFoodSubcategoryByKeyword("행복 중식당")).toBe("MEAL");
    expect(classifyFoodSubcategoryByKeyword("사쿠라 일식집")).toBe("MEAL");
    expect(classifyFoodSubcategoryByKeyword("우리 음식점")).toBe("MEAL");
  });

  it("모호한 이름은 단정하지 않고 null을 반환한다", () => {
    expect(classifyFoodSubcategoryByKeyword("행복상회")).toBeNull();
    expect(classifyFoodSubcategoryByKeyword("")).toBeNull();
  });
});

describe("classifyFoodSubcategory — lclsSystm3(신, 최우선) → cat3(구, 구형 호환) → 이름 키워드(fallback)", () => {
  it("lclsSystm3가 판정 가능하면 이름·cat3와 무관하게 그 결과를 우선한다", () => {
    // lclsSystm3="FD050100"(카페) vs cat3="A05020100"(한식, MEAL) vs 이름="한식당"(MEAL) — 셋이 서로
    // 다른 답을 줄 만한 입력에서 lclsSystm3(신, 최우선)의 결과(CAFE)가 이긴다.
    expect(classifyFoodSubcategory({ lclsSystm3: "FD050100", cat3: "A05020100", name: "한식당" })).toBe("CAFE");
  });

  it("lclsSystm3가 없으면(구형 데이터) cat3로 판정한다", () => {
    expect(classifyFoodSubcategory({ cat3: "A05020100", name: "OO카페" })).toBe("MEAL");
    expect(classifyFoodSubcategory({ cat3: "A05020900", name: "일반 매장" })).toBe("CAFE");
  });

  it("lclsSystm3도 cat3도 없으면 이름 키워드로 판정한다", () => {
    expect(classifyFoodSubcategory({ name: "동네카페" })).toBe("CAFE");
    expect(classifyFoodSubcategory({ name: "전통 한식당" })).toBe("MEAL");
  });

  it("아무 근거도 없으면 UNKNOWN을 반환한다(단정하지 않음)", () => {
    expect(classifyFoodSubcategory({ name: "행복상회" })).toBe("UNKNOWN");
  });
});

describe("isMealEligibleFoodSubcategory", () => {
  it("MEAL만 식사 가능으로 본다 — CAFE와 UNKNOWN은 안전하게 식사 불가로 본다", () => {
    expect(isMealEligibleFoodSubcategory("MEAL")).toBe(true);
    expect(isMealEligibleFoodSubcategory("CAFE")).toBe(false);
    expect(isMealEligibleFoodSubcategory("UNKNOWN")).toBe(false);
  });
});
