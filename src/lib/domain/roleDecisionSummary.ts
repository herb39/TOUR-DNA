import { AXIS_LABEL_KO, type DnaAxisKey } from "./types";
import { roleLabel, type UserRoleCode } from "./audienceContext";

/**
 * 역할별 "핵심 의사결정 요약"(2026-08-13, 공모전 요구사항 5절) — DNA 5축 중 가장 약한 축과 역할을
 * 조합해 "지금 무엇을 먼저 검토해야 하는가"를 한 문장으로 요약한다. LLM을 쓰지 않는 CURATED 규칙이며,
 * businessOpportunity.ts의 AXIS_OPPORTUNITY_COPY(기회 카드)와는 독립적인 문구 세트다 — 여기서는
 * "사업 기회 제안"이 아니라 "역할이 지금 우선 볼 판단"이라는 다른 목적에 답한다. 근거(약점 축)가 없으면
 * (axisScores 전부 null) null을 반환해 근거 없는 요약을 지어내지 않는다.
 */

const AXIS_ROLE_DIRECTION: Record<DnaAxisKey, Record<UserRoleCode, string>> = {
  demand: {
    TRAVEL_AGENCY: "신규 유입보다 재방문·구전을 유도하는 상품 구성이 우선입니다",
    LOCAL_GOV: "신규 유입 확대를 위한 홍보·연계 사업 추진이 우선입니다",
    FESTIVAL_PLANNER: "낮은 수요를 프로그램 화제성으로 보완하는 기획이 우선입니다",
  },
  stay: {
    TRAVEL_AGENCY: "체류 시간을 늘리는 1박 이상 숙박 연계 상품 구성이 우선입니다",
    LOCAL_GOV: "당일 방문은 충분하지만 체류 전환이 약해 야간·숙박 인프라 연계가 우선입니다",
    FESTIVAL_PLANNER: "핵심 POI를 야간 프로그램과 연결해 행사 후 체류를 유도하는 구성이 적합합니다",
  },
  spend: {
    TRAVEL_AGENCY: "유료 체험·로컬 상품을 엮어 객단가를 높이는 구성이 우선입니다",
    LOCAL_GOV: "소비 접점을 늘리는 지역 상권 연계 사업이 우선입니다",
    FESTIVAL_PLANNER: "현장 소비를 늘리는 로컬 부스·상품 연계 구성이 적합합니다",
  },
  diversity: {
    TRAVEL_AGENCY: "테마를 다각화해 재방문 유인을 만드는 상품 구성이 우선입니다",
    LOCAL_GOV: "관광 유형을 다각화하는 콘텐츠 발굴 사업이 우선입니다",
    FESTIVAL_PLANNER: "다양한 프로그램으로 여러 방문 동기를 만드는 기획이 적합합니다",
  },
  network: {
    TRAVEL_AGENCY: "인근 명소를 묶는 코스형 상품 구성이 우선입니다",
    LOCAL_GOV: "관광지 간 연계 교통·코스 개발 사업이 우선입니다",
    FESTIVAL_PLANNER: "인근 명소와 연계한 동선으로 참여 범위를 넓히는 기획이 적합합니다",
  },
};

export interface RoleDecisionSummaryInput {
  role: UserRoleCode | undefined;
  /** DNA 5축 원점수(0~100) — 일부 또는 전부 null(MISSING)이어도 안전하게 처리한다. */
  axisScores: { axis: DnaAxisKey; score: number | null }[];
  /** 화면에 이미 표시된 1순위 추천 전략명 — 있으면 문장에 함께 인용한다(없으면 생략, 지어내지 않음). */
  topStrategyName: string | null;
  /** 화면에 숫자를 보여줄 때만 사용하는 표시지수. 없으면 기존 도메인 호출처럼 원점수를 사용한다. */
  displayScores?: Partial<Record<DnaAxisKey, number | null>>;
}

/** 역할이 없거나(레거시) DNA 축 데이터가 전부 없으면 null — 근거 없이 요약을 만들지 않는다. */
export function buildRoleDecisionSummary(input: RoleDecisionSummaryInput): string | null {
  const { role, axisScores, topStrategyName } = input;
  if (!role) return null;
  const available = axisScores.filter(
    (a): a is { axis: DnaAxisKey; score: number } => a.score !== null && Number.isFinite(a.score),
  );
  if (available.length === 0) return null;

  const weakest = [...available].sort((a, b) => a.score - b.score)[0];
  const direction = AXIS_ROLE_DIRECTION[weakest.axis][role];
  const strategyClause = topStrategyName ? `추천 전략 '${topStrategyName}' 기준으로, ` : "";
  const displayScore = input.displayScores?.[weakest.axis];
  const scoreText = displayScore !== null && displayScore !== undefined ? displayScore : weakest.score;

  return `${roleLabel(role)} 관점: ${AXIS_LABEL_KO[weakest.axis]} 축이 상대적 약점(DNA 상대지수 ${scoreText})으로 나타나 ${strategyClause}${direction}.`;
}
