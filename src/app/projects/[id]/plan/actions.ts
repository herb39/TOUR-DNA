"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { searchPoisInRegion } from "@/lib/services/poiDetails";
import type { CourseDay, PoiDetail, TransportCode } from "@/lib/domain/planBuilder";
import { enrichCourseDaysWithRealRoutes } from "@/lib/services/route/courseRouteEnrichment";
import { assertProjectAccessible, projectAccessCookieName } from "@/lib/services/projectAccess";
import {
  generatePromoContentForProject,
  getPromoContentForProject,
  savePromoContentForProject,
  type GeneratePromoContentResult,
  type GetPromoContentResult,
  type SavePromoContentResult,
} from "@/lib/services/promoContentService";

async function requireProjectAccess(projectId: string): Promise<void> {
  const cookieStore = await cookies();
  await assertProjectAccessible(projectId, cookieStore.get(projectAccessCookieName(projectId))?.value);
}

export interface SavePlanFormState {
  success: boolean;
  message?: string;
  savedAt?: string;
  /** 저장 직후 서버가 실제로 반영한 course(카카오 실제 경로 enrichment 결과 포함)를 그대로 돌려준다.
   * PlanEditor의 days state는 클라이언트가 보낸 값으로 이미 채워져 있어 useActionState가 새 props를
   * 받아도 저절로 갱신되지 않는다(React가 이미 마운트된 컴포넌트의 state를 prop 변경만으로 되돌리지
   * 않음) — 그래서 저장 성공 시 이 필드로 서버가 계산한 최신 값을 클라이언트에 명시적으로 되돌려주고,
   * PlanEditor가 이 값으로 자신의 state를 덮어써야 한다(2026-08-06, 실제 경로 결과 미표시 버그 수정). */
  days?: CourseDay[];
}

export async function savePlanAction(
  planId: string,
  projectId: string,
  _prevState: SavePlanFormState,
  formData: FormData,
): Promise<SavePlanFormState> {
  const productName = String(formData.get("productName") ?? "").trim();
  const conceptText = String(formData.get("conceptText") ?? "").trim();
  const memo = String(formData.get("memo") ?? "");
  const kpiMemo = String(formData.get("kpiMemo") ?? "");
  const courseJson = String(formData.get("courseJson") ?? "");
  const operationChecklistJson = String(formData.get("operationChecklistJson") ?? "");
  const risksJson = String(formData.get("risksJson") ?? "");
  const kpisJson = String(formData.get("kpisJson") ?? "");

  await requireProjectAccess(projectId);

  if (!productName) {
    return { success: false, message: "상품명을 입력해주세요." };
  }

  let course: { days: CourseDay[] };
  let operationChecklist: unknown;
  let risks: unknown;
  let kpis: unknown;
  try {
    course = JSON.parse(courseJson);
    operationChecklist = JSON.parse(operationChecklistJson);
    risks = JSON.parse(risksJson);
    kpis = JSON.parse(kpisJson);
  } catch {
    return { success: false, message: "실행안 데이터 형식이 올바르지 않습니다." };
  }

  // 실제 도로 경로(Phase 12, 2026-08-05): PRIVATE_VEHICLE 실행안만, 저장 직전에 이전에 저장된 course와
  // 인접 구간(POI 쌍)을 비교해 바뀐 구간만 카카오를 새로 호출한다(순서 변경·추가·삭제로 실제로 바뀐
  // 구간만 재호출, 시간·체류시간만 바뀐 저장은 재호출 없음). 조회·enrichment가 실패해도 course는 이미
  // 클라이언트가 보낸 haversine 기반 값이므로 저장 자체는 항상 진행한다.
  try {
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      include: { input: true, selectedPlan: true },
    });
    const transport = existing?.input?.transport as TransportCode | undefined;
    if (transport) {
      const previousDays = (existing?.selectedPlan?.course as { days: CourseDay[] } | undefined)?.days ?? null;
      course = { days: await enrichCourseDaysWithRealRoutes(course.days, transport, previousDays) };
    }
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", source: "savePlanAction", message: "route enrichment failed, saving haversine estimates as-is", reason: e instanceof Error ? e.message : "unknown" }),
    );
  }

  await prisma.selectedPlan.update({
    where: { id: planId },
    data: {
      productName,
      conceptText,
      memo,
      kpiMemo,
      course: course as unknown as object,
      operationChecklist: operationChecklist as object,
      risks: risks as object,
      kpis: kpis as object,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: "PLANNED" } });

  revalidatePath(`/projects/${projectId}/plan`);
  return { success: true, savedAt: new Date().toISOString(), days: course.days };
}

export async function backToAnalysisAction(projectId: string) {
  await requireProjectAccess(projectId);
  redirect(`/projects/${projectId}/analysis`);
}

/** 실행안 편집기의 "장소 추가" 검색창에서 호출한다. 해당 프로젝트의 지역으로 한정해 POI를 찾는다. */
export async function searchAvailablePoisAction(projectId: string, regionId: string, query: string): Promise<PoiDetail[]> {
  await requireProjectAccess(projectId);
  return searchPoisInRegion(regionId, query);
}

/**
 * Phase 5-C UI가 호출할 홍보자료 서버 액션. 지역·역할·국적·전략·Evidence 등 생성 입력은 클라이언트에서
 * 받지 않고 서비스 계층이 projectId로 DB를 다시 조회해 구성한다 — 여기서는 projectId와 제어값
 * (overwrite)만 전달한다. 저장에 성공했을 때만 실행안 페이지를 재검증한다.
 */
export async function generatePromoContentAction(
  projectId: string,
  options: { overwrite?: boolean } = {},
): Promise<GeneratePromoContentResult> {
  await requireProjectAccess(projectId);
  const result = await generatePromoContentForProject(projectId, options);
  if (result.ok) revalidatePath(`/projects/${projectId}/plan`);
  return result;
}

export async function getPromoContentAction(projectId: string): Promise<GetPromoContentResult> {
  await requireProjectAccess(projectId);
  return getPromoContentForProject(projectId);
}

/** 사용자가 편집한 홍보자료를 저장한다. content는 클라이언트가 보낸 unknown 값 그대로 넘기고,
 * 런타임 검증은 서비스 계층(savePromoContentForProject)에서만 수행한다. */
export async function savePromoContentAction(projectId: string, content: unknown): Promise<SavePromoContentResult> {
  await requireProjectAccess(projectId);
  const result = await savePromoContentForProject(projectId, content);
  if (result.ok) revalidatePath(`/projects/${projectId}/plan`);
  return result;
}
