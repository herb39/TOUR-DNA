import type { PromoContent } from "./promoContent";
import { labelForRole } from "@/lib/validation/codes";

/**
 * 홍보자료 포스터·카드뉴스 "미리보기" 전용 view model(Phase 1, 2026-08-07). 새 콘텐츠를 생성하지
 * 않는다 — 이미 저장된 `PromoContent`(결정론적 생성 결과)와 프로젝트 요약 정보(지역·여행월·전략명)만
 * 재조합한다. LLM·랜덤값·네트워크를 쓰지 않으며, 동일 입력은 항상 동일 결과를 낸다. 편집기(전체 텍스트)
 * 와 달리 미리보기는 길이를 제한한다 — 잘라도 의미가 남도록 단어/문장 경계에서만 자른다.
 */

export interface PromoProjectSummary {
  regionName: string;
  travelYear: number;
  travelMonth: number;
  strategyName: string;
}

export const POSTER_HEADLINE_MAX = 40;
export const POSTER_TAGLINE_MAX = 60;
export const POSTER_CTA_MAX = 60;
export const CARD_BODY_PREVIEW_MAX = 50;
export const MAX_POSTER_COURSE_ITEMS = 3;

/** 최대 길이를 넘으면 마지막 공백/쉼표/마침표 경계에서 자르고 "…"을 붙인다 — 단어 중간이 잘려 의미가
 * 사라지는 것을 피한다. 적당한 경계를 못 찾으면(공백 없는 긴 고유명사 등) 문자 수 기준으로만 자른다. */
export function truncateAtBoundary(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const slice = trimmed.slice(0, maxLength);
  const boundaryMatch = /^[\s\S]*[\s,.·×]/.exec(slice);
  const cut = boundaryMatch ? boundaryMatch[0].trimEnd() : slice;
  return `${cut}…`;
}

/** instagram.caption은 여러 문장을 공백으로 이어 붙인 형태다(joinNonEmpty) — 첫 문장(첫 마침표까지)만
 * 뽑아 포스터 한 줄 카피로 쓴다. 마침표가 없으면 caption 전체를 그대로 쓴다. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const periodIndex = trimmed.indexOf(".");
  if (periodIndex === -1) return trimmed;
  return trimmed.slice(0, periodIndex + 1);
}

export interface PromoPosterCourseItem {
  order: number;
  name: string;
  timeSlot: string;
}

export interface PromoPosterViewModel {
  regionName: string;
  headline: string;
  tagline: string;
  travelPeriodLabel: string;
  targetLabel: string | null;
  strategyName: string;
  courseItems: PromoPosterCourseItem[];
  roleLabel: string;
  closingNote: string;
}

/** roleContent variant별로 이미 존재하는 "마무리/행동 유도" 성격의 문장을 그대로 재사용한다(새 CTA
 * 문구를 만들지 않는다) — 여행사는 일정 하이라이트, 지자체는 추진 개요, 축제 기획자는 체류 유도 힌트.
 * 포스터 CTA뿐 아니라 랜딩 미리보기의 CTA에도 같은 문장을 재사용한다(2026-08-08). */
export function resolveClosingNote(roleContent: PromoContent["roleContent"]): string {
  if (roleContent.role === "TRAVEL_AGENCY") return roleContent.itineraryHighlight;
  if (roleContent.role === "LOCAL_GOV") return roleContent.lead;
  return roleContent.retentionTip;
}

/** roleContent별로 제목에 해당하는 필드가 다르므로(productName/title/title), landing.title을 헤드라인
 * 기본값으로 우선 쓴다 — 세 역할 모두에서 이미 "{지역} {전략} 여행 코스" 형태로 지역+전략을 포함해
 * Level 1 정보(지역/제목)에 가장 적합하다. */
export function buildPromoPosterViewModel(
  content: PromoContent,
  project: PromoProjectSummary,
): PromoPosterViewModel {
  const targetLabel = content.cardNews.slides[0]?.body?.trim() || null;

  return {
    regionName: project.regionName,
    headline: truncateAtBoundary(content.landing.title, POSTER_HEADLINE_MAX),
    tagline: truncateAtBoundary(firstSentence(content.instagram.caption), POSTER_TAGLINE_MAX),
    travelPeriodLabel: `${project.travelYear}년 ${project.travelMonth}월`,
    targetLabel: targetLabel ? truncateAtBoundary(targetLabel, POSTER_TAGLINE_MAX) : null,
    strategyName: project.strategyName,
    courseItems: content.courseHighlights.slice(0, MAX_POSTER_COURSE_ITEMS).map((h, i) => ({
      order: i + 1,
      name: h.poiName,
      timeSlot: h.timeSlot,
    })),
    roleLabel: labelForRole(content.roleContent.role),
    closingNote: truncateAtBoundary(resolveClosingNote(content.roleContent), POSTER_CTA_MAX),
  };
}

export type PromoCardNewsSlideKind = "cover" | "course" | "closing";

export interface PromoCardNewsPreviewSlide {
  index: number;
  kind: PromoCardNewsSlideKind;
  title: string;
  body: string;
}

/** 저장된 cardNews.slides를 그대로 순서대로 옮기되, 미리보기용으로만 본문 길이를 제한한다 — 새 슬라이드를
 * 추가·삭제하거나 순서를 바꾸지 않는다(편집 영역은 원본 그대로 유지). 첫 슬라이드는 표지, 마지막 슬라이드는
 * 마무리로, 그 사이는 대표 코스 슬라이드로 표시만 구분한다(실제 슬라이드 개수는 저장된 데이터에 따른다 —
 * 항상 4장으로 채우지 않는다). */
export function buildPromoCardNewsViewModel(content: PromoContent): PromoCardNewsPreviewSlide[] {
  const slides = content.cardNews.slides;
  return slides.map((slide, i) => {
    const kind: PromoCardNewsSlideKind = i === 0 ? "cover" : i === slides.length - 1 ? "closing" : "course";
    return {
      index: i + 1,
      kind,
      title: truncateAtBoundary(slide.title, POSTER_HEADLINE_MAX),
      body: truncateAtBoundary(slide.body, CARD_BODY_PREVIEW_MAX),
    };
  });
}

export interface PromoLandingViewModel {
  heroTitle: string;
  /** landing.body는 이미 완결된 문단이라 자르지 않고 그대로 보여준다(포스터·카드뉴스와 달리 랜딩은
   * "전체 복사"가 목적인 긴 텍스트 채널). */
  valueProposition: string;
  /** 저장된 데이터에 실제로 존재하는 역할만 채운다(TRAVEL_AGENCY의 판매 포인트) — 없는 역할은 빈
   * 배열로 두어 섹션 자체를 생략한다(새 특징을 지어내지 않음). */
  keyFeatures: string[];
  courseItems: PromoPosterCourseItem[];
  recommendedFor: string | null;
  cta: string;
}

/** 랜딩페이지 미리보기 view model(2026-08-08) — LandingContent(title/body)만으로는 "히어로 제목/가치
 * 제안/주요 특징/대표 코스/추천 대상/CTA" 구조를 전부 표현할 수 없어, 이미 저장된 다른 필드(courseHighlights,
 * roleContent)를 함께 재조합한다. 새 문구를 만들지 않고, 역할별로 존재하지 않는 필드는 조용히 생략한다. */
export function buildPromoLandingViewModel(content: PromoContent): PromoLandingViewModel {
  const { roleContent } = content;
  return {
    heroTitle: content.landing.title,
    valueProposition: content.landing.body,
    keyFeatures: roleContent.role === "TRAVEL_AGENCY" ? [...roleContent.sellingPoints] : [],
    courseItems: content.courseHighlights.map((h, i) => ({ order: i + 1, name: h.poiName, timeSlot: h.timeSlot })),
    recommendedFor: roleContent.role === "TRAVEL_AGENCY" ? roleContent.targetAudience : null,
    cta: resolveClosingNote(roleContent),
  };
}

export interface PromoProposalViewModel {
  businessName: string;
  purpose: string;
  coreStrategy: string;
  courseItems: PromoPosterCourseItem[];
  expectedEffects: string[];
  risks: string[];
}

/** roleContent variant마다 "사업명"에 대응하는 필드가 다르다 — 여행사는 상품명, 지자체·축제 기획자는
 * title. 새 이름을 짓지 않고 이미 저장된 값을 그대로 옮긴다. */
function resolveBusinessName(roleContent: PromoContent["roleContent"]): string {
  return roleContent.role === "TRAVEL_AGENCY" ? roleContent.productName : roleContent.title;
}

/** "기대 효과"에 직접 대응하는 필드가 있는 역할(LOCAL_GOV)은 그 값을 쓰고, 여행사는 판매 포인트를
 * 같은 의미로 재사용한다 — 축제 기획자는 대응하는 필드가 없어 빈 배열로 두고 섹션을 생략한다. */
function resolveExpectedEffects(roleContent: PromoContent["roleContent"]): string[] {
  if (roleContent.role === "LOCAL_GOV") return roleContent.expectedEffects;
  if (roleContent.role === "TRAVEL_AGENCY") return [...roleContent.sellingPoints];
  return [];
}

/** "주요 위험"은 저장된 실행안 risks를 그대로 옮기는 축제 기획자 콘텐츠에만 있다 — 다른 역할은 빈
 * 배열로 두고 섹션을 생략한다(새 위험 요인을 지어내지 않음). */
function resolveProposalRisks(roleContent: PromoContent["roleContent"]): string[] {
  return roleContent.role === "FESTIVAL_PLANNER" ? roleContent.risks : [];
}

/** 제안서 미리보기 view model(2026-08-08) — "사업명/추진 목적/핵심 전략/대표 코스/기대 효과/주요 위험"
 * 구조로 재조합한다. 추진 목적은 이미 역할별 목적 절이 포함된 proposalSummary 첫 문장을 그대로 쓰고,
 * 핵심 전략은 프로젝트 요약의 전략명을 쓴다 — 둘 다 새로 만들지 않고 이미 계산된 값만 재사용한다. */
export function buildPromoProposalViewModel(
  content: PromoContent,
  project: PromoProjectSummary,
): PromoProposalViewModel {
  const { roleContent } = content;
  return {
    businessName: resolveBusinessName(roleContent),
    purpose: content.proposalSummary.sentences[0],
    coreStrategy: project.strategyName,
    courseItems: content.courseHighlights.map((h, i) => ({ order: i + 1, name: h.poiName, timeSlot: h.timeSlot })),
    expectedEffects: resolveExpectedEffects(roleContent),
    risks: resolveProposalRisks(roleContent),
  };
}
