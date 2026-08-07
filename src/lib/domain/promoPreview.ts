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
 * 문구를 만들지 않는다) — 여행사는 일정 하이라이트, 지자체는 추진 개요, 축제 기획자는 체류 유도 힌트. */
function resolveClosingNote(roleContent: PromoContent["roleContent"]): string {
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
