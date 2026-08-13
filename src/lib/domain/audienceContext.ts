import type { PoiCategoryCode, StrategyTemplate } from "./strategyTemplates";

/**
 * Phase 4: 역할·국적·테마·여행월이 실제 분석 결과(전략 점수/순위/근거, 실행안 체크리스트·위험요인)에
 * 영향을 주기 위한 중앙 정책 모듈. 여러 파일에 흩어진 if문 대신 이 파일 하나에서만 가중치·판정 규칙을
 * 관리한다(설명 가능한 가중치 원칙). Math.random/Date.now/현재시각을 전혀 쓰지 않는 순수 함수만
 * 포함한다 — 동일 입력에는 항상 동일 결과.
 *
 * provenance 구분:
 * - "CURATED": 실제 공공데이터가 아니라 이 프로젝트가 기획상 정한 규칙(예: 역할별 목표 우선순위,
 *   외국인 서비스 준비도 추정치). 실측 수요 데이터로 오인되지 않도록 근거 텍스트에 항상 이를 명시한다.
 * - "MISSING": 해당 조건을 반영할 근거 자체가 없어(예: 반려동물 동반 전용 코스 템플릿 부재) 점수에는
 *   반영하지 않고 안내만 추가하는 경우.
 */

export type UserRoleCode = "TRAVEL_AGENCY" | "LOCAL_GOV" | "FESTIVAL_PLANNER";
export type NationalityCode = "DOMESTIC" | "FOREIGN";

export type ThemeCategory =
  | "FOOD"
  | "NATURE"
  | "CULTURE_HISTORY"
  | "WELLNESS"
  | "FESTIVAL"
  | "PET_FRIENDLY"
  | "LEISURE_ACTIVITY";

export type ContextAdjustmentSource = "role" | "nationality" | "theme" | "month";

export interface ContextAdjustment {
  source: ContextAdjustmentSource;
  appliesTo: "roleFit" | "targetFit" | "feasibilityFit" | "checklist";
  delta: number;
  reason: string;
  basis: "CURATED" | "MISSING";
}

const ROLE_LABEL_KO: Record<UserRoleCode, string> = {
  TRAVEL_AGENCY: "여행사/DMC",
  LOCAL_GOV: "지자체/관광재단",
  FESTIVAL_PLANNER: "축제 기획자",
};

export function roleLabel(role: UserRoleCode): string {
  return ROLE_LABEL_KO[role];
}

/** 값이 실제 지원되는 역할 코드인지 확인 후 반환한다. 레거시/누락 값은 undefined로 안전하게 처리한다
 * (이 조건이 없으면 역할 가중치를 아예 적용하지 않는다 — 12절 하위 호환). */
export function normalizeRole(value: unknown): UserRoleCode | undefined {
  return value === "TRAVEL_AGENCY" || value === "LOCAL_GOV" || value === "FESTIVAL_PLANNER" ? value : undefined;
}

export function normalizeNationality(value: unknown): NationalityCode | undefined {
  return value === "DOMESTIC" || value === "FOREIGN" ? value : undefined;
}

/** 1~12 정수만 유효한 여행월로 인정한다. */
export function normalizeMonth(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12 ? value : undefined;
}

export function normalizeThemeList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
}

/**
 * 역할별 목표(primaryGoal/supportedGoals) 우선순위(CURATED, 0~100). 지자체는 지역경제·공공성·
 * 계절분산을, 여행사는 상품성·신규시장·재방문(판매 가능성)을, 축제 기획자는 방문객 유치·비수기 분산·
 * 브랜드 인지도 등 행사 자체의 흥행과 재방문(재참여)을 상대적으로 우선한다(마스터 문서 6절, 2026-07-30
 * 축제 기획자 역할 추가). 실제 매출/방문객 데이터가 아니라 기획 우선순위이므로 근거 텍스트에는 항상
 * "역할 우선순위(기획 규칙)" 임을 밝힌다.
 */
const ROLE_GOAL_PRIORITY: Record<UserRoleCode, Record<string, number>> = {
  LOCAL_GOV: {
    GOAL_LOCAL_ECONOMY: 100,
    GOAL_SEASONALITY_BALANCE: 95,
    GOAL_VISITOR_GROWTH: 85,
    GOAL_REPEAT_VISIT: 75,
    GOAL_BRAND_IMAGE: 70,
    GOAL_NEW_MARKET: 55,
    GOAL_STAY_SPEND_EXPANSION: 60,
  },
  TRAVEL_AGENCY: {
    GOAL_STAY_SPEND_EXPANSION: 100,
    GOAL_NEW_MARKET: 90,
    GOAL_REPEAT_VISIT: 80,
    GOAL_VISITOR_GROWTH: 75,
    GOAL_BRAND_IMAGE: 55,
    GOAL_LOCAL_ECONOMY: 45,
    GOAL_SEASONALITY_BALANCE: 45,
  },
  FESTIVAL_PLANNER: {
    GOAL_SEASONALITY_BALANCE: 100,
    GOAL_VISITOR_GROWTH: 95,
    GOAL_BRAND_IMAGE: 80,
    GOAL_REPEAT_VISIT: 70,
    GOAL_NEW_MARKET: 60,
    GOAL_STAY_SPEND_EXPANSION: 55,
    GOAL_LOCAL_ECONOMY: 50,
  },
};

const ROLE_GOAL_PRIORITY_DEFAULT = 50;

/** 템플릿이 지원하는 목표들의 역할별 우선순위 평균 — 템플릿마다 supportedGoals 조합이 달라 역할에 따라
 * 실제로 다른 점수가 나온다(예: 축제형은 지자체 우선순위가 훨씬 높고, 청년 콘텐츠형은 여행사 우선순위가
 * 훨씬 높다). 역할이 없으면(레거시 데이터) 중립값 50을 반환한다. */
export function computeRoleFit(
  template: StrategyTemplate,
  role: UserRoleCode | undefined,
): { score: number; adjustment: ContextAdjustment | null } {
  if (!role) return { score: ROLE_GOAL_PRIORITY_DEFAULT, adjustment: null };
  const priorities = template.supportedGoals.map(
    (goal) => ROLE_GOAL_PRIORITY[role][goal] ?? ROLE_GOAL_PRIORITY_DEFAULT,
  );
  const score = priorities.length > 0
    ? Math.round(priorities.reduce((a, b) => a + b, 0) / priorities.length)
    : ROLE_GOAL_PRIORITY_DEFAULT;
  return {
    score,
    adjustment: {
      source: "role",
      appliesTo: "roleFit",
      delta: score - ROLE_GOAL_PRIORITY_DEFAULT,
      reason: `${roleLabel(role)} 관점의 목표 우선순위(기획 규칙) 반영`,
      basis: "CURATED",
    },
  };
}

/**
 * 자유 입력 테마 문구를 실제 서비스에 존재하는 관광 서비스 요소(언어/접근성/체험 성격)에 근거한 내부
 * 분류 카테고리로 매핑한다. 새 enum을 만드는 것이 아니라 이미 자유 텍스트로 저장되는 preferredThemes를
 * 해석하는 계층일 뿐이다(스키마 변경 없음). 국가별 고정관념이 아니라 키워드 매칭만 사용한다.
 */
const THEME_KEYWORDS: Record<ThemeCategory, string[]> = {
  FOOD: ["미식", "맛집", "먹거리", "시장", "음식"],
  NATURE: ["자연", "힐링", "휴양", "숲", "산", "바다", "경관"],
  CULTURE_HISTORY: ["문화", "역사", "유적", "전통", "고궁", "박물관"],
  WELLNESS: ["웰니스", "의료", "스파", "온천", "건강"],
  FESTIVAL: ["축제", "이벤트", "행사", "페스티벌"],
  PET_FRIENDLY: ["반려동물", "반려견", "펫", "강아지", "고양이"],
  LEISURE_ACTIVITY: ["레저", "액티비티", "체험", "스포츠", "야외활동"],
};

export function classifyThemes(themes: string[]): ThemeCategory[] {
  const categories = new Set<ThemeCategory>();
  for (const theme of themes) {
    for (const [category, keywords] of Object.entries(THEME_KEYWORDS) as [ThemeCategory, string[]][]) {
      if (keywords.some((k) => theme.includes(k))) categories.add(category);
    }
  }
  return [...categories];
}

/** 테마 카테고리 → 템플릿ID별 가산점(CURATED, 템플릿 concept/poiCategories와의 실제 연관성에 근거).
 * 반려동물(PET_FRIENDLY)은 전용 코스 템플릿이 없어 의도적으로 비워둔다(MISSING 처리, computeThemeFit
 * 참고). */
const THEME_TEMPLATE_BONUS: Partial<Record<ThemeCategory, Record<string, number>>> = {
  FOOD: { LOCAL_FOOD_MARKET: 12, FESTIVAL_EVENT: 5, YOUTH_LOCAL_CONTENT: 4 },
  NATURE: { NATURE_WELLNESS: 12, FAMILY_EXPERIENCE: 3 },
  CULTURE_HISTORY: { CULTURE_HISTORY: 12, FAMILY_EXPERIENCE: 3 },
  WELLNESS: { NATURE_WELLNESS: 10 },
  FESTIVAL: { FESTIVAL_EVENT: 12 },
  LEISURE_ACTIVITY: { NATURE_WELLNESS: 6, YOUTH_LOCAL_CONTENT: 6, NIGHT_STAY_EXTENSION: 4 },
};

const THEME_CATEGORY_BONUS_CAP = 15;

/**
 * TourAPI 신 분류체계(lclsSystm1 대분류/lclsSystm2 중분류) → ThemeCategory 공식 신호 매핑(2026-08-14,
 * POI 추천 품질 2차 고도화). THEME_KEYWORDS(자유 텍스트 이름 substring 매칭)와 달리, 한국관광공사가
 * 실제로 부여한 분류 코드다 — 이미 이 프로젝트가 검증에 쓰던 것과 같은 방식(scripts/verify-region-
 * codes.ts --lcls-systm1 <코드>, KorService2의 lclsSystmCode2 오퍼레이션을 실 서비스키로 직접 호출)으로
 * 아래 코드의 공식 명칭을 확인했다:
 * - HS(대분류 "역사관광", 확인됨): HS01 역사유적지/HS02 역사유물/HS03 종교성지/HS04 안보관광지. 이름에
 *   "문화"/"역사" 등 일반 단어가 없는 실제 사적지(경주 첨성대·대릉원·천마총 등 — 실 로컬 DB로 확인)도
 *   대분류 자체로 CULTURE_HISTORY와 정확히 대응된다.
 * - NA(대분류 "자연관광", 확인됨): NA01~05 전부 자연경관(산/하천·해양)·자연생태·자연공원·기타자연관광 —
 *   NATURE와 정확히 대응된다.
 * - LS(대분류 "레포츠", 확인됨): LS01~04 전부 육상/수상/항공/복합 레저스포츠 — LEISURE_ACTIVITY와
 *   정확히 대응된다.
 * - FD(대분류 "음식", 이미 foodClassification.ts에서 세부분류 용도로 검증됨): FOOD와 정확히 대응된다.
 * - lclsSystm2="EX05"(대분류 EX "체험관광"의 중분류 "웰니스관광"): 온천/사우나/스파/찜질방/한방체험/
 *   힐링명상/뷰티스파/기타웰니스/자연치유/기타의료관광 — WELLNESS와 정확히 대응된다. EX 대분류의 나머지
 *   중분류(전통체험/공예체험/농산어촌체험/산사체험/산업관광 등)는 WELLNESS와 무관해 EX05만 쓴다.
 * - lclsSystm2="VE07"(대분류 VE "문화관광"의 중분류 "전시시설"): 박물관/기념관/전시관/컨벤션센터/
 *   과학관/미술관 — CULTURE_HISTORY와 대응된다. VE 대분류 전체는 테마공원(VE02)·도시공원(VE03)·
 *   레저스포츠시설(VE10)·교통시설(VE11) 등과 뒤섞여 있어(경주 "강동 워터파크"=VE02가 실제 사례) 신호로
 *   쓰지 않고, 명확히 전시·박물관류인 VE07 중분류만 쓴다.
 * 매핑에 없는 코드(값이 없는 경우 포함 — FIXTURE 큐레이션 데이터나 구형 저장 데이터)는 빈 배열을
 * 반환한다 — 이 경우 호출부(computePoiFit)가 기존 이름 키워드 판정으로 안전하게 fallback한다(새 신호가
 * 없다고 기존 판정을 더 나쁘게 만들지 않는다).
 */
const STRUCTURAL_LCLS_SYSTM1_THEME: Partial<Record<string, ThemeCategory>> = {
  HS: "CULTURE_HISTORY",
  NA: "NATURE",
  LS: "LEISURE_ACTIVITY",
  FD: "FOOD",
};

const STRUCTURAL_LCLS_SYSTM2_THEME: Partial<Record<string, ThemeCategory>> = {
  VE07: "CULTURE_HISTORY",
  EX05: "WELLNESS",
};

/** POI의 TourAPI 신 분류체계 코드로부터 확인 가능한 ThemeCategory를 반환한다(위 매핑 참고). 중분류가
 * 대분류보다 더 구체적인 신호이므로 중분류 매핑을 먼저 확인한다 — 실제로는 두 매핑이 겹치는 대분류가
 * 없어 결과에 차이는 없지만, 향후 매핑이 늘어났을 때 구체적인 신호를 우선한다는 원칙을 코드로 남긴다. */
export function classifyStructuralPoiThemes(
  lclsSystm1: string | null | undefined,
  lclsSystm2: string | null | undefined,
): ThemeCategory[] {
  const categories = new Set<ThemeCategory>();
  const byLevel2 = lclsSystm2 ? STRUCTURAL_LCLS_SYSTM2_THEME[lclsSystm2] : undefined;
  if (byLevel2) categories.add(byLevel2);
  const byLevel1 = lclsSystm1 ? STRUCTURAL_LCLS_SYSTM1_THEME[lclsSystm1] : undefined;
  if (byLevel1) categories.add(byLevel1);
  return [...categories];
}

/** 테마 카테고리 → 실제 코스 POI 선택에 우선순위를 줄 PoiCategoryCode(2026-08-10 도입, strategy.ts의
 * selectPois가 사용). THEME_TEMPLATE_BONUS(전략 점수 가산)와 별개의 매핑이다 — 여기서는 "이 테마를
 * 고른 사용자가 실제 코스에서 우선 마주치길 기대할 카테고리"만 담는다. 근거 없이 세부 취향을 추측하지
 * 않기 위해, PoiCategoryCode 6종(ATTRACTION/FOOD/LODGING/EXPERIENCE/FESTIVAL/SHOPPING) 중 테마와
 * 명확히 연관된 카테고리만 매핑한다. PET_FRIENDLY는 대응 카테고리가 없어 의도적으로 비워둔다(전용
 * 코스 템플릿이 없는 것과 동일한 이유 — computeThemeFit 주석 참고). */
const THEME_POI_CATEGORY_MAP: Partial<Record<ThemeCategory, PoiCategoryCode[]>> = {
  FOOD: ["FOOD"],
  NATURE: ["ATTRACTION", "EXPERIENCE"],
  CULTURE_HISTORY: ["ATTRACTION"],
  WELLNESS: ["EXPERIENCE", "LODGING"],
  FESTIVAL: ["FESTIVAL"],
  LEISURE_ACTIVITY: ["EXPERIENCE"],
};

/** 선호 테마 카테고리들이 가리키는 PoiCategoryCode 전체를 중복 없이 반환한다(순서 보존). 테마가 없으면
 * 빈 배열 — 호출부(selectPois)가 기존 우선순위 티어 구조에 그대로 얹을 수 있도록 한다. */
export function themePreferredPoiCategories(categories: ThemeCategory[]): PoiCategoryCode[] {
  const result: PoiCategoryCode[] = [];
  for (const category of categories) {
    for (const cat of THEME_POI_CATEGORY_MAP[category] ?? []) {
      if (!result.includes(cat)) result.push(cat);
    }
  }
  return result;
}

/** 카테고리 기반 테마 가산점 — 기존 substring 가산점(strategy.ts의 원래 +10 규칙)과 합산 후
 * THEME_CATEGORY_BONUS_CAP으로 clamp한다. PET_FRIENDLY처럼 대응 템플릿이 없는 카테고리는 점수에는
 * 0을 더하되 "전용 템플릿 없음"을 MISSING 근거로 남긴다. */
export function computeThemeFit(
  template: StrategyTemplate,
  preferredCategories: ThemeCategory[],
  existingSubstringBonus: number,
): { bonus: number; adjustments: ContextAdjustment[] } {
  const adjustments: ContextAdjustment[] = [];
  let categoryBonus = 0;
  for (const category of preferredCategories) {
    const bonus = THEME_TEMPLATE_BONUS[category]?.[template.id];
    if (bonus) {
      categoryBonus += bonus;
      adjustments.push({
        source: "theme",
        appliesTo: "targetFit",
        delta: bonus,
        reason: `선호 테마(${category}) 분류와 이 전략의 연관성 반영(기획 규칙)`,
        basis: "CURATED",
      });
    } else if (category === "PET_FRIENDLY") {
      adjustments.push({
        source: "theme",
        appliesTo: "targetFit",
        delta: 0,
        reason: "반려동물 동반 테마: 현재 전용 코스 템플릿이 없어 점수에는 반영하지 않음",
        basis: "MISSING",
      });
    }
  }
  const bonus = Math.min(existingSubstringBonus + categoryBonus, THEME_CATEGORY_BONUS_CAP);
  return { bonus, adjustments };
}

/**
 * 외국인 대상 서비스 준비도(CURATED 추정) — 실제 방문객 데이터가 아니라 템플릿 성격(해설·안내 의존도,
 * 자기주도 관람 가능성)에 근거한 소폭 조정이다. 내국인은 조정하지 않는다(객관적 수요 데이터를 건드리지
 * 않는다는 4.1 원칙). feasibilityFit(운영 적합도)에만 더하며, 값은 StrategyTemplate.foreignReadinessAdjustment에
 * 템플릿별로 명시돼 있다.
 */
export function computeNationalityFeasibilityDelta(
  template: StrategyTemplate,
  nationality: NationalityCode | undefined,
): { delta: number; adjustment: ContextAdjustment | null } {
  if (nationality !== "FOREIGN") return { delta: 0, adjustment: null };
  const delta = template.foreignReadinessAdjustment;
  return {
    delta,
    adjustment: {
      source: "nationality",
      appliesTo: "feasibilityFit",
      delta,
      reason: `외국인 대상 서비스 준비도 추정(실측 수요 데이터 아님, CURATED): ${template.foreignReadinessNote}`,
      basis: "CURATED",
    },
  };
}

interface SeasonRiskRule {
  months: number[];
  note: string;
  /** 실외 비중이 큰 템플릿(ATTRACTION/EXPERIENCE/FESTIVAL 중심)에만 적용할지 여부. */
  outdoorOnly: boolean;
}

/** 월별 계절 위험 규칙(CURATED) — 실제 기상 API 연동 전까지 쓰는 명시적 규칙. 실제 기온·강수량 수치를
 * 지어내지 않고, 통상적으로 알려진 장마철/혹서기/혹한기 구간만 다룬다. */
const SEASON_RISK_RULES: SeasonRiskRule[] = [
  { months: [6, 7], note: "장마철 강수로 실외 일정 차질 가능 — 우천 대체 동선 사전 확보 필요", outdoorOnly: true },
  { months: [7, 8], note: "혹서기 실외 체류 시 온열질환 위험 — 그늘/휴식 지점과 식수 공급 확인 필요", outdoorOnly: true },
  { months: [12, 1, 2], note: "혹한기 실외 이동 시 결빙·저체온 위험 — 방한 대책과 실내 대체 코스 확인 필요", outdoorOnly: true },
];

const OUTDOOR_CATEGORIES = new Set(["ATTRACTION", "EXPERIENCE", "FESTIVAL"]);

function isOutdoorHeavyTemplate(template: StrategyTemplate): boolean {
  return template.poiCategories.some((c) => OUTDOOR_CATEGORIES.has(c));
}

/** 여행월에 따른 추가 위험 안내(실행안 위험요인/체크리스트에 덧붙인다). 월이 없거나(레거시) 실외 비중이
 * 낮은 템플릿이면 빈 배열을 반환한다 — 근거 없이 위험을 지어내지 않는다. */
export function computeSeasonalRiskNotes(month: number | undefined, template: StrategyTemplate): string[] {
  if (month === undefined) return [];
  const outdoorHeavy = isOutdoorHeavyTemplate(template);
  return SEASON_RISK_RULES.filter((rule) => rule.months.includes(month) && (!rule.outdoorOnly || outdoorHeavy)).map(
    (rule) => rule.note,
  );
}

/** 테마 카테고리에 따른 추가 체크리스트/위험 안내. 반려동물 동반은 전용 템플릿이 없다는 사실 자체를
 * 체크리스트에 안내하고, 레저·액티비티는 실외 비중이 큰 템플릿에서 안전 장비 확인을 추가한다. */
export function computeThemeChecklistNotes(categories: ThemeCategory[], template: StrategyTemplate): string[] {
  const notes: string[] = [];
  if (categories.includes("PET_FRIENDLY")) {
    notes.push("반려동물 동반 가능 여부는 업체별로 사전에 직접 확인 필요(전용 코스 템플릿 없음)");
  }
  if (categories.includes("LEISURE_ACTIVITY") && isOutdoorHeavyTemplate(template)) {
    notes.push("레저·액티비티 실외 활동 안전장비·보험 가입 여부 사전 확인 필요");
  }
  return notes;
}

/** 국적별 서비스 준비 체크리스트 안내(CURATED) — 실제 언어별 안내 실태 데이터가 없으므로, "준비가
 * 필요하다"는 안내만 추가하고 구체적 수요 수치는 언급하지 않는다. */
export function computeNationalityChecklistNotes(nationality: NationalityCode | undefined): string[] {
  if (nationality !== "FOREIGN") return [];
  return ["다국어 안내판/메뉴판 준비 여부 확인 필요(외국인 대상, 서비스 준비도 기준)"];
}

/** 역할별 실행 체크리스트 안내(CURATED) — 지자체는 정책 보고용 정량 근거를, 여행사는 판매 전환 관점을,
 * 축제 기획자는 프로그램 시간대 구성과 현장 운영(체류 유도·혼잡 관리)을 우선한다는 마스터 문서 6절
 * 방향을 실행 단계 안내로 구체화한다(2026-07-30 축제 기획자 역할 추가). */
export function computeRoleChecklistNotes(role: UserRoleCode | undefined): string[] {
  if (!role) return [];
  if (role === "LOCAL_GOV") {
    return ["정책 보고용 정량 지표(KPI) 수집 방법 사전 확정 필요"];
  }
  if (role === "FESTIVAL_PLANNER") {
    return [
      "프로그램별 시간대 배치와 체류 유도 동선 사전 확정 필요",
      "현장 혼잡·운영 인력 배치 계획 사전 확정 필요",
    ];
  }
  return ["예약/판매 채널(OTA 등) 연동 및 가격 정책 사전 확정 필요"];
}

export interface KpiTemplate {
  name: string;
  method: string;
}

/** 역할별 KPI 관점 추가(CURATED) — 템플릿 고유 KPI는 그대로 두고, 지자체는 정책 성과 지표를, 여행사는
 * 판매 전환 지표를, 축제 기획자는 프로그램 운영·참여 지표를 하나씩 더한다. 같은 전략(templateId)이 서로
 * 다른 시나리오의 1위로 뽑히더라도 역할이 다르면 KPI 목록이 실제로 달라지도록 하기 위한 일반 규칙이다
 * (특정 지역·시나리오 전용 분기가 아니다, 2026-07-30 축제 기획자 역할 추가). */
export function computeRoleKpiNotes(role: UserRoleCode | undefined): KpiTemplate[] {
  if (!role) return [];
  if (role === "LOCAL_GOV") {
    return [
      { name: "정책 성과 보고 지표", method: "체류시간·지역경제 파급효과 등 행정 보고용 지표 달성률을 분기별로 점검" },
    ];
  }
  if (role === "FESTIVAL_PLANNER") {
    return [
      { name: "프로그램 운영 지표", method: "시간대별 프로그램 참여·체류 인원 집계 방법을 사전에 정하고 현장에서 측정" },
    ];
  }
  return [{ name: "상품 판매 전환율", method: "예약 채널별 문의 대비 실제 예약 완료 비율 추적" }];
}

export interface RoleRiskNote {
  risk: string;
  mitigation: string;
}

/** 역할별 위험 관점 추가(CURATED, 2026-08-08) — 템플릿 고유 위험(riskTemplates)·계절 위험은 그대로
 * 두고, 역할마다 실제로 신경 쓰는 운영 리스크를 하나씩 더한다. 이전에는 위험 목록이 역할과 무관하게
 * 완전히 동일했다(체크리스트/KPI는 이미 역할별로 갈리는데 위험만 갈리지 않는 비대칭이 있었음) — 지자체는
 * 정책 보고 일정, 여행사는 예약 취소·노쇼로 인한 상품 운영 손실, 축제 기획자는 혼잡·안전 관리를
 * 우선한다는 마스터 문서 6절 방향을 위험 관리 단계에도 동일하게 적용한다(computeRoleChecklistNotes/
 * computeRoleKpiNotes와 같은 구조). */
export function computeRoleRiskNotes(role: UserRoleCode | undefined): RoleRiskNote[] {
  if (!role) return [];
  if (role === "LOCAL_GOV") {
    return [
      {
        risk: "정책 보고 시점과 실제 데이터 집계 시점이 어긋날 수 있음",
        mitigation: "행정 보고 일정에 맞춰 지표 집계 시점을 사전에 조율한다.",
      },
    ];
  }
  if (role === "FESTIVAL_PLANNER") {
    return [
      {
        risk: "행사 당일 집중 방문으로 인한 혼잡·안전 관리 부담 증가",
        mitigation: "혼잡 예상 시간대에 안전요원과 동선 통제 계획을 사전에 배치한다.",
      },
    ];
  }
  return [
    {
      risk: "예약 취소·노쇼로 인한 상품 운영 손실 가능성",
      mitigation: "예약 확정 정책과 취소 수수료 규정을 사전에 고지한다.",
    },
  ];
}

/** 국적별 KPI 관점 추가(CURATED) — 외국인 대상일 때만, 허위 방문객 수치 대신 측정 방법 자체를 KPI로
 * 제시한다(실측 데이터 없이 수치를 지어내지 않는다는 원칙 유지). */
export function computeNationalityKpiNotes(nationality: NationalityCode | undefined): KpiTemplate[] {
  if (nationality !== "FOREIGN") return [];
  return [{ name: "외국인 예약 비중 추이", method: "예약 시스템의 국적 입력값 기준 외국인 예약 건수 비율을 추적" }];
}

/**
 * 2026-07-31: 프로젝트 조건(역할·국적·테마·여행월·지역)이 "프로젝트 조건 → DNA 분석 → 전략 3안 →
 * 선택 전략 → 실행안 → 홍보자료" 파이프라인 전체에 같은 정규화 규칙으로 전달되도록 하는 공통 도메인
 * 타입이다. 이전에는 analyzeProject.ts/planService.ts/promoContentAdapter.ts가 각자 raw 값을 받아
 * 개별적으로 normalizeRole/normalizeNationality 등을 다시 호출했다 — 정규화 규칙 자체(무엇을 유효한
 * 값으로 볼지)는 이 파일에 이미 모여 있었으므로 결과가 갈릴 위험은 없었지만, "같은 컨텍스트 타입을
 * 파이프라인 전체가 공유"하지는 않아 각 단계가 독립적으로 재정규화하는 구조였다. 이 타입과
 * buildAnalysisContext()로 그 공유 지점을 명시적으로 만든다.
 */
export interface AnalysisContext {
  role: UserRoleCode | undefined;
  nationality: NationalityCode | undefined;
  travelMonth: number | undefined;
  /** 정규화된 원본 문자열 목록(표시·비교용 — 예: substring 매칭, 화면 노출). */
  preferredThemes: string[];
  excludedThemes: string[];
  /** 자유 텍스트 테마를 내부 분류 카테고리로 매핑한 결과(THEME_KEYWORDS 기반). */
  themeCategories: ThemeCategory[];
  regionCode: string;
}

export interface BuildAnalysisContextInput {
  role: unknown;
  nationality: unknown;
  travelMonth: unknown;
  preferredThemes: unknown;
  excludedThemes?: unknown;
  regionCode: string;
}

/** 파이프라인 전체가 공유하는 단일 진입점 — 역할/국적/월/테마 값이 유효하지 않거나(레거시 데이터,
 * 잘못된 폼 입력 등) 없으면 각 필드가 조용히 undefined/빈 배열로 빠진다(하위 호환, 임의 문자열이
 * 그대로 분석·프롬프트에 들어가지 않는다). */
export function buildAnalysisContext(input: BuildAnalysisContextInput): AnalysisContext {
  const preferredThemes = normalizeThemeList(input.preferredThemes);
  return {
    role: normalizeRole(input.role),
    nationality: normalizeNationality(input.nationality),
    travelMonth: normalizeMonth(input.travelMonth),
    preferredThemes,
    excludedThemes: normalizeThemeList(input.excludedThemes),
    themeCategories: classifyThemes(preferredThemes),
    regionCode: input.regionCode,
  };
}
