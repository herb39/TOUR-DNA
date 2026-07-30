"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { searchPoisInRegion } from "@/lib/services/poiDetails";
import type { PoiDetail } from "@/lib/domain/planBuilder";
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

  let course: unknown;
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

  await prisma.selectedPlan.update({
    where: { id: planId },
    data: {
      productName,
      conceptText,
      memo,
      kpiMemo,
      course: course as object,
      operationChecklist: operationChecklist as object,
      risks: risks as object,
      kpis: kpis as object,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: "PLANNED" } });

  revalidatePath(`/projects/${projectId}/plan`);
  return { success: true, savedAt: new Date().toISOString() };
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
