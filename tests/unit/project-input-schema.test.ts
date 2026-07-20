import { describe, expect, it } from "vitest";
import { projectInputSchema } from "@/lib/validation/project-input.schema";

function validInput() {
  return {
    projectName: "대전 9월 소규모 여행 기획",
    role: "TRAVEL_AGENCY",
    sidoCode: "SIDO_DAEJEON",
    sigunguCode: "SGG_DAEJEON",
    travelYear: 2026,
    travelMonth: 9,
    nationality: "DOMESTIC",
    ageGroups: ["AGE_20S", "AGE_30S"],
    companionType: "COMPANION_FRIENDS",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: null,
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "PUBLIC_TRANSPORT",
    groupType: "SMALL_10_20",
    preferredThemes: [],
    excludedThemes: [],
    memo: "",
  };
}

describe("projectInputSchema", () => {
  it("유효한 입력을 통과시킨다", () => {
    const result = projectInputSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("프로젝트명이 없으면 한국어 에러 메시지를 반환한다", () => {
    const result = projectInputSchema.safeParse({ ...validInput(), projectName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("프로젝트명"))).toBe(true);
    }
  });

  it("연령대를 하나도 선택하지 않으면 실패한다", () => {
    const result = projectInputSchema.safeParse({ ...validInput(), ageGroups: [] });
    expect(result.success).toBe(false);
  });

  it("여행 월이 범위를 벗어나면 실패한다", () => {
    const result = projectInputSchema.safeParse({ ...validInput(), travelMonth: 13 });
    expect(result.success).toBe(false);
  });

  it("보조 목표가 주 목표와 같으면 실패한다", () => {
    const result = projectInputSchema.safeParse({
      ...validInput(),
      secondaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    });
    expect(result.success).toBe(false);
  });

  it("잘못된 코드값을 가진 enum은 실패한다", () => {
    const result = projectInputSchema.safeParse({ ...validInput(), budgetLevel: "SUPER_HIGH" });
    expect(result.success).toBe(false);
  });
});
