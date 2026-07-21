"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { searchPoisInRegion } from "@/lib/services/poiDetails";
import type { PoiDetail } from "@/lib/domain/planBuilder";

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
  redirect(`/projects/${projectId}/analysis`);
}

/** 실행안 편집기의 "장소 추가" 검색창에서 호출한다. 해당 프로젝트의 지역으로 한정해 POI를 찾는다. */
export async function searchAvailablePoisAction(regionId: string, query: string): Promise<PoiDetail[]> {
  return searchPoisInRegion(regionId, query);
}
