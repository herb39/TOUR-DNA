"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  buildFestivalAnchorConfirmation,
  type FestivalAnchorActionState,
  type FestivalAnchorConfirmationInput,
} from "@/lib/domain/festivalAnchorProject";
import { assertProjectAccessible, projectAccessCookieName } from "@/lib/services/projectAccess";
import { fetchFestivalAnchorCandidates } from "@/lib/services/festivalAnchorService";
import { deleteProjectAnchor, saveProjectAnchor } from "@/lib/services/projectAnchorService";

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseExpectedUpdatedAt(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "프로젝트 Anchor 작업을 처리하지 못했습니다.";
}

export async function saveFestivalAnchorAction(
  projectId: string,
  _previousState: FestivalAnchorActionState,
  formData: FormData,
): Promise<FestivalAnchorActionState> {
  const cookieStore = await cookies();
  try {
    await assertProjectAccessible(projectId, cookieStore.get(projectAccessCookieName(projectId))?.value);
  } catch (error) {
    return { success: false, message: errorMessage(error) };
  }

  const expectedProjectUpdatedAt = parseExpectedUpdatedAt(formValue(formData, "expectedProjectUpdatedAt"));
  if (!expectedProjectUpdatedAt) return { success: false, message: "화면이 오래되어 다시 불러와야 합니다." };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      updatedAt: true,
      travelYear: true,
      travelMonth: true,
      region: { select: { code: true } },
      input: { select: { duration: true } },
    },
  });
  if (!project || !project.input) return { success: false, message: "프로젝트 조건을 찾을 수 없습니다." };

  const lookup = await fetchFestivalAnchorCandidates({
    regionCode: project.region.code,
    travelYear: project.travelYear,
    travelMonth: project.travelMonth,
  });
  if (lookup.status !== "AVAILABLE") {
    return { success: false, message: "공식 행사정보를 다시 확인하지 못해 Anchor를 확정하지 않았습니다." };
  }

  const candidateId = formValue(formData, "candidateId");
  const candidate = lookup.candidates.find((item) => item.id === candidateId);
  if (!candidate) return { success: false, message: "선택한 공식 행사 후보를 다시 확인해주세요." };

  const input: FestivalAnchorConfirmationInput = {
    candidateId,
    plannedDate: formValue(formData, "plannedDate"),
    plannedDayIndex: formValue(formData, "plannedDayIndex"),
    timeStatus: formValue(formData, "timeStatus"),
    timeSlot: formValue(formData, "timeSlot") || null,
    timeStart: formValue(formData, "timeStart") || null,
    timeEnd: formValue(formData, "timeEnd") || null,
  };
  const confirmation = buildFestivalAnchorConfirmation({
    candidate,
    input,
    regionCode: project.region.code,
    travelYear: project.travelYear,
    travelMonth: project.travelMonth,
    duration: project.input.duration,
    provenance: lookup.provenance,
  });
  if (!confirmation.ok) return { success: false, message: confirmation.message };

  const result = await saveProjectAnchor({ projectId, expectedProjectUpdatedAt, confirmation: confirmation.value });
  if (!result.ok) return { success: false, message: result.message };

  revalidatePath(`/projects/${projectId}/analysis`);
  revalidatePath(`/projects/${projectId}/plan`);
  redirect(`/projects/${projectId}/analysis`);
}

export async function deleteFestivalAnchorAction(
  projectId: string,
  _previousState: FestivalAnchorActionState,
  formData: FormData,
): Promise<FestivalAnchorActionState> {
  const cookieStore = await cookies();
  try {
    await assertProjectAccessible(projectId, cookieStore.get(projectAccessCookieName(projectId))?.value);
  } catch (error) {
    return { success: false, message: errorMessage(error) };
  }

  const expectedProjectUpdatedAt = parseExpectedUpdatedAt(formValue(formData, "expectedProjectUpdatedAt"));
  if (!expectedProjectUpdatedAt) return { success: false, message: "화면이 오래되어 다시 불러와야 합니다." };

  const result = await deleteProjectAnchor({ projectId, expectedProjectUpdatedAt });
  if (!result.ok) return { success: false, message: result.message };

  revalidatePath(`/projects/${projectId}/analysis`);
  revalidatePath(`/projects/${projectId}/plan`);
  redirect(`/projects/${projectId}/analysis`);
}
