import { AXIS_LABEL_KO, type AxisStatus, type DnaAxisKey } from "./types";

/**
 * KPI 연결 보강(README 로드맵 "KPI 연결 강화", 2026-08-03). `planBuilder.ts`의 `buildKpis()`가 만드는
 * `{name, method}` 목록은 그대로 두고(기존 KPI 편집 기능·전략별 KPI 생성 로직 변경 없음), 각 KPI에
 * "측정 목적/연결된 DNA 축/연결된 사업 목표/권장 측정 시점/목표값 설정 근거"를 덧붙이기만 하는 순수
 * 함수다. DNA·전략 점수 공식은 전혀 건드리지 않는다 — 이미 계산된 axisScores를 참고 정보로만 읽는다.
 *
 * ## 목표값 원칙(수치를 임의 생성하지 않는다)
 * `targetBasis`는 절대 구체적 목표 수치(예: "재방문율 30%")를 만들어내지 않는다. 연결된 DNA 축의
 * 현재 점수(이미 계산된 값)를 "참고 맥락"으로만 보여주고, 실제 목표 수치는 항상
 * `KPI_TARGET_INSTITUTION_PLACEHOLDER`("기관 설정 필요")로 귀결시킨다 — 축 데이터가 없거나 KPI가
 * 어떤 축과도 연결되지 않으면 그 사실만 안내한다.
 */

/** 실제 목표 수치는 절대 지어내지 않고 항상 이 문구로 귀결된다. */
export const KPI_TARGET_INSTITUTION_PLACEHOLDER = "기관 설정 필요";

export interface EnrichedKpi {
  name: string;
  method: string;
  /** 측정 목적 — 이 KPI를 왜 측정하는지 한 문장. */
  purpose: string;
  /** 연결된 DNA 축 — 이 KPI가 어떤 축의 개선을 보여주는지. 축과 무관한 운영 지표는 null. */
  linkedAxis: DnaAxisKey | null;
  /** 연결된 사업 목표 코드(ProjectInput.primaryGoal 그대로) — 프로젝트에 목표가 없으면 null. */
  linkedGoalCode: string | null;
  /** 연결된 사업 목표 라벨(한글). */
  linkedGoalLabel: string | null;
  /** 권장 측정 시점 — method 문구(설문/매출/로그 등)에서 그대로 유추한다(지어내지 않음). */
  recommendedTiming: string;
  /** 목표값 설정 근거 — 연결된 축 점수를 참고 맥락으로 보여주되, 실제 목표 수치는 항상
   * "기관 설정 필요"로 안내한다. */
  targetBasis: string;
}

export interface AxisScoreLike {
  axis: DnaAxisKey;
  score: number | null;
  status: AxisStatus;
}

/** KPI 이름 → 연결 DNA 축. `planBuilder.ts`의 `buildKpis()`가 실제로 생성하는 모든 KPI 이름(7개 전략
 * 템플릿의 kpiTemplates + 역할별/국적별 KPI 메모)을 그대로 나열한다 — 축과 무관한 순수 운영 지표
 * (안전사고, 정책 보고, 운영 지표 등)는 명시적으로 null을 둔다. 표에 없는 이름(사용자가 직접 추가한
 * KPI)은 아래 `classifyKpiAxis()`가 null로 안전하게 처리한다. */
const KPI_AXIS_LINK: Record<string, DnaAxisKey | null> = {
  // LOCAL_FOOD_MARKET
  "1인당 평균 소비액": "spend",
  "시장 체류시간": "stay",
  "재방문 의사율": "demand",
  // NIGHT_STAY_EXTENSION
  "숙박 전환율": "stay",
  "야간 프로그램 참여율": "stay",
  "체류시간 증가폭": "stay",
  // NATURE_WELLNESS
  "체험 프로그램 만족도": "diversity",
  "평균 체류시간": "stay",
  // CULTURAL_HERITAGE
  "해설 프로그램 참여율": "diversity",
  "학습 만족도": "diversity",
  "체류시간": "stay",
  // FESTIVAL_CONNECT
  "축제 기간 방문객 수 증가율": "demand",
  "동반 소비 연계율": "spend",
  "SNS 언급량": "network",
  // FAMILY_EXPERIENCE
  "가족 단위 재방문율": "demand",
  "체험 프로그램 완료율": "diversity",
  "안전사고 발생 건수": null,
  // SNS_HOTSPOT
  "SNS 콘텐츠 생성 건수": "network",
  "1인당 소비액": "spend",
  // 역할·국적 KPI 메모(audienceContext.ts computeRoleKpiNotes/computeNationalityKpiNotes)
  "정책 성과 보고 지표": null,
  "프로그램 운영 지표": null,
  "상품 판매 전환율": "spend",
  "외국인 예약 비중 추이": "demand",
};

function classifyKpiAxis(name: string): DnaAxisKey | null {
  return Object.prototype.hasOwnProperty.call(KPI_AXIS_LINK, name) ? KPI_AXIS_LINK[name] : null;
}

function buildPurpose(name: string, axis: DnaAxisKey | null): string {
  if (axis) {
    return `"${name}" 지표로 ${AXIS_LABEL_KO[axis]} 축의 개선 여부를 확인하기 위함입니다.`;
  }
  return `"${name}" 지표로 사업 운영 품질을 확인하기 위함입니다.`;
}

/** method 문구(측정 방법)에 이미 담긴 측정 수단 단서로 권장 시점을 유추한다 — 새 값을 지어내지 않고
 * 기존 method 텍스트를 근거로만 판단한다. */
function inferRecommendedTiming(method: string): string {
  if (method.includes("설문")) return "코스 종료 직후(현장 설문)";
  if (method.includes("사고") || (method.includes("로그") && method.includes("목표"))) {
    return "상시(발생 시 즉시 기록)";
  }
  if (method.includes("로그")) return "상시(운영 로그 기준)";
  if (method.includes("매출") || method.includes("결제")) return "월별(전월 대비 비교)";
  if (method.includes("예약")) return "월별(예약 데이터 집계)";
  if (method.includes("해시태그") || method.includes("게시물") || method.includes("SNS")) {
    return "분기별(SNS 게시물 집계)";
  }
  if (method.includes("방문자수") || method.includes("증가율") || method.includes("비교")) {
    return "시즌 종료 후(전년·전월 비교)";
  }
  return "분기별(정기 점검)";
}

function buildTargetBasis(axis: DnaAxisKey | null, axisScores: AxisScoreLike[] | null): string {
  if (!axis) {
    return `${KPI_TARGET_INSTITUTION_PLACEHOLDER} — 이 지표는 DNA 축과 직접 연결되지 않아 자체 운영 기준으로 목표치를 정해야 합니다.`;
  }
  if (!axisScores) {
    return `${KPI_TARGET_INSTITUTION_PLACEHOLDER} — 분석 데이터를 확인할 수 없어 목표값 근거를 제시할 수 없습니다.`;
  }
  const found = axisScores.find((a) => a.axis === axis);
  if (!found || found.score === null) {
    return `${KPI_TARGET_INSTITUTION_PLACEHOLDER} — ${AXIS_LABEL_KO[axis]} 축 데이터가 없어 목표값 근거를 만들 수 없습니다.`;
  }
  const statusLabel = found.status === "LIVE" ? "실시간" : found.status === "SNAPSHOT" ? "최근 확보" : "데이터 부족";
  return (
    `참고: 이 지역 ${AXIS_LABEL_KO[axis]} 축 점수는 비교군 내 ${found.score}점입니다(${statusLabel} 데이터). ` +
    `${KPI_TARGET_INSTITUTION_PLACEHOLDER} — 이 점수만으로 목표 수치를 자동 산출하지 않으며, 기관이 자체 운영 여건에 맞춰 정해야 합니다.`
  );
}

/** 사전검증 리포트의 위험·보완사항이 지목한 축들과 연결된 KPI 이름만 골라낸다(요구사항 2 — "사전검증
 * 리포트의 위험·보완사항에서 관련 KPI로 이어지게 한다"). 어떤 KPI도 해당 축과 연결돼 있지 않으면 빈
 * 배열(억지로 만들지 않음). */
export function findRelatedKpiNames(kpis: EnrichedKpi[], axes: DnaAxisKey[]): string[] {
  if (axes.length === 0) return [];
  const axisSet = new Set(axes);
  return kpis.filter((k) => k.linkedAxis !== null && axisSet.has(k.linkedAxis)).map((k) => k.name);
}

/** KPI 목록에 측정 목적·연결 축·연결 목표·권장 시점·목표값 근거를 덧붙인다. DB 조회·외부 API 호출이
 * 없는 순수 함수 — 같은 입력이면 항상 같은 결과를 낸다. */
export function enrichKpis(
  kpis: { name: string; method: string }[],
  input: {
    /** 이미 계산된 DNA 5축 점수/상태(analysisResult) — 없으면(null) 모든 목표값 근거가 "확인 불가"로 처리된다. */
    axisScores: AxisScoreLike[] | null;
    /** ProjectInput.primaryGoal 그대로. */
    primaryGoalCode: string | null;
    primaryGoalLabel: string | null;
  },
): EnrichedKpi[] {
  return kpis.map((kpi) => {
    const axis = classifyKpiAxis(kpi.name);
    return {
      name: kpi.name,
      method: kpi.method,
      purpose: buildPurpose(kpi.name, axis),
      linkedAxis: axis,
      linkedGoalCode: input.primaryGoalCode,
      linkedGoalLabel: input.primaryGoalLabel,
      recommendedTiming: inferRecommendedTiming(kpi.method),
      targetBasis: buildTargetBasis(axis, input.axisScores),
    };
  });
}
