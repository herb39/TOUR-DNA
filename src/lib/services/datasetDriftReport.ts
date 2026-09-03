import { DNA_AXES, type DnaAxisKey } from "@/lib/domain/types";
import { buildAnalysisContext } from "@/lib/domain/audienceContext";
import { computeDna } from "@/lib/domain/dna";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { computeStrategies, type ProjectInputForScoring } from "@/lib/domain/strategy";
import { computeRegionSimilarityComparisons } from "@/lib/domain/regionSimilarity";
import {
  computeAxisDriftReport,
  computeStrengthWeaknessDrift,
  summarizeSimilarityDrift,
  summarizeStrategyDrift,
  SIMILARITY_DRIFT_SEED_REGION_CODES,
  type AxisDriftReport,
  type SimilarityDriftReport,
  type StrategyDriftReport,
  type StrengthWeaknessChangeReport,
} from "@/lib/domain/datasetDriftGate";
import { buildDnaEngineInput } from "./buildDnaEngineInput";
import { fetchPoisByCategory } from "./fetchPoisByCategory";
import { fetchRegionComparisonProfiles } from "./fetchRegionComparisonProfiles";
import { fetchCommonCohortProfiles } from "./fetchCommonCohortProfiles";

export type DatasetDriftPolicy = "CURRENT" | "COMMON_COHORT";
export const DEFAULT_DATASET_DRIFT_POLICY: DatasetDriftPolicy = "COMMON_COHORT";

/**
 * Phase 2-C(2026-08-12): 두 baseYm(ACTIVE와 STAGING candidate) 사이의 DNA drift를 실제로 계산한다.
 * DNA/정규화/유사도/전략 산식은 전혀 새로 만들지 않고, 이미 검증된 `buildDnaEngineInput`/`computeDna`/
 * `fetchRegionComparisonProfiles`/`computeRegionSimilarityComparisons`/`computeStrategies`를 baseYm
 * 양쪽에 대해 각각 호출해서 비교만 한다. 통계(percentile/rank correlation/decile churn 등) 계산은
 * `src/lib/domain/datasetDriftGate.ts`의 순수 함수에 위임한다.
 *
 * `evaluateDatasetPromotion`(datasetPromotion.ts)이 이 모듈의 `computeDatasetDriftReport`만 가져다
 * 쓰도록 분리해 두었다 — completeness/audit BLOCKED 판정을 테스트할 때 이 무거운 계산까지 매번
 * 실행하거나 mock할 필요가 없도록 하기 위해서다.
 */

/**
 * drift gate가 전략 drift(Part 11)를 확인하기 위해 쓰는 QA 전용 대표 시나리오 3개 — 실제 서비스가
 * 쓰는 `src/lib/domain/contestScenarios.ts`(강릉/경주/제천, 전부 역할이 TRAVEL_AGENCY 아니면
 * LOCAL_GOV)와는 별도로, 역할 3종(TRAVEL_AGENCY/LOCAL_GOV/FESTIVAL_PLANNER)을 모두 겪어보도록
 * 구성했다. `computeStrategies` 자체는 그대로 재사용하고, 입력 조합만 이 파일에서 새로 정의한다.
 * 매번 이 배열 그대로 사용한다(랜덤 생성 없음).
 */
export interface DriftQaScenario {
  id: string;
  regionCode: string;
  role: "TRAVEL_AGENCY" | "LOCAL_GOV" | "FESTIVAL_PLANNER";
  nationality: "DOMESTIC" | "FOREIGN";
  preferredThemes: string[];
  travelMonth: number;
  scoringInputBase: Omit<ProjectInputForScoring, "role" | "nationality" | "travelMonth" | "preferredThemes" | "excludedThemes">;
}

export const DRIFT_QA_SCENARIOS: readonly DriftQaScenario[] = [
  {
    id: "gangneung-travel-agency-food",
    regionCode: "SGG_GANGNEUNG",
    role: "TRAVEL_AGENCY",
    nationality: "FOREIGN",
    preferredThemes: ["미식"],
    travelMonth: 9,
    scoringInputBase: {
      ageGroups: ["AGE_20S", "AGE_30S"],
      companionType: "COMPANION_COUPLE",
      primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
      secondaryGoal: "GOAL_NEW_MARKET",
      duration: "ONE_NIGHT_TWO_DAYS",
      budgetLevel: "MID",
      transport: "PUBLIC_TRANSPORT",
      groupType: "FIT",
    },
  },
  {
    id: "gyeongju-local-gov-culture-history",
    regionCode: "SGG_GYEONGJU",
    role: "LOCAL_GOV",
    nationality: "DOMESTIC",
    preferredThemes: ["문화", "역사"],
    travelMonth: 10,
    scoringInputBase: {
      ageGroups: ["AGE_40S", "AGE_50S"],
      companionType: "COMPANION_GROUP_TOUR",
      primaryGoal: "GOAL_LOCAL_ECONOMY",
      secondaryGoal: "GOAL_BRAND_IMAGE",
      duration: "TWO_NIGHTS_THREE_DAYS",
      budgetLevel: "MID",
      transport: "PUBLIC_TRANSPORT",
      groupType: "MEDIUM_21_40",
    },
  },
  {
    id: "jecheon-festival-planner-wellness",
    regionCode: "SGG_JECHEON",
    role: "FESTIVAL_PLANNER",
    nationality: "FOREIGN",
    preferredThemes: ["웰니스"],
    travelMonth: 12,
    scoringInputBase: {
      ageGroups: ["AGE_30S", "AGE_40S"],
      companionType: "COMPANION_COUPLE",
      primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
      secondaryGoal: "GOAL_REPEAT_VISIT",
      duration: "TWO_NIGHTS_THREE_DAYS",
      budgetLevel: "PREMIUM",
      transport: "PRIVATE_VEHICLE",
      groupType: "FIT",
    },
  },
] as const;

async function computeScenarioTop3TemplateIds(
  scenario: DriftQaScenario,
  baseYm: string,
  diagnosticDnaByCode?: Map<string, ReturnType<typeof computeDna>>,
): Promise<string[]> {
  const dna = diagnosticDnaByCode?.get(scenario.regionCode) ?? computeDna(await buildDnaEngineInput(scenario.regionCode, baseYm));
  const poisByCategory = await fetchPoisByCategory(scenario.regionCode);
  const analysisContext = buildAnalysisContext({
    role: scenario.role,
    nationality: scenario.nationality,
    travelMonth: scenario.travelMonth,
    preferredThemes: scenario.preferredThemes,
    excludedThemes: [],
    regionCode: scenario.regionCode,
  });
  const scoringInput: ProjectInputForScoring = {
    ...scenario.scoringInputBase,
    travelMonth: analysisContext.travelMonth ?? scenario.travelMonth,
    preferredThemes: analysisContext.preferredThemes,
    excludedThemes: analysisContext.excludedThemes,
    role: analysisContext.role,
    nationality: analysisContext.nationality,
  };
  const strategies = computeStrategies(dna, scoringInput, poisByCategory, MODEL_VERSION);
  return strategies.map((s) => s.templateId);
}

export interface DatasetDriftReport {
  activeBaseYm: string;
  candidateBaseYm: string;
  policy: DatasetDriftPolicy;
  metricCohortReports: Record<
    string,
    {
      activeRegionCount: number;
      candidateRegionCount: number;
      commonRegionCount: number;
      asymmetricRegionCount: number;
    }
  >;
  fullAxisCommonCohortSize: number;
  axisReports: AxisDriftReport[];
  strengthWeakness: StrengthWeaknessChangeReport;
  similarity: SimilarityDriftReport;
  strategy: StrategyDriftReport;
}

/**
 * DNA drift report 전체를 계산한다(무거운 연산 — 전국 255개 지역 DNA를 baseYm 2개에 대해 각각
 * 재계산한다. `fetchRegionComparisonProfiles`가 이미 매 프로젝트 분석마다 이 규모로 실행되고 있어
 * 신규 성능 문제는 아니다). similarity/strategy는 성능을 고려해 명시적으로 관리되는 대표 seed/시나리오
 * 목록(랜덤 아님)만 사용한다.
 */
export async function computeDatasetDriftReport(
  activeBaseYm: string,
  candidateBaseYm: string,
  policy: DatasetDriftPolicy = DEFAULT_DATASET_DRIFT_POLICY,
): Promise<DatasetDriftReport> {
  const commonCohort = policy === "COMMON_COHORT" ? await fetchCommonCohortProfiles(activeBaseYm, candidateBaseYm) : null;
  const [activeProfiles, candidateProfiles] = commonCohort
    ? [commonCohort.activeProfiles, commonCohort.candidateProfiles]
    : await Promise.all([fetchRegionComparisonProfiles(activeBaseYm), fetchRegionComparisonProfiles(candidateBaseYm)]);
  const activeByCode = new Map(activeProfiles.map((p) => [p.code, p]));
  const candidateByCode = new Map(candidateProfiles.map((p) => [p.code, p]));
  const allCodes = new Set([...activeByCode.keys(), ...candidateByCode.keys()]);

  const axisReports: AxisDriftReport[] = DNA_AXES.map((axis: DnaAxisKey) => {
    const samples = [...allCodes].map((code) => ({
      code,
      activeScore: activeByCode.get(code)?.axisScores[axis].score ?? null,
      candidateScore: candidateByCode.get(code)?.axisScores[axis].score ?? null,
    }));
    return computeAxisDriftReport(axis, samples);
  });

  const strengthWeaknessCodes = commonCohort?.fullAxisCommonRegionCodes ?? [...allCodes];
  const strengthWeaknessRegions = strengthWeaknessCodes.map((code) => ({
    code,
    activeScores: Object.fromEntries(DNA_AXES.map((a) => [a, activeByCode.get(code)?.axisScores[a].score ?? null])) as Partial<
      Record<DnaAxisKey, number | null>
    >,
    candidateScores: Object.fromEntries(
      DNA_AXES.map((a) => [a, candidateByCode.get(code)?.axisScores[a].score ?? null]),
    ) as Partial<Record<DnaAxisKey, number | null>>,
  }));
  const strengthWeakness = computeStrengthWeaknessDrift(strengthWeaknessRegions);

  const similarityProfiles = commonCohort
    ? commonCohort.fullAxisCommonRegionCodes
        .map((code) => activeByCode.get(code))
        .filter((profile): profile is NonNullable<typeof profile> => profile !== undefined)
    : activeProfiles;
  const candidateSimilarityProfiles = commonCohort
    ? commonCohort.fullAxisCommonRegionCodes
        .map((code) => candidateByCode.get(code))
        .filter((profile): profile is NonNullable<typeof profile> => profile !== undefined)
    : candidateProfiles;
  const similaritySeedResults = SIMILARITY_DRIFT_SEED_REGION_CODES.map((code) => {
    const activeTarget = activeByCode.get(code);
    const candidateTarget = candidateByCode.get(code);
    if (!activeTarget || !candidateTarget) {
      return { code, activeTop3: null, candidateTop3: null };
    }
    const activeTop3 = computeRegionSimilarityComparisons(activeTarget, similarityProfiles).comparisons.map((c) => c.regionCode);
    const candidateTop3 = computeRegionSimilarityComparisons(candidateTarget, candidateSimilarityProfiles).comparisons.map(
      (c) => c.regionCode,
    );
    return { code, activeTop3, candidateTop3 };
  });
  const similarity = summarizeSimilarityDrift(similaritySeedResults);

  const strategyScenarioResults = await Promise.all(
    DRIFT_QA_SCENARIOS.map(async (scenario) => {
      const [activeTop3TemplateIds, candidateTop3TemplateIds] = await Promise.all([
        commonCohort
          ? computeScenarioTop3TemplateIds(scenario, activeBaseYm, commonCohort.activeDnaByCode)
          : computeScenarioTop3TemplateIds(scenario, activeBaseYm),
        commonCohort
          ? computeScenarioTop3TemplateIds(scenario, candidateBaseYm, commonCohort.candidateDnaByCode)
          : computeScenarioTop3TemplateIds(scenario, candidateBaseYm),
      ]);
      return { scenarioId: scenario.id, activeTop3TemplateIds, candidateTop3TemplateIds };
    }),
  );
  const strategy = summarizeStrategyDrift(strategyScenarioResults);

  const fullAxisCommonCohortSize =
    commonCohort?.fullAxisCommonCohortSize ??
    [...allCodes].filter((code) =>
      DNA_AXES.every((axis) => activeByCode.get(code)?.axisScores[axis].score !== null && candidateByCode.get(code)?.axisScores[axis].score !== null),
    ).length;

  return {
    activeBaseYm,
    candidateBaseYm,
    policy,
    metricCohortReports: commonCohort?.metricCohortReports ?? {},
    fullAxisCommonCohortSize,
    axisReports,
    strengthWeakness,
    similarity,
    strategy,
  };
}
