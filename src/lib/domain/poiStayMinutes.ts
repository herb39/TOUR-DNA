import type { FoodSubcategory } from "./foodClassification";

/** 새로 생성하는 일반 일정의 기본 체류시간(분)에 대한 공통 입력 계약. */
export interface PoiStayMinutesInput {
  category?: string | null;
  foodSubcategory?: FoodSubcategory;
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
}

/** 분류 신호가 없거나 알 수 없을 때 사용하는 보수적인 기본값. */
export const DEFAULT_ITEM_STAY_MINUTES = 60;

/**
 * 자동 초안·일반 후보 추가·Anchor 전후 후보 추가가 공유하는 첫 체류시간이다.
 * 이미 저장된 CourseItem의 stayMinutes를 다시 계산하는 동적 최적화에는 사용하지 않는다.
 */
export function recommendedPoiStayMinutes(input: PoiStayMinutesInput): number {
  const category = input.category?.toUpperCase();

  if (category === "LODGING") return 0;
  if (category === "FOOD") return input.foodSubcategory === "CAFE" ? 45 : 60;
  if (category === "SHOPPING") return 60;
  if (category === "FESTIVAL") return 120;
  if (category === "EXPERIENCE") return input.lclsSystm1 === "LS" ? 180 : 120;
  if (category === "ATTRACTION") return input.lclsSystm2 === "VE07" ? 120 : 90;

  return DEFAULT_ITEM_STAY_MINUTES;
}
