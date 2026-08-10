import type { CourseDay, MealPurpose } from "./planBuilder";
import { AXIS_LABEL_KO, type DataProvenance, type DnaAxisKey, type EvidenceItem } from "./types";
import type { UserRoleCode } from "./audienceContext";
import { toDisplayDnaScore } from "./dnaDisplayScore";
import { formatBaseYm, metricLabel } from "@/lib/format";
import { labelForNationality } from "@/lib/validation/codes";

/**
 * Phase 5-A: 저장된 프로젝트·실행안·근거 데이터만으로 홍보자료 5종(상품 제안서 요약/랜딩·상세페이지/
 * 인스타그램/블로그/역할별 자료)을 만드는 결정론적 순수 함수. LLM·DB·네트워크·환경변수·현재 시각·
 * 랜덤값을 전혀 쓰지 않는다 — 동일 입력은 항상 동일 결과를 낸다. 문구에 필요한 조사(은/는/이/가/을/를/
 * 으로)는 값의 받침에 따라 달라지므로, 변수 뒤에는 받침에 무관하게 항상 같은 형태인 조사(에서/의/등을)나
 * 라벨식 표기("데이터 근거: ...")만 붙인다 — 어색하거나 틀린 조사 조합을 만들지 않기 위함이다.
 *
 * Phase 2(2026-08-07): 이전에는 역할별 콘텐츠(roleContent)만 역할에 따라 구조가 달랐고, 공통 5개
 * 채널(제안서 요약/랜딩/인스타그램/블로그/카드뉴스)은 역할과 거의 무관하게 동일한 문장 구조였다.
 * `roleProposalPurposeClause`/`roleProposalFocusClause`/`roleLandingLeadIn`/`roleLandingClosingLine`/
 * `roleInstagramHook`/`roleBlogAngle`/`roleCardNewsClosing` 헬퍼로 각 채널에 역할 관점(강조점·목적)을
 * 하나씩 덧붙인다 — 기존 문장 구조·기존 데이터 조합 로직은 그대로 두고 role 분기 문구만 추가하는
 * 최소 변경이다. 이 문구들은 [audienceContext.ts](./audienceContext.ts)의 `ROLE_GOAL_PRIORITY`·
 * `computeRoleChecklistNotes`가 이미 정해둔 역할별 우선순위 방향(여행사=상품성·판매·체류소비,
 * 지자체=지역경제·정책·계절분산, 축제 기획자=집객·계절분산·현장운영)과 어긋나지 않도록 같은 방향으로만
 * 작성한다 — 역할 정의 자체(우선순위 표, 한글 라벨)는 audienceContext.ts를 그대로 재사용하고
 * 새로 만들지 않는다.
 */

/** 역할 코드 정의는 audienceContext.ts 하나만 둔다(중복 정의 방지) — 문자열 값은 동일하다. */
export type PromoUserRole = UserRoleCode;
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

/** DNA 5축 강점/약점 축 하나를 홍보 문구에 쓸 수 있는 형태로 요약한 것(2026-08-11). 내부 원점수
 * (0~100)는 절대 담지 않는다 — 표시지수(10~90, dnaDisplayScore.ts)만 담아 "DNA 72점" 같은 기계적인
 * 문장이 나오지 않게 한다. 실제 문구에서는 이 값조차 그대로 쓰지 않고 자연어 표현(DNA_STRENGTH_PHRASE)
 * 으로만 옮긴다 — displayScore는 화면에 근거 수치를 보여주고 싶을 때를 대비해 구조에만 남겨둔다. */
export interface PromoDnaAxisSummary {
  axis: DnaAxisKey;
  label: string;
  displayScore: number;
}

export interface PromoDnaContext {
  /** 점수가 높은 축부터 최대 2개. 계산 불가(레거시 분석·축 데이터 없음)면 빈 배열 — 강점을 지어내지 않는다. */
  strengths: PromoDnaAxisSummary[];
  /** 점수가 낮은 축부터 최대 2개(강점과 겹치면 제외). */
  weaknesses: PromoDnaAxisSummary[];
}

export const EMPTY_PROMO_DNA_CONTEXT: PromoDnaContext = { strengths: [], weaknesses: [] };

/** AnalysisResult에 저장된 5축 원점수만으로 강점/약점 축을 뽑는 순수 함수. score가 null인 축(MISSING)은
 * 후보에서 제외한다 — 데이터가 없는 축을 강점/약점으로 지어내지 않는다. 판정(정렬) 자체는 dna.ts의
 * buildStrengthsOpportunitiesCautions와 동일하게 원점수 순위로 하되, 노출값만 표시지수로 바꾼다. */
export function buildPromoDnaContext(axisScores: { axis: DnaAxisKey; score: number | null }[]): PromoDnaContext {
  const available = axisScores.filter(
    (a): a is { axis: DnaAxisKey; score: number } => a.score !== null && Number.isFinite(a.score),
  );
  if (available.length === 0) return EMPTY_PROMO_DNA_CONTEXT;

  const toSummary = (a: { axis: DnaAxisKey; score: number }): PromoDnaAxisSummary => ({
    axis: a.axis,
    label: AXIS_LABEL_KO[a.axis],
    displayScore: toDisplayDnaScore(a.score) as number,
  });

  const sortedDesc = [...available].sort((a, b) => b.score - a.score);
  const strengths = sortedDesc.slice(0, 2).map(toSummary);
  const strengthAxes = new Set(strengths.map((s) => s.axis));
  const weaknesses = [...sortedDesc]
    .reverse()
    .filter((a) => !strengthAxes.has(a.axis))
    .slice(0, 2)
    .map(toSummary);

  return { strengths, weaknesses };
}

export interface BuildPromoContentInput {
  project: PromoProjectContext;
  strategy: PromoStrategyContext;
  plan: PromoPlanContext;
  evidences: EvidenceItem[];
  /** 값을 넘기지 않으면(레거시 호출부) 강점/약점 없이 생성한다 — 기존 호출부를 깨지 않기 위한
   * optional 필드다. 새 호출부(promoContentAdapter.ts)는 항상 명시적으로 채워 넘긴다. */
  dna?: PromoDnaContext;
}

/**
 * 채널 생성 함수 전체가 공유하는 공통 입력 요약(2026-08-11 도입, "Generation Context"). 각 build*
 * 함수가 BuildPromoContentInput을 제각각 해석하지 않도록, 자주 쓰는 파생 값(대표 코스, DNA 강점/약점
 * 자연어 문구, 근거 인용 등)을 한 곳에서 미리 계산해둔다. 이 구조는 향후 LLM 기반 생성 엔진을 붙이더라도
 * 그대로 입력(prompt context)으로 재사용할 수 있도록 설계했다 — 다만 이번 작업에서는 LLM을 붙이지
 * 않는다. 이 파일 밖에서 직접 만들지 않고 반드시 buildPromoGenerationContext()로만 생성한다.
 */
export interface PromoGenerationContext {
  regionName: string;
  role: PromoUserRole;
  nationality: PromoNationality | null;
  travelYear: number;
  travelMonth: number;
  preferredThemes: string[];
  strategyName: string;
  strategyConcept: string;
  targetDescription: string;
  dnaStrengths: PromoDnaAxisSummary[];
  dnaWeaknesses: PromoDnaAxisSummary[];
  evidenceHighlights: PromoEvidenceReference[];
  coursePois: PromoCourseHighlight[];
  timeSlots: string[];
  kpis: { name: string; method: string }[];
  risks: { risk: string; mitigation: string }[];
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

export interface CardNewsSlide {
  title: string;
  body: string;
}

/** 카드뉴스 채널(2026-07-31 추가) — course/targetSummary/kpis 등 이미 저장된 값만으로 슬라이드를
 * 구성하는 결정론적 채널. 새 이미지·디자인 자산은 만들지 않고 텍스트 구성안만 제공한다. */
export interface CardNewsContent {
  slides: CardNewsSlide[];
}

/** 숏폼(릴스/쇼츠) 콘텐츠 채널의 장면 하나(2026-08-11 도입). visual/caption/narration 모두 실제
 * POI명이나 이미 저장된 전략·컨셉 텍스트에서만 만든다 — 실제 촬영 여부·연출은 방송/제작 담당자가
 * 정할 몫이므로 "촬영 현장에서 참고할 구성안"이라는 성격을 벗어나지 않는다. */
export interface ShortFormScene {
  scene: number;
  /** 화면 구성 힌트(예: "○○ 현장 촬영") — 실제 카메라 앵글·편집 지시가 아니다. */
  visual: string;
  /** 화면에 얹을 짧은 자막. */
  caption: string;
  /** 내레이션 대본 한 줄. */
  narration: string;
}

/** 숏폼 채널(2026-08-11 추가) — 15~30초 내외 릴스/쇼츠 초안. POI가 부족해도 최소 Hook+마무리 2개
 * 장면은 항상 만들어 실패하지 않는다(아래 buildShortForm 참고). */
export interface ShortFormContent {
  title: string;
  hook: string;
  scenes: ShortFormScene[];
  cta: string;
}

/** 지원하는 홍보자료 채널 전체 목록(2026-08-11, 숏폼 채널 추가로 6종→7종) — 채널 타입(`PromoChannel`)과
 * 기본 순서(`DEFAULT_CHANNEL_PRIORITY`), 스키마 검증(`promoContent.schema.ts`)이 모두 이 배열 하나에서
 * 파생된다 — 채널 이름을 여러 곳에 중복 하드코딩하지 않는다. */
export const ALL_PROMO_CHANNELS = [
  "proposalSummary",
  "landing",
  "instagram",
  "blog",
  "cardNews",
  "roleContent",
  "shortForm",
] as const;

export type PromoChannel = (typeof ALL_PROMO_CHANNELS)[number];

/** cardNews/channelPriority/translationNotice 도입(2026-07-31) 이전에 저장된 홍보자료를 안전하게
 * 채우기 위한 기본값 — `promoContent.schema.ts`의 하위 호환 처리에서만 사용한다. */
export const DEFAULT_CHANNEL_PRIORITY: PromoChannel[] = [...ALL_PROMO_CHANNELS];

/** `channelPriority`가 지원 채널 전체를 정확히 한 번씩만 포함하는 순열인지 확인한다(2026-08-01) —
 * 빈 배열/중복/일부 누락/순서 조작으로 일부 채널을 숨기는 값을 모두 걸러낸다. `promoContent.schema.ts`의
 * 저장 검증과 레거시 파싱 복구 로직이 이 함수 하나만 재사용한다(중복 정의 방지). */
export function isValidChannelPriority(value: unknown): value is PromoChannel[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== ALL_PROMO_CHANNELS.length) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !(ALL_PROMO_CHANNELS as readonly string[]).includes(item)) return false;
    if (seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

export interface PromoContent {
  version: string;
  proposalSummary: ProposalSummary;
  landing: LandingContent;
  instagram: InstagramContent;
  blog: BlogContent;
  cardNews: CardNewsContent;
  roleContent: RolePromoContent;
  shortForm: ShortFormContent;
  evidenceReferences: PromoEvidenceReference[];
  /** course를 홍보자료 문구에 쓰기 위해 뽑아낸 대표 일정 — 원래 순서(dayIndex → order)를 그대로 유지한다. */
  courseHighlights: PromoCourseHighlight[];
  /** 역할별로 어떤 채널을 우선 확인해야 하는지 순서를 담는다(화면 표시 순서 힌트일 뿐, 채널 자체를
   * 숨기지는 않는다) — 지자체는 보도자료·제안서, 축제 기획자는 SNS·카드뉴스, 여행사는 상품 소개문·SNS
   * 순서를 우선한다(마스터 문서 6절). */
  channelPriority: PromoChannel[];
  /** 국적이 FOREIGN일 때만 채워진다 — 검증된 다국어 번역 데이터/기능이 없다는 사실을 화면에 투명하게
   * 알린다(저품질 대량 번역을 만들지 않는다는 원칙, 2026-07-31). */
  translationNotice: string | null;
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

/** 제안서 요약 sentence1 끝에 붙는 역할별 목적 절(CURATED) — 여행사는 판매 가능한 상품 구성,
 * 지자체는 지역 활성화 사업 추진, 축제 기획자는 행사 프로그램 운영을 목적으로 명시한다. 역할명을
 * 문장에 끼워 넣는 대신(단순 치환 금지), 역할마다 실제로 다른 목적 어휘(판매/사업/운영)를 쓴다. */
function roleProposalPurposeClause(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "지역 관광 활성화 사업 추진을 목표로 합니다.";
  if (role === "FESTIVAL_PLANNER") return "축제·행사 프로그램 운영을 목표로 합니다.";
  return "판매 가능한 여행 상품 구성을 목표로 합니다.";
}

/** 제안서 요약 sentence2에 붙는 역할별 강조 포인트(CURATED) — 같은 코스라도 여행사는 판매 시 강조할
 * 매력, 지자체는 사업 추진 근거, 축제 기획자는 프로그램 구성 참고 동선으로 활용 방향이 다르다. */
function roleProposalFocusClause(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "지역 자원 활용과 사업 추진 근거로 이 코스를 활용할 수 있습니다.";
  if (role === "FESTIVAL_PLANNER") return "행사 프로그램 구성 시 이 코스를 참고 동선으로 활용할 수 있습니다.";
  return "판매 시 이 코스를 핵심 매력으로 강조할 수 있습니다.";
}

/** 랜딩 본문 맨 앞에 붙는 역할별 도입 문장(CURATED) — 이 페이지를 누가, 어떤 목적으로 쓸지 먼저
 * 밝힌다. */
function roleLandingLeadIn(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "지역 활성화 사업으로 추진할 수 있도록 구성했습니다.";
  if (role === "FESTIVAL_PLANNER") return "행사 프로그램 운영에 바로 활용할 수 있도록 구성했습니다.";
  return "여행 상품으로 바로 제안할 수 있도록 구성했습니다.";
}

/** 랜딩 본문 맨 끝에 붙는 역할별 마무리 문장(CURATED, 가치 제안+안내) — 실제로 클릭 가능한 버튼이
 * 아니라 서술형 안내 문장이라는 점을 분명히 하기 위해 "~을 확인해 주세요" 형태로 통일한다. */
function roleLandingClosingLine(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "자세한 사업 내용은 아래 프로그램과 기대 효과를 확인해 주세요.";
  if (role === "FESTIVAL_PLANNER") return "자세한 운영 계획은 아래 프로그램과 시간대 구성을 확인해 주세요.";
  return "자세한 상품 구성은 아래 코스와 판매 포인트를 확인해 주세요.";
}

/** Instagram 캡션 맨 앞에 붙는 짧은 후킹 문구(CURATED) — 여행사는 소비자 친화적 소비 유도, 지자체는
 * 기관 SNS에서도 어색하지 않은 정보형 안내, 축제 기획자는 참여·집객 유도로 톤을 구분한다. */
function roleInstagramHook(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "지역 관광 활성화 소식입니다.";
  if (role === "FESTIVAL_PLANNER") return "지금 참여할 수 있는 축제 소식입니다.";
  return "여행 상품으로 바로 즐기는 코스입니다.";
}

/** 블로그 도입부에 붙는 역할별 관점 문장(CURATED) — 같은 코스·데이터를 소개하는 목적 자체가
 * 판매/사업 설명/행사 소개로 다르다는 것을 첫 문장에서 밝힌다. */
function roleBlogAngle(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "이 자료는 지역 자원과 활성화 사업 필요성을 중심으로 소개합니다.";
  if (role === "FESTIVAL_PLANNER") return "이 코스는 축제 프로그램과 주변 관광 연계를 중심으로 소개합니다.";
  return "이 코스는 여행 상품으로 판매하기 좋은 구성을 중심으로 소개합니다.";
}

/** 카드뉴스 마지막 슬라이드(마무리)의 역할별 제목과 도입 어구(CURATED) — 기존 closingBody(판매
 * 포인트/KPI 등 이미 계산된 값)는 그대로 두고, 그 값을 어떤 관점으로 읽어야 하는지만 역할별로 다르게
 * 붙인다(새 사실을 만들지 않는다). */
function roleCardNewsClosing(role: PromoUserRole): { title: string; leadIn: string } {
  if (role === "LOCAL_GOV") return { title: "기대 효과", leadIn: "사업 추진 시 기대 효과" };
  if (role === "FESTIVAL_PLANNER") return { title: "참여 안내", leadIn: "참여 시 안내사항" };
  return { title: "판매 포인트", leadIn: "판매 시 강조할 포인트" };
}

/** DNA 강점 축 하나를 마케팅 문구에 쓸 수 있는 자연어 형용구로 옮긴다(CURATED, 2026-08-11). 원점수·
 * 표시지수 숫자를 절대 문장에 그대로 넣지 않기 위한 유일한 통로다 — "다양한 관광자원이 강점인 지역
 * 특성을 활용해"처럼, 축 이름 대신 그 축이 실제로 의미하는 특성을 서술한다. 이 매핑에 따라 문장
 * branch가 결정되므로(동일 강점 축 → 항상 동일 문구) random 없이도 프로젝트마다 다른 문구가 나온다. */
const DNA_STRENGTH_PHRASE: Record<DnaAxisKey, string> = {
  demand: "관광 수요가 활발한",
  stay: "체류형 여행에 강한",
  spend: "소비력 있는 방문객이 모이는",
  diversity: "다양한 관광자원을 갖춘",
  network: "주변 관광지와의 연계가 좋은",
};

/** DNA 약점(보완 여지) 축을 "위협"이 아니라 "기회"로 표현하는 문구(CURATED) — 카드뉴스의 "지역 문제·
 * 기회" 슬라이드 등 마케팅/제안 맥락에서 부정적으로 읽히지 않도록 한다. */
const DNA_OPPORTUNITY_PHRASE: Record<DnaAxisKey, string> = {
  demand: "수요 확대",
  stay: "체류 시간 확대",
  spend: "소비 연계 강화",
  diversity: "관광자원 다양화",
  network: "주변 관광지 연계 강화",
};

/** dna.strengths[0]가 있을 때만 짧은 절을 만든다(없으면 null — 문장에서 아예 생략). */
function dnaStrengthClause(ctx: PromoGenerationContext): string | null {
  const top = ctx.dnaStrengths[0];
  if (!top) return null;
  return `이 지역은 ${DNA_STRENGTH_PHRASE[top.axis]} 특성이 있어 이번 전략과 잘 맞습니다.`;
}

/** dna.weaknesses[0]가 있을 때만 "기회" 프레임 문장을 만든다(없으면 null). */
function dnaOpportunityClause(ctx: PromoGenerationContext): string | null {
  const bottom = ctx.dnaWeaknesses[0];
  if (!bottom) return null;
  // DNA_OPPORTUNITY_PHRASE 값이 전부 받침 없는 글자("대"/"화")로 끝나 "를"이 항상 맞다(2026-08-11
  // 실제 생성 결과 검증 중 "강화을"처럼 어색한 조사가 나오는 것을 발견해 수정 — 값이 늘어나면 이
  // 가정이 깨질 수 있으니 새 phrase를 추가할 때 받침 여부를 함께 확인해야 한다).
  return `${DNA_OPPORTUNITY_PHRASE[bottom.axis]}를 새로운 기회로 활용할 수 있습니다.`;
}

/** 채널 본문 맨 끝에 붙는 역할별 행동 유도 문구(CTA, CURATED) — 여행사는 상품 문의, 지자체는 담당
 * 부서 문의, 축제 기획자는 참여 신청으로 구분한다. */
function roleCtaClause(role: PromoUserRole): string {
  if (role === "LOCAL_GOV") return "자세한 추진 계획은 담당 부서로 문의해 주세요.";
  if (role === "FESTIVAL_PLANNER") return "지금 바로 참여 신청 방법을 확인해 보세요.";
  return "지금 바로 상품 문의를 남겨 보세요.";
}

/** BuildPromoContentInput → PromoGenerationContext 변환(순수 함수, 부작용 없음). 각 build* 함수가
 * 같은 파생 값을 다시 계산하지 않도록 buildPromoContent()가 한 번만 만들어 모든 채널에 전달한다. */
function buildPromoGenerationContext(
  input: BuildPromoContentInput,
  highlights: PromoCourseHighlight[],
  evidenceRefs: PromoEvidenceReference[],
): PromoGenerationContext {
  const { project, strategy, plan } = input;
  const dna = input.dna ?? EMPTY_PROMO_DNA_CONTEXT;
  return {
    regionName: project.regionName,
    role: project.role,
    nationality: project.nationality,
    travelYear: project.travelYear,
    travelMonth: project.travelMonth,
    preferredThemes: project.preferredThemes,
    strategyName: strategy.name,
    strategyConcept: plan.conceptText,
    targetDescription: plan.targetSummary,
    dnaStrengths: dna.strengths,
    dnaWeaknesses: dna.weaknesses,
    evidenceHighlights: evidenceRefs,
    coursePois: highlights,
    timeSlots: buildTimeSlotProgramLines(plan.course, 6),
    kpis: plan.kpis,
    risks: plan.risks,
  };
}

function buildProposalSummary(
  input: BuildPromoContentInput,
  ctx: PromoGenerationContext,
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
    roleProposalPurposeClause(project.role),
  ]);

  const sentence2 = joinNonEmpty([
    highlightNames.length > 0
      ? `핵심 전략은 '${strategy.name}'이며, 대표 코스로 ${highlightNames.join(", ")} 등을 포함합니다.`
      : `핵심 전략은 '${strategy.name}'이며, 현재 저장된 실행안 코스 정보를 기반으로 구성되었습니다.`,
    dnaStrengthClause(ctx),
    roleProposalFocusClause(project.role),
  ]);

  const sentence3 =
    evidenceRefs.length > 0
      ? `데이터 근거: ${formatEvidenceLine(evidenceRefs[0])}가 이 기획을 뒷받침합니다.`
      : `제공된 데이터 근거가 아직 없어 실행안 내용만을 기반으로 안내합니다.`;

  return { sentences: [sentence1, sentence2, sentence3] };
}

function buildLanding(
  input: BuildPromoContentInput,
  ctx: PromoGenerationContext,
  highlightNames: string[],
  lunchName: string | null,
  dinnerName: string | null,
): LandingContent {
  const { project, strategy, plan } = input;
  const title = `${project.regionName} ${strategy.name} 여행 코스`;

  const body = joinNonEmpty([
    roleLandingLeadIn(project.role),
    plan.background,
    dnaStrengthClause(ctx),
    `핵심 타깃: ${plan.targetSummary}.`,
    highlightNames.length > 0 ? `대표 방문지: ${highlightNames.join(", ")} 등입니다.` : null,
    lunchName ? `점심은 ${lunchName}에서 즐길 수 있습니다.` : null,
    dinnerName ? `저녁은 ${dinnerName}에서 즐길 수 있습니다.` : null,
    roleLandingClosingLine(project.role),
    roleCtaClause(project.role),
  ]);

  return { title, body };
}

function buildInstagram(
  input: BuildPromoContentInput,
  ctx: PromoGenerationContext,
  highlightNames: string[],
): InstagramContent {
  const { project, strategy } = input;
  const themePart = project.preferredThemes.length > 0 ? `${project.preferredThemes.join(", ")} 테마로 즐기는 여행.` : null;
  const secondHighlightPart =
    highlightNames.length > 1 ? `${highlightNames[1]}까지 이어지는 알찬 일정도 준비했어요.` : null;

  const paragraphs = [
    roleInstagramHook(project.role),
    `${project.regionName} × ${strategy.name} 코스.`,
    joinNonEmpty([highlightNames[0] ? `${highlightNames[0]}에서 시작하는 여행.` : null, themePart]),
    joinNonEmpty([secondHighlightPart, dnaStrengthClause(ctx)]),
    roleCtaClause(project.role),
  ].filter((p) => p.length > 0);

  const caption = paragraphs.join("\n\n");
  const hashtags = buildHashtags(project.regionName, project.travelMonth, strategy.name, highlightNames);
  return { caption, hashtags };
}

function buildBlog(
  input: BuildPromoContentInput,
  ctx: PromoGenerationContext,
  highlightNames: string[],
  evidenceRefs: PromoEvidenceReference[],
): BlogContent {
  const { project, strategy, plan } = input;
  const title = `${project.regionName} ${strategy.name} 코스 소개`;

  const themesPart =
    project.preferredThemes.length > 0 ? `관심 테마: ${project.preferredThemes.join(", ")}.` : null;
  const highlightPart =
    highlightNames.length > 0 ? `이번 코스는 ${highlightNames.join(", ")} 등을 둘러봅니다.` : null;
  const kpiPart = plan.kpis.length > 0 ? `${plan.kpis[0].name} 등의 성과 지표로 운영 효과를 확인할 계획입니다.` : null;
  // 데이터 기반 추천 이유 — evidenceReferences(사실 확인된 근거)만 인용하고, 근거가 없으면 문장 자체를
  // 만들지 않는다(evidence 없는데 "데이터 근거로"라는 문구만 지어내지 않음).
  const evidenceReasonPart =
    evidenceRefs.length > 0 ? `추천 이유: ${formatEvidenceLine(evidenceRefs[0])} 데이터를 근거로 합니다.` : null;

  const body = joinNonEmpty([
    roleBlogAngle(project.role),
    plan.conceptText,
    highlightPart,
    themesPart,
    dnaStrengthClause(ctx),
    evidenceReasonPart,
    kpiPart,
    roleCtaClause(project.role),
  ]);

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

/** 카드뉴스 슬라이드 구성안(2026-08-11 확장) — ①표지(전략명+타깃) → ②지역 문제/기회(DNA 약점을 기회로
 * 프레이밍, 없으면 background로 대체) → ③핵심 전략(컨셉) → ④대표 방문지 1장당 1슬라이드(최대 3장) →
 * ⑤마무리(기존 판매 포인트/KPI 요약) 순으로 결정론적으로 만든다. 새 수치·이미지는 만들지 않고 이미
 * 저장된 값 또는 DNA_OPPORTUNITY_PHRASE(자연어 프레이밍)만 사용한다. */
function buildCardNews(
  input: BuildPromoContentInput,
  ctx: PromoGenerationContext,
  highlights: PromoCourseHighlight[],
): CardNewsContent {
  const { project, strategy, plan } = input;
  const opportunityBody = dnaOpportunityClause(ctx) ?? plan.background;
  const slides: CardNewsSlide[] = [
    { title: `${project.regionName} ${strategy.name}`, body: plan.targetSummary },
    { title: "지역 문제·기회", body: opportunityBody },
    { title: "핵심 전략", body: plan.conceptText },
  ];
  for (const h of highlights.slice(0, 3)) {
    slides.push({ title: h.poiName, body: `${h.dayIndex}일차 ${h.timeSlot}` });
  }
  const closingFact =
    plan.sellingPoints.filter(isNonEmptyString)[0] ??
    (plan.kpis[0] ? `${plan.kpis[0].name} — ${plan.kpis[0].method}` : "자세한 내용은 실행안을 참고해 주세요.");
  const closing = roleCardNewsClosing(project.role);
  slides.push({ title: closing.title, body: `${closing.leadIn}: ${closingFact}` });
  return { slides };
}

/** 숏폼(릴스/쇼츠) 콘텐츠 초안(2026-08-11 신설) — Hook → 대표 POI 최대 2곳 → 전략 컨셉/CTA 순.
 * 실제 코스 POI가 부족하거나 아예 없어도(highlights가 빈 배열) 실패하지 않는다 — POI 장면 대신 전략
 * 컨셉 장면으로 대체해 최소 Hook+마무리 2개 장면은 항상 만든다. */
function buildShortForm(
  input: BuildPromoContentInput,
  ctx: PromoGenerationContext,
  highlights: PromoCourseHighlight[],
): ShortFormContent {
  const { project, strategy, plan } = input;
  const title = `${project.regionName} ${strategy.name} 숏폼 구성안`;
  const hook = joinNonEmpty([roleInstagramHook(project.role), `${project.regionName} ${project.travelMonth}월 여행`]);

  const scenes: ShortFormScene[] = [
    {
      scene: 1,
      visual: `${project.regionName} 대표 전경 촬영`,
      caption: hook,
      narration: joinNonEmpty([`${project.regionName}에서 떠나는 ${strategy.name} 여행,`, dnaStrengthClause(ctx)]),
    },
  ];

  const poiScenes = highlights.slice(0, 2);
  if (poiScenes.length > 0) {
    for (const h of poiScenes) {
      scenes.push({
        scene: scenes.length + 1,
        visual: `${h.poiName} 현장 촬영`,
        caption: h.poiName,
        narration: `${h.dayIndex}일차 ${h.timeSlot}, ${h.poiName}`,
      });
    }
  } else {
    // POI가 아직 없어도 실패하지 않는다 — 저장된 전략 컨셉 텍스트로 대체 장면을 만든다(새 사실을 지어내지 않음).
    scenes.push({
      scene: scenes.length + 1,
      visual: `${strategy.name} 컨셉 이미지`,
      caption: strategy.name,
      narration: plan.conceptText,
    });
  }

  const cta = roleCtaClause(project.role);
  scenes.push({
    scene: scenes.length + 1,
    visual: "코스 요약 화면",
    caption: cta,
    narration: plan.conceptText,
  });

  return { title, hook, scenes, cta };
}

/** 역할별 홍보자료 채널 확인 우선순위(CURATED, 마스터 문서 6절) — 채널 자체를 숨기지 않고 표시 순서만
 * 안내한다. 지자체는 보도자료·제안서, 축제 기획자는 SNS·카드뉴스, 여행사는 상품 소개문·SNS·블로그를
 * 우선한다. */
export function computeChannelPriority(role: PromoUserRole): PromoChannel[] {
  if (role === "LOCAL_GOV") {
    return ["roleContent", "proposalSummary", "landing", "blog", "cardNews", "shortForm", "instagram"];
  }
  if (role === "FESTIVAL_PLANNER") {
    return ["shortForm", "instagram", "cardNews", "roleContent", "proposalSummary", "landing", "blog"];
  }
  return ["shortForm", "roleContent", "instagram", "blog", "landing", "cardNews", "proposalSummary"];
}

/** 외국인 대상일 때만 노출되는 안내 — 검증된 번역 데이터/기능이 없다는 사실을 투명하게 알린다(저품질
 * 대량 번역을 자동 생성하지 않는다는 원칙, 2026-07-31). */
function buildTranslationNotice(nationality: PromoNationality | null): string | null {
  if (nationality !== "FOREIGN") return null;
  return "외국인 대상 홍보자료입니다. 현재 검증된 다국어 번역 데이터나 번역 기능이 없어 한국어 기획안 그대로 제공합니다 — 실제 배포 전 전문 번역을 거쳐 주세요.";
}

export function buildPromoContent(input: BuildPromoContentInput): PromoContent {
  const highlights = extractCourseHighlights(input.plan.course, 4);
  const highlightNames = highlights.map((h) => h.poiName);
  const lunchName = findFirstByMealPurpose(input.plan.course, "LUNCH");
  const dinnerName = findFirstByMealPurpose(input.plan.course, "DINNER");
  const evidenceRefs = buildEvidenceReferences(input.evidences);
  const ctx = buildPromoGenerationContext(input, highlights, evidenceRefs);

  const roleContent: RolePromoContent =
    input.project.role === "TRAVEL_AGENCY"
      ? buildTravelAgencyPromo(input, highlightNames)
      : input.project.role === "FESTIVAL_PLANNER"
        ? buildFestivalPlannerPromo(input, highlightNames)
        : buildLocalGovPromo(input, highlightNames, evidenceRefs);

  return {
    version: PROMO_CONTENT_VERSION,
    proposalSummary: buildProposalSummary(input, ctx, highlightNames, evidenceRefs),
    landing: buildLanding(input, ctx, highlightNames, lunchName, dinnerName),
    instagram: buildInstagram(input, ctx, highlightNames),
    blog: buildBlog(input, ctx, highlightNames, evidenceRefs),
    cardNews: buildCardNews(input, ctx, highlights),
    roleContent,
    shortForm: buildShortForm(input, ctx, highlights),
    evidenceReferences: evidenceRefs,
    courseHighlights: highlights,
    channelPriority: computeChannelPriority(input.project.role),
    translationNotice: buildTranslationNotice(input.project.nationality),
  };
}
