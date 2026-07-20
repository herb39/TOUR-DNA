import { clamp, roundForDisplay } from "./normalize";
import { STRATEGY_TEMPLATES, type PoiCategoryCode, type StrategyTemplate } from "./strategyTemplates";
import { AXIS_LABEL_KO, type DnaAxisKey, type DnaResult, type EvidenceItem } from "./types";

export type BudgetLevelCode = "LOW" | "MID" | "PREMIUM";
export type TransportCode = "WALK" | "PUBLIC_TRANSPORT" | "PRIVATE_VEHICLE" | "MIXED";
export type GroupTypeCode = "FIT" | "SMALL_10_20" | "MEDIUM_21_40";
export type DurationCode = "DAY_TRIP" | "ONE_NIGHT_TWO_DAYS" | "TWO_NIGHTS_THREE_DAYS";

export interface ProjectInputForScoring {
  ageGroups: string[];
  companionType: string;
  primaryGoal: string;
  secondaryGoal?: string | null;
  duration: DurationCode;
  budgetLevel: BudgetLevelCode;
  transport: TransportCode;
  groupType: GroupTypeCode;
  travelMonth: number; // 1~12
  preferredThemes: string[];
  excludedThemes: string[];
}

export interface PoiLike {
  id: string;
  name: string;
  category: PoiCategoryCode;
}

export interface StrategyScoreBreakdown {
  demandFit: number;
  supplyFit: number;
  seasonFit: number;
  targetFit: number;
  feasibilityFit: number;
}

export interface ConsumptionTouchpoints {
  food: boolean;
  lodging: boolean;
  experience: boolean;
  examples: string[];
}

export interface StrategyComputationResult {
  templateId: string;
  rank: number;
  name: string;
  concept: string;
  totalScore: number;
  scoreBreakdown: StrategyScoreBreakdown;
  reasons: string[];
  targetDescription: string;
  poiIds: string[];
  consumptionTouchpoints: ConsumptionTouchpoints;
  risks: string[];
  evidences: EvidenceItem[];
  modelVersion: string;
}

function circularMonthDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 12 - d);
}

function weightedAxisFit(weights: Partial<Record<DnaAxisKey, number>>, dna: DnaResult): number {
  const entries = Object.entries(weights) as [DnaAxisKey, number][];
  const available = entries.filter(([axis]) => dna[axis].score !== null);
  if (available.length === 0) return 50; // 결측 축뿐이면 중립값
  const totalWeight = available.reduce((sum, [, w]) => sum + w, 0);
  const weighted = available.reduce(
    (sum, [axis, w]) => sum + (dna[axis].score as number) * (w / totalWeight),
    0,
  );
  return roundForDisplay(clamp(weighted, 0, 100));
}

function computeSeasonFit(travelMonth: number, idealMonths: number[]): number {
  if (idealMonths.includes(travelMonth)) return 100;
  const minDist = Math.min(...idealMonths.map((m) => circularMonthDistance(travelMonth, m)));
  return clamp(100 - minDist * 20, 0, 100);
}

function computeTargetFit(template: StrategyTemplate, input: ProjectInputForScoring): number {
  const ageScore = input.ageGroups.some((a) => template.targetAgeGroups.includes(a)) ? 100 : 40;
  const companionScore = template.targetCompanionTypes.includes(input.companionType) ? 100 : 40;
  const goalScore = template.supportedGoals.includes(input.primaryGoal)
    ? 100
    : input.secondaryGoal && template.supportedGoals.includes(input.secondaryGoal)
      ? 70
      : 40;
  const base = ageScore * 0.4 + companionScore * 0.35 + goalScore * 0.25;
  const themeBonus = input.preferredThemes.some(
    (t) => template.concept.includes(t) || template.name.includes(t),
  )
    ? 10
    : 0;
  return roundForDisplay(clamp(base + themeBonus, 0, 100));
}

function computeFeasibilityFit(template: StrategyTemplate, input: ProjectInputForScoring): number {
  const budgetScore = template.preferredBudgetLevels.includes(input.budgetLevel) ? 100 : 60;
  const transportScore = template.preferredTransport.includes(input.transport) ? 100 : 60;
  const groupScore = template.preferredGroupTypes.includes(input.groupType) ? 100 : 60;
  const overnightPenalty = template.requiresOvernight && input.duration === "DAY_TRIP" ? 40 : 0;
  const raw = (budgetScore + transportScore + groupScore) / 3 - overnightPenalty;
  return roundForDisplay(clamp(raw, 0, 100));
}

function isExcludedByTheme(template: StrategyTemplate, excludedThemes: string[]): boolean {
  return excludedThemes.some(
    (theme) => theme.length > 0 && (template.name.includes(theme) || template.concept.includes(theme)),
  );
}

function collectEvidences(
  template: StrategyTemplate,
  dna: DnaResult,
): EvidenceItem[] {
  const axes = new Set<DnaAxisKey>([
    ...(Object.keys(template.demandAxisWeights) as DnaAxisKey[]),
    ...(Object.keys(template.supplyAxisWeights) as DnaAxisKey[]),
  ]);
  const evidences: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const axis of axes) {
    for (const ev of dna[axis].evidence) {
      const key = `${ev.axis}:${ev.metricCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidences.push(ev);
    }
  }
  return evidences;
}

function selectPois(
  template: StrategyTemplate,
  poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>>,
): { poiIds: string[]; touchpoints: ConsumptionTouchpoints } {
  const sortedCopy = (cat: PoiCategoryCode) =>
    [...(poisByCategory[cat] ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const poiIds: string[] = [];
  const selectedByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>> = {};

  for (const cat of template.poiCategories) {
    const picked = sortedCopy(cat).slice(0, 2);
    if (picked.length > 0) {
      selectedByCategory[cat] = picked;
      poiIds.push(...picked.map((p) => p.id));
    }
  }

  const touchpointCats: PoiCategoryCode[] = ["FOOD", "LODGING", "EXPERIENCE"];
  const currentTouchpointCats = touchpointCats.filter((c) => (selectedByCategory[c]?.length ?? 0) > 0);
  for (const cat of touchpointCats) {
    if (currentTouchpointCats.length >= 2) break;
    if (selectedByCategory[cat]) continue;
    const picked = sortedCopy(cat).slice(0, 1);
    if (picked.length > 0) {
      selectedByCategory[cat] = picked;
      poiIds.push(...picked.map((p) => p.id));
      currentTouchpointCats.push(cat);
    }
  }

  const examples = touchpointCats.flatMap((c) => (selectedByCategory[c] ?? []).map((p) => p.name)).slice(0, 3);

  return {
    poiIds,
    touchpoints: {
      food: (selectedByCategory.FOOD?.length ?? 0) > 0,
      lodging: (selectedByCategory.LODGING?.length ?? 0) > 0,
      experience: (selectedByCategory.EXPERIENCE?.length ?? 0) > 0,
      examples,
    },
  };
}

function buildReasons(
  template: StrategyTemplate,
  breakdown: StrategyScoreBreakdown,
  dna: DnaResult,
): string[] {
  const reasons: string[] = [];

  const demandAxes = Object.keys(template.demandAxisWeights) as DnaAxisKey[];
  const strongestDemandAxis = demandAxes
    .filter((a) => dna[a].score !== null)
    .sort((a, b) => (dna[b].score as number) - (dna[a].score as number))[0];
  reasons.push(
    strongestDemandAxis
      ? `${AXIS_LABEL_KO[strongestDemandAxis]} 축 점수(${dna[strongestDemandAxis].score})가 반영되어 수요 적합도 ${breakdown.demandFit}점`
      : `데이터 부족으로 수요 적합도는 중립값(${breakdown.demandFit}점)을 적용함`,
  );

  reasons.push(
    breakdown.supplyFit >= 60
      ? `지역 내 연계 인프라(POI/업종 연결)가 충분해 공급 적합도 ${breakdown.supplyFit}점`
      : `지역 내 연계 인프라가 제한적이라 공급 적합도 ${breakdown.supplyFit}점 — 보완 필요`,
  );

  reasons.push(
    breakdown.seasonFit >= 80
      ? `여행 시기가 이 전략의 성수기(${template.idealMonths.join(", ")}월)와 잘 맞아 시즌 적합도 ${breakdown.seasonFit}점`
      : `여행 시기가 성수기(${template.idealMonths.join(", ")}월)와 다소 어긋나 시즌 적합도 ${breakdown.seasonFit}점`,
  );

  return reasons;
}

/**
 * 전략 3안을 계산한다. 점수/순위는 절대 하드코딩하지 않고 아래 공식으로만 결정된다.
 * strategyScore = demandFit*0.35 + supplyFit*0.25 + seasonFit*0.20 + targetFit*0.10 + feasibilityFit*0.10
 */
export function computeStrategies(
  dna: DnaResult,
  input: ProjectInputForScoring,
  poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>>,
  modelVersion: string,
): StrategyComputationResult[] {
  const candidates = STRATEGY_TEMPLATES.filter((t) => !isExcludedByTheme(t, input.excludedThemes));

  const scored = candidates.map((template) => {
    const demandFit = weightedAxisFit(template.demandAxisWeights, dna);
    const supplyFit = weightedAxisFit(template.supplyAxisWeights, dna);
    const seasonFit = computeSeasonFit(input.travelMonth, template.idealMonths);
    const targetFit = computeTargetFit(template, input);
    const feasibilityFit = computeFeasibilityFit(template, input);

    const totalScore = roundForDisplay(
      clamp(
        demandFit * 0.35 + supplyFit * 0.25 + seasonFit * 0.2 + targetFit * 0.1 + feasibilityFit * 0.1,
        0,
        100,
      ),
    );

    const breakdown: StrategyScoreBreakdown = { demandFit, supplyFit, seasonFit, targetFit, feasibilityFit };
    const { poiIds, touchpoints } = selectPois(template, poisByCategory);

    return {
      template,
      totalScore,
      breakdown,
      poiIds,
      touchpoints,
      evidences: collectEvidences(template, dna),
    };
  });

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.breakdown.supplyFit !== a.breakdown.supplyFit) return b.breakdown.supplyFit - a.breakdown.supplyFit;
    if (b.breakdown.demandFit !== a.breakdown.demandFit) return b.breakdown.demandFit - a.breakdown.demandFit;
    return a.template.id.localeCompare(b.template.id);
  });

  return scored.slice(0, 3).map((s, index) => ({
    templateId: s.template.id,
    rank: index + 1,
    name: s.template.name,
    concept: s.template.concept,
    totalScore: s.totalScore,
    scoreBreakdown: s.breakdown,
    reasons: buildReasons(s.template, s.breakdown, dna),
    targetDescription: s.template.targetDescriptionTemplate,
    poiIds: s.poiIds,
    consumptionTouchpoints: s.touchpoints,
    risks: s.template.riskTemplates,
    evidences: s.evidences,
    modelVersion,
  }));
}
