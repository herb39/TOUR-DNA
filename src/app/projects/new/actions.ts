"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { projectInputSchema } from "@/lib/validation/project-input.schema";
import { runAnalysisForProject } from "@/lib/services/analyzeProject";
import { hashProjectPassword, validateProjectPasswordInput } from "@/lib/services/projectAccess";

export interface CreateProjectFormState {
  success: boolean;
  errors: Record<string, string[]>;
  submittedValues?: Record<string, unknown>;
}

function splitThemes(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function createProjectAction(
  _prevState: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  const raw = {
    projectName: formData.get("projectName"),
    role: formData.get("role"),
    sidoCode: formData.get("sidoCode"),
    sigunguCode: formData.get("sigunguCode"),
    travelYear: Number(formData.get("travelYear")),
    travelMonth: Number(formData.get("travelMonth")),
    nationality: formData.get("nationality"),
    ageGroups: formData.getAll("ageGroups"),
    companionType: formData.get("companionType"),
    primaryGoal: formData.get("primaryGoal"),
    secondaryGoal: formData.get("secondaryGoal") || null,
    duration: formData.get("duration"),
    budgetLevel: formData.get("budgetLevel"),
    transport: formData.get("transport"),
    groupType: formData.get("groupType"),
    preferredThemes: splitThemes(formData.get("preferredThemes")),
    excludedThemes: splitThemes(formData.get("excludedThemes")),
    memo: formData.get("memo") || undefined,
  };

  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, submittedValues: raw };
  }

  // 비밀번호 보호는 입력 조건(projectInputSchema)과 무관한 별도 설정이라 여기서 직접 검증한다.
  // 빈 값이면 공개 프로젝트로 만든다(기존 프로젝트와 동일한 기본값 — 하위 호환).
  const passwordInput = formData.get("password");
  const password = typeof passwordInput === "string" ? passwordInput : "";
  let passwordHash: string | null = null;
  if (password.length > 0) {
    const passwordError = validateProjectPasswordInput(password);
    if (passwordError) {
      return { success: false, errors: { password: [passwordError] }, submittedValues: raw };
    }
    passwordHash = hashProjectPassword(password);
  }

  const region = await prisma.region.findUnique({ where: { code: parsed.data.sigunguCode } });
  if (!region) {
    return {
      success: false,
      errors: { sigunguCode: ["선택한 지역을 찾을 수 없습니다. 다시 선택해주세요."] },
      submittedValues: raw,
    };
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.projectName,
      role: parsed.data.role,
      regionId: region.id,
      sidoCode: parsed.data.sidoCode,
      sigunguCode: parsed.data.sigunguCode,
      travelYear: parsed.data.travelYear,
      travelMonth: parsed.data.travelMonth,
      passwordHash,
      input: {
        create: {
          nationality: parsed.data.nationality,
          ageGroups: parsed.data.ageGroups,
          companionType: parsed.data.companionType,
          primaryGoal: parsed.data.primaryGoal,
          secondaryGoal: parsed.data.secondaryGoal ?? null,
          duration: parsed.data.duration,
          budgetLevel: parsed.data.budgetLevel,
          transport: parsed.data.transport,
          groupType: parsed.data.groupType,
          preferredThemes: parsed.data.preferredThemes,
          excludedThemes: parsed.data.excludedThemes,
          memo: parsed.data.memo ?? null,
        },
      },
    },
  });

  try {
    await runAnalysisForProject(project.id);
  } catch (e) {
    return {
      success: false,
      errors: {
        _root: [
          e instanceof Error
            ? `분석 계산 중 오류가 발생했습니다: ${e.message}`
            : "분석 계산 중 알 수 없는 오류가 발생했습니다.",
        ],
      },
    };
  }

  redirect(`/projects/${project.id}/analysis`);
}
