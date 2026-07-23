import { clamp, minMaxNormalize, roundForDisplay } from "./normalize";
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

interface MetricLookupResult {
  entry: RegionMetricValue;
  normalizedValue: number;
}

function lookupMetric(
  cohort: RegionMetricValue[] | undefined,
  regionCode: string,
  baseYm: string,
): MetricLookupResult | null {
  if (!cohort || cohort.length === 0) return null;
  const entry = cohort.find((c) => c.regionCode === regionCode && c.baseYm === baseYm);
  if (!entry) return null;
  const cohortValues = cohort.filter((c) => c.baseYm === baseYm).map((c) => c.rawValue);
  return { entry, normalizedValue: minMaxNormalize(entry.rawValue, cohortValues) };
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
  const rule = (code: string) => `SIGUNGU 코호트 내 min-max, baseYm=${input.baseYm}, metric=${code}`;
  const evidence: EvidenceItem[] = [];
  const entries: RegionMetricValue[] = [];

  const service = lookupMetric(
    input.metricCohorts[METRIC_CODES.DEMAND_SERVICE],
    input.regionCode,
    input.baseYm,
  );
  if (service) {
    evidence.push(toEvidence("demand", service, rule(METRIC_CODES.DEMAND_SERVICE)));
    entries.push(service.entry);
  }

  const resource = lookupMetric(
    input.metricCohorts[METRIC_CODES.DEMAND_RESOURCE],
    input.regionCode,
    input.baseYm,
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

  return buildAxis(evidence, entries);
}

function computeSimpleAxis(
  axis: "stay" | "spend" | "diversity",
  metricCode: string,
  input: DnaEngineInput,
): DnaAxisResult {
  const result = lookupMetric(input.metricCohorts[metricCode], input.regionCode, input.baseYm);
  if (!result) return { score: null, status: "MISSING", evidence: [] };
  const evidence = [
    toEvidence(
      axis,
      result,
      `SIGUNGU 코호트 내 min-max, baseYm=${input.baseYm}, metric=${metricCode}`,
    ),
  ];
  return buildAxis(evidence, [result.entry]);
}

function computeNetworkAxis(input: DnaEngineInput): DnaAxisResult {
  const net = input.networkInputs;
  if (!net) return { score: null, status: "MISSING", evidence: [] };

  const categoryCoverage = [net.foodCount > 0, net.lodgingCount > 0, net.experienceCount > 0].filter(
    Boolean,
  ).length;
  const rawScore = clamp(
    net.attractionCount * 4 + net.relatedPoiCount * 3 + categoryCoverage * (100 / 3 / 2),
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
      `Network 구조적 산식의 POI 구성 근거(중심관광지수×4, 업종 커버리지 보너스에 사용). ` +
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
      appliedRule: "Network 구조적 산식의 연관관광지 관계 근거(연관관광지수×3에 사용). 사람이 구성한 큐레이션 데이터.",
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
