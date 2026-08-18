/** 폼/DB에는 코드값을, 화면에는 한글 라벨을 사용한다. */

export const ROLE_OPTIONS = [
  { code: "TRAVEL_AGENCY", label: "여행사/DMC" },
  { code: "LOCAL_GOV", label: "지자체/관광재단" },
  { code: "FESTIVAL_PLANNER", label: "축제 기획자" },
] as const;

export const NATIONALITY_OPTIONS = [
  { code: "DOMESTIC", label: "내국인" },
  { code: "FOREIGN", label: "외국인" },
] as const;

export const AGE_GROUP_OPTIONS = [
  { code: "AGE_TEEN", label: "10대 이하" },
  { code: "AGE_20S", label: "20대" },
  { code: "AGE_30S", label: "30대" },
  { code: "AGE_40S", label: "40대" },
  { code: "AGE_50S", label: "50대" },
  { code: "AGE_60S_PLUS", label: "60대 이상" },
] as const;

/** 최종 제품 구조의 콘텐츠 테마. 여행 조건과 섞지 않고 코스·분석의 주제만 표현한다. */
export const CONTENT_THEME_OPTIONS = [
  { code: "THEME_FOOD", label: "미식", description: "음식·시장·로컬푸드" },
  { code: "THEME_NATURE", label: "자연", description: "산·바다·생태·자연경관" },
  { code: "THEME_WELLNESS", label: "웰니스", description: "온천·숲·힐링·휴식" },
  { code: "THEME_CULTURE_HISTORY", label: "문화·역사", description: "유적·박물관·전통문화" },
  { code: "THEME_CULTURE_ARTS", label: "문화예술", description: "공연·전시·미술·문화공간" },
  { code: "THEME_LEISURE_ACTIVITY", label: "레저·액티비티", description: "스포츠·체험·야외활동" },
  { code: "THEME_K_CONTENT", label: "K-콘텐츠", description: "촬영지·한류·콘텐츠 명소" },
  { code: "THEME_NIGHT_TOURISM", label: "야간관광", description: "야경·야시장·야간공연" },
] as const;

/** 콘텐츠 테마와 독립적으로 적용하는 여행 조건. */
export const TRAVEL_CONDITION_OPTIONS = [
  { code: "CONDITION_PET_FRIENDLY", label: "반려동물 동반", description: "동반 가능 POI·숙박·식음 우선" },
  { code: "CONDITION_ACCESSIBLE", label: "무장애·이동약자", description: "계단·화장실·휴식·접근성 확인" },
  { code: "CONDITION_WALK_TRANSIT", label: "뚜벅이·대중교통", description: "권역 집중·대중교통 연결 우선" },
  { code: "CONDITION_FAMILY", label: "가족·유아동", description: "이동량·안전·가족 편의시설 고려" },
] as const;

export const COMPANION_TYPE_OPTIONS = [
  { code: "COMPANION_SOLO", label: "혼자" },
  { code: "COMPANION_COUPLE", label: "커플/부부" },
  { code: "COMPANION_FRIENDS", label: "친구/지인" },
  { code: "COMPANION_FAMILY", label: "가족" },
  { code: "COMPANION_GROUP_TOUR", label: "단체" },
] as const;

export const PRIMARY_GOAL_OPTIONS = [
  { code: "GOAL_STAY_EXPANSION", label: "체류 확대" },
  { code: "GOAL_SPEND_EXPANSION", label: "지역 소비 확대" },
  { code: "GOAL_VISITOR_GROWTH", label: "방문객 증가" },
  { code: "GOAL_REPEAT_VISIT", label: "재방문 유도" },
  { code: "GOAL_OFF_SEASON_ACTIVATION", label: "비수기 활성화" },
  { code: "GOAL_VISITOR_DISTRIBUTION", label: "관광객 분산" },
  { code: "GOAL_LOCAL_ECONOMY", label: "지역 소상공인 매출 연계" },
  { code: "GOAL_BRAND_IMAGE", label: "지역 브랜드 이미지 제고" },
  { code: "GOAL_NEW_MARKET", label: "신규 타깃 시장 개척" },
] as const;

/** 기존 프로젝트와 저장 데이터가 사용하는 통합 목표 코드. 새 폼에서는 노출하지 않는다. */
export const LEGACY_PRIMARY_GOAL_CODES = ["GOAL_STAY_SPEND_EXPANSION", "GOAL_SEASONALITY_BALANCE"] as const;

export const DURATION_OPTIONS = [
  { code: "DAY_TRIP", label: "당일" },
  { code: "ONE_NIGHT_TWO_DAYS", label: "1박 2일" },
  { code: "TWO_NIGHTS_THREE_DAYS", label: "2박 3일" },
] as const;

export const BUDGET_LEVEL_OPTIONS = [
  { code: "LOW", label: "저가" },
  { code: "MID", label: "중간" },
  { code: "PREMIUM", label: "프리미엄" },
] as const;

export const TRANSPORT_OPTIONS = [
  { code: "WALK", label: "도보" },
  { code: "PUBLIC_TRANSPORT", label: "대중교통" },
  { code: "PRIVATE_VEHICLE", label: "전용차량" },
  { code: "MIXED", label: "혼합" },
] as const;

export const GROUP_TYPE_OPTIONS = [
  { code: "FIT", label: "개별/FIT" },
  { code: "SMALL_10_20", label: "10~20명" },
  { code: "MEDIUM_21_40", label: "21~40명" },
] as const;

function codesOf<T extends readonly { code: string }[]>(
  options: T,
): [T[number]["code"], ...T[number]["code"][]] {
  return options.map((o) => o.code) as [T[number]["code"], ...T[number]["code"][]];
}

export const ROLE_CODES = codesOf(ROLE_OPTIONS);
export const NATIONALITY_CODES = codesOf(NATIONALITY_OPTIONS);
export const AGE_GROUP_CODES = codesOf(AGE_GROUP_OPTIONS);
export const CONTENT_THEME_CODES = codesOf(CONTENT_THEME_OPTIONS);
export const TRAVEL_CONDITION_CODES = codesOf(TRAVEL_CONDITION_OPTIONS);
export const COMPANION_TYPE_CODES = codesOf(COMPANION_TYPE_OPTIONS);
export const PRIMARY_GOAL_CODES = [
  ...codesOf(PRIMARY_GOAL_OPTIONS),
  ...LEGACY_PRIMARY_GOAL_CODES,
] as [string, ...string[]];
export const DURATION_CODES = codesOf(DURATION_OPTIONS);
export const BUDGET_LEVEL_CODES = codesOf(BUDGET_LEVEL_OPTIONS);
export const TRANSPORT_CODES = codesOf(TRANSPORT_OPTIONS);
export const GROUP_TYPE_CODES = codesOf(GROUP_TYPE_OPTIONS);

function labelOf<T extends readonly { code: string; label: string }[]>(options: T, code: string): string {
  return options.find((o) => o.code === code)?.label ?? code;
}

export const labelForRole = (code: string) => labelOf(ROLE_OPTIONS, code);
export const labelForNationality = (code: string) => labelOf(NATIONALITY_OPTIONS, code);
export const labelForAgeGroup = (code: string) => labelOf(AGE_GROUP_OPTIONS, code);
export const labelForContentTheme = (code: string) => labelOf(CONTENT_THEME_OPTIONS, code);
export const labelForTravelCondition = (code: string) => labelOf(TRAVEL_CONDITION_OPTIONS, code);
export const labelForCompanionType = (code: string) => labelOf(COMPANION_TYPE_OPTIONS, code);
export const labelForPrimaryGoal = (code: string) =>
  code === "GOAL_STAY_SPEND_EXPANSION"
    ? "체류 및 지역 소비 확대"
    : code === "GOAL_SEASONALITY_BALANCE"
      ? "비수기 수요 분산"
      : labelOf(PRIMARY_GOAL_OPTIONS, code);
export const labelForDuration = (code: string) => labelOf(DURATION_OPTIONS, code);
export const labelForBudgetLevel = (code: string) => labelOf(BUDGET_LEVEL_OPTIONS, code);
export const labelForTransport = (code: string) => labelOf(TRANSPORT_OPTIONS, code);
export const labelForGroupType = (code: string) => labelOf(GROUP_TYPE_OPTIONS, code);
