import { AXIS_LABEL_KO, type DataProvenance, type DnaAxisKey } from "./types";

/**
 * 사업 사전검증 리포트(README 로드맵 "사업 사전검증", 2026-08-03). 선택한 전략·실행안을 기준으로
 * DNA 5축, 관광사업 기회 3안, 유사지역 비교, POI 공급, 이동 경고, 위험·대응안을 종합해 "지금 이 사업을
 * 추진해도 되는가"에 대한 결정론적 판정을 만든다.
 *
 * ## 경계
 * - 새로운 지표를 계산하지 않는다. DNA 5축 점수(dna.ts), POI 공급 부족 판정(poiFitService.ts), 이동
 *   경고(planBuilder.ts의 CourseDay.notices), 유사지역 비교(regionSimilarity.ts), 위험·대응안
 *   (SelectedPlan.risks)은 모두 이미 계산·저장된 값을 그대로 입력받아 조합만 한다.
 * - 외부 LLM·API를 쓰지 않는다. 전부 규칙 기반(CURATED) 판정이며 그 사실을 화면에 명시한다.
 *
 * ## 4가지 게이팅 신호(신호별로 OK/CAUTION/BLOCKER/UNKNOWN 중 하나)
 * 1. 데이터 신뢰도: DNA 5축 각각을 구성하는 Evidence의 provenance(LIVE_API/CACHED_API/CURATED/
 *    ESTIMATED/null)를 직접 본다 — 축 상태(AxisStatus: LIVE/SNAPSHOT/MISSING)만으로는 "SNAPSHOT"이
 *    사람이 검수한 CURATED 데이터인지, 근거가 아예 없는 추정값인지 구분할 수 없어서다(2026-08-03
 *    보완, 아래 "데이터 신뢰도 판정 정책" 참고).
 * 2. POI 공급 충분성: poiFitService.ts의 shortage 판정(지역 데이터 자체 부족이면 BLOCKER).
 * 3. 이동 현실성: 코스에 이미 기록된 장거리 이동 경고(notices) 개수.
 * 4. 지역 차별성: 유사지역 비교에서 이 지역만의 강점이 확인되는지.
 *
 * ## 데이터 신뢰도 판정 정책(provenance 기반, 2026-08-03)
 * `EvidenceTable.tsx`의 `isProvenanceCautionLevel()`과 동일한 기준을 그대로 재사용한다 — 화면에서
 * 이미 "주의 깊게 봐야 할 근거 수준"이라고 강조하는 값과 사전검증의 판단을 어긋나지 않게 하기 위함이다.
 * - `LIVE_API`/`CACHED_API`/`CURATED` → **TRUSTED**(확인된 실제 데이터). `CACHED_API`(과거 성공 응답
 *   재사용)와 `CURATED`(사람이 검수한 데이터)는 "지금 이 순간의 실시간 값"은 아니지만, 근거가 없는
 *   추정값과 다르다 — 단순히 LIVE가 아니라는 이유만으로 CAUTION으로 낮추지 않는다(요구사항 2).
 * - `ESTIMATED` → **ESTIMATED**(추정값). 실측이 아니라 계산/추정으로 채운 값이라는 뜻이라 CAUTION
 *   대상이다.
 * - `null`(레거시 미분류) 또는 문자 그대로 `"MISSING"` provenance 값 → **UNCLASSIFIED**(출처 판정
 *   정보 없음). ESTIMATED와는 다른 사유이므로 별도로 구분해 표시한다(요구사항 3).
 * - 이 축에 Evidence 자체가 없음(빈 배열) → **MISSING**(축 자체가 없음). "값은 있는데 추정값"인
 *   ESTIMATED와 "값 자체가 없음"인 MISSING을 절대 같은 취급하지 않는다(요구사항 3).
 * - 축 하나에 여러 Evidence가 섞여 있으면(예: 수요 축은 보통 여러 지표의 평균) 그중 가장 신뢰도가
 *   낮은 근거가 그 축 전체의 등급을 결정한다("약한 고리" 원칙 — 기존 `combineAxisStatus`와 동일한
 *   보수적 태도).
 * - `CACHED_API`가 포함된 축은 등급 자체는 낮추지 않되(TRUSTED 유지), "재사용된 이전 API 응답을
 *   포함한다"는 노후도 참고 문구를 판정 이유에 별도로 덧붙인다(요구사항 4 — 게이팅에는 영향 없는
 *   순수 정보성 신호).
 * - 판정 이유 문구에는 항상 "어떤 축이 어떤 provenance 때문에" 그 등급이 됐는지 구체적으로 적는다
 *   (요구사항 5) — 예: "수요(Demand)(추정값 근거 포함)".
 *
 * ## 추진 권고 판정 원칙(단일 점수 평균을 쓰지 않는다)
 * - 4가지 신호 중 하나라도 BLOCKER면, 나머지가 전부 좋아도 무조건 "보완 후 재검토"다(치명적 조건
 *   우선 원칙 — 평균으로 상쇄하지 않는다).
 * - BLOCKER는 없지만 CAUTION/UNKNOWN이 하나라도 있으면 "조건부 권장".
 * - 4가지 신호가 전부 OK일 때만 "권장".
 *
 * 근거가 부족해 신호 자체를 판정할 수 없는 경우(예: 비교 지역이 하나도 없음, 코스가 비어 있음)는
 * 점수를 지어내지 않고 UNKNOWN("확인 필요")으로 남긴다.
 */

export const PRE_LAUNCH_RULE_VERSION = "pre-launch-validation-rules-v1";

export type PreLaunchRecommendation = "RECOMMENDED" | "CONDITIONAL" | "NEEDS_IMPROVEMENT";

export const RECOMMENDATION_LABEL_KO: Record<PreLaunchRecommendation, string> = {
  RECOMMENDED: "권장",
  CONDITIONAL: "조건부 권장",
  NEEDS_IMPROVEMENT: "보완 후 재검토",
};

export type SignalStatus = "OK" | "CAUTION" | "BLOCKER" | "UNKNOWN";

export interface PreLaunchSignal {
  status: SignalStatus;
  /** 사람이 읽는 판정 근거 설명. */
  detail: string;
}

export interface PoiShortageLike {
  dataInsufficient: boolean;
  message: string;
  suggestion: string;
}

/** 축 하나의 신뢰도 등급 — 위 "데이터 신뢰도 판정 정책" 참고. */
export type AxisReliabilityTier = "TRUSTED" | "ESTIMATED" | "UNCLASSIFIED" | "MISSING";

const AXIS_TIER_REASON_KO: Record<AxisReliabilityTier, string> = {
  TRUSTED: "", // CAUTION 문구 조립에는 쓰이지 않는다(OK 축은 별도 사유를 표시하지 않음).
  MISSING: "데이터 자체가 없음",
  ESTIMATED: "추정값 근거 포함",
  UNCLASSIFIED: "출처 판정 정보가 없는 근거 포함",
};

/** 이 축을 구성하는 Evidence들의 provenance 중 가장 신뢰도가 낮은 것이 축 전체의 등급을 결정한다
 * ("약한 고리" 원칙). `EvidenceTable.tsx`의 `isProvenanceCautionLevel()`과 동일한 기준을 쓴다 —
 * LIVE_API/CACHED_API/CURATED는 전부 "확인된 실제 데이터"로 취급하고, ESTIMATED/null(레거시 미분류)/
 * 문자 그대로의 "MISSING" provenance만 CAUTION 대상으로 본다. */
export function classifyAxisProvenance(evidenceProvenances: (DataProvenance | null)[]): AxisReliabilityTier {
  if (evidenceProvenances.length === 0) return "MISSING";
  if (evidenceProvenances.some((p) => p === "ESTIMATED")) return "ESTIMATED";
  if (evidenceProvenances.some((p) => p === null || p === "MISSING")) return "UNCLASSIFIED";
  return "TRUSTED";
}

export interface PreLaunchValidationInput {
  /** DNA 5축 전체(순서 무관) — 이미 계산된 analysisResult의 점수와, 그 축을 구성한 각 Evidence의
   * provenance를 그대로 전달한다(축에 Evidence가 없으면 빈 배열 — score===null과 대응). */
  axisScores: {
    axis: DnaAxisKey;
    score: number | null;
    evidenceProvenances: (DataProvenance | null)[];
  }[];
  /** poiFitService.buildStrategyPoiFitSummary().shortage를 그대로 전달(부족 없으면 null). */
  poiShortage: PoiShortageLike | null;
  /** 코스 전체에서 장거리 이동으로 제외된 장소 안내(CourseDay.notices) 총합. */
  travelNoticeCount: number;
  /** 코스에 며칠치 일정이 있는지 — 0이면 코스 자체가 비어 있다는 뜻(POI/이동 신호를 판정할 수 없음). */
  totalCourseDays: number;
  /** 유사지역 비교에서 실제로 확보된 비교 지역 수(0~3). */
  regionComparisonCount: number;
  /** 유사지역 비교의 uniqueStrengthNote(비교 지역 전부보다 앞서는 축이 있을 때만 값이 있음). */
  regionUniqueStrengthNote: string | null;
  /** SelectedPlan.risks — 이미 생성된 위험·대응안 목록. */
  riskMitigations: { risk: string; mitigation: string }[];
}

export interface PreLaunchValidationReport {
  recommendation: PreLaunchRecommendation;
  recommendationLabel: string;
  /** 종합 판단 이유 — 어떤 신호가 결론을 좌우했는지 구체적으로 설명한다. */
  reason: string;
  dataReliability: PreLaunchSignal;
  poiSupplySufficiency: PreLaunchSignal;
  travelFeasibility: PreLaunchSignal;
  regionalDifferentiation: PreLaunchSignal;
  /** 위험·대응안 요약 문장 목록(최대 5개 — SelectedPlan.risks 순서 그대로, 지어내지 않음). */
  keyRisks: string[];
  /** OK가 아닌 신호마다 하나씩 생성되는 구체적 보완 행동 목록. 전부 OK면 빈 배열. */
  requiredImprovements: string[];
  /** 판정 기준·한계를 설명하는 고정 문구(화면에 그대로 노출). */
  criteria: string;
  ruleVersion: string;
  /** 데이터 신뢰도 신호에서 CAUTION/BLOCKER 사유로 지목된 축(0~5개) — KPI 연결(요구사항 2)이 "데이터
   * 신뢰도 보완 KPI"를 추천할 때 쓴다. 전부 OK면 빈 배열. */
  dataReliabilityFlaggedAxes: DnaAxisKey[];
  /** DNA 5축 중 점수가 가장 낮은 축 — "체류/소비/수요 취약 지역 KPI" 등 축 기반 KPI 연결에 쓴다.
   * 점수가 있는 축이 하나도 없으면 null. */
  weakestAxis: DnaAxisKey | null;
  /** 보완 후 기대 상태(2026-08-13) — "무엇을 보완하면 어디로 나아갈 수 있는가"를 판정 유형별 정형
   * 문구로 한 줄 더 보여준다. 새 사실을 지어내지 않고 recommendation 값만으로 결정되는 고정 문구다. */
  expectedOutcomeIfImproved: string;
}

const MAX_KEY_RISKS = 5;
/** 이 개수 이상 이동 경고가 있으면 동선이 구조적으로 불안정하다고 보고 BLOCKER로 격상한다. */
const TRAVEL_NOTICE_BLOCKER_THRESHOLD = 3;
/** DNA 축이 이 개수 이상 MISSING이면 판단 근거 자체가 부족하다고 보고 BLOCKER로 격상한다. */
const MISSING_AXIS_BLOCKER_THRESHOLD = 2;

const CRITERIA_TEXT =
  "이 판정은 이미 계산된 DNA 5축·POI 공급·이동 경고·유사지역 비교·위험 요인만 사용하는 정해진 규칙입니다. " +
  "외부 시장조사·실제 수요 데이터는 포함되지 않으며, 네 항목 중 하나라도 치명적 문제가 있으면 다른 항목 점수가 높아도 " +
  "'보완 후 재검토'로 판단합니다(단일 평균 점수로 결론 내리지 않음).";

interface DataReliabilityResult {
  signal: PreLaunchSignal;
  /** 이 신호에서 CAUTION/BLOCKER 사유로 지목된 축들 — KPI 연결(요구사항 2, kpiLinking.ts)이 "데이터
   * 신뢰도 보완 KPI"를 추천할 때 그대로 재사용한다. */
  flaggedAxes: DnaAxisKey[];
}

function evaluateDataReliability(
  axisScores: PreLaunchValidationInput["axisScores"],
): DataReliabilityResult {
  const classified = axisScores.map((a) => ({
    axis: a.axis,
    tier: classifyAxisProvenance(a.evidenceProvenances),
    hasCachedApi: a.evidenceProvenances.some((p) => p === "CACHED_API"),
  }));

  const missing = classified.filter((c) => c.tier === "MISSING");
  const estimated = classified.filter((c) => c.tier === "ESTIMATED");
  const unclassified = classified.filter((c) => c.tier === "UNCLASSIFIED");
  const cachedAxes = classified.filter((c) => c.hasCachedApi);

  // 노후도 참고 문구(요구사항 4) — 등급(OK/CAUTION/BLOCKER) 자체에는 영향을 주지 않는 별도 정보성 신호.
  const staleNote =
    cachedAxes.length > 0
      ? ` (참고: ${cachedAxes.map((c) => AXIS_LABEL_KO[c.axis]).join(", ")} 축은 재사용된 이전 API 응답(노후 데이터)을 포함하지만 확인된 실제 데이터로 취급합니다.)`
      : "";

  if (missing.length >= MISSING_AXIS_BLOCKER_THRESHOLD) {
    return {
      signal: {
        status: "BLOCKER",
        detail: `DNA 5축 중 ${missing.length}개 축(${missing.map((c) => AXIS_LABEL_KO[c.axis]).join(", ")})은 ${AXIS_TIER_REASON_KO.MISSING} 상태라 판단 근거가 부족합니다.${staleNote}`,
      },
      flaggedAxes: missing.map((c) => c.axis),
    };
  }
  if (missing.length === 1) {
    return {
      signal: {
        status: "CAUTION",
        detail: `${AXIS_LABEL_KO[missing[0].axis]} 축은 ${AXIS_TIER_REASON_KO.MISSING} 상태라 판단에 반영하지 못했습니다.${staleNote}`,
      },
      flaggedAxes: [missing[0].axis],
    };
  }

  const cautionAxes = [...estimated, ...unclassified];
  if (cautionAxes.length === 0) {
    return {
      signal: {
        status: "OK",
        detail: `DNA 5축 모두 실시간 또는 검증된 데이터를 사용했습니다.${staleNote}`,
      },
      flaggedAxes: [],
    };
  }

  const detailParts = cautionAxes.map((c) => `${AXIS_LABEL_KO[c.axis]}(${AXIS_TIER_REASON_KO[c.tier]})`);
  return {
    signal: {
      status: "CAUTION",
      detail: `다음 축은 신뢰도가 낮은 근거를 포함합니다 — ${detailParts.join(", ")}.${staleNote}`,
    },
    flaggedAxes: cautionAxes.map((c) => c.axis),
  };
}

/** 공유 축 중 점수가 가장 낮은 축(취약 축)을 고른다 — businessOpportunity.ts의 취약축 보완형과 동일한
 * "가장 낮은 점수" 원칙. KPI 연결(요구사항 2)이 "체류/소비/수요 취약 지역 KPI"를 추천할 때 재사용한다.
 * 점수가 있는 축이 하나도 없으면(전부 MISSING) null. */
function findWeakestAxis(axisScores: PreLaunchValidationInput["axisScores"]): DnaAxisKey | null {
  const scored = axisScores.filter((a) => a.score !== null) as (PreLaunchValidationInput["axisScores"][number] & {
    score: number;
  })[];
  if (scored.length === 0) return null;
  return [...scored].sort((a, b) => a.score - b.score)[0].axis;
}

function evaluatePoiSupplySufficiency(
  poiShortage: PoiShortageLike | null,
  totalCourseDays: number,
): PreLaunchSignal {
  if (totalCourseDays === 0) {
    return { status: "UNKNOWN", detail: "코스에 담긴 일정이 없어 POI 공급 충분성을 확인할 수 없습니다." };
  }
  if (!poiShortage) {
    return { status: "OK", detail: "목표로 삼은 장소 수를 충족했습니다." };
  }
  if (poiShortage.dataInsufficient) {
    return { status: "BLOCKER", detail: poiShortage.message };
  }
  return { status: "CAUTION", detail: poiShortage.message };
}

function evaluateTravelFeasibility(travelNoticeCount: number, totalCourseDays: number): PreLaunchSignal {
  if (totalCourseDays === 0) {
    return { status: "UNKNOWN", detail: "코스에 담긴 일정이 없어 이동 현실성을 확인할 수 없습니다." };
  }
  if (travelNoticeCount === 0) {
    return { status: "OK", detail: "장거리 이동 문제로 코스에서 제외된 장소가 없습니다." };
  }
  if (travelNoticeCount >= TRAVEL_NOTICE_BLOCKER_THRESHOLD) {
    return {
      status: "BLOCKER",
      detail: `${travelNoticeCount}건의 장소가 장거리 이동 문제로 코스에서 제외됐습니다 — 동선이 구조적으로 불안정합니다.`,
    };
  }
  return {
    status: "CAUTION",
    detail: `${travelNoticeCount}건의 장소가 장거리 이동 문제로 코스에서 제외됐습니다.`,
  };
}

function evaluateRegionalDifferentiation(
  regionComparisonCount: number,
  regionUniqueStrengthNote: string | null,
): PreLaunchSignal {
  if (regionComparisonCount === 0) {
    return { status: "UNKNOWN", detail: "비교할 유사 지역을 찾지 못해 지역 차별성을 확인할 수 없습니다." };
  }
  if (regionUniqueStrengthNote) {
    return { status: "OK", detail: regionUniqueStrengthNote };
  }
  return {
    status: "CAUTION",
    detail: "비교한 유사 지역 대비 뚜렷하게 앞서는 축이 확인되지 않았습니다.",
  };
}

interface GatingSignal {
  key: string;
  label: string;
  signal: PreLaunchSignal;
  improvement: string;
}

function buildGatingSignals(
  dataReliability: PreLaunchSignal,
  poiSupplySufficiency: PreLaunchSignal,
  travelFeasibility: PreLaunchSignal,
  regionalDifferentiation: PreLaunchSignal,
  poiShortage: PoiShortageLike | null,
): GatingSignal[] {
  return [
    {
      key: "dataReliability",
      label: "데이터 신뢰도",
      signal: dataReliability,
      improvement: "부족한 축의 실측 데이터를 보강한 뒤 다시 분석하세요.",
    },
    {
      key: "poiSupplySufficiency",
      label: "POI 공급 충분성",
      signal: poiSupplySufficiency,
      improvement:
        poiShortage?.suggestion ?? "지역 후보 데이터를 보강하거나 테마·카테고리 범위를 넓혀 다시 분석해보세요.",
    },
    {
      key: "travelFeasibility",
      label: "이동 현실성",
      signal: travelFeasibility,
      improvement: "제외된 장소를 대체할 인접 후보를 확보하거나 일정·이동 수단을 조정해보세요.",
    },
    {
      key: "regionalDifferentiation",
      label: "지역 차별성",
      signal: regionalDifferentiation,
      improvement: "이 지역만의 차별화 요소(테마·시기·자원)를 추가로 발굴해 보완하세요.",
    },
  ];
}

const EXPECTED_OUTCOME_BY_RECOMMENDATION: Record<PreLaunchRecommendation, string> = {
  RECOMMENDED: "현재 확보된 근거만으로 실행안 검토를 진행할 수 있습니다.",
  CONDITIONAL: "위 보완 조건을 충족하면 실행안 검토 단계로 안정적으로 진행할 수 있습니다.",
  NEEDS_IMPROVEMENT: "치명적 문제를 먼저 해결한 뒤 다시 분석해야 실행 가능성을 판단할 수 있습니다.",
};

/** 2026-08-13: "왜 조건부/보완 필요인가"를 판정 배지 라벨만으로 끝내지 않기 위해, 가장 결정적이었던
 * 신호 하나의 detail(이미 계산된 구체적 근거 문장)을 reason에 그대로 이어붙인다 — 새 문장을 지어내지
 * 않고 있는 값을 재배열만 한다. 여러 신호가 동시에 문제여도 첫 번째(가장 먼저 나열되는, 곧 4가지
 * 신호 목록 순서상 우선순위가 높은) 신호의 detail만 대표로 보여준다(전부 나열하면 한 줄 요약이 아니게
 * 된다). */
function decideRecommendation(signals: GatingSignal[]): { recommendation: PreLaunchRecommendation; reason: string } {
  const blockers = signals.filter((s) => s.signal.status === "BLOCKER");
  if (blockers.length > 0) {
    return {
      recommendation: "NEEDS_IMPROVEMENT",
      reason: `${blockers.map((b) => b.label).join(", ")}에서 치명적인 문제가 확인되어(${blockers[0].label}: ${blockers[0].signal.detail}), 다른 항목이 양호해도 보완 후 재검토를 권장합니다.`,
    };
  }
  const cautionsOrUnknown = signals.filter((s) => s.signal.status === "CAUTION" || s.signal.status === "UNKNOWN");
  if (cautionsOrUnknown.length > 0) {
    return {
      recommendation: "CONDITIONAL",
      reason: `${cautionsOrUnknown.map((c) => c.label).join(", ")}에 보완이 필요해(${cautionsOrUnknown[0].label}: ${cautionsOrUnknown[0].signal.detail}) 조건부 권장으로 판단합니다.`,
    };
  }
  return {
    recommendation: "RECOMMENDED",
    reason: "데이터 신뢰도·POI 공급·이동 동선·지역 차별성 모두 양호해 추진을 권장합니다.",
  };
}

function buildRequiredImprovements(signals: GatingSignal[]): string[] {
  return signals
    .filter((s) => s.signal.status !== "OK")
    .map((s) =>
      s.signal.status === "UNKNOWN"
        ? `[${s.label}] 확인 필요 — ${s.signal.detail}`
        : `[${s.label}] ${s.improvement}`,
    );
}

/** 사업 사전검증 리포트를 계산한다. DB 조회·외부 API 호출이 전혀 없는 순수 함수 — 같은 입력이면 항상
 * 같은 결과를 낸다. */
export function computePreLaunchValidation(input: PreLaunchValidationInput): PreLaunchValidationReport {
  const dataReliabilityResult = evaluateDataReliability(input.axisScores);
  const dataReliability = dataReliabilityResult.signal;
  const poiSupplySufficiency = evaluatePoiSupplySufficiency(input.poiShortage, input.totalCourseDays);
  const travelFeasibility = evaluateTravelFeasibility(input.travelNoticeCount, input.totalCourseDays);
  const regionalDifferentiation = evaluateRegionalDifferentiation(
    input.regionComparisonCount,
    input.regionUniqueStrengthNote,
  );

  const signals = buildGatingSignals(
    dataReliability,
    poiSupplySufficiency,
    travelFeasibility,
    regionalDifferentiation,
    input.poiShortage,
  );

  const { recommendation, reason } = decideRecommendation(signals);

  return {
    recommendation,
    recommendationLabel: RECOMMENDATION_LABEL_KO[recommendation],
    reason,
    dataReliability,
    poiSupplySufficiency,
    travelFeasibility,
    regionalDifferentiation,
    keyRisks: input.riskMitigations.slice(0, MAX_KEY_RISKS).map((r) => `${r.risk} — ${r.mitigation}`),
    requiredImprovements: buildRequiredImprovements(signals),
    criteria: CRITERIA_TEXT,
    ruleVersion: PRE_LAUNCH_RULE_VERSION,
    dataReliabilityFlaggedAxes: dataReliabilityResult.flaggedAxes,
    weakestAxis: findWeakestAxis(input.axisScores),
    expectedOutcomeIfImproved: EXPECTED_OUTCOME_BY_RECOMMENDATION[recommendation],
  };
}
