import type { CourseDay, MealPurpose } from "./planBuilder";
import type { DataProvenance, EvidenceItem } from "./types";
import { formatBaseYm, metricLabel } from "@/lib/format";
import { labelForNationality } from "@/lib/validation/codes";

/**
 * Phase 5-A: 저장된 프로젝트·실행안·근거 데이터만으로 홍보자료 5종(상품 제안서 요약/랜딩·상세페이지/
 * 인스타그램/블로그/역할별 자료)을 만드는 결정론적 순수 함수. LLM·DB·네트워크·환경변수·현재 시각·
 * 랜덤값을 전혀 쓰지 않는다 — 동일 입력은 항상 동일 결과를 낸다. 문구에 필요한 조사(은/는/이/가/을/를/
 * 으로)는 값의 받침에 따라 달라지므로, 변수 뒤에는 받침에 무관하게 항상 같은 형태인 조사(에서/의/등을)나
 * 라벨식 표기("데이터 근거: ...")만 붙인다 — 어색하거나 틀린 조사 조합을 만들지 않기 위함이다.
 */

export type PromoUserRole = "TRAVEL_AGENCY" | "LOCAL_GOV" | "FESTIVAL_PLANNER";
export type PromoNationality = "DOMESTIC" | "FOREIGN";

export const PROMO_CONTENT_VERSION = "promo-content-v1";

export interface PromoProjectContext {
  role: PromoUserRole;
  regionName: string;
  /** 값이 없으면(null) 문구에서 국적을 아예 언급하지 않는다. */
  nationality: PromoNationality | null;
  travelYear: number;
  travelMonth: number;
  /** 사용자가 자유 입력한 테마 문구. 빈 배열이면 문구에서 언급하지 않는다. */
  preferredThemes: string[];
}

export interface PromoStrategyContext {
  name: string;
}

export interface PromoPlanContext {
  productName: string;
  conceptText: string;
  background: string;
  targetSummary: string;
  sellingPoints: string[];
  course: CourseDay[];
  kpis: { name: string; method: string }[];
  /** 축제 기획자 역할 콘텐츠(운영 체크리스트·위험요인)에만 쓰인다 — 저장된 실행안 값을 그대로 재사용한다. */
  operationChecklist: string[];
  risks: { risk: string; mitigation: string }[];
}

export interface BuildPromoContentInput {
  project: PromoProjectContext;
  strategy: PromoStrategyContext;
  plan: PromoPlanContext;
  evidences: EvidenceItem[];
}

export interface ProposalSummary {
  /** 항상 정확히 3문장. 개별 문장 단위로 UI에서 따로 편집할 수 있도록 배열로 관리한다. */
  sentences: readonly [string, string, string];
}

export interface LandingContent {
  title: string;
  body: string;
}

export interface InstagramContent {
  caption: string;
  /** '#' 없이 순수 태그 텍스트만 담는다. 렌더링 시점에 '#'을 붙인다. */
  hashtags: string[];
}

export interface BlogContent {
  title: string;
  body: string;
}

export interface TravelAgencyPromo {
  role: "TRAVEL_AGENCY";
  productName: string;
  targetAudience: string;
  /** 항상 정확히 3개. */
  sellingPoints: readonly [string, string, string];
  itineraryHighlight: string;
}

export interface LocalGovPromo {
  role: "LOCAL_GOV";
  title: string;
  lead: string;
  background: string;
  coreProgram: string;
  /** 근거 없이 만들지 않는다 — evidenceReferences가 비어 있으면 이 배열도 빈 배열이다. */
  dataBasedEvidence: string[];
  /** 저장된 KPI가 있을 때만 채운다. 방문객 증가율·경제효과 등은 추정해 만들지 않는다. */
  expectedEffects: string[];
}

export interface FestivalPlannerPromo {
  role: "FESTIVAL_PLANNER";
  title: string;
  /** 콘텐츠 구성 요약 — 대표 프로그램/방문지 위주. */
  programHighlight: string;
  /** 시간대별 프로그램 배치 — course의 기존 순서를 그대로 문장화한다(새 시간을 지어내지 않음). */
  timeSlotPlan: string[];
  /** 체류 유도 동선 힌트. */
  retentionTip: string;
  /** 저장된 실행안의 운영 체크리스트를 그대로 재사용한다(새 항목을 만들지 않음). */
  operationChecklist: string[];
  /** 저장된 실행안의 위험요인·대응안을 한 줄로 합쳐 재사용한다. */
  risks: string[];
}

export type RolePromoContent = TravelAgencyPromo | LocalGovPromo | FestivalPlannerPromo;

export interface PromoEvidenceReference {
  metricCode: string;
  rawValue: number;
  /** Evidence.unit을 그대로 전달할 뿐, 새 단위를 지어내지 않는다. 값이 없으면 null. */
  unit: string | null;
  sourceCode: string;
  baseYm: string;
  provenance: DataProvenance;
  /** provenance === "ESTIMATED"일 때만 true. */
  isEstimated: boolean;
}

export interface PromoCourseHighlight {
  dayIndex: number;
  poiName: string;
  category: string;
  timeSlot: string;
  mealPurpose: MealPurpose | null;
}

export interface PromoContent {
  version: string;
  proposalSummary: ProposalSummary;
  landing: LandingContent;
  instagram: InstagramContent;
  blog: BlogContent;
  roleContent: RolePromoContent;
  evidenceReferences: PromoEvidenceReference[];
  /** course를 홍보자료 문구에 쓰기 위해 뽑아낸 대표 일정 — 원래 순서(dayIndex → order)를 그대로 유지한다. */
  courseHighlights: PromoCourseHighlight[];
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator = " "): string {
  return parts.filter((p): p is string => Boolean(p && p.trim().length > 0)).join(separator);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** course의 기존 순서(day → order)를 그대로 따라가며 poiName이 있는 항목만 최대 maxCount개 뽑는다.
 * 정렬 기준을 새로 만들지 않는다 — 이미 저장된 순서를 그대로 신뢰한다. */
function extractCourseHighlights(course: CourseDay[], maxCount: number): PromoCourseHighlight[] {
  const highlights: PromoCourseHighlight[] = [];
  for (const day of course) {
    for (const item of day.items) {
      if (!isNonEmptyString(item.poiName)) continue;
      highlights.push({
        dayIndex: day.dayIndex,
        poiName: item.poiName,
        category: item.category,
        timeSlot: item.timeSlot,
        mealPurpose: item.mealPurpose ?? null,
      });
      if (highlights.length >= maxCount) return highlights;
    }
  }
  return highlights;
}

/** 실제 점심/저녁으로 배치된 장소만 찾는다 — 카페/전통찻집(mealPurpose GENERAL) 등 식사 아닌 FOOD는
 * 여기서 절대 걸리지 않는다(scheduleDayWithMeals가 이미 결정한 purpose를 그대로 신뢰). */
function findFirstByMealPurpose(course: CourseDay[], purpose: MealPurpose): string | null {
  for (const day of course) {
    for (const item of day.items) {
      if (item.mealPurpose === purpose && isNonEmptyString(item.poiName)) return item.poiName;
    }
  }
  return null;
}

function sanitizeHashtagToken(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/[^0-9A-Za-z가-힣]/g, "");
}

/** 지역/여행월/전략명/대표 방문지에서만 결정론적으로 해시태그를 만든다 — 유행어·통계·과장 문구를
 * 새로 만들지 않는다. 중복 제거(대소문자 무시), 빈 값 제외, 입력이 같으면 순서도 항상 같다. */
function buildHashtags(
  regionName: string,
  travelMonth: number,
  strategyName: string,
  highlightNames: string[],
): string[] {
  const rawCandidates = [regionName, `${travelMonth}월여행`, strategyName, ...highlightNames];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawCandidates) {
    const tag = sanitizeHashtagToken(raw);
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** Evidence를 홍보자료에 쓸 수 있는 형태로만 걸러낸다(Phase 1 provenance 규칙 적용).
 * - MISSING, provenance 없음(null): 확정 근거로 쓰지 않는다(생성 근거·출처 목록에서 제외).
 * - rawValue가 유한하지 않거나 sourceCode/baseYm이 비어 있으면 제외(출처 지어내지 않음).
 * - 같은 (metricCode, baseYm, sourceCode) 조합은 첫 번째만 남긴다(입력 순서 유지, 안정적 중복 제거). */
function buildEvidenceReferences(evidences: EvidenceItem[]): PromoEvidenceReference[] {
  const seen = new Set<string>();
  const result: PromoEvidenceReference[] = [];
  for (const ev of evidences) {
    if (ev.provenance === null || ev.provenance === "MISSING") continue;
    if (!Number.isFinite(ev.rawValue)) continue;
    if (!isNonEmptyString(ev.sourceCode)) continue;
    if (!isNonEmptyString(ev.baseYm)) continue;
    const key = `${ev.metricCode}|${ev.baseYm}|${ev.sourceCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      metricCode: ev.metricCode,
      rawValue: ev.rawValue,
      unit: isNonEmptyString(ev.unit) ? ev.unit : null,
      sourceCode: ev.sourceCode,
      baseYm: ev.baseYm,
      provenance: ev.provenance,
      isEstimated: ev.provenance === "ESTIMATED",
    });
  }
  return result;
}

function formatEvidenceLine(ref: PromoEvidenceReference): string {
  const valuePart = ref.unit ? `${ref.rawValue} ${ref.unit}` : `${ref.rawValue}`;
  const estimatedPart = ref.isEstimated ? ", 추정값" : "";
  return `${metricLabel(ref.metricCode)}: ${valuePart} (출처: ${ref.sourceCode}, 기준월 ${formatBaseYm(ref.baseYm)}${estimatedPart})`;
}

function buildProposalSummary(
  input: BuildPromoContentInput,
  highlightNames: string[],
  evidenceRefs: PromoEvidenceReference[],
): ProposalSummary {
  const { project, strategy, plan } = input;

  const nationalityPart = project.nationality ? `${labelForNationality(project.nationality)} 방문객 대상으로` : null;
  // P0-6(2026-07-27): plan.productName은 이미 "...코스"/"...상품"으로 끝나는 경우가 많다
  // (planService.ts의 productName 템플릿 참고) — 뒤에 "코스입니다"를 무조건 붙이면
  // "'○○ 코스' 코스입니다"처럼 단어가 중복된다. 이미 그 단어로 끝나면 붙이지 않는다.
  const productNameText = plan.productName.trim();
  const productNamePart = /(코스|상품)$/.test(productNameText)
    ? `기획한 '${productNameText}'입니다.`
    : `기획한 '${productNameText}' 코스입니다.`;
  const sentence1 = joinNonEmpty([
    `${project.regionName}에서`,
    `${project.travelYear}년 ${project.travelMonth}월`,
    nationalityPart,
    productNamePart,
  ]);

  const sentence2 =
    highlightNames.length > 0
      ? `핵심 전략은 '${strategy.name}'이며, 대표 코스로 ${highlightNames.join(", ")} 등을 포함합니다.`
      : `핵심 전략은 '${strategy.name}'이며, 현재 저장된 실행안 코스 정보를 기반으로 구성되었습니다.`;

  const sentence3 =
    evidenceRefs.length > 0
      ? `데이터 근거: ${formatEvidenceLine(evidenceRefs[0])}가 이 기획을 뒷받침합니다.`
      : `제공된 데이터 근거가 아직 없어 실행안 내용만을 기반으로 안내합니다.`;

  return { sentences: [sentence1, sentence2, sentence3] };
}

function buildLanding(
  input: BuildPromoContentInput,
  highlightNames: string[],
  lunchName: string | null,
  dinnerName: string | null,
): LandingContent {
  const { project, strategy, plan } = input;
  const title = `${project.regionName} ${strategy.name} 여행 코스`;

  const body = joinNonEmpty([
    plan.background,
    `핵심 타깃: ${plan.targetSummary}.`,
    highlightNames.length > 0 ? `대표 방문지: ${highlightNames.join(", ")} 등입니다.` : null,
    lunchName ? `점심은 ${lunchName}에서 즐길 수 있습니다.` : null,
    dinnerName ? `저녁은 ${dinnerName}에서 즐길 수 있습니다.` : null,
  ]);

  return { title, body };
}

function buildInstagram(
  input: BuildPromoContentInput,
  highlightNames: string[],
): InstagramContent {
  const { project, strategy } = input;
  const caption = joinNonEmpty([
    `${project.regionName} × ${strategy.name} 코스.`,
    highlightNames[0] ? `${highlightNames[0]}에서 시작하는 여행.` : null,
  ]);
  const hashtags = buildHashtags(project.regionName, project.travelMonth, strategy.name, highlightNames);
  return { caption, hashtags };
}

function buildBlog(
  input: BuildPromoContentInput,
  highlightNames: string[],
): BlogContent {
  const { project, strategy, plan } = input;
  const title = `${project.regionName} ${strategy.name} 코스 소개`;

  const themesPart =
    project.preferredThemes.length > 0 ? `관심 테마: ${project.preferredThemes.join(", ")}.` : null;
  const highlightPart =
    highlightNames.length > 0 ? `이번 코스는 ${highlightNames.join(", ")} 등을 둘러봅니다.` : null;
  const kpiPart = plan.kpis.length > 0 ? `${plan.kpis[0].name} 등의 성과 지표로 운영 효과를 확인할 계획입니다.` : null;

  const body = joinNonEmpty([plan.conceptText, highlightPart, themesPart, kpiPart]);

  return { title, body };
}

/** 저장된 sellingPoints가 유효하면 그 값(최대 3개)을 우선 쓰고, 모자라면 대표 코스·타깃 요약 등
 * 이미 저장된 다른 데이터로만 결정론적으로 채운다 — 새 숫자나 장소를 지어내지 않는다. */
function resolveSellingPoints(
  storedSellingPoints: string[],
  targetSummary: string,
  highlightNames: string[],
): readonly [string, string, string] {
  const valid = storedSellingPoints.filter(isNonEmptyString).slice(0, 3);
  const result: string[] = [...valid];

  const fallbackCandidates = [
    ...highlightNames.map((name) => `${name} 방문 코스 포함`),
    targetSummary,
    "상세 판매 포인트는 실행안을 참고해 주세요.",
  ];
  for (const candidate of fallbackCandidates) {
    if (result.length >= 3) break;
    if (isNonEmptyString(candidate) && !result.includes(candidate)) result.push(candidate);
  }
  while (result.length < 3) result.push("상세 판매 포인트는 실행안을 참고해 주세요.");

  return [result[0], result[1], result[2]];
}

function buildTravelAgencyPromo(
  input: BuildPromoContentInput,
  highlightNames: string[],
): TravelAgencyPromo {
  const { plan } = input;
  return {
    role: "TRAVEL_AGENCY",
    productName: plan.productName,
    targetAudience: plan.targetSummary,
    sellingPoints: resolveSellingPoints(plan.sellingPoints, plan.targetSummary, highlightNames),
    itineraryHighlight:
      highlightNames.length > 0
        ? `${highlightNames.join(", ")} 등을 포함한 일정으로 구성됩니다.`
        : "세부 일정은 실행안 코스를 참고해 주세요.",
  };
}

function buildLocalGovPromo(
  input: BuildPromoContentInput,
  highlightNames: string[],
  evidenceRefs: PromoEvidenceReference[],
): LocalGovPromo {
  const { project, strategy, plan } = input;

  return {
    role: "LOCAL_GOV",
    title: `[보도자료] ${project.regionName} ${strategy.name} 추진`,
    lead: `${project.regionName}에서 ${strategy.name} 전략을 바탕으로 '${plan.productName}' 추진을 준비하고 있습니다.`,
    background: plan.background,
    coreProgram:
      highlightNames.length > 0
        ? `${highlightNames.join(", ")} 등을 중심으로 한 프로그램을 운영합니다.`
        : "실행안에 등록된 프로그램을 중심으로 운영합니다.",
    dataBasedEvidence: evidenceRefs.map(formatEvidenceLine),
    expectedEffects: plan.kpis.map((k) => `${k.name} — ${k.method}`),
  };
}

/** course의 기존 순서(day → order)를 그대로 따라가며 시간대·방문지를 한 줄로 문장화한다 — 새 시간대나
 * 프로그램명을 지어내지 않고 이미 저장된 course 항목만 그대로 옮긴다. */
function buildTimeSlotProgramLines(course: CourseDay[], maxCount: number): string[] {
  const lines: string[] = [];
  for (const day of course) {
    for (const item of day.items) {
      if (!isNonEmptyString(item.poiName)) continue;
      lines.push(`${day.dayIndex}일차 ${item.timeSlot} — ${item.poiName}`);
      if (lines.length >= maxCount) return lines;
    }
  }
  return lines;
}

function buildFestivalPlannerPromo(
  input: BuildPromoContentInput,
  highlightNames: string[],
): FestivalPlannerPromo {
  const { strategy, plan } = input;
  return {
    role: "FESTIVAL_PLANNER",
    title: `${strategy.name} 프로그램 운영 자료`,
    programHighlight:
      highlightNames.length > 0
        ? `${highlightNames.join(", ")} 등을 중심으로 프로그램을 구성합니다.`
        : "세부 프로그램 구성은 실행안 코스를 참고해 주세요.",
    timeSlotPlan: buildTimeSlotProgramLines(plan.course, 6),
    retentionTip:
      highlightNames.length > 1
        ? `${highlightNames[0]}에서 ${highlightNames[highlightNames.length - 1]}(으)로 이어지는 동선으로 체류 시간을 유도할 수 있습니다.`
        : "체류 유도 동선은 실행안 코스 순서를 참고해 주세요.",
    operationChecklist: plan.operationChecklist,
    risks: plan.risks.map((r) => `${r.risk} — ${r.mitigation}`),
  };
}

export function buildPromoContent(input: BuildPromoContentInput): PromoContent {
  const highlights = extractCourseHighlights(input.plan.course, 4);
  const highlightNames = highlights.map((h) => h.poiName);
  const lunchName = findFirstByMealPurpose(input.plan.course, "LUNCH");
  const dinnerName = findFirstByMealPurpose(input.plan.course, "DINNER");
  const evidenceRefs = buildEvidenceReferences(input.evidences);

  const roleContent: RolePromoContent =
    input.project.role === "TRAVEL_AGENCY"
      ? buildTravelAgencyPromo(input, highlightNames)
      : input.project.role === "FESTIVAL_PLANNER"
        ? buildFestivalPlannerPromo(input, highlightNames)
        : buildLocalGovPromo(input, highlightNames, evidenceRefs);

  return {
    version: PROMO_CONTENT_VERSION,
    proposalSummary: buildProposalSummary(input, highlightNames, evidenceRefs),
    landing: buildLanding(input, highlightNames, lunchName, dinnerName),
    instagram: buildInstagram(input, highlightNames),
    blog: buildBlog(input, highlightNames),
    roleContent,
    evidenceReferences: evidenceRefs,
    courseHighlights: highlights,
  };
}
