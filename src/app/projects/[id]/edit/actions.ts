"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { projectInputSchema } from "@/lib/validation/project-input.schema";
import { computeProjectAnalysis, persistProjectAnalysis } from "@/lib/services/analyzeProject";
import { assertProjectAccessible, projectAccessCookieName } from "@/lib/services/projectAccess";
import {
  buildStructuredProjectPreferences,
  themeCodeForLabel,
  themeLabelsFromCodes,
} from "@/lib/validation/project-preferences";
import { CONTENT_THEME_CODES } from "@/lib/validation/codes";

export interface UpdateProjectFormState {
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

function selectedThemeCodes(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("preferredThemes")
        .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
        .map((value) => value.trim())
        .map((value) => (CONTENT_THEME_CODES.includes(value as (typeof CONTENT_THEME_CODES)[number]) ? value : themeCodeForLabel(value)))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

/** 낙관적 동시성 확인 실패를 일반 오류와 구분해 안내 문구를 다르게 주기 위한 표식 에러. */
class ConcurrentModificationError extends Error {}

/**
 * 기존 프로젝트의 조건을 수정하고 재분석한다(Phase 6, 2026-08-01 도입, 2026-08-02 정책 단순화).
 *
 * 정책(단순화): 재분석에 성공하면 기존 분석·선택 전략·실행안·홍보자료를 전부 새 결과로 교체한다.
 * 운영 DB의 현재 데이터가 전부 테스트 데이터라 기존 산출물을 보존할 필요가 없다는 판단에 따라, 이전의
 * "실행안은 남기고 다음 전략 선택 때만 교체" 방식을 버리고 "재분석 = 이 프로젝트의 분석 이후 산출물을
 * 전부 새로 만든다"로 단순화했다.
 *
 * 안전 정책:
 * - 분석 계산(`computeProjectAnalysis`)은 DB에 아무것도 쓰지 않으므로, 이 단계에서 실패하면 기존
 *   AnalysisResult/StrategyResult/SelectedPlan(실행안·홍보자료 포함)이 전혀 손상되지 않는다.
 * - 계산이 성공한 뒤에만 `prisma.$transaction`으로 Project/ProjectInput 갱신, 기존 SelectedPlan 삭제,
 *   기존 분석 교체를 원자적으로 실행한다 — 트랜잭션 중간에 실패하면 전체가 롤백되어 이전 상태로 남는다.
 * - `SelectedPlan`(실행안 + `promoContent`에 저장된 홍보자료)은 트랜잭션 안에서 명시적으로 삭제한다.
 *   `Project.selectedStrategyResultId`도 null로 되돌린다(예전 전략은 사라지므로) — 재분석 후 사용자는
 *   분석 화면에서 새 전략 3안 중 하나를 다시 선택해야 한다.
 * - 실행안·홍보자료가 있는 프로젝트는 클라이언트 폼에서 "삭제된다"는 경고를 명확히 보여주고
 *   `acknowledgeOverwrite` 체크를 요구한다(`ProjectEditForm.tsx`) — 서버에서도 동일 조건을 다시
 *   검사해, 클라이언트를 우회한 요청도 확인 없이 통과하지 못하게 한다.
 * - `projectUpdatedAt`(폼 렌더 시점의 `Project.updatedAt`)을 낙관적 동시성 토큰으로 사용해, 같은
 *   프로젝트를 동시에(다른 탭 등) 재분석하려는 두 번째 요청은 첫 번째 요청이 이미 갱신한 뒤이므로
 *   `updateMany`가 0건을 반환해 안전하게 거부된다(중복 제출/동시 재분석 방지).
 */
export async function updateProjectAndReanalyzeAction(
  projectId: string,
  _prevState: UpdateProjectFormState,
  formData: FormData,
): Promise<UpdateProjectFormState> {
  const cookieStore = await cookies();
  await assertProjectAccessible(projectId, cookieStore.get(projectAccessCookieName(projectId))?.value);

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
    preferredThemes: selectedThemeCodes(formData),
    travelConditions: formData
      .getAll("travelConditions")
      .filter((value): value is string => typeof value === "string"),
    excludedThemes: splitThemes(formData.get("excludedThemes")),
    memo: formData.get("memo") || undefined,
  };

  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]>, submittedValues: raw };
  }

  const preferredThemeLabels = themeLabelsFromCodes(parsed.data.preferredThemes);
  const storedPreferences = buildStructuredProjectPreferences(
    parsed.data.preferredThemes,
    parsed.data.travelConditions,
  );

  const region = await prisma.region.findUnique({ where: { code: parsed.data.sigunguCode } });
  if (!region) {
    return {
      success: false,
      errors: { sigunguCode: ["선택한 지역을 찾을 수 없습니다. 다시 선택해주세요."] },
      submittedValues: raw,
    };
  }

  const current = await prisma.project.findUnique({
    where: { id: projectId },
    select: { updatedAt: true, selectedPlan: { select: { id: true } } },
  });
  if (!current) {
    return { success: false, errors: { _root: ["프로젝트를 찾을 수 없습니다."] } };
  }

  // 실행안(및 그 안에 저장된 홍보자료)이 있는 프로젝트는 재분석 시 그것들이 삭제된다는 사실을 사용자가
  // 명확히 확인한 뒤에만 진행한다(폼의 체크박스, 서버에서 재검증).
  if (current.selectedPlan) {
    const acknowledged = formData.get("acknowledgeOverwrite");
    if (acknowledged !== "on") {
      return {
        success: false,
        errors: {
          _root: [
            "이 프로젝트에는 이미 실행안(과 홍보자료)이 있습니다. 재분석하면 삭제된다는 점을 확인했다는 체크를 완료한 뒤 다시 시도해주세요.",
          ],
        },
        submittedValues: raw,
      };
    }
  }

  const expectedUpdatedAtRaw = formData.get("projectUpdatedAt");
  const expectedUpdatedAt =
    typeof expectedUpdatedAtRaw === "string" && expectedUpdatedAtRaw.length > 0
      ? new Date(expectedUpdatedAtRaw)
      : null;
  if (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) {
    return {
      success: false,
      errors: { _root: ["요청 정보가 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."] },
      submittedValues: raw,
    };
  }

  // 1) 계산은 DB 쓰기 없이 먼저 수행한다 — 여기서 실패하면 아래 트랜잭션 자체가 시작되지 않으므로
  // 기존 분석·실행안·홍보자료는 그대로 보존된다.
  let computed;
  try {
    computed = await computeProjectAnalysis({
      regionCode: region.code,
      role: parsed.data.role,
      nationality: parsed.data.nationality,
      travelYear: parsed.data.travelYear,
      travelMonth: parsed.data.travelMonth,
      ageGroups: parsed.data.ageGroups,
      companionType: parsed.data.companionType,
      primaryGoal: parsed.data.primaryGoal,
      secondaryGoal: parsed.data.secondaryGoal ?? null,
      duration: parsed.data.duration,
      budgetLevel: parsed.data.budgetLevel,
      transport: parsed.data.transport,
      groupType: parsed.data.groupType,
      preferredThemes: preferredThemeLabels,
      excludedThemes: parsed.data.excludedThemes,
    });
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
      submittedValues: raw,
    };
  }

  // 2) 계산이 성공했을 때만 실제 교체를 트랜잭션으로 원자적으로 반영한다.
  try {
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.project.updateMany({
        where: { id: projectId, updatedAt: expectedUpdatedAt },
        data: {
          name: parsed.data.projectName,
          role: parsed.data.role,
          regionId: region.id,
          sidoCode: parsed.data.sidoCode,
          sigunguCode: parsed.data.sigunguCode,
          travelYear: parsed.data.travelYear,
          travelMonth: parsed.data.travelMonth,
          // 기존 전략은 재분석으로 곧 사라지므로, 존재하지 않는 전략을 계속 가리키지 않도록 초기화한다.
          selectedStrategyResultId: null,
          status: "ANALYZED",
        },
      });
      if (updateResult.count === 0) {
        throw new ConcurrentModificationError();
      }

      // 기존 실행안(및 그 안의 홍보자료)은 재분석 정책상 보존하지 않는다 — 새 분석 결과로 완전히
      // 교체한다. deleteMany는 행이 없어도(실행안 없는 프로젝트) 안전하게 0건 삭제로 끝난다.
      await tx.selectedPlan.deleteMany({ where: { projectId } });

      await tx.projectInput.update({
        where: { projectId },
        data: {
          nationality: parsed.data.nationality,
          ageGroups: parsed.data.ageGroups,
          companionType: parsed.data.companionType,
          primaryGoal: parsed.data.primaryGoal,
          secondaryGoal: parsed.data.secondaryGoal ?? null,
          duration: parsed.data.duration,
          budgetLevel: parsed.data.budgetLevel,
          transport: parsed.data.transport,
          groupType: parsed.data.groupType,
          preferredThemes: storedPreferences,
          excludedThemes: parsed.data.excludedThemes,
          memo: parsed.data.memo ?? null,
        },
      });

      await persistProjectAnalysis(tx, projectId, computed);
    });
  } catch (e) {
    if (e instanceof ConcurrentModificationError) {
      return {
        success: false,
        errors: {
          _root: ["다른 요청이 먼저 이 프로젝트를 수정했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요."],
        },
        submittedValues: raw,
      };
    }
    return {
      success: false,
      errors: {
        _root: [
          e instanceof Error ? `저장 중 오류가 발생했습니다: ${e.message}` : "저장 중 알 수 없는 오류가 발생했습니다.",
        ],
      },
      submittedValues: raw,
    };
  }

  redirect(`/projects/${projectId}/analysis`);
}
