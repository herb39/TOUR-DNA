import { prisma } from "@/lib/db";
import { decideDriftGateVerdict, type PromotionVerdict } from "@/lib/domain/datasetDriftGate";
import { computeDatasetDriftReport, type DatasetDriftReport } from "./datasetDriftReport";
import { checkDatasetCompleteness, activateDataset, getActiveDatasetBaseYm, type ActivateDatasetResult } from "./activeDataset";
import type { TourismDataQualityReport } from "./tourismDataQualityAudit";

/**
 * Phase 2-C(2026-08-12): STAGING dataset이 수집 완료됐다는 사실만으로 바로 ACTIVE가 되지 않도록,
 * completeness/audit(Phase 2-A 재사용) + DNA drift gate(신규, `datasetDriftReport.ts`/
 * `datasetDriftGate.ts`)를 모두 통과해야만 승격을 허용하는 단일 promotion 경로.
 */

export interface DatasetPromotionEvaluation {
  baseYm: string;
  activeBaseYm: string | null;
  verdict: PromotionVerdict;
  reasons: string[];
  completenessReport: TourismDataQualityReport | null;
  driftReport: DatasetDriftReport | null;
}

/**
 * STAGING → ACTIVE 승격 전 사전조건을 순서대로 확인한다(Part 3): (1) dataset 존재 (2) status===STAGING
 * (3) ACTIVE 존재 (4) target baseYm > ACTIVE baseYm (5) completeness/audit PASS (6) DNA drift report
 * 계산 (7) drift gate 판정. 앞 단계 하나라도 BLOCKED면 그 뒤 단계(특히 무거운 DNA drift 계산)는
 * 시작하지 않는다. 이 함수는 DB에 어떤 쓰기도 하지 않는다(읽기 전용 판정) — 실제 ACTIVE 전환은
 * `promoteDataset`이 이 함수의 결과가 PASS일 때만 수행한다.
 */
export async function evaluateDatasetPromotion(baseYm: string): Promise<DatasetPromotionEvaluation> {
  const dataset = await prisma.dataset.findUnique({ where: { baseYm } });
  if (!dataset) {
    return {
      baseYm,
      activeBaseYm: null,
      verdict: "BLOCKED",
      reasons: [`[BLOCKED] baseYm=${baseYm}에 해당하는 dataset이 존재하지 않는다.`],
      completenessReport: null,
      driftReport: null,
    };
  }
  if (dataset.status !== "STAGING") {
    return {
      baseYm,
      activeBaseYm: null,
      verdict: "BLOCKED",
      reasons: [`[BLOCKED] baseYm=${baseYm}은 STAGING 상태가 아니다(현재 status=${dataset.status}).`],
      completenessReport: null,
      driftReport: null,
    };
  }

  const activeBaseYm = await getActiveDatasetBaseYm();
  if (!activeBaseYm) {
    return {
      baseYm,
      activeBaseYm: null,
      verdict: "BLOCKED",
      reasons: ["[BLOCKED] 현재 ACTIVE dataset이 없어 비교(drift) 기준이 없다."],
      completenessReport: null,
      driftReport: null,
    };
  }

  if (!(baseYm > activeBaseYm)) {
    return {
      baseYm,
      activeBaseYm,
      verdict: "BLOCKED",
      reasons: [`[BLOCKED] target baseYm(${baseYm})이 현재 ACTIVE(${activeBaseYm})보다 최신이 아니다.`],
      completenessReport: null,
      driftReport: null,
    };
  }

  const { complete, report: completenessReport } = await checkDatasetCompleteness(baseYm);
  if (!complete) {
    return {
      baseYm,
      activeBaseYm,
      verdict: "BLOCKED",
      reasons: [
        `[BLOCKED] completeness/audit 미통과 — 판정=${completenessReport.verdict}, ` +
          `미완료 지역 ${completenessReport.snapshot.incompleteRegions}곳, ERROR ${completenessReport.snapshot.errorRegions}곳.`,
        ...completenessReport.verdictReasons,
      ],
      completenessReport,
      driftReport: null,
    };
  }

  const driftReport = await computeDatasetDriftReport(activeBaseYm, baseYm);
  const decision = decideDriftGateVerdict({
    axisReports: driftReport.axisReports,
    strengthWeakness: driftReport.strengthWeakness,
    similarity: driftReport.similarity,
    strategy: driftReport.strategy,
  });

  return {
    baseYm,
    activeBaseYm,
    verdict: decision.verdict,
    reasons: decision.reasons,
    completenessReport,
    driftReport,
  };
}

export type PromoteDatasetResult =
  | { ok: true; baseYm: string; previousActiveBaseYm: string | null; evaluation: DatasetPromotionEvaluation }
  | { ok: false; reason: "NOT_PASS"; evaluation: DatasetPromotionEvaluation };

/**
 * 단일 promotion 경로 — `evaluateDatasetPromotion`이 PASS를 반환했을 때만 실제로 `activateDataset`을
 * 호출해 ACTIVE를 바꾼다. REVIEW_REQUIRED/BLOCKED면 어떤 DB 쓰기도 하지 않고 기존 ACTIVE를 그대로
 * 유지한다. `--force`/`--skip-drift` 같은 우회 옵션은 의도적으로 제공하지 않는다.
 */
export async function promoteDataset(baseYm: string): Promise<PromoteDatasetResult> {
  const evaluation = await evaluateDatasetPromotion(baseYm);
  if (evaluation.verdict !== "PASS") {
    return { ok: false, reason: "NOT_PASS", evaluation };
  }
  const result: ActivateDatasetResult = await activateDataset(baseYm);
  if (!result.ok) {
    // completeness는 evaluateDatasetPromotion에서 이미 확인했지만, 그 사이 상태가 바뀌는 경쟁 조건에
    // 대비해 activateDataset의 자체 재확인 결과도 그대로 신뢰한다(느슨한 재확인이 아니라 진짜 재검증).
    return { ok: false, reason: "NOT_PASS", evaluation };
  }
  return { ok: true, baseYm: result.baseYm, previousActiveBaseYm: result.previousActiveBaseYm, evaluation };
}
