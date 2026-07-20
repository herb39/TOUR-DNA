import { prisma } from "@/lib/db";
import { computeAnalysisKey } from "@/lib/domain/analysisKey";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { computeDataVersion } from "@/lib/domain/dataVersion";
import { computeDna } from "@/lib/domain/dna";
import { computeStrategies, type ProjectInputForScoring } from "@/lib/domain/strategy";
import type { EvidenceItem } from "@/lib/domain/types";
import { DEFAULT_BASE_YM } from "@/lib/fixtures/metrics";
import { buildDnaEngineInput } from "./buildDnaEngineInput";
import { fetchPoisByCategory } from "./fetchPoisByCategory";

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
  };
}

/** 프로젝트의 DNA/전략 분석을 계산해 DB에 저장한다. 재실행 시 기존 분석 결과를 대체한다(idempotent). */
export async function runAnalysisForProject(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { input: true, region: true },
  });
  if (!project.input) throw new Error("ProjectInput이 없습니다. 먼저 조건 입력을 완료해주세요.");

  const baseYm = process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  const dnaInput = await buildDnaEngineInput(project.region.code, baseYm);
  const dna = computeDna(dnaInput);
  const dataVersion = computeDataVersion(dnaInput);

  const poisByCategory = await fetchPoisByCategory(project.region.code);
  const scoringInput: ProjectInputForScoring = {
    ageGroups: project.input.ageGroups as string[],
    companionType: project.input.companionType,
    primaryGoal: project.input.primaryGoal,
    secondaryGoal: project.input.secondaryGoal,
    duration: project.input.duration,
    budgetLevel: project.input.budgetLevel,
    transport: project.input.transport,
    groupType: project.input.groupType,
    travelMonth: project.travelMonth,
    preferredThemes: project.input.preferredThemes as string[],
    excludedThemes: project.input.excludedThemes as string[],
  };

  const strategies = computeStrategies(dna, scoringInput, poisByCategory, MODEL_VERSION);
  const analysisKey = computeAnalysisKey({
    input: { ...scoringInput, regionCode: project.region.code, travelYear: project.travelYear, baseYm },
    dataVersion,
    modelVersion: MODEL_VERSION,
  });

  await prisma.analysisResult.deleteMany({ where: { projectId } });

  const created = await prisma.analysisResult.create({
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
      analysisKey,
      dataVersion,
      modelVersion: MODEL_VERSION,
    },
  });

  const allAxisEvidence = [dna.demand, dna.stay, dna.spend, dna.diversity, dna.network].flatMap(
    (a) => a.evidence,
  );
  if (allAxisEvidence.length > 0) {
    await prisma.evidence.createMany({
      data: allAxisEvidence.map((e) => toEvidenceCreateData(e, { analysisResultId: created.id })),
    });
  }

  for (const s of strategies) {
    const strategyRow = await prisma.strategyResult.create({
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
      },
    });

    if (s.evidences.length > 0) {
      await prisma.evidence.createMany({
        data: s.evidences.map((e) => toEvidenceCreateData(e, { strategyResultId: strategyRow.id })),
      });
      const evidenceRows = await prisma.evidence.findMany({
        where: { strategyResultId: strategyRow.id },
        select: { id: true },
      });
      await prisma.strategyResult.update({
        where: { id: strategyRow.id },
        data: { evidenceIds: evidenceRows.map((e) => e.id) },
      });
    }
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: "ANALYZED" } });

  return created.id;
}
