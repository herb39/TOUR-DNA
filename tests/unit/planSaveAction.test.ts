// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getProjectAccessStatus = vi.fn();
const cookieGet = vi.fn();
const projectFindUnique = vi.fn();
const selectedPlanUpdate = vi.fn();
const projectUpdate = vi.fn();
const transaction = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGet(name) }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findUnique: (...args: unknown[]) => projectFindUnique(...args),
      update: (...args: unknown[]) => projectUpdate(...args),
    },
    selectedPlan: {
      update: (...args: unknown[]) => selectedPlanUpdate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

vi.mock("@/lib/services/projectAccess", () => ({
  assertProjectAccessible: vi.fn(),
  getProjectAccessStatus: (...args: unknown[]) => getProjectAccessStatus(...args),
  projectAccessCookieName: (projectId: string) => `access-${projectId}`,
}));

vi.mock("@/lib/services/route/courseRouteEnrichment", () => ({
  enrichCourseDaysWithRealRoutes: vi.fn(async (days: unknown) => days),
}));

vi.mock("@/lib/services/route/routeGeometryService", () => ({
  fetchCourseRouteGeometry: vi.fn(async () => []),
}));

vi.mock("@/lib/services/poiDetails", () => ({
  searchPoisInRegion: vi.fn(async () => []),
}));

vi.mock("@/lib/services/projectAnchorService", () => ({
  getProjectAnchor: vi.fn(),
}));

vi.mock("@/lib/domain/festivalAnchorCourse", () => ({
  findFestivalAnchorItems: vi.fn(() => []),
  validateFestivalAnchorCourseDays: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/services/promoContentService", () => ({
  generatePromoContentForProject: vi.fn(),
  getPromoContentForProject: vi.fn(),
  savePromoContentForProject: vi.fn(),
}));

import { savePlanAction } from "@/app/projects/[id]/plan/actions";

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    productName: "테스트 실행안",
    conceptText: "테스트 콘셉트",
    memo: "",
    kpiMemo: "",
    courseJson: JSON.stringify({ days: [{ dayIndex: 1, items: [] }] }),
    operationChecklistJson: JSON.stringify([]),
    risksJson: JSON.stringify([]),
    kpisJson: JSON.stringify([]),
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  getProjectAccessStatus.mockReset().mockResolvedValue({ kind: "PUBLIC" });
  cookieGet.mockReset().mockReturnValue(undefined);
  projectFindUnique.mockReset().mockResolvedValue({
    input: { transport: "PUBLIC_TRANSPORT" },
    selectedPlan: { course: { days: [] } },
  });
  selectedPlanUpdate.mockReset().mockResolvedValue({});
  projectUpdate.mockReset().mockResolvedValue({});
  transaction.mockReset().mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
  revalidatePath.mockReset();
});

describe("savePlanAction 오류 전달 계약", () => {
  it("정상 입력은 기존 success 계약으로 저장한다", async () => {
    const result = await savePlanAction("plan-1", "project-1", { success: false }, makeFormData());

    expect(result).toMatchObject({ success: true });
    expect(result.code).toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/projects/project-1/plan");
  });

  it("잠긴 프로젝트는 ACCESS_DENIED를 반환하고 transaction에 진입하지 않는다", async () => {
    getProjectAccessStatus.mockResolvedValueOnce({ kind: "LOCKED" });

    const result = await savePlanAction("plan-1", "project-1", { success: false }, makeFormData());

    expect(result).toEqual({
      success: false,
      code: "ACCESS_DENIED",
      message: "변경사항을 저장하지 못했습니다. 다시 시도해주세요.",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("course shape가 잘못되면 PAYLOAD_INVALID를 반환한다", async () => {
    const result = await savePlanAction(
      "plan-1",
      "project-1",
      { success: false },
      makeFormData({ courseJson: JSON.stringify({ days: null }) }),
    );

    expect(result).toMatchObject({ success: false, code: "PAYLOAD_INVALID" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("transaction의 record not found는 PLAN_NOT_FOUND로 제한한다", async () => {
    selectedPlanUpdate.mockRejectedValueOnce({ code: "P2025" });

    const result = await savePlanAction("plan-1", "project-1", { success: false }, makeFormData());

    expect(result).toMatchObject({ success: false, code: "PLAN_NOT_FOUND" });
    expect(result.message).toBe("변경사항을 저장하지 못했습니다. 다시 시도해주세요.");
  });

  it("기타 transaction 오류는 DB_TRANSACTION_FAILED로 제한한다", async () => {
    projectUpdate.mockRejectedValueOnce({ code: "P2002" });

    const result = await savePlanAction("plan-1", "project-1", { success: false }, makeFormData());

    expect(result).toMatchObject({ success: false, code: "DB_TRANSACTION_FAILED" });
  });

  it("access 조회 자체가 예외면 내부 정보를 제외한 UNEXPECTED_SAVE_ERROR를 반환한다", async () => {
    getProjectAccessStatus.mockRejectedValueOnce(new Error("internal database detail"));

    const result = await savePlanAction("plan-1", "project-1", { success: false }, makeFormData());

    expect(result).toEqual({
      success: false,
      code: "UNEXPECTED_SAVE_ERROR",
      message: "변경사항을 저장하지 못했습니다. 다시 시도해주세요.",
    });
    expect(result.message).not.toContain("internal");
    expect(transaction).not.toHaveBeenCalled();
  });
});
