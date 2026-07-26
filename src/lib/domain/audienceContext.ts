import type { StrategyTemplate } from "./strategyTemplates";

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

export type UserRoleCode = "TRAVEL_AGENCY" | "LOCAL_GOV";
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
};

export function roleLabel(role: UserRoleCode): string {
  return ROLE_LABEL_KO[role];
}

/** 값이 실제 지원되는 역할 코드인지 확인 후 반환한다. 레거시/누락 값은 undefined로 안전하게 처리한다
 * (이 조건이 없으면 역할 가중치를 아예 적용하지 않는다 — 12절 하위 호환). */
export function normalizeRole(value: unknown): UserRoleCode | undefined {
  return value === "TRAVEL_AGENCY" || value === "LOCAL_GOV" ? value : undefined;
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
 * 계절분산을, 여행사는 상품성·신규시장·재방문(판매 가능성)을 상대적으로 우선한다(마스터 문서 6절).
 * 실제 매출/방문객 데이터가 아니라 기획 우선순위이므로 근거 텍스트에는 항상 "역할 우선순위(기획 규칙)"
 * 임을 밝힌다.
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

/** 역할별 실행 체크리스트 안내(CURATED) — 지자체는 정책 보고용 정량 근거를, 여행사는 판매 전환 관점을
 * 우선한다는 마스터 문서 6절 방향을 실행 단계 안내로 구체화한다. */
export function computeRoleChecklistNotes(role: UserRoleCode | undefined): string[] {
  if (!role) return [];
  if (role === "LOCAL_GOV") {
    return ["정책 보고용 정량 지표(KPI) 수집 방법 사전 확정 필요"];
  }
  return ["예약/판매 채널(OTA 등) 연동 및 가격 정책 사전 확정 필요"];
}
