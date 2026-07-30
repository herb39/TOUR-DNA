import type { InstagramContent, LandingContent, BlogContent, PromoContent, RolePromoContent } from "./promoContent";

/**
 * Phase 5-C 복사 기능이 쓰는 순수 포맷 함수. PromoContent를 읽기만 하고 mutate하지 않으며, 저장된
 * 값 이외의 문구를 새로 만들지 않는다(빈 섹션은 생략). UI(PromoContentEditor)와 향후 다른 화면이
 * 같은 포맷 규칙을 공유할 수 있도록 도메인 계층에 둔다.
 */

export function formatProposalSummaryForCopy(summary: PromoContent["proposalSummary"]): string {
  return summary.sentences.join("\n");
}

export function formatLandingForCopy(landing: LandingContent): string {
  return `${landing.title}\n\n${landing.body}`;
}

export function formatInstagramForCopy(instagram: InstagramContent): string {
  const hashtagLine = instagram.hashtags.map((tag) => `#${tag}`).join(" ");
  return hashtagLine.length > 0 ? `${instagram.caption}\n\n${hashtagLine}` : instagram.caption;
}

export function formatBlogForCopy(blog: BlogContent): string {
  return `${blog.title}\n\n${blog.body}`;
}

export function roleContentSectionLabel(role: RolePromoContent["role"]): string {
  if (role === "TRAVEL_AGENCY") return "여행상품 홍보자료";
  if (role === "FESTIVAL_PLANNER") return "프로그램 운영 자료";
  return "보도자료";
}

export function formatRoleContentForCopy(roleContent: RolePromoContent): string {
  if (roleContent.role === "TRAVEL_AGENCY") {
    return [
      `상품명: ${roleContent.productName}`,
      `타깃 고객: ${roleContent.targetAudience}`,
      "",
      "판매 포인트",
      ...roleContent.sellingPoints.map((point, i) => `${i + 1}. ${point}`),
      "",
      `일정 하이라이트: ${roleContent.itineraryHighlight}`,
    ].join("\n");
  }

  if (roleContent.role === "FESTIVAL_PLANNER") {
    const lines = [roleContent.title, "", `콘텐츠 구성: ${roleContent.programHighlight}`];
    if (roleContent.timeSlotPlan.length > 0) {
      lines.push("", "시간대별 프로그램", ...roleContent.timeSlotPlan.map((t) => `- ${t}`));
    }
    lines.push("", `체류 유도: ${roleContent.retentionTip}`);
    if (roleContent.operationChecklist.length > 0) {
      lines.push("", "운영 체크리스트", ...roleContent.operationChecklist.map((c) => `- ${c}`));
    }
    if (roleContent.risks.length > 0) {
      lines.push("", "위험요인", ...roleContent.risks.map((r) => `- ${r}`));
    }
    return lines.join("\n");
  }

  const lines = [roleContent.title, roleContent.lead, "", `추진 배경: ${roleContent.background}`, `핵심 프로그램: ${roleContent.coreProgram}`];
  if (roleContent.dataBasedEvidence.length > 0) {
    lines.push("", "데이터 기반 근거", ...roleContent.dataBasedEvidence.map((e) => `- ${e}`));
  }
  if (roleContent.expectedEffects.length > 0) {
    lines.push("", "기대 효과", ...roleContent.expectedEffects.map((e) => `- ${e}`));
  }
  return lines.join("\n");
}

/** 화면 표시 순서(제안서 요약 → 랜딩 → Instagram → 블로그 → 역할별 자료)와 동일한 순서로 합친다. */
export function formatFullPromoContentForCopy(content: PromoContent): string {
  const sections: Array<[string, string]> = [
    ["제안서 요약", formatProposalSummaryForCopy(content.proposalSummary)],
    ["랜딩페이지", formatLandingForCopy(content.landing)],
    ["Instagram", formatInstagramForCopy(content.instagram)],
    ["블로그", formatBlogForCopy(content.blog)],
    [roleContentSectionLabel(content.roleContent.role), formatRoleContentForCopy(content.roleContent)],
  ];
  return sections.map(([label, body]) => `[${label}]\n${body}`).join("\n\n");
}

/** Instagram 해시태그 편집 textarea 입력을 배열로 변환한다. 쉼표/공백/줄바꿈을 구분자로 인정하고,
 * 선행 '#'만 한 번 제거하며(중복 '#' 방지), 대소문자·내부 문자는 사용자가 입력한 그대로 둔다. */
export function parseHashtagsInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((token) => (token.startsWith("#") ? token.slice(1) : token))
    .filter((token) => token.length > 0);
}
