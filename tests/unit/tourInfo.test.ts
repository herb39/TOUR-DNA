// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isMealEligibleFoodCat3, FOOD_SUBCATEGORY_NAME_BY_CAT3 } from "@/lib/public-data/adapters/tourInfo";

// 실 서비스키로 categoryCode2(공식 분류 코드 조회, contentTypeId=39, cat1=A05, cat2=A0502) 및
// areaBasedList2(대전/강원 표본 200건) 응답을 직접 확인한 뒤(2026-07-24) 작성한 테스트다.
// categoryCode2가 반환한 7개 코드가 cat2=A0502 하위의 전부다(totalCount=7).
describe("isMealEligibleFoodCat3 — 실제 TourAPI cat3 분류 기준(3단계 카페 구분)", () => {
  it("일반 식사가 가능한 것으로 확인된 cat3(한식/서양식/일식/중식/이색음식점)는 식사 가능으로 판별한다", () => {
    expect(isMealEligibleFoodCat3("A05020100")).toBe(true); // 한식
    expect(isMealEligibleFoodCat3("A05020200")).toBe(true); // 서양식
    expect(isMealEligibleFoodCat3("A05020300")).toBe(true); // 일식
    expect(isMealEligibleFoodCat3("A05020400")).toBe(true); // 중식
    expect(isMealEligibleFoodCat3("A05020700")).toBe(true); // 이색음식점
  });

  it("카페/전통찻집과 클럽은 명확한 비식사 장소로 식사 후보에서 제외한다", () => {
    expect(isMealEligibleFoodCat3("A05020900")).toBe(false); // 카페/전통찻집
    expect(isMealEligibleFoodCat3("A05021000")).toBe(false); // 클럽
  });

  it("cat3가 없거나(null/undefined) 알려진 7개 코드에 없는 값이면 안전하게 식사 불가로 본다", () => {
    expect(isMealEligibleFoodCat3(undefined)).toBe(false);
    expect(isMealEligibleFoodCat3(null)).toBe(false);
    expect(isMealEligibleFoodCat3("")).toBe(false);
    expect(isMealEligibleFoodCat3("A09999999")).toBe(false); // 알 수 없는 코드
  });

  it("categoryCode2로 실제 확인한 cat2=A0502 하위 코드는 정확히 7개이며, 디저트·베이커리·주점 전용 코드는 없다", () => {
    const codes = Object.keys(FOOD_SUBCATEGORY_NAME_BY_CAT3);
    expect(codes).toHaveLength(7);
    // 실제로 "성심당"(베이커리)이 A05020900(카페/전통찻집)으로 들어오는 것을 실 데이터에서 확인했다 —
    // 베이커리·디저트 전용 코드는 TourAPI에 존재하지 않는다(한계로 명시).
    expect(FOOD_SUBCATEGORY_NAME_BY_CAT3["A05020900"]).toBe("카페/전통찻집");
    const names = Object.values(FOOD_SUBCATEGORY_NAME_BY_CAT3);
    expect(names).not.toContain("디저트");
    expect(names).not.toContain("베이커리");
    expect(names).not.toContain("주점");
  });
});
