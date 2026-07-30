// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (...args: unknown[]) => cookieSet(...args) }),
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

const projectFindUnique = vi.fn();
const attemptUpsert = vi.fn();
const attemptUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: (...args: unknown[]) => projectFindUnique(...args) },
    projectAccessAttempt: {
      upsert: (...args: unknown[]) => attemptUpsert(...args),
      update: (...args: unknown[]) => attemptUpdate(...args),
    },
  },
}));

import { verifyProjectAccessAction, type ProjectAccessFormState } from "@/app/projects/[id]/access-actions";
import { hashProjectPassword } from "@/lib/services/projectAccess";

const initialState: ProjectAccessFormState = {};

function formDataWith(password: string): FormData {
  const fd = new FormData();
  fd.set("password", password);
  return fd;
}

beforeEach(() => {
  cookieSet.mockReset();
  projectFindUnique.mockReset();
  attemptUpsert.mockReset();
  attemptUpdate.mockReset();
  attemptUpsert.mockResolvedValue({ failedCount: 0, lockedUntil: null });
  process.env.PROJECT_ACCESS_SECRET = "test-secret-key";
});

describe("verifyProjectAccessAction — 잠금 해제 쿠키 발급", () => {
  it("올바른 비밀번호면 HttpOnly·SameSite=lax 쿠키를 이 프로젝트 경로로만 설정하고 분석 화면으로 리다이렉트한다", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });

    await expect(
      verifyProjectAccessAction("proj-1", initialState, formDataWith("올바른비밀번호")),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue, options] = cookieSet.mock.calls[0];
    expect(cookieName).toBe("tour_dna_project_access_proj-1");
    expect(cookieValue).not.toContain("올바른비밀번호");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/projects/proj-1" });
    expect(options.expires).toBeInstanceOf(Date);
  });

  it("잘못된 비밀번호면 쿠키를 설정하지 않고 오류 메시지만 반환한다(원문 비밀번호를 응답에 포함하지 않음)", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });

    const result = await verifyProjectAccessAction("proj-1", initialState, formDataWith("틀린값"));
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("틀린값");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("빈 비밀번호는 거부되고 쿠키를 설정하지 않는다", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });

    const result = await verifyProjectAccessAction("proj-1", initialState, formDataWith(""));
    expect(result.error).toBeTruthy();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("존재하지 않는 프로젝트는 일반 오류만 반환한다(내부 정보 노출 없음)", async () => {
    projectFindUnique.mockResolvedValue(null);
    const result = await verifyProjectAccessAction("no-such", initialState, formDataWith("아무값"));
    expect(result.error).toBe("프로젝트를 찾을 수 없습니다.");
  });

  it("여러 번 실패하면 잠금 상태로 전환되어 이후 요청은 비밀번호 비교 없이 거부된다", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    attemptUpsert.mockResolvedValue({ failedCount: 4, lockedUntil: null });

    await verifyProjectAccessAction("proj-1", initialState, formDataWith("틀린값"));
    expect(attemptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockedUntil: expect.any(Date) }) }),
    );

    attemptUpsert.mockResolvedValueOnce({ failedCount: 0, lockedUntil: new Date(Date.now() + 60_000) });
    const result = await verifyProjectAccessAction("proj-1", initialState, formDataWith("올바른비밀번호"));
    expect(result.error).toMatch(/잠시 후/);
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
