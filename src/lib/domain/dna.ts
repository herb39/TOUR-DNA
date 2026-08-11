import { clamp, normalizeByTransform, roundForDisplay, type NormalizationTransform } from "./normalize";
import {
  AXIS_LABEL_KO,
  type AxisStatus,
  type DataMode,
  type DnaAxisResult,
  type DnaEngineInput,
  type DnaResult,
  type EvidenceItem,
  METRIC_CODES,
  type RegionMetricValue,
} from "./types";

/**
 * 2026-08-11: 전국 감사 결과 극단값 민감도가 확인된 우편향 규모형 metric만 log1p+min-max를 쓴다
 * (normalize.ts의 normalizeByTransform 참고). 방문자수 증감률(METRIC_CODES.DEMAND_VISITOR_GROWTH)은
 * lookupMetric을 아예 거치지 않고 별도의 clamp(50+증감률) 공식을 쓰므로 이 맵과 무관하다 — 부호가
 * 있는 값에 log1p를 적용하는 실수를 구조적으로 막는다. Stay/Diversity는 그대로 LINEAR_MIN_MAX다.
 */
const LOG1P_METRIC_CODES = new Set<string>([
  METRIC_CODES.DEMAND_SERVICE,
  METRIC_CODES.DEMAND_RESOURCE,
  METRIC_CODES.SPEND,
]);

function transformForMetric(metricCode: string): NormalizationTransform {
  return LOG1P_METRIC_CODES.has(metricCode) ? "LOG1P_MIN_MAX" : "LINEAR_MIN_MAX";
}

function normalizationRuleLabel(transform: NormalizationTransform): string {
  return transform === "LOG1P_MIN_MAX" ? "log1p 변환 후 SIGUNGU 코호트 내 min-max" : "SIGUNGU 코호트 내 min-max";
}

interface MetricLookupResult {
  entry: RegionMetricValue;
  normalizedValue: number;
}

function lookupMetric(
  cohort: RegionMetricValue[] | undefined,
  regionCode: string,
  baseYm: string,
  metricCode: string,
): MetricLookupResult | null {
  if (!cohort || cohort.length === 0) return null;
  const entry = cohort.find((c) => c.regionCode === regionCode && c.baseYm === baseYm);
  if (!entry) return null;
  const cohortValues = cohort.filter((c) => c.baseYm === baseYm).map((c) => c.rawValue);
  const normalizedValue = normalizeByTransform(transformForMetric(metricCode), entry.rawValue, cohortValues);
  return { entry, normalizedValue };
}

function toEvidence(
  axis: DnaAxisResult extends never ? never : EvidenceItem["axis"],
  result: MetricLookupResult,
  appliedRule: string,
): EvidenceItem {
  return {
    axis,
    metricCode: result.entry.metricCode,
    rawValue: result.entry.rawValue,
    normalizedValue: result.normalizedValue,
    unit: result.entry.unit,
    adminLevel: result.entry.adminLevel,
    regionCode: result.entry.regionCode,
    baseYm: result.entry.baseYm,
    sourceCode: result.entry.sourceCode,
    collectedAt: result.entry.collectedAt,
    provenance: result.entry.provenance,
    appliedRule,
  };
}

function combineAxisStatus(entries: RegionMetricValue[]): AxisStatus {
  if (entries.length === 0) return "MISSING";
  const anyFallback = entries.some((e) => e.isSnapshotFallback);
  return anyFallback ? "SNAPSHOT" : "LIVE";
}

function buildAxis(evidence: EvidenceItem[], entries: RegionMetricValue[]): DnaAxisResult {
  if (evidence.length === 0) {
    return { score: null, status: "MISSING", evidence: [] };
  }
  const avg = evidence.reduce((sum, e) => sum + (e.normalizedValue ?? 0), 0) / evidence.length;
  return { score: roundForDisplay(avg), status: combineAxisStatus(entries), evidence };
}

function computeDemandAxis(input: DnaEngineInput): DnaAxisResult {
  const rule = (code: string) => `${normalizationRuleLabel(transformForMetric(code))}, baseYm=${input.baseYm}, metric=${code}`;
  const evidence: EvidenceItem[] = [];
  const entries: RegionMetricValue[] = [];

  const service = lookupMetric(
    input.metricCohorts[METRIC_CODES.DEMAND_SERVICE],
    input.regionCode,
    input.baseYm,
    METRIC_CODES.DEMAND_SERVICE,
  );
  if (service) {
    evidence.push(toEvidence("demand", service, rule(METRIC_CODES.DEMAND_SERVICE)));
    entries.push(service.entry);
  }

  const resource = lookupMetric(
    input.metricCohorts[METRIC_CODES.DEMAND_RESOURCE],
    input.regionCode,
    input.baseYm,
    METRIC_CODES.DEMAND_RESOURCE,
  );
  if (resource) {
    evidence.push(toEvidence("demand", resource, rule(METRIC_CODES.DEMAND_RESOURCE)));
    entries.push(resource.entry);
  }

  if (input.previousVisitorCount && input.currentVisitorCount && input.previousVisitorCount.value > 0) {
    const growthRatePercent =
      ((input.currentVisitorCount.value - input.previousVisitorCount.value) /
        input.previousVisitorCount.value) *
      100;
    const normalized = clamp(50 + growthRatePercent, 0, 100);
    // 증감률은 current/previous 두 값을 모두 사용하므로, 둘 중 하나라도 fallback이면 이 근거도
    // fallback으로 취급한다. provenance는 current를 우선하되 없으면 previous를 쓴다(둘 다 같은
    // VISITOR_CNT 파이프라인에서 나오므로 보통 일치한다 — 임의로 지어내지 않고 실제 기록된 값만 사용).
    const growthEntry: RegionMetricValue = {
      regionCode: input.regionCode,
      baseYm: input.currentVisitorCount.baseYm,
      metricCode: METRIC_CODES.DEMAND_VISITOR_GROWTH,
      rawValue: Math.round(growthRatePercent * 100) / 100,
      unit: "%",
      adminLevel: input.adminLevel,
      sourceCode: input.currentVisitorCount.sourceCode,
      collectedAt: input.currentVisitorCount.collectedAt,
      provenance: input.currentVisitorCount.provenance ?? input.previousVisitorCount.provenance,
      isSnapshotFallback: input.currentVisitorCount.isSnapshotFallback || input.previousVisitorCount.isSnapshotFallback,
    };
    evidence.push({
      axis: "demand",
      metricCode: growthEntry.metricCode,
      rawValue: growthEntry.rawValue,
      normalizedValue: normalized,
      unit: growthEntry.unit,
      adminLevel: growthEntry.adminLevel,
      regionCode: growthEntry.regionCode,
      baseYm: growthEntry.baseYm,
      sourceCode: growthEntry.sourceCode,
      collectedAt: growthEntry.collectedAt,
      provenance: growthEntry.provenance,
      appliedRule: `전월 대비 방문자수 증감률을 50 기준 선형 변환(0%→50, ±50%p→0/100 clamp)`,
    });
    entries.push(growthEntry);
  }

  const axis = buildAxis(evidence, entries);

  // 2026-07-29: 방문자수 자체와 화면 표시용 증감률(전년 동월 우선)은 buildAxis 호출 *이후*에만
  // evidence 배열에 추가한다 — buildAxis의 평균 산식(수요 축 점수)은 위에서 이미 확정되었으므로, 아래
  // 두 항목의 normalizedValue(null)가 평균에 섞여 점수를 왜곡하지 않는다(DNA 5축 공식 변경 없음).
  // 이 두 항목은 오직 핵심 지표 요약카드·전략 추천 근거 표시용 참고 데이터다.
  const displayEvidence: EvidenceItem[] = [];
  if (input.currentVisitorCount) {
    displayEvidence.push({
      axis: "demand",
      metricCode: METRIC_CODES.VISITOR_CNT,
      rawValue: input.currentVisitorCount.value,
      normalizedValue: null,
      unit: "명",
      adminLevel: input.adminLevel,
      regionCode: input.regionCode,
      baseYm: input.currentVisitorCount.baseYm,
      sourceCode: input.currentVisitorCount.sourceCode,
      collectedAt: input.currentVisitorCount.collectedAt,
      provenance: input.currentVisitorCount.provenance,
      appliedRule: "화면 표시용 참고 지표 — 수요 적합도 점수 계산에는 포함되지 않음",
    });
  }
  const visitorGrowthComparison = input.visitorGrowthComparison;
  const growthRatePercent = visitorGrowthComparison?.growthRatePercent;
  if (
    visitorGrowthComparison &&
    growthRatePercent !== null &&
    growthRatePercent !== undefined &&
    input.currentVisitorCount
  ) {
    const g = visitorGrowthComparison;
    const appliedRule =
      g.basis === "YOY"
        ? `전년 동월(${g.comparisonBaseYm}) 방문자수 대비 증감률 — 화면 표시용, 수요 적합도 점수에는 미반영`
        : `직전 확인월(${g.comparisonBaseYm}) 방문자수 대비 증감률 — 전년 동월 데이터가 없어 대체함. 화면 표시용, 수요 적합도 점수에는 미반영`;
    displayEvidence.push({
      axis: "demand",
      metricCode: METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY,
      rawValue: growthRatePercent,
      normalizedValue: null,
      unit: "%",
      adminLevel: input.adminLevel,
      regionCode: input.regionCode,
      baseYm: input.currentVisitorCount.baseYm,
      sourceCode: input.currentVisitorCount.sourceCode,
      collectedAt: input.currentVisitorCount.collectedAt,
      provenance: input.currentVisitorCount.provenance,
      appliedRule,
    });
  }

  return { ...axis, evidence: [...axis.evidence, ...displayEvidence] };
}

function computeSimpleAxis(
  axis: "stay" | "spend" | "diversity",
  metricCode: string,
  input: DnaEngineInput,
): DnaAxisResult {
  const result = lookupMetric(input.metricCohorts[metricCode], input.regionCode, input.baseYm, metricCode);
  if (!result) return { score: null, status: "MISSING", evidence: [] };
  const evidence = [
    toEvidence(
      axis,
      result,
      `${normalizationRuleLabel(transformForMetric(metricCode))}, baseYm=${input.baseYm}, metric=${metricCode}`,
    ),
  ];
  return buildAxis(evidence, [result.entry]);
}

/** 2026-07-27(P0-2): count가 늘수록 점수가 무한정 선형으로 오르는 대신, 절반포화점(half)에서 50점에
 * 도달하고 그 뒤로는 완만하게 100에 가까워지는 로그형 체감 곡선(Michaelis-Menten 형태)을 쓴다.
 * count=0이면 0, count→∞여도 100에 정확히는 도달하지 않는다 — "POI를 많이 모으기만 하면 즉시
 * 만점"이 되는 기존 선형+clamp 구조의 포화 문제를 근본적으로 없앤다(임의로 만점 기준 숫자만 올리는
 * 방식이 아니다). half는 "이 개수면 이 구성요소 만점의 절반"이라는 뜻이라 화면에서 설명 가능하다. */
function diminishingReturnsScore(count: number, half: number): number {
  if (count <= 0) return 0;
  return 100 * (count / (count + half));
}

/** 중심 관광지 8곳이면 이 구성요소 만점(100)의 절반(50)에 도달한다는 뜻 — 실 서비스키 조사 표본
 * (대전/제천 등, docs/public-api-status.md)에서 지역당 중심 관광지가 대략 5~15곳 수준이었던 것을
 * 기준으로 삼았다. */
const ATTRACTION_HALF_SATURATION = 8;
/** 연관 관광지 관계는 개수 자체가 적어(POI_RELATION 큐레이션), 더 적은 개수에서 절반에 도달하게 한다. */
const RELATION_HALF_SATURATION = 6;

/** Network = 중심 관광지 체감곡선(50%) + 연관 관광지 체감곡선(20%) + 업종 커버리지(30%, 기존과 동일하게
 * 음식/숙박/체험 3종 중 몇 종이 있는지). 세 요소를 구분해서 반영하라는 요구(P0-2)에 따라 가중치를
 * 명시적으로 분리했다 — 이전에는 사실상 attractionCount 선형항이 지배적이었다. */
const NETWORK_ATTRACTION_WEIGHT = 0.5;
const NETWORK_RELATION_WEIGHT = 0.2;
const NETWORK_CATEGORY_COVERAGE_WEIGHT = 0.3;

function computeNetworkAxis(input: DnaEngineInput): DnaAxisResult {
  const net = input.networkInputs;
  if (!net) return { score: null, status: "MISSING", evidence: [] };

  const categoryCoverage = [net.foodCount > 0, net.lodgingCount > 0, net.experienceCount > 0].filter(
    Boolean,
  ).length;
  const attractionScore = diminishingReturnsScore(net.attractionCount, ATTRACTION_HALF_SATURATION);
  const relationScore = diminishingReturnsScore(net.relatedPoiCount, RELATION_HALF_SATURATION);
  const categoryCoverageScore = (categoryCoverage / 3) * 100;
  const rawScore = clamp(
    attractionScore * NETWORK_ATTRACTION_WEIGHT +
      relationScore * NETWORK_RELATION_WEIGHT +
      categoryCoverageScore * NETWORK_CATEGORY_COVERAGE_WEIGHT,
    0,
    100,
  );

  // Phase 1-E(2026-07-23): Network 근거를 POI 근거와 관계 근거로 분리한다(마스터 문서 1-3절:
  // "관광지·음식·숙박·체험 POI 수는 TOUR_INFO 또는 각 POI의 실제 출처로 표시한다. 연관관광지 관계 수는
  // POI_RELATION/CURATED로 별도 표시한다"). 점수 산식(rawScore)은 그대로 두고, evidence 배열만 늘린다.
  const poiEvidence: EvidenceItem = {
    axis: "network",
    metricCode: "networkPoiCount",
    rawValue: net.poi.apiCount + net.poi.fixtureCount,
    normalizedValue: null,
    unit: "count",
    adminLevel: input.adminLevel,
    regionCode: input.regionCode,
    baseYm: input.baseYm,
    sourceCode: "TOUR_INFO",
    collectedAt: net.collectedAt,
    provenance: net.poi.provenance,
    appliedRule:
      `Network 산식의 중심 관광지 구성 근거 — 개수가 늘수록 체감(로그형)으로 반영되어 ` +
      `${ATTRACTION_HALF_SATURATION}곳이면 이 구성요소 만점의 절반(가중치 ${NETWORK_ATTRACTION_WEIGHT * 100}%), ` +
      `업종 커버리지(가중치 ${NETWORK_CATEGORY_COVERAGE_WEIGHT * 100}%)에도 사용됨. ` +
      `API 수집 ${net.poi.apiCount}건, 큐레이션(FIXTURE) ${net.poi.fixtureCount}건.`,
  };

  const evidence: EvidenceItem[] = [poiEvidence];

  // 관계가 하나도 없으면(net.relation === null) "확인된 0건"과 "근거 없음"을 구분할 수 없으므로
  // Evidence 자체를 만들지 않는다(허위 CURATED 0건 방지, buildDnaEngineInput.ts 참고).
  if (net.relation) {
    evidence.push({
      axis: "network",
      metricCode: "networkRelationCount",
      rawValue: net.relation.count,
      normalizedValue: null,
      unit: "count",
      adminLevel: input.adminLevel,
      regionCode: input.regionCode,
      baseYm: input.baseYm,
      sourceCode: "POI_RELATION",
      collectedAt: net.collectedAt,
      provenance: net.relation.provenance,
      appliedRule:
        `Network 산식의 연관 관광지 관계 근거 — 개수가 늘수록 체감(로그형)으로 반영(가중치 ` +
        `${NETWORK_RELATION_WEIGHT * 100}%). 사람이 구성한 큐레이션 데이터.`,
    });
  }

  // 축 상태는 기존과 동일한 원칙(어느 근거든 fallback이면 SNAPSHOT)을 유지한다 — 이전에는 POI/관계를
  // OR로 합친 단일 플래그였고, 지금은 분리된 두 근거의 fallback 여부를 OR로 합치므로 실질적으로 같은
  // 결과를 낸다(점수/축 상태 계산식 자체는 변경하지 않음).
  const isFallback = net.poi.isSnapshotFallback || (net.relation?.isSnapshotFallback ?? false);
  const status: AxisStatus = isFallback ? "SNAPSHOT" : "LIVE";
  return { score: roundForDisplay(rawScore), status, evidence };
}

function buildStrengthsOpportunitiesCautions(
  scored: { axis: keyof typeof AXIS_LABEL_KO; result: DnaAxisResult }[],
): Pick<DnaResult, "strengths" | "opportunities" | "cautions"> {
  const available = scored.filter((s) => s.result.score !== null) as {
    axis: keyof typeof AXIS_LABEL_KO;
    result: DnaAxisResult & { score: number };
  }[];
  const sortedDesc = [...available].sort((a, b) => b.result.score - a.result.score);
  const sortedAsc = [...available].sort((a, b) => a.result.score - b.result.score);

  const strengths = sortedDesc
    .slice(0, 2)
    .map((s) => `${AXIS_LABEL_KO[s.axis]} 축이 강함 (점수 ${s.result.score})`);
  while (strengths.length < 2) strengths.push("데이터 부족으로 추가 강점을 특정할 수 없음");

  const opportunityCandidates = sortedAsc.filter(
    (s) => !strengths.some((label) => label.includes(AXIS_LABEL_KO[s.axis])),
  );
  const opportunities = opportunityCandidates
    .slice(0, 2)
    .map((s) => `${AXIS_LABEL_KO[s.axis]} 축 보완 여지 (점수 ${s.result.score})`);
  const missingAxes = scored.filter((s) => s.result.score === null);
  for (const m of missingAxes) {
    if (opportunities.length >= 2) break;
    opportunities.push(`${AXIS_LABEL_KO[m.axis]} 축 데이터 부족 — 별도 현장 조사 필요`);
  }
  while (opportunities.length < 2) opportunities.push("추가 데이터 확보 시 기회 요인을 더 특정할 수 있음");

  const caution = missingAxes.length > 0
    ? `${missingAxes.map((m) => AXIS_LABEL_KO[m.axis]).join(", ")} 축은 공공데이터가 부족해 참고용으로만 사용할 것`
    : sortedAsc.length > 0
      ? `${AXIS_LABEL_KO[sortedAsc[0].axis]} 축 점수가 낮아 해당 축에 의존하는 전략은 주의가 필요함`
      : "현재 데이터로는 특별한 주의사항이 식별되지 않음";

  return { strengths, opportunities: opportunities.slice(0, 2), cautions: [caution] };
}

export function computeDna(input: DnaEngineInput): DnaResult {
  const demand = computeDemandAxis(input);
  const stay = computeSimpleAxis("stay", METRIC_CODES.STAY, input);
  const spend = computeSimpleAxis("spend", METRIC_CODES.SPEND, input);
  const diversity = computeSimpleAxis("diversity", METRIC_CODES.DIVERSITY, input);
  const network = computeNetworkAxis(input);

  const axisResults = { demand, stay, spend, diversity, network };
  const statuses = Object.values(axisResults).map((a) => a.status);
  const liveAxisCount = statuses.filter((s) => s === "LIVE").length;
  const missingCount = statuses.filter((s) => s === "MISSING").length;

  let overallDataMode: DataMode;
  if (liveAxisCount === 5) overallDataMode = "LIVE";
  else if (liveAxisCount === 0 && missingCount === 0) overallDataMode = "SNAPSHOT";
  else overallDataMode = "HYBRID";

  const { strengths, opportunities, cautions } = buildStrengthsOpportunitiesCautions([
    { axis: "demand", result: demand },
    { axis: "stay", result: stay },
    { axis: "spend", result: spend },
    { axis: "diversity", result: diversity },
    { axis: "network", result: network },
  ]);

  return {
    ...axisResults,
    overallDataMode,
    liveAxisCount,
    strengths,
    opportunities,
    cautions,
  };
}
