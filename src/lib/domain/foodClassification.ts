import {
  FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3,
  NON_MEAL_FOOD_LCLS_SYSTM3_CODES,
  LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3,
  LEGACY_NON_MEAL_FOOD_CAT3_CODES,
} from "@/lib/public-data/adapters/tourInfo";

/**
 * FOOD 카테고리 내부 세부 분류 — 식사 중심(MEAL) / 카페·디저트 중심(CAFE) / 분류 불명확(UNKNOWN).
 * 판정 규칙은 이 파일 하나에서만 관리한다(strategy.ts의 선점·planBuilder.ts의 연속배치 회피가
 * 공용으로 재사용). mealEligible(boolean, 기존 필드)은 이 값에서 파생된다 — subcategory !== "CAFE"
 * (UNKNOWN은 기존 하위호환 규칙대로 식사 가능 취급)이므로 기존 동작을 바꾸지 않는다.
 */
export type FoodSubcategory = "MEAL" | "CAFE" | "UNKNOWN";

/** 신 분류체계 lclsSystm3(최우선 근거) — 소분류가 없거나 알려지지 않은 코드면 null(판정 불가)을
 * 반환해 다음 단계(구 cat3 → 이름 키워드)로 넘어간다. 실제 코드값 테이블은 아직 비어 있다
 * (tourInfo.ts 상단 주석 참고 — 실키 접근이 막혀 확인하지 못함) — 채워지기 전까지는 이 함수가 항상
 * null을 반환해 자동으로 다음 단계(구 cat3)로 폴백한다. */
export function classifyFoodSubcategoryByLclsSystm3(lclsSystm3: string | null | undefined): FoodSubcategory | null {
  if (!lclsSystm3 || !(lclsSystm3 in FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3)) return null;
  return NON_MEAL_FOOD_LCLS_SYSTM3_CODES.has(lclsSystm3) ? "CAFE" : "MEAL";
}

/** 구 분류체계 cat3(2단계 근거, 구형 데이터 호환 전용) — 2026-07-27 신 체계 전환 이전에 저장된
 * `Poi.rawPayload`에는 `lclsSystm3` 없이 `cat3`만 있을 수 있다. 신규 요청/응답에는 이 필드가 존재하지
 * 않으므로, lclsSystm3가 없을 때만(과거 저장 데이터를 재조회할 때만) 호출한다. */
export function classifyFoodSubcategoryByLegacyCat3(cat3: string | null | undefined): FoodSubcategory | null {
  if (!cat3 || !(cat3 in LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3)) return null;
  return LEGACY_NON_MEAL_FOOD_CAT3_CODES.has(cat3) ? "CAFE" : "MEAL";
}

/** 카페/디저트류 이름 키워드 — 프로젝트 데이터(한국관광공사 TourAPI title)에서 관찰되는 표기 위주. */
const CAFE_NAME_KEYWORDS = ["카페", "커피", "디저트", "베이커리", "빵", "찻집", "티룸", "브런치"];

/** 식사류 이름 키워드 — 신·구 분류 코드가 모두 없는 FIXTURE/legacy 데이터의 최종 fallback 판정용. */
const MEAL_NAME_KEYWORDS = ["한식", "중식", "일식", "양식", "음식점", "맛집", "식당", "고기", "국밥", "해장국"];

/** 이름에 더 구체적인 원본 분류(lclsSystm3/cat3)가 없을 때만 쓰는 마지막 키워드 fallback — 모호하면
 * 단정하지 않고 null(UNKNOWN)을 반환한다. */
export function classifyFoodSubcategoryByKeyword(name: string): FoodSubcategory | null {
  if (CAFE_NAME_KEYWORDS.some((k) => name.includes(k))) return "CAFE";
  if (MEAL_NAME_KEYWORDS.some((k) => name.includes(k))) return "MEAL";
  return null;
}

/** lclsSystm3(신, 최우선) → cat3(구, 구형 데이터 호환 전용) → 이름 키워드(마지막 fallback) 순으로
 * FOOD 세부 분류를 판정한다. 더 구체적인 원본 분류 정보가 있으면 항상 키워드보다 우선한다. 아무것도
 * 판정할 수 없으면 UNKNOWN(식사 가능으로 취급하되 무엇인지 단정하지 않음 — 잘못 카페로 단정해 식사
 * 슬롯에서 빠지는 것을 막기 위함). */
export function classifyFoodSubcategory(input: {
  lclsSystm3?: string | null;
  cat3?: string | null;
  name: string;
}): FoodSubcategory {
  return (
    classifyFoodSubcategoryByLclsSystm3(input.lclsSystm3) ??
    classifyFoodSubcategoryByLegacyCat3(input.cat3) ??
    classifyFoodSubcategoryByKeyword(input.name) ??
    "UNKNOWN"
  );
}

/** subcategory → mealEligible(boolean) 파생. 확실히 식사 중심(MEAL)으로 판정된 경우만 식사 가능으로
 * 본다 — lclsSystm3/cat3가 없거나 알 수 없는 경우(UNKNOWN)는 안전하게 식사 불가로 본다(잘못 배치하는
 * 것보다 식사 슬롯을 생략하는 쪽을 우선한다는 기존 정책 유지). */
export function isMealEligibleFoodSubcategory(subcategory: FoodSubcategory): boolean {
  return subcategory === "MEAL";
}
