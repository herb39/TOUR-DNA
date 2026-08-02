// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 6(조건 수정 및 안전한 재분석) — `updateProjectAndReanalyzeAction`을 실제 함수로 호출해
 * 검증한다. `projectAccess.ts`의 실제 게이트 로직은 모킹하지 않는다(다른 액션 테스트와 동일한 원칙 —
 * "직접 호출로 잠금을 우회할 수 없다"를 실제로 확인하기 위함). next/headers·next/navigation·@/lib/db·
 * analyzeProject만 모킹한다.
 */

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGet(name) }),
}));

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
const projectFindUnique = vi.fn();
const txProjectUpdateMany = vi.fn();
const txProjectInputUpdate = vi.fn();
const txSelectedPlanDeleteMany = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    region: { findUnique: (...args: unknown[]) => regionFindUnique(...args) },
    project: { findUnique: (...args: unknown[]) => projectFindUnique(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

const computeProjectAnalysis = vi.fn();
const persistProjectAnalysis = vi.fn();
vi.mock("@/lib/services/analyzeProject", () => ({
  computeProjectAnalysis: (...args: unknown[]) => computeProjectAnalysis(...args),
  persistProjectAnalysis: (...args: unknown[]) => persistProjectAnalysis(...args),
}));

import { updateProjectAndReanalyzeAction, type UpdateProjectFormState } from "@/app/projects/[id]/edit/actions";

const PROJECT_UPDATED_AT = new Date("2026-08-01T00:00:00.000Z");

function validFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    projectName: "수정된 프로젝트",
    role: "TRAVEL_AGENCY",
    sidoCode: "SIDO_GANGWON",
    sigunguCode: "SGG_GANGNEUNG",
    travelYear: "2026",
    travelMonth: "10",
    nationality: "DOMESTIC",
    companionType: "COMPANION_SOLO",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "MIXED",
    groupType: "FIT",
    projectUpdatedAt: PROJECT_UPDATED_AT.toISOString(),
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  fd.append("ageGroups", "AGE_20S");
  return fd;
}

const initialState: UpdateProjectFormState = { success: true, errors: {} };

const txClient = {
  project: { updateMany: (...args: unknown[]) => txProjectUpdateMany(...args) },
  projectInput: { update: (...args: unknown[]) => txProjectInputUpdate(...args) },
  selectedPlan: { deleteMany: (...args: unknown[]) => txSelectedPlanDeleteMany(...args) },
};

beforeEach(() => {
  cookieGet.mockReset();
  regionFindUnique.mockReset();
  projectFindUnique.mockReset();
  txProjectUpdateMany.mockReset();
  txProjectInputUpdate.mockReset();
  txSelectedPlanDeleteMany.mockReset();
  transactionMock.mockReset();
  computeProjectAnalysis.mockReset();
  persistProjectAnalysis.mockReset();

  // 공개 프로젝트(비밀번호 없음) + 실행안 없음이 기본값 — 각 테스트가 필요에 맞게 덮어쓴다.
  cookieGet.mockReturnValue(undefined);
  projectFindUnique.mockResolvedValue({
    passwordHash: null,
    updatedAt: PROJECT_UPDATED_AT,
    selectedPlan: null,
  });
  regionFindUnique.mockResolvedValue({ id: "region-1", code: "SGG_GANGNEUNG" });
  computeProjectAnalysis.mockResolvedValue({ dna: {}, dataVersion: "v1", analysisKey: "key1", strategies: [] });
  persistProjectAnalysis.mockResolvedValue("analysis-result-1");
  transactionMock.mockImplementation(async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient));
  txProjectUpdateMany.mockResolvedValue({ count: 1 });
  txProjectInputUpdate.mockResolvedValue({});
  txSelectedPlanDeleteMany.mockResolvedValue({ count: 0 });
});

describe("updateProjectAndReanalyzeAction — 분석만 있는 프로젝트", () => {
  it("실행안이 없으면 확인 체크 없이 재분석이 성공하고 분석 화면으로 리디렉션한다", async () => {
    await expect(updateProjectAndReanalyzeAction("proj-1", initialState, validFormData())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(computeProjectAnalysis).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txProjectUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "proj-1", updatedAt: PROJECT_UPDATED_AT },
        data: expect.objectContaining({ selectedStrategyResultId: null, status: "ANALYZED" }),
      }),
    );
    expect(txProjectInputUpdate).toHaveBeenCalledTimes(1);
    expect(persistProjectAnalysis).toHaveBeenCalledWith(txClient, "proj-1", expect.any(Object));
    // 실행안이 없던 프로젝트도 동일하게 deleteMany를 호출한다(0건 삭제로 안전하게 끝난다).
    expect(txSelectedPlanDeleteMany).toHaveBeenCalledWith({ where: { projectId: "proj-1" } });
  });

  it("입력값이 기존과 동일해도(변경 없음) 동일한 절차로 재분석을 수행한다", async () => {
    await expect(
      updateProjectAndReanalyzeAction("proj-1", initialState, validFormData({ projectName: "수정된 프로젝트" })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateProjectAndReanalyzeAction — 실행안·홍보자료가 있는 프로젝트", () => {
  beforeEach(() => {
    projectFindUnique.mockResolvedValue({
      passwordHash: null,
      updatedAt: PROJECT_UPDATED_AT,
      selectedPlan: { id: "plan-1" },
    });
  });

  it("확인 체크(acknowledgeOverwrite) 없이 제출하면 거부되고 아무것도 계산·저장하지 않는다", async () => {
    const result = await updateProjectAndReanalyzeAction("proj-1", initialState, validFormData());

    expect(result.success).toBe(false);
    expect(result.errors._root?.[0]).toContain("실행안");
    expect(computeProjectAnalysis).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("확인 체크와 함께 제출하면 정상적으로 재분석이 진행되고 기존 SelectedPlan(실행안·홍보자료)이 삭제된다", async () => {
    await expect(
      updateProjectAndReanalyzeAction(
        "proj-1",
        initialState,
        validFormData({ acknowledgeOverwrite: "on" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txProjectUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selectedStrategyResultId: null }) }),
    );
    expect(txSelectedPlanDeleteMany).toHaveBeenCalledWith({ where: { projectId: "proj-1" } });
  });
});

describe("updateProjectAndReanalyzeAction — 유효하지 않은 입력", () => {
  it("필수 필드가 비어 있으면 필드 오류를 반환하고 DB를 건드리지 않는다", async () => {
    const fd = validFormData();
    fd.delete("ageGroups"); // ageGroups는 1개 이상 필요

    const result = await updateProjectAndReanalyzeAction("proj-1", initialState, fd);

    expect(result.success).toBe(false);
    expect(result.errors.ageGroups?.[0]).toBeTruthy();
    expect(computeProjectAnalysis).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("존재하지 않는 지역 코드는 sigunguCode 필드 오류를 반환한다", async () => {
    regionFindUnique.mockResolvedValue(null);

    const result = await updateProjectAndReanalyzeAction("proj-1", initialState, validFormData());

    expect(result.success).toBe(false);
    expect(result.errors.sigunguCode?.[0]).toBeTruthy();
    expect(computeProjectAnalysis).not.toHaveBeenCalled();
  });
});

describe("updateProjectAndReanalyzeAction — 분석 계산 실패", () => {
  it("계산이 실패하면 트랜잭션을 시작하지 않고 오류만 반환한다(기존 분석 보존)", async () => {
    computeProjectAnalysis.mockRejectedValue(new Error("외부 데이터 조회 실패"));

    const result = await updateProjectAndReanalyzeAction("proj-1", initialState, validFormData());

    expect(result.success).toBe(false);
    expect(result.errors._root?.[0]).toContain("외부 데이터 조회 실패");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(persistProjectAnalysis).not.toHaveBeenCalled();
  });
});

describe("updateProjectAndReanalyzeAction — 중복 제출·동시 재분석 방지", () => {
  it("트랜잭션 도중 updatedAt이 이미 바뀌어 있으면(동시 수정) 0건 갱신으로 안전하게 거부된다", async () => {
    txProjectUpdateMany.mockResolvedValue({ count: 0 });

    const result = await updateProjectAndReanalyzeAction("proj-1", initialState, validFormData());

    expect(result.success).toBe(false);
    expect(result.errors._root?.[0]).toContain("다른 요청");
    // selectedPlan 삭제·projectInput.update·persistProjectAnalysis는 모두 project.updateMany 이후
    // 단계이므로 호출되지 않는다(기존 데이터 전체 보존).
    expect(txSelectedPlanDeleteMany).not.toHaveBeenCalled();
    expect(txProjectInputUpdate).not.toHaveBeenCalled();
    expect(persistProjectAnalysis).not.toHaveBeenCalled();
  });

  it("요청 정보(projectUpdatedAt)가 없으면 재분석을 진행하지 않는다", async () => {
    const fd = validFormData();
    fd.delete("projectUpdatedAt");

    const result = await updateProjectAndReanalyzeAction("proj-1", initialState, fd);

    expect(result.success).toBe(false);
    expect(computeProjectAnalysis).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("updateProjectAndReanalyzeAction — 비밀번호 보호 프로젝트", () => {
  it("잠긴 프로젝트는 쿠키 없이 호출하면 계산·저장 없이 거부된다", async () => {
    const { hashProjectPassword } = await import("@/lib/services/projectAccess");
    projectFindUnique.mockImplementation(() => {
      // getProjectAccessStatus(select: {passwordHash: true})와 이 액션의 자체 조회(select 없음)를
      // 하나의 mock으로 함께 처리한다 — 항상 두 조회에 필요한 필드를 모두 담은 객체를 반환한다.
      return Promise.resolve({
        passwordHash: hashProjectPassword("비밀번호123"),
        updatedAt: PROJECT_UPDATED_AT,
        selectedPlan: null,
      });
    });

    await expect(updateProjectAndReanalyzeAction("proj-1", initialState, validFormData())).rejects.toThrow(
      "비밀번호 확인이 필요합니다",
    );
    expect(computeProjectAnalysis).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("잠금 해제 쿠키가 있으면 정상적으로 재분석까지 진행된다", async () => {
    const { hashProjectPassword, createProjectAccessCookieValue } = await import("@/lib/services/projectAccess");
    process.env.PROJECT_ACCESS_SECRET = "test-secret-key";
    const hash = hashProjectPassword("비밀번호123");
    const session = createProjectAccessCookieValue("proj-1", hash);
    cookieGet.mockReturnValue({ value: session!.value });
    projectFindUnique.mockResolvedValue({ passwordHash: hash, updatedAt: PROJECT_UPDATED_AT, selectedPlan: null });

    await expect(updateProjectAndReanalyzeAction("proj-1", initialState, validFormData())).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
