import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { computeAnalysisKey } from "@/lib/domain/analysisKey";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { computeDataVersion } from "@/lib/domain/dataVersion";
import { computeDna } from "@/lib/domain/dna";
import {
  computeStrategies,
  type BudgetLevelCode,
  type DurationCode,
  type GroupTypeCode,
  type ProjectInputForScoring,
  type StrategyComputationResult,
  type TransportCode,
} from "@/lib/domain/strategy";
import { buildAnalysisContext } from "@/lib/domain/audienceContext";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { DnaResult, EvidenceItem } from "@/lib/domain/types";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";
import { buildDnaEngineInput } from "./buildDnaEngineInput";
import { fetchPoisByCategory } from "./fetchPoisByCategory";
import { fetchRegionComparisonProfiles } from "./fetchRegionComparisonProfiles";
import { computeRegionSimilarityComparisons, type RegionComparisonAnalysis } from "@/lib/domain/regionSimilarity";

type PersistClient = typeof prisma | Prisma.TransactionClient;

function toEvidenceCreateData(
  e: EvidenceItem,
  link: { analysisResultId: string } | { strategyResultId: string },
) {
  return {
    ...link,
    axis: e.axis,
    metricCode: e.metricCode,
    rawValue: e.rawValue,
    normalizedValue: e.normalizedValue,
    unit: e.unit,
    adminLevel: e.adminLevel,
    regionCode: e.regionCode,
    baseYm: e.baseYm,
    sourceCode: e.sourceCode,
    collectedAt: new Date(e.collectedAt),
    appliedRule: e.appliedRule,
    // Phase 1-C: 분석 당시 provenance를 그대로 복사해 보존한다(마스터 문서 1-1절). 판정 근거가
    // 없으면 e.provenance가 이미 null이므로 그대로 null을 저장한다 — 임의로 채우지 않는다.
    provenance: e.provenance,
  };
}

export interface AnalysisComputeInput {
  regionCode: string;
  role: string;
  nationality: string;
  travelYear: number;
  travelMonth: number;
  ageGroups: string[];
  companionType: string;
  primaryGoal: string;
  secondaryGoal?: string | null;
  duration: DurationCode;
  budgetLevel: BudgetLevelCode;
  transport: TransportCode;
  groupType: GroupTypeCode;
  preferredThemes: string[];
  excludedThemes: string[];
}

export interface ComputedProjectAnalysis {
  dna: DnaResult;
  dataVersion: string;
  analysisKey: string;
  strategies: StrategyComputationResult[];
  /** 분석 시점의 지역 전체 POI 카테고리별 개수 스냅샷 — 관광사업 기회 3안(SUPPLY_GAP/TARGET_THEME_GAP)의
   * 재현성을 위해 AnalysisResult.poiCategorySummary로 그대로 저장된다(2026-08-02). */
  poiCategorySummary: Partial<Record<PoiCategoryCode, number>>;
  /** 분석 시점에 계산한 유사지역 비교 결과 전체 — AnalysisResult.regionComparisonSnapshot으로 그대로
   * 저장된다(2026-08-10). 대상 지역이 아직 지원되지 않아(비교 프로필을 찾지 못해) 계산할 수 없으면
   * null — 이 경우 화면은 poiCategorySummary와 동일하게 예외적으로 현재 DB를 다시 조회한다. */
  regionComparisonSnapshot: RegionComparisonAnalysis | null;
}

/**
 * DNA 5축·전략 3안을 계산만 한다 — DB에 아무것도 쓰지 않는다(Phase 6, 2026-08-01). 내부에서 쓰는
 * `buildDnaEngineInput`/`fetchPoisByCategory`는 읽기 전용 조회라, 이 함수가 도중에 예외를 던져도
 * 기존에 저장된 AnalysisResult/StrategyResult/SelectedPlan/홍보자료는 전혀 건드리지 않는다. 신규
 * 프로젝트 생성(`runAnalysisForProject`)과 기존 프로젝트 재분석(`/projects/[id]/edit/actions.ts`)이
 * 이 함수를 공유해, "같은 조건이면 같은 분석 로직"을 보장한다.
 */
export async function computeProjectAnalysis(input: AnalysisComputeInput): Promise<ComputedProjectAnalysis> {
  const baseYm = process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  const dnaInput = await buildDnaEngineInput(input.regionCode, baseYm);
  const dna = computeDna(dnaInput);
  const dataVersion = computeDataVersion(dnaInput);

  const poisByCategory = await fetchPoisByCategory(input.regionCode);
  const poiCategorySummary = Object.fromEntries(
    Object.entries(poisByCategory).map(([category, pois]) => [category, pois?.length ?? 0]),
  ) as Partial<Record<PoiCategoryCode, number>>;

  // 프로젝트 조건(역할·국적·테마·월·지역)을 파이프라인 전체가 공유하는 단일 컨텍스트로 정규화한다
  // (2026-07-31, 역할별 맞춤 분석 완성) — DNA 분석/전략 계산/실행안/홍보자료가 모두 이 컨텍스트가
  // 만든 값(role/nationality/travelMonth/themeCategories)을 그대로 신뢰한다.
  const analysisContext = buildAnalysisContext({
    role: input.role,
    nationality: input.nationality,
    travelMonth: input.travelMonth,
    preferredThemes: input.preferredThemes,
    excludedThemes: input.excludedThemes,
    regionCode: input.regionCode,
  });

  const scoringInput: ProjectInputForScoring = {
    ageGroups: input.ageGroups,
    companionType: input.companionType,
    primaryGoal: input.primaryGoal,
    secondaryGoal: input.secondaryGoal,
    duration: input.duration,
    budgetLevel: input.budgetLevel,
    transport: input.transport,
    groupType: input.groupType,
    travelMonth: analysisContext.travelMonth ?? input.travelMonth,
    preferredThemes: analysisContext.preferredThemes,
    excludedThemes: analysisContext.excludedThemes,
    role: analysisContext.role,
    nationality: analysisContext.nationality,
  };

  const strategies = computeStrategies(dna, scoringInput, poisByCategory, MODEL_VERSION);
  const analysisKey = computeAnalysisKey({
    input: { ...scoringInput, regionCode: input.regionCode, travelYear: input.travelYear, baseYm },
    dataVersion,
    modelVersion: MODEL_VERSION,
  });

  // 유사지역 비교 스냅샷(2026-08-10) — 분석 시점에 딱 한 번 계산해 그대로 저장한다. 이후 데이터
  // sync로 NormalizedMetric이 갱신되거나 min-max 코호트(지원 SIGUNGU 수)가 바뀌어도, 이미 저장된
  // 분석 결과 화면은 이 스냅샷만 사용해 상단 DNA 카드와 항상 같은 숫자를 보여준다(재현성 보완) —
  // regionSimilarity.ts/fetchRegionComparisonProfiles.ts를 그대로 재사용하며 유사도 산식은 전혀
  // 바꾸지 않는다. 대상 지역의 비교 프로필을 찾지 못하면(아직 지원되지 않는 지역) null로 남긴다.
  const regionComparisonProfiles = await fetchRegionComparisonProfiles(baseYm);
  const targetRegionProfile = regionComparisonProfiles.find((p) => p.code === input.regionCode);
  const regionComparisonSnapshot: RegionComparisonAnalysis | null = targetRegionProfile
    ? computeRegionSimilarityComparisons(targetRegionProfile, regionComparisonProfiles)
    : null;

  return { dna, dataVersion, analysisKey, strategies, poiCategorySummary, regionComparisonSnapshot };
}

/**
 * 이미 계산된 분석 결과를 저장한다 — 기존 AnalysisResult(및 onDelete:Cascade로 함께 지워지는
 * StrategyResult/Evidence)를 지우고 새로 만든다. `client`에 트랜잭션 클라이언트(`tx`)를 넘기면 호출부의
 * 트랜잭션 범위 안에서 원자적으로 실행된다 — 재분석 경로(`edit/actions.ts`)가 이렇게 써서 "저장 도중
 * 실패하면 기존 분석이 그대로 남는다"를 보장한다. 신규 생성 경로(`runAnalysisForProject`)는 지울
 * 기존 데이터가 없으므로 트랜잭션 없이 기본 `prisma` 클라이언트로 호출한다(기존 동작 그대로 유지).
 */
export async function persistProjectAnalysis(
  client: PersistClient,
  projectId: string,
  computed: ComputedProjectAnalysis,
): Promise<string> {
  const { dna, dataVersion, analysisKey, strategies, poiCategorySummary, regionComparisonSnapshot } = computed;

  await client.analysisResult.deleteMany({ where: { projectId } });

  const created = await client.analysisResult.create({
    data: {
      projectId,
      demandScore: dna.demand.score,
      demandStatus: dna.demand.status,
      stayScore: dna.stay.score,
      stayStatus: dna.stay.status,
      spendScore: dna.spend.score,
      spendStatus: dna.spend.status,
      diversityScore: dna.diversity.score,
      diversityStatus: dna.diversity.status,
      networkScore: dna.network.score,
      networkStatus: dna.network.status,
      overallDataMode: dna.overallDataMode,
      liveAxisCount: dna.liveAxisCount,
      strengths: dna.strengths,
      opportunities: dna.opportunities,
      cautions: dna.cautions,
      poiCategorySummary,
      // null이면 필드를 아예 생략한다(컬럼 기본값이 NULL이라 결과는 동일하다) — Prisma Json 필드에
      // 명시적 null을 넣으려면 Prisma.JsonNull 런타임 값이 필요한데 여기서는 그럴 필요가 없다.
      ...(regionComparisonSnapshot !== null
        ? { regionComparisonSnapshot: regionComparisonSnapshot as unknown as Prisma.InputJsonValue }
        : {}),
      analysisKey,
      dataVersion,
      modelVersion: MODEL_VERSION,
    },
  });

  const allAxisEvidence = [dna.demand, dna.stay, dna.spend, dna.diversity, dna.network].flatMap(
    (a) => a.evidence,
  );
  if (allAxisEvidence.length > 0) {
    await client.evidence.createMany({
      data: allAxisEvidence.map((e) => toEvidenceCreateData(e, { analysisResultId: created.id })),
    });
  }

  for (const s of strategies) {
    const strategyRow = await client.strategyResult.create({
      data: {
        analysisResultId: created.id,
        templateId: s.templateId,
        rank: s.rank,
        name: s.name,
        concept: s.concept,
        totalScore: s.totalScore,
        scoreBreakdown: { ...s.scoreBreakdown },
        reasons: s.reasons,
        targetDescription: s.targetDescription,
        poiIds: s.poiIds,
        consumptionTouchpoints: { ...s.consumptionTouchpoints },
        risks: s.risks,
        evidenceIds: [],
        coreProblem: s.coreProblem,
        coreResource: s.coreResource,
        stayStyle: s.stayStyle,
        executionDifficulty: s.executionDifficulty,
        expectedEffect: s.expectedEffect,
      },
    });

    if (s.evidences.length > 0) {
      await client.evidence.createMany({
        data: s.evidences.map((e) => toEvidenceCreateData(e, { strategyResultId: strategyRow.id })),
      });
      const evidenceRows = await client.evidence.findMany({
        where: { strategyResultId: strategyRow.id },
        select: { id: true },
      });
      await client.strategyResult.update({
        where: { id: strategyRow.id },
        data: { evidenceIds: evidenceRows.map((e) => e.id) },
      });
    }
  }

  return created.id;
}

/** 프로젝트의 DNA/전략 분석을 계산해 DB에 저장한다. 재실행 시 기존 분석 결과를 대체한다(idempotent).
 * 신규 프로젝트 생성 직후(`/projects/new`)에만 쓰인다 — 지워질 기존 데이터가 없는 상태이므로
 * 트랜잭션이 필요하지 않다(계산 실패 시 Project/ProjectInput만 남고 분석 없음 상태가 되며, 화면은
 * 이 상태를 이미 정상적으로 처리한다). 기존 프로젝트의 안전한 재분석은
 * `src/app/projects/[id]/edit/actions.ts`가 `computeProjectAnalysis`/`persistProjectAnalysis`를
 * 트랜잭션으로 감싸 별도로 처리한다(Phase 6, 2026-08-01). */
export async function runAnalysisForProject(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { input: true, region: true },
  });
  if (!project.input) throw new Error("ProjectInput이 없습니다. 먼저 조건 입력을 완료해주세요.");

  const computed = await computeProjectAnalysis({
    regionCode: project.region.code,
    role: project.role,
    nationality: project.input.nationality,
    travelYear: project.travelYear,
    travelMonth: project.travelMonth,
    ageGroups: project.input.ageGroups as string[],
    companionType: project.input.companionType,
    primaryGoal: project.input.primaryGoal,
    secondaryGoal: project.input.secondaryGoal,
    duration: project.input.duration,
    budgetLevel: project.input.budgetLevel,
    transport: project.input.transport,
    groupType: project.input.groupType,
    preferredThemes: project.input.preferredThemes as string[],
    excludedThemes: project.input.excludedThemes as string[],
  });

  const analysisResultId = await persistProjectAnalysis(prisma, projectId, computed);
  await prisma.project.update({ where: { id: projectId }, data: { status: "ANALYZED" } });

  return analysisResultId;
}
