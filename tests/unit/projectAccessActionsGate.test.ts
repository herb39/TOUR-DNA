// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "직접 API/Server Action 호출로 화면 잠금을 우회할 수 없다"를 실제 Server Action 함수를 호출해
 * 검증한다(Mock으로 판정 로직 자체를 우회하지 않고, 각 액션이 실제로 projectAccess의 공통 가드를
 * 통과시키는지 확인). next/headers·next/navigation·@/lib/db·promoContentService만 모킹한다.
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
const redirectMock = vi.fn((to: string) => {
  throw new FakeRedirectSignal(to);
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
}));

const projectFindUnique = vi.fn();
const strategyResultFindFirst = vi.fn();
const projectUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findUnique: (...args: unknown[]) => projectFindUnique(...args),
      update: (...args: unknown[]) => projectUpdate(...args),
    },
    strategyResult: { findFirst: (...args: unknown[]) => strategyResultFindFirst(...args) },
  },
}));

const getPromoContentForProject = vi.fn();
vi.mock("@/lib/services/promoContentService", () => ({
  generatePromoContentForProject: vi.fn(),
  getPromoContentForProject: (...args: unknown[]) => getPromoContentForProject(...args),
  savePromoContentForProject: vi.fn(),
}));

import { hashProjectPassword, createProjectAccessCookieValue } from "@/lib/services/projectAccess";
import { selectStrategyAction } from "@/app/projects/[id]/analysis/actions";
import { getPromoContentAction } from "@/app/projects/[id]/plan/actions";

beforeEach(() => {
  cookieGet.mockReset();
  redirectMock.mockClear();
  projectFindUnique.mockReset();
  strategyResultFindFirst.mockReset();
  projectUpdate.mockReset();
  getPromoContentForProject.mockReset();
  process.env.PROJECT_ACCESS_SECRET = "test-secret-key";
});

describe("selectStrategyAction — 보호된 프로젝트는 쿠키 없이 Server Action을 직접 호출해도 우회할 수 없다", () => {
  it("잠긴 프로젝트에 쿠키 없이 호출하면 전략 변경 없이 거부된다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: hashProjectPassword("비밀번호123") });
    cookieGet.mockReturnValue(undefined);

    await expect(selectStrategyAction("proj-1", "strategy-1")).rejects.toThrow("비밀번호 확인이 필요합니다");
    expect(strategyResultFindFirst).not.toHaveBeenCalled();
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("올바른 잠금 해제 쿠키가 있으면 실제 전략 변경 로직까지 도달한다", async () => {
    const hash = hashProjectPassword("비밀번호123");
    const session = createProjectAccessCookieValue("proj-1", hash);
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    cookieGet.mockReturnValue({ value: session!.value });
    strategyResultFindFirst.mockResolvedValue({ id: "strategy-1" });
    projectUpdate.mockResolvedValue({});

    await expect(selectStrategyAction("proj-1", "strategy-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(strategyResultFindFirst).toHaveBeenCalled();
    expect(projectUpdate).toHaveBeenCalled();
  });

  it("공개 프로젝트는 쿠키 없이도 정상적으로 로직에 도달한다(회귀 확인)", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: null });
    cookieGet.mockReturnValue(undefined);
    strategyResultFindFirst.mockResolvedValue({ id: "strategy-1" });
    projectUpdate.mockResolvedValue({});

    await expect(selectStrategyAction("proj-1", "strategy-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(projectUpdate).toHaveBeenCalled();
  });
});

describe("getPromoContentAction — 홍보자료 조회도 동일한 공통 가드를 통과해야 한다", () => {
  it("잠긴 프로젝트는 홍보자료 서비스 자체를 호출하지 않고 거부된다(민감 데이터 미반환)", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: hashProjectPassword("비밀번호123") });
    cookieGet.mockReturnValue(undefined);

    await expect(getPromoContentAction("proj-1")).rejects.toThrow("비밀번호 확인이 필요합니다");
    expect(getPromoContentForProject).not.toHaveBeenCalled();
  });

  it("잠금 해제된 프로젝트는 정상적으로 홍보자료를 조회한다", async () => {
    const hash = hashProjectPassword("비밀번호123");
    const session = createProjectAccessCookieValue("proj-1", hash);
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    cookieGet.mockReturnValue({ value: session!.value });
    getPromoContentForProject.mockResolvedValue({ ok: true, content: null });

    const result = await getPromoContentAction("proj-1");
    expect(result).toEqual({ ok: true, content: null });
    expect(getPromoContentForProject).toHaveBeenCalledWith("proj-1");
  });
});
