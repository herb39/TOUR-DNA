import { roleLabel, type UserRoleCode } from "./audienceContext";

/**
 * 전략 추천 근거를 "데이터 진단 → 해석 → 추천 이유 → 실행 방향" 4단계로 연결하는 순수 조합 함수
 * (2026-08-13). 새 점수식·새 근거를 만들지 않고, `strategy.ts`(`computeStrategies`가 채우는
 * `reasons`)와 `strategyTemplates.ts`(coreProblem/coreResource/stayStyle, 2026-07-31 마이그레이션)에
 * 이미 저장돼 있는 문자열만 재배열한다. LLM을 쓰지 않고, 새 통계·순위·경제효과 수치를 지어내지 않는다.
 *
 * `roleDecisionSummary.ts`(analysis/plan 화면 상단, "이 역할이 지금 무엇을 먼저 봐야 하는가" — DNA
 * 5축 중 가장 약한 축 기준)와 책임을 분리한다 — 이 함수는 "왜 이 전략이 추천됐는가"만 다루며, 전략
 * 템플릿 고유 필드(coreProblem/coreResource/stayStyle)를 근거로 쓴다는 점에서 문장이 겹치지 않는다.
 *
 * coreProblem/coreResource/stayStyle 5필드는 2026-07-31 마이그레이션 이전 레거시 분석에는 없을 수
 * 있다(전부 null) — 그 경우 근거를 지어내지 않고 null을 반환한다(호출부는 기존 flat reasons 목록으로
 * 안전하게 대체한다).
 */

export interface StrategyRationaleTouchpoints {
  food: boolean;
  lodging: boolean;
  experience: boolean;
}

export interface StrategyRationaleInput {
  role: UserRoleCode | undefined;
  strategyName: string;
  coreProblem: string | null;
  coreResource: string | null;
  stayStyle: string | null;
  /** computeStrategies()가 이미 계산한 4개 근거 문장(reasons) — [0]수요, [1]공급·역할,
   * [2]시즌, [3]지표 기반 서술(있을 때만). 이 함수는 새 문장을 짓지 않고 이 배열만 재사용한다. */
  reasons: string[];
  roleFitReason: string | undefined;
  consumptionTouchpoints: StrategyRationaleTouchpoints;
}

export interface StrategyRationale {
  /** ① 데이터 진단 — reasons에서 가장 구체적인 지표 서술을 그대로 재사용한다. */
  dataDiagnosis: string;
  /** ② 해석 — 전략 템플릿의 coreProblem(CURATED, 지역명 비의존)을 그대로 재사용한다. */
  interpretation: string;
  /** ③ 추천 이유 — coreResource + 역할 목표 우선순위(roleFitReason)를 조합한다. */
  recommendationReason: string;
  /** ④ 실행 방향 — stayStyle + 실제 소비 접점(consumptionTouchpoints)을 조합한다. */
  executionDirection: string;
}

export function buildStrategyRationale(input: StrategyRationaleInput): StrategyRationale | null {
  const { role, strategyName, coreProblem, coreResource, stayStyle, reasons, roleFitReason, consumptionTouchpoints } =
    input;
  if (!coreProblem || !coreResource || !stayStyle) return null;
  if (reasons.length === 0) return null;

  const dataDiagnosis = reasons.length > 3 ? reasons[3] : reasons[0];

  // roleFitReason(computeRoleFit()이 이미 만드는 문장)은 "OO 관점의 목표 우선순위(기획 규칙) 반영"
  // 형태로 끝난다 — 여기서 role/관점을 다시 앞에 붙이면 "OO 관점의 목표 우선순위(OO 관점의 목표
  // 우선순위...)"처럼 겹친다. roleFitReason이 있으면 그대로 이어 붙이고, 없을 때만(레거시 방어) 직접
  // 조립한다.
  // coreResource/stayStyle은 템플릿마다 받침 유무가 달라(예: "…콘텐츠"는 받침 없음, "…맛집"은 받침
  // 있음) 바로 뒤에 을/를을 붙이면 절반은 어색해진다("콘텐츠을" 등) — "기반의"/"기반으로"처럼 받침과
  // 무관하게 항상 같은 형태인 연결어만 사용한다(promoContent.ts의 조사 처리 원칙과 동일).
  const recommendationReason = role
    ? `${coreResource} 기반의 '${strategyName}' 전략이 ${
        roleFitReason ?? `${roleLabel(role)} 관점의 목표 우선순위(기획 규칙) 반영`
      }으로 1순위로 추천됩니다.`
    : `${coreResource} 기반의 '${strategyName}' 전략이 조건 적합도 기준 1순위로 추천됩니다.`;

  const touchpointLabels = [
    consumptionTouchpoints.food ? "식음" : null,
    consumptionTouchpoints.lodging ? "숙박" : null,
    consumptionTouchpoints.experience ? "체험" : null,
  ].filter((v): v is string => v !== null);
  const touchpointClause =
    touchpointLabels.length > 0
      ? `${touchpointLabels.join("·")}을 하나로 연결하는 구성이 우선입니다.`
      : "실행안 코스 구성을 참고해 우선순위를 정하는 것이 좋습니다.";
  const seasonClause = reasons.length > 2 ? ` ${reasons[2]}.` : "";
  const executionDirection = `${stayStyle} 기반으로 ${touchpointClause}${seasonClause}`;

  return { dataDiagnosis, interpretation: coreProblem, recommendationReason, executionDirection };
}

/**
 * plan/print 화면용 축약형 한 줄 — "선택 전략 근거"로 쓴다. analysis 화면의 4단계 블록과 달리
 * coreProblem·coreResource 두 필드만으로 한 문장을 만든다(짧게 재확인하는 용도, 긴 블록 복제 아님).
 * roleDecisionSummary(역할이 지금 우선 볼 것)와도 겹치지 않는다 — 이 문장은 "이 전략을 선택한 이유"만
 * 다룬다.
 */
export function buildShortStrategyRationaleLine(
  coreProblem: string | null,
  coreResource: string | null,
): string | null {
  if (!coreProblem || !coreResource) return null;
  // coreResource 받침 유무가 템플릿마다 달라(위 buildStrategyRationale 주석 참고) "기반으로"만 사용한다.
  return `${coreProblem} — ${coreResource} 기반으로 보완하는 전략입니다.`;
}
