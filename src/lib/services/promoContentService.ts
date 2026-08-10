import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { buildPromoContent, computeChannelPriority, type PromoUserRole } from "@/lib/domain/promoContent";
import type { PromoContent } from "@/lib/domain/promoContent";
import { parsePromoContent, parsePromoContentForSave } from "@/lib/validation/promoContent.schema";
import { buildPromoContentInputFromProjectData, toPromoContentJson } from "./promoContentAdapter";

/**
 * Phase 5-B DB 서비스: Phase 5-A `buildPromoContent()`를 실제 저장 흐름에 연결한다.
 * 클라이언트가 보낸 지역/역할/국적/전략/Evidence는 신뢰하지 않는다 — 생성 입력은 항상 이 파일이
 * projectId 하나만 받아 DB에서 다시 조회해 구성한다.
 */

export type PromoContentErrorCode = "notFound" | "noPlan" | "alreadyExists" | "invalidContent" | "forbidden" | "internalError";

export type GeneratePromoContentResult = { ok: true; content: PromoContent } | { ok: false; code: PromoContentErrorCode; message: string };
export type GetPromoContentResult = { ok: true; content: PromoContent | null } | { ok: false; code: PromoContentErrorCode; message: string };
export type SavePromoContentResult = { ok: true; content: PromoContent } | { ok: false; code: PromoContentErrorCode; message: string };

function logInternalError(scope: string, error: unknown): void {
  console.error(
    JSON.stringify({ level: "error", scope: `promo-content:${scope}`, message: error instanceof Error ? error.message : "unknown" }),
  );
}

const EVIDENCE_SELECT = {
  axis: true,
  metricCode: true,
  rawValue: true,
  normalizedValue: true,
  unit: true,
  adminLevel: true,
  regionCode: true,
  baseYm: true,
  sourceCode: true,
  collectedAt: true,
  appliedRule: true,
  provenance: true,
} as const;

const SELECTED_PLAN_SELECT = {
  productName: true,
  conceptText: true,
  background: true,
  targetSummary: true,
  sellingPoints: true,
  course: true,
  kpis: true,
  operationChecklist: true,
  risks: true,
  promoContent: true,
} as const;

async function loadProjectForGeneration(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      role: true,
      selectedStrategyResultId: true,
      travelYear: true,
      travelMonth: true,
      region: { select: { name: true } },
      input: { select: { nationality: true, preferredThemes: true } },
      selectedPlan: { select: SELECTED_PLAN_SELECT },
      // DNA 5축 강점/약점을 홍보 문구 근거로 쓰기 위한 조회(2026-08-11) — 원점수는 이 파일 밖으로
      // 나가지 않고 promoContentAdapter.ts가 표시지수·자연어 문구로만 변환한다.
      analysisResult: {
        select: { demandScore: true, stayScore: true, spendScore: true, diversityScore: true, networkScore: true },
      },
    },
  });
}

/**
 * 홍보자료를 생성해 저장한다. 기존 promoContent가 없으면(DB NULL) 항상 저장하고, 있으면
 * `options.overwrite === true`일 때만 재생성해 교체한다 — 그 외에는 저장하지 않고 alreadyExists를
 * 반환한다. 저장 직전 조건부 updateMany로 다시 확인하므로, 두 요청이 동시에 들어와도 overwrite가 아닌
 * 쪽은 실제로 DB에 반영된 값을 기준으로 안전하게 거부된다(클라이언트가 들고 있던 상태만 믿지 않는다).
 */
export async function generatePromoContentForProject(
  projectId: string,
  options: { overwrite?: boolean } = {},
): Promise<GeneratePromoContentResult> {
  const overwrite = options.overwrite === true;

  let project: Awaited<ReturnType<typeof loadProjectForGeneration>>;
  try {
    project = await loadProjectForGeneration(projectId);
  } catch (error) {
    logInternalError("generate:loadProject", error);
    return { ok: false, code: "internalError", message: "프로젝트 조회 중 오류가 발생했습니다." };
  }

  if (!project) return { ok: false, code: "notFound", message: "프로젝트를 찾을 수 없습니다." };
  if (!project.input) return { ok: false, code: "noPlan", message: "입력 조건을 찾을 수 없습니다." };
  if (!project.selectedPlan || !project.selectedStrategyResultId) {
    return { ok: false, code: "noPlan", message: "실행안이 아직 생성되지 않았습니다. 먼저 실행안을 생성해주세요." };
  }
  if (project.selectedPlan.promoContent !== null && !overwrite) {
    return { ok: false, code: "alreadyExists", message: "이미 생성된 홍보자료가 있습니다. 덮어쓰려면 재생성을 확인해주세요." };
  }

  type EvidenceRows = Parameters<typeof buildPromoContentInputFromProjectData>[0]["evidenceRows"];
  let strategy: { name: string; evidences: EvidenceRows; analysisResult: { evidences: EvidenceRows } | null } | null;
  try {
    strategy = await prisma.strategyResult.findUnique({
      where: { id: project.selectedStrategyResultId },
      select: {
        name: true,
        evidences: { select: EVIDENCE_SELECT },
        // 전략에 직접 연결된 근거(evidences)가 비어 있을 수 있다(예: 전략 evidenceIds 연결 이전 데이터,
        // 또는 특정 전략만 근거가 저장되지 않은 경우) — 그 경우 같은 분석의 축(axis) 근거를
        // fallback으로 쓴다(아래 참고). 분석 자체가 LIVE 5/5인데 홍보자료만 "근거 없음"이라고 말하는
        // 모순을 없애기 위해서다(2026-07-29).
        analysisResult: { select: { evidences: { select: EVIDENCE_SELECT } } },
      },
    });
  } catch (error) {
    logInternalError("generate:loadStrategy", error);
    return { ok: false, code: "internalError", message: "전략 정보 조회 중 오류가 발생했습니다." };
  }
  if (!strategy) return { ok: false, code: "internalError", message: "선택된 전략 정보를 찾을 수 없습니다." };

  // 전략 전용 근거가 비어 있으면 분석 전체(축별) 근거로 대체한다 — 둘 다 같은 Evidence 모델이라 구조
  // 변환 없이 그대로 재사용할 수 있다. 둘 다 비어 있으면(실제로 근거가 전혀 없으면) 빈 배열 그대로
  // 넘겨 기존 "근거 없음" 문구가 정확히 그 경우에만 나오게 한다.
  const evidenceRows: EvidenceRows =
    strategy.evidences.length > 0 ? strategy.evidences : (strategy.analysisResult?.evidences ?? []);

  const input = buildPromoContentInputFromProjectData({
    project: {
      role: project.role,
      travelYear: project.travelYear,
      travelMonth: project.travelMonth,
      regionName: project.region.name,
      nationality: project.input.nationality,
      preferredThemes: project.input.preferredThemes,
    },
    plan: project.selectedPlan,
    strategyName: strategy.name,
    evidenceRows,
    analysis: project.analysisResult ?? null,
  });

  const content = buildPromoContent(input);
  const jsonValue = toPromoContentJson(content);

  try {
    const updateResult = await prisma.selectedPlan.updateMany({
      where: overwrite ? { projectId } : { projectId, promoContent: { equals: Prisma.DbNull } },
      data: { promoContent: jsonValue },
    });
    if (updateResult.count === 0) {
      // overwrite가 아닌 경로에서 count===0이면, 우리가 위에서 읽은 뒤 다른 요청이 먼저 저장했다는 뜻이다.
      return { ok: false, code: "alreadyExists", message: "이미 생성된 홍보자료가 있습니다. 덮어쓰려면 재생성을 확인해주세요." };
    }
  } catch (error) {
    logInternalError("generate:save", error);
    return { ok: false, code: "internalError", message: "홍보자료 저장 중 오류가 발생했습니다." };
  }

  return { ok: true, content };
}

/** 저장된 홍보자료를 조회한다. DB NULL이면 null, 값이 있으면 런타임 검증을 거친 뒤에만 반환한다. */
export async function getPromoContentForProject(projectId: string): Promise<GetPromoContentResult> {
  let project: { selectedPlan: { promoContent: Prisma.JsonValue } | null } | null;
  try {
    project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { selectedPlan: { select: { promoContent: true } } },
    });
  } catch (error) {
    logInternalError("get:loadProject", error);
    return { ok: false, code: "internalError", message: "프로젝트 조회 중 오류가 발생했습니다." };
  }

  if (!project) return { ok: false, code: "notFound", message: "프로젝트를 찾을 수 없습니다." };
  if (!project.selectedPlan) return { ok: false, code: "noPlan", message: "실행안이 아직 생성되지 않았습니다." };
  if (project.selectedPlan.promoContent === null) return { ok: true, content: null };

  const parsed = parsePromoContent(project.selectedPlan.promoContent);
  if (!parsed.ok) {
    return { ok: false, code: "invalidContent", message: "저장된 홍보자료 데이터 형식이 올바르지 않습니다." };
  }
  return { ok: true, content: parsed.value };
}

/**
 * 사용자가 편집한 홍보자료를 저장한다. content는 항상 unknown으로 취급하고, 검증(엄격 스키마)을
 * 통과한 값만 그대로(재생성·정규화 없이) 저장한다. 검증 실패 시 DB를 건드리지 않는다.
 *
 * `channelPriority`는 클라이언트가 보낸 값을 신뢰하지 않는다(2026-08-01 보완) — 형식이 유효한 순열
 * 이더라도, 순서 조작으로 실제 역할과 다른 채널 우선순위를 저장하려는 시도를 막기 위해 저장 직전
 * 실제 프로젝트 역할(project.role)로 서버가 다시 계산한 값으로 항상 덮어쓴다.
 */
export async function savePromoContentForProject(projectId: string, content: unknown): Promise<SavePromoContentResult> {
  const parsed = parsePromoContentForSave(content);
  if (!parsed.ok) {
    return { ok: false, code: "invalidContent", message: parsed.message };
  }

  let project: { role: PromoUserRole; selectedPlan: { id: string } | null } | null;
  try {
    project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { role: true, selectedPlan: { select: { id: true } } },
    });
  } catch (error) {
    logInternalError("save:loadProject", error);
    return { ok: false, code: "internalError", message: "프로젝트 조회 중 오류가 발생했습니다." };
  }

  if (!project) return { ok: false, code: "notFound", message: "프로젝트를 찾을 수 없습니다." };
  if (!project.selectedPlan) return { ok: false, code: "noPlan", message: "실행안이 아직 생성되지 않았습니다." };

  const contentToSave: PromoContent = {
    ...parsed.value,
    channelPriority: computeChannelPriority(project.role),
  };

  const jsonValue = toPromoContentJson(contentToSave);
  try {
    await prisma.selectedPlan.update({ where: { projectId }, data: { promoContent: jsonValue } });
  } catch (error) {
    logInternalError("save:update", error);
    return { ok: false, code: "internalError", message: "홍보자료 저장 중 오류가 발생했습니다." };
  }

  return { ok: true, content: contentToSave };
}
