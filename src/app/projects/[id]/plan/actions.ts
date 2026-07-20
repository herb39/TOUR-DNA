"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

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

  if (!productName) {
    return { success: false, message: "상품명을 입력해주세요." };
  }

  let course: unknown;
  try {
    course = JSON.parse(courseJson);
  } catch {
    return { success: false, message: "코스 데이터 형식이 올바르지 않습니다." };
  }

  await prisma.selectedPlan.update({
    where: { id: planId },
    data: { productName, conceptText, memo, kpiMemo, course: course as object },
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: "PLANNED" } });

  revalidatePath(`/projects/${projectId}/plan`);
  return { success: true, savedAt: new Date().toISOString() };
}

export async function backToAnalysisAction(projectId: string) {
  redirect(`/projects/${projectId}/analysis`);
}
