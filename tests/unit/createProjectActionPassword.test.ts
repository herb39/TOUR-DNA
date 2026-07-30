// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeRedirectSignal extends Error {
  constructor(public to: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new FakeRedirectSignal(to);
  },
}));

const regionFindUnique = vi.fn();
const projectCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    region: { findUnique: (...args: unknown[]) => regionFindUnique(...args) },
    project: { create: (...args: unknown[]) => projectCreate(...args) },
  },
}));

const runAnalysisForProject = vi.fn();
vi.mock("@/lib/services/analyzeProject", () => ({
  runAnalysisForProject: (...args: unknown[]) => runAnalysisForProject(...args),
}));

import { createProjectAction, type CreateProjectFormState } from "@/app/projects/new/actions";
import { verifyProjectPasswordHash } from "@/lib/services/projectAccess";

function validFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    projectName: "테스트 프로젝트",
    role: "TRAVEL_AGENCY",
    sidoCode: "SIDO_GANGWON",
    sigunguCode: "SGG_GANGNEUNG",
    travelYear: "2026",
    travelMonth: "9",
    nationality: "DOMESTIC",
    companionType: "COMPANION_SOLO",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "MIXED",
    groupType: "FIT",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  fd.append("ageGroups", "AGE_20S");
  return fd;
}

const initialState: CreateProjectFormState = { success: true, errors: {} };

beforeEach(() => {
  regionFindUnique.mockReset();
  projectCreate.mockReset();
  runAnalysisForProject.mockReset();
  regionFindUnique.mockResolvedValue({ id: "region-1" });
  runAnalysisForProject.mockResolvedValue(undefined);
});

describe("createProjectAction — 프로젝트 비밀번호 보호 생성(원문 미저장)", () => {
  it("비밀번호를 입력하지 않으면 공개 프로젝트(passwordHash: null)로 생성된다", async () => {
    projectCreate.mockResolvedValue({ id: "proj-1" });
    await expect(createProjectAction(initialState, validFormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(projectCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passwordHash: null }) }),
    );
  });

  it("비밀번호를 입력하면 원문이 아니라 scrypt 해시가 저장된다", async () => {
    projectCreate.mockResolvedValue({ id: "proj-1" });
    await expect(
      createProjectAction(initialState, validFormData({ password: "보호비밀번호123" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    const savedData = projectCreate.mock.calls[0][0].data;
    expect(savedData.passwordHash).not.toBeNull();
    expect(savedData.passwordHash).not.toContain("보호비밀번호123");
    expect(verifyProjectPasswordHash("보호비밀번호123", savedData.passwordHash)).toBe(true);
  });

  it("너무 짧은 비밀번호는 프로젝트를 생성하지 않고 필드 오류를 반환한다", async () => {
    const result = await createProjectAction(initialState, validFormData({ password: "123" }));
    expect(result.success).toBe(false);
    expect(result.errors.password?.[0]).toBeTruthy();
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("실패 응답(errors)에는 원문 비밀번호가 그대로 남아있지 않다 — submittedValues에 password 필드를 포함하지 않는다", async () => {
    const result = await createProjectAction(initialState, validFormData({ password: "123" }));
    expect(JSON.stringify(result.submittedValues ?? {})).not.toContain("123");
  });
});
