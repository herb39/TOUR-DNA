import { z } from "zod";
import {
  AGE_GROUP_CODES,
  BUDGET_LEVEL_CODES,
  COMPANION_TYPE_CODES,
  DURATION_CODES,
  GROUP_TYPE_CODES,
  NATIONALITY_CODES,
  PRIMARY_GOAL_CODES,
  ROLE_CODES,
  TRANSPORT_CODES,
} from "./codes";

const currentYear = 2026;

export const projectInputSchema = z
  .object({
    projectName: z
      .string({ error: "프로젝트명을 입력해주세요." })
      .trim()
      .min(1, "프로젝트명을 입력해주세요.")
      .max(100, "프로젝트명은 100자 이내로 입력해주세요."),
    role: z.enum(ROLE_CODES, { error: "역할을 선택해주세요." }),
    sidoCode: z.string().trim().min(1, "시·도를 선택해주세요."),
    sigunguCode: z.string().trim().min(1, "시·군·구를 선택해주세요."),
    travelYear: z
      .number({ error: "여행 연도를 선택해주세요." })
      .int()
      .min(currentYear - 1, `여행 연도는 ${currentYear - 1}년 이후여야 합니다.`)
      .max(currentYear + 2, `여행 연도는 ${currentYear + 2}년 이전이어야 합니다.`),
    travelMonth: z
      .number({ error: "여행 월을 선택해주세요." })
      .int()
      .min(1, "여행 월은 1~12 사이여야 합니다.")
      .max(12, "여행 월은 1~12 사이여야 합니다."),
    nationality: z.enum(NATIONALITY_CODES, { error: "내/외국인 여부를 선택해주세요." }),
    ageGroups: z
      .array(z.enum(AGE_GROUP_CODES))
      .min(1, "연령대를 1개 이상 선택해주세요.")
      .max(6, "연령대 선택이 너무 많습니다."),
    companionType: z.enum(COMPANION_TYPE_CODES, { error: "동행 유형을 선택해주세요." }),
    primaryGoal: z.enum(PRIMARY_GOAL_CODES, { error: "주 목표를 선택해주세요." }),
    secondaryGoal: z.enum(PRIMARY_GOAL_CODES).nullable().optional(),
    duration: z.enum(DURATION_CODES, { error: "여행 기간을 선택해주세요." }),
    budgetLevel: z.enum(BUDGET_LEVEL_CODES, { error: "예산 수준을 선택해주세요." }),
    transport: z.enum(TRANSPORT_CODES, { error: "이동 수단을 선택해주세요." }),
    groupType: z.enum(GROUP_TYPE_CODES, { error: "그룹 규모를 선택해주세요." }),
    preferredThemes: z
      .array(z.string().trim().min(1).max(20))
      .max(5, "선호 테마는 5개 이내로 입력해주세요.")
      .default([]),
    excludedThemes: z
      .array(z.string().trim().min(1).max(20))
      .max(5, "제외 테마는 5개 이내로 입력해주세요.")
      .default([]),
    memo: z.string().trim().max(500, "메모는 500자 이내로 입력해주세요.").optional(),
  })
  .refine((data) => !data.secondaryGoal || data.secondaryGoal !== data.primaryGoal, {
    message: "보조 목표는 주 목표와 달라야 합니다.",
    path: ["secondaryGoal"],
  });

export type ProjectInputFormValues = z.infer<typeof projectInputSchema>;
