import { FOOD_SUBCATEGORY_NAME_BY_CAT3, NON_MEAL_FOOD_CAT3_CODES } from "@/lib/public-data/adapters/tourInfo";

/**
 * FOOD 카테고리 내부 세부 분류 — 식사 중심(MEAL) / 카페·디저트 중심(CAFE) / 분류 불명확(UNKNOWN).
 * 판정 규칙은 이 파일 하나에서만 관리한다(strategy.ts의 선점·planBuilder.ts의 연속배치 회피가
 * 공용으로 재사용). mealEligible(boolean, 기존 필드)은 이 값에서 파생된다 — subcategory !== "CAFE"
 * (UNKNOWN은 기존 하위호환 규칙대로 식사 가능 취급)이므로 기존 동작을 바꾸지 않는다.
 */
export type FoodSubcategory = "MEAL" | "CAFE" | "UNKNOWN";

/** cat1/cat2/cat3(대/중/소분류)는 TourAPI 응답에서 그대로 온다 — 소분류가 없거나 알려지지 않은
 * 코드면 이름 키워드로 보조 판정한다(둘 다 실패하면 UNKNOWN). */
export function classifyFoodSubcategoryByCat3(cat3: string | null | undefined): FoodSubcategory | null {
  if (!cat3 || !(cat3 in FOOD_SUBCATEGORY_NAME_BY_CAT3)) return null;
  return NON_MEAL_FOOD_CAT3_CODES.has(cat3) ? "CAFE" : "MEAL";
}

/** 카페/디저트류 이름 키워드 — 프로젝트 데이터(한국관광공사 TourAPI title)에서 관찰되는 표기 위주. */
const CAFE_NAME_KEYWORDS = ["카페", "커피", "디저트", "베이커리", "빵", "찻집", "티룸", "브런치"];

/** 식사류 이름 키워드 — cat3가 없는 FIXTURE/legacy 데이터의 보조 판정용. */
const MEAL_NAME_KEYWORDS = ["한식", "중식", "일식", "양식", "음식점", "맛집", "식당", "고기", "국밥", "해장국"];

/** 이름에 더 구체적인 원본 분류(cat3)가 없을 때만 쓰는 키워드 보조 판정 — 모호하면 단정하지 않고
 * null(UNKNOWN)을 반환한다. */
export function classifyFoodSubcategoryByKeyword(name: string): FoodSubcategory | null {
  if (CAFE_NAME_KEYWORDS.some((k) => name.includes(k))) return "CAFE";
  if (MEAL_NAME_KEYWORDS.some((k) => name.includes(k))) return "MEAL";
  return null;
}

/** cat3(있으면 우선) → 이름 키워드(보조) 순으로 FOOD 세부 분류를 판정한다. 원본에 더 구체적인 분류
 * 정보(cat3)가 있으면 키워드보다 그것을 우선한다. 둘 다 판정할 수 없으면 UNKNOWN(식사 가능으로
 * 취급하되 무엇인지 단정하지 않음 — 잘못 카페로 단정해 식사 슬롯에서 빠지는 것을 막기 위함). */
export function classifyFoodSubcategory(input: { cat3?: string | null; name: string }): FoodSubcategory {
  return classifyFoodSubcategoryByCat3(input.cat3) ?? classifyFoodSubcategoryByKeyword(input.name) ?? "UNKNOWN";
}

/** subcategory → mealEligible(boolean) 파생. 확실히 식사 중심(MEAL)으로 판정된 경우만 식사 가능으로
 * 본다 — cat3가 없거나 알 수 없는 경우(UNKNOWN)는 기존 isMealEligibleFoodCat3와 동일하게 안전하게
 * 식사 불가로 본다(잘못 배치하는 것보다 식사 슬롯을 생략하는 쪽을 우선한다는 기존 정책 유지). */
export function isMealEligibleFoodSubcategory(subcategory: FoodSubcategory): boolean {
  return subcategory === "MEAL";
}
