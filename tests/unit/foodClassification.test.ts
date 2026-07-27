import { describe, expect, it } from "vitest";
import {
  classifyFoodSubcategory,
  classifyFoodSubcategoryByCat3,
  classifyFoodSubcategoryByKeyword,
  isMealEligibleFoodSubcategory,
} from "@/lib/domain/foodClassification";

describe("classifyFoodSubcategoryByCat3", () => {
  it("한식/서양식/일식/중식/이색음식점 cat3는 MEAL로 분류한다", () => {
    for (const cat3 of ["A05020100", "A05020200", "A05020300", "A05020400", "A05020700"]) {
      expect(classifyFoodSubcategoryByCat3(cat3)).toBe("MEAL");
    }
  });

  it("카페/전통찻집·클럽 cat3는 CAFE로 분류한다", () => {
    expect(classifyFoodSubcategoryByCat3("A05020900")).toBe("CAFE");
    expect(classifyFoodSubcategoryByCat3("A05021000")).toBe("CAFE");
  });

  it("cat3가 없거나 알 수 없으면 null(판정 불가)을 반환한다", () => {
    expect(classifyFoodSubcategoryByCat3(null)).toBeNull();
    expect(classifyFoodSubcategoryByCat3(undefined)).toBeNull();
    expect(classifyFoodSubcategoryByCat3("UNKNOWN_CODE")).toBeNull();
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

describe("classifyFoodSubcategory — cat3 우선, 이름 키워드 보조", () => {
  it("cat3가 있으면 이름과 무관하게 cat3를 우선한다", () => {
    // 이름만 보면 카페 같아도(원본에 더 구체적인 분류 정보가 있으면 그것을 우선한다) cat3가 한식이면 MEAL.
    expect(classifyFoodSubcategory({ cat3: "A05020100", name: "OO카페" })).toBe("MEAL");
  });

  it("cat3가 없으면 이름 키워드로 보조 판정한다", () => {
    expect(classifyFoodSubcategory({ cat3: null, name: "동네카페" })).toBe("CAFE");
    expect(classifyFoodSubcategory({ name: "전통 한식당" })).toBe("MEAL");
  });

  it("cat3도 없고 이름도 모호하면 UNKNOWN을 반환한다(단정하지 않음)", () => {
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
