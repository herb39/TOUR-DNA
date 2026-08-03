import { getTemplateById, type StrategyTemplate } from "./strategyTemplates";
import { computeRoleFit, roleLabel, type UserRoleCode } from "./audienceContext";

/**
 * 2026-08-04: 전략 3안 비교 화면에 예산 항목·협력 대상을 추가하기 위한 CURATED(기획 규칙) 도메인
 * 모듈. 금액은 절대 지어내지 않고 항상 BUDGET_AMOUNT_PLACEHOLDER로 표시하며, 항목 설명만 전략
 * 템플릿(strategyTemplates.ts에 이미 정의된 coreResource/poiCategories/requiresOvernight 등
 * CURATED 속성)과 역할(UserRoleCode)에 따라 달라진다. 외부 LLM·신규 API를 쓰지 않고, 기존 전략
 * 점수 공식(strategy.ts)도 전혀 건드리지 않는다.
 */
export const STRATEGY_RESOURCE_PLAN_RULE_VERSION = "strategy-resource-plan-rules-v1";

export const BUDGET_AMOUNT_PLACEHOLDER = "기관 산정 필요";

export const BUDGET_CATEGORIES = [
  "콘텐츠·프로그램 운영",
  "장소·시설",
  "인력",
  "홍보",
  "교통·안전",
  "데이터·성과 측정",
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export interface StrategyBudgetItem {
  category: BudgetCategory;
  description: string;
  amount: string;
}

export const PARTNER_CATEGORIES = [
  "지자체 부서",
  "관광재단",
  "지역 상인·사업자",
  "숙박·교통 업체",
  "문화·축제 기관",
  "데이터 제공기관",
] as const;
export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number];

export interface StrategyPartnerLink {
  category: PartnerCategory;
  name: string;
  reason: string;
}

export interface RoleFitRankingEntry {
  role: UserRoleCode;
  roleLabel: string;
  score: number;
}

const ALL_ROLES: UserRoleCode[] = ["LOCAL_GOV", "TRAVEL_AGENCY", "FESTIVAL_PLANNER"];

/** 이 전략 템플릿이 세 역할 각각에 얼마나 적합한지(roleFit 공식 재사용, 점수 공식 변경 없음)
 * 내림차순으로 정렬해 반환한다 — "적합 역할" 비교 표 칸에 쓰인다. */
export function buildRoleFitRanking(templateId: string): RoleFitRankingEntry[] {
  const template = getTemplateById(templateId);
  return ALL_ROLES.map((role) => ({
    role,
    roleLabel: roleLabel(role),
    score: computeRoleFit(template, role).score,
  })).sort((a, b) => b.score - a.score);
}

/** "적합 역할" 랭킹을 화면·인쇄 화면이 완전히 같은 문구로 보여주기 위한 공용 포맷터. */
export function formatRoleFitRanking(ranking: RoleFitRankingEntry[]): string {
  return ranking.map((r) => `${r.roleLabel}(${r.score}점)`).join(" > ");
}

export const EXECUTION_DIFFICULTY_LABEL_KO: Record<"LOW" | "MEDIUM" | "HIGH", string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
};

/**
 * 2026-08-04(비교표 결측값 진단): coreProblem/coreResource/stayStyle/executionDifficulty/
 * expectedEffect 5개 필드는 2026-07-31 마이그레이션(add_strategy_differentiation_fields)에서
 * 함께 추가됐고, analyzeProject.ts가 재분석 때마다 이 5개를 항상 동시에 채운다 — 즉 실제 DB에서는
 * "5개 전부 null(그 마이그레이션 이전 레거시 분석)" 또는 "5개 전부 값 있음(그 이후 재분석)" 둘 중
 * 하나만 나와야 정상이다. 일부만 null인 경우는 정상 경로에서 나올 수 없는 상태이므로, 레거시로
 * 오인해 안내를 숨기지 않고 "재분석 필요"라는 일반 안내로 남겨 이상 상태임을 그대로 드러낸다.
 */
export type StrategyDifferentiationAvailability = "COMPLETE" | "LEGACY" | "PARTIAL_MISSING";

export const LEGACY_STRATEGY_FIELD_NOTICE = "이 비교 항목은 이전 분석 결과라 재분석이 필요합니다.";
export const PARTIAL_MISSING_STRATEGY_FIELD_NOTICE = "재분석 필요";

export interface StrategyDifferentiationFields {
  coreProblem: string | null;
  coreResource: string | null;
  stayStyle: string | null;
  executionDifficulty: "LOW" | "MEDIUM" | "HIGH" | null;
  expectedEffect: string | null;
}

export function classifyStrategyDifferentiationAvailability(
  fields: StrategyDifferentiationFields,
): StrategyDifferentiationAvailability {
  const values = [
    fields.coreProblem,
    fields.coreResource,
    fields.stayStyle,
    fields.executionDifficulty,
    fields.expectedEffect,
  ];
  const missingCount = values.filter((v) => v === null).length;
  if (missingCount === 0) return "COMPLETE";
  if (missingCount === values.length) return "LEGACY";
  return "PARTIAL_MISSING";
}

/** null인 비교 필드 하나를 무엇으로 안내할지 — 전체 레코드가 레거시면 "이전 분석 결과" 안내를,
 * 그 외(정상 경로에서 나올 수 없는 이상 상태)에는 기존 일반 안내를 그대로 남긴다. */
export function describeMissingStrategyField(availability: StrategyDifferentiationAvailability): string {
  return availability === "LEGACY" ? LEGACY_STRATEGY_FIELD_NOTICE : PARTIAL_MISSING_STRATEGY_FIELD_NOTICE;
}

export interface StrategyComparisonSourceRow extends StrategyDifferentiationFields {
  id: string;
  rank: number;
  name: string;
  totalScore: number;
  templateId: string;
  risks: string[];
}

export interface StrategyComparisonRow extends StrategyComparisonSourceRow {
  roleFitRanking: RoleFitRankingEntry[];
  dataAvailability: StrategyDifferentiationAvailability;
}

/** 분석 화면과 인쇄 화면이 완전히 같은 비교 데이터·판정 로직을 쓰도록 하는 단일 진입점 — 두 화면
 * 모두 이 함수가 반환한 rows만 그대로 렌더링하고, roleFit 계산이나 레거시 판정을 각자 다시 하지
 * 않는다. */
export function buildStrategyComparisonRows(
  sources: StrategyComparisonSourceRow[],
): StrategyComparisonRow[] {
  return sources.map((s) => ({
    ...s,
    roleFitRanking: buildRoleFitRanking(s.templateId),
    dataAvailability: classifyStrategyDifferentiationAvailability(s),
  }));
}

function buildContentBudgetDescription(template: StrategyTemplate): string {
  return `${template.coreResource} 기반 프로그램 기획·콘텐츠 제작비(체험 키트, 해설 자료 등)`;
}

function buildVenueBudgetDescription(template: StrategyTemplate): string {
  if (template.poiCategories.includes("FESTIVAL")) {
    return "축제장·행사부스 대관료 및 시설 설치비";
  }
  if (template.requiresOvernight || template.poiCategories.includes("LODGING")) {
    return "숙박시설 연계 대관료 및 부대시설 이용료";
  }
  if (template.poiCategories.includes("EXPERIENCE")) {
    return "체험시설 대관료 및 안전시설 설치비";
  }
  return "코스 내 주요 장소 대관·이용료";
}

function buildStaffBudgetDescription(template: StrategyTemplate, role: UserRoleCode | undefined): string {
  const base =
    role === "LOCAL_GOV"
      ? "행정 지원인력 및 해설사 인건비"
      : role === "FESTIVAL_PLANNER"
        ? "현장 운영인력 및 안전요원 인건비"
        : role === "TRAVEL_AGENCY"
          ? "여행 인솔자·가이드 인건비"
          : "현장 운영인력 인건비";
  return template.executionDifficulty === "HIGH"
    ? `${base}(실행 난이도 높음 — 인력 여유분 추가 확보 필요)`
    : base;
}

function buildPromotionBudgetDescription(role: UserRoleCode | undefined): string {
  if (role === "LOCAL_GOV") return "지자체 홍보채널(누리집·SNS·보도자료) 제작·집행비";
  if (role === "FESTIVAL_PLANNER") return "축제 SNS·현장 홍보물 제작비";
  if (role === "TRAVEL_AGENCY") return "OTA·여행상품 홍보 및 광고 집행비";
  return "온오프라인 홍보물 제작비";
}

function buildSafetyBudgetDescription(template: StrategyTemplate): string {
  let desc = "코스 이동 구간 교통비 및 안전관리비";
  if (template.requiresOvernight) desc += "(야간 이동 안전 관리 포함)";
  if (template.poiCategories.includes("FESTIVAL")) desc += "(혼잡 관리 인력·교통 통제 비용 포함)";
  return desc;
}

function buildMeasurementBudgetDescription(template: StrategyTemplate): string {
  return `KPI 측정용 설문·운영 로그 시스템 운영비(전략 기본 KPI ${template.kpiTemplates.length}건 기준)`;
}

/** 전략 템플릿+역할에 따라 6개 예산 항목을 생성한다. 금액은 항상 BUDGET_AMOUNT_PLACEHOLDER —
 * 실제 사업비는 기관이 자체 산정해야 하며 이 함수가 임의로 추정하지 않는다. */
export function buildStrategyBudgetItems(
  templateId: string,
  role: UserRoleCode | undefined,
): StrategyBudgetItem[] {
  const template = getTemplateById(templateId);
  const descriptionByCategory: Record<BudgetCategory, string> = {
    "콘텐츠·프로그램 운영": buildContentBudgetDescription(template),
    "장소·시설": buildVenueBudgetDescription(template),
    인력: buildStaffBudgetDescription(template, role),
    홍보: buildPromotionBudgetDescription(role),
    "교통·안전": buildSafetyBudgetDescription(template),
    "데이터·성과 측정": buildMeasurementBudgetDescription(template),
  };
  return BUDGET_CATEGORIES.map((category) => ({
    category,
    description: descriptionByCategory[category],
    amount: BUDGET_AMOUNT_PLACEHOLDER,
  }));
}

function buildGovPartner(role: UserRoleCode | undefined): StrategyPartnerLink {
  return role === "LOCAL_GOV"
    ? { category: "지자체 부서", name: "주무부서(관광정책과 등)", reason: "사업 총괄 및 예산 집행 협의" }
    : { category: "지자체 부서", name: "인허가·행정 협조 부서", reason: "시설 사용 및 안전 신고 협조" };
}

function buildFoundationPartner(role: UserRoleCode | undefined): StrategyPartnerLink {
  return role === "FESTIVAL_PLANNER"
    ? { category: "관광재단", name: "지역 관광재단", reason: "축제 홍보 및 방문객 통계 협업" }
    : { category: "관광재단", name: "지역 관광재단", reason: "마케팅 지원 및 통계 데이터 연계" };
}

function buildMerchantPartner(template: StrategyTemplate): StrategyPartnerLink {
  const hasConsumptionCore = template.poiCategories.includes("FOOD") || template.poiCategories.includes("SHOPPING");
  return hasConsumptionCore
    ? {
        category: "지역 상인·사업자",
        name: "전통시장 상인회·로컬 매장",
        reason: "코스 내 소비 연계 및 할인 프로모션 협의",
      }
    : { category: "지역 상인·사업자", name: "지역 상인·사업자", reason: "코스 인근 소비처 연계 협의" };
}

function buildLodgingTransportPartner(template: StrategyTemplate): StrategyPartnerLink {
  return template.requiresOvernight
    ? { category: "숙박·교통 업체", name: "숙박업체", reason: "객실 확보 및 숙박 프로모션 연계" }
    : { category: "숙박·교통 업체", name: "교통업체", reason: "코스 이동 구간 배차 및 안전 운행 협의" };
}

function buildCultureFestivalPartner(templateId: string): StrategyPartnerLink {
  if (templateId === "FESTIVAL_EVENT") {
    return { category: "문화·축제 기관", name: "축제 운영위원회", reason: "행사 일정 조율 및 공동 프로그램 구성" };
  }
  if (templateId === "CULTURE_HISTORY") {
    return {
      category: "문화·축제 기관",
      name: "지역 문화원·문화재 관리기관",
      reason: "해설사 파견 및 전시 콘텐츠 협조",
    };
  }
  return {
    category: "문화·축제 기관",
    name: "해당 없음",
    reason: "이 전략은 문화·축제 기관 연계 비중이 낮음",
  };
}

function buildDataProviderPartner(): StrategyPartnerLink {
  return {
    category: "데이터 제공기관",
    name: "지역 관광 데이터센터·통계기관",
    reason: "KPI 측정용 방문자·소비 데이터 제공",
  };
}

/** 전략 템플릿+역할에 따라 6개 협력 대상을 생성한다. 항목 순서는 PARTNER_CATEGORIES와 항상 일치한다. */
export function buildStrategyPartners(
  templateId: string,
  role: UserRoleCode | undefined,
): StrategyPartnerLink[] {
  const template = getTemplateById(templateId);
  return [
    buildGovPartner(role),
    buildFoundationPartner(role),
    buildMerchantPartner(template),
    buildLodgingTransportPartner(template),
    buildCultureFestivalPartner(templateId),
    buildDataProviderPartner(),
  ];
}
