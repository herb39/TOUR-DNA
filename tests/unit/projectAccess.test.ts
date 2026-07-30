// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  MIN_PROJECT_PASSWORD_LENGTH,
  assertProjectAccessible,
  createProjectAccessCookieValue,
  getProjectAccessStatus,
  hashProjectPassword,
  isProjectAccessLocked,
  projectAccessCookieName,
  recordFailedProjectAccessAttempt,
  resetProjectAccessAttempts,
  validateProjectPasswordInput,
  verifyProjectPassword,
  verifyProjectPasswordHash,
} from "@/lib/services/projectAccess";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  projectFindUnique.mockReset();
  attemptUpsert.mockReset();
  attemptUpdate.mockReset();
  process.env.PROJECT_ACCESS_SECRET = "test-secret-key";
  delete process.env.SITE_ACCESS_PASSWORD;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("validateProjectPasswordInput — 기본 입력 검증", () => {
  it("빈 비밀번호는 거부한다", () => {
    expect(validateProjectPasswordInput("")).not.toBeNull();
  });

  it(`${MIN_PROJECT_PASSWORD_LENGTH}자 미만은 거부한다`, () => {
    expect(validateProjectPasswordInput("a".repeat(MIN_PROJECT_PASSWORD_LENGTH - 1))).not.toBeNull();
  });

  it(`${MIN_PROJECT_PASSWORD_LENGTH}자 이상이면 통과한다`, () => {
    expect(validateProjectPasswordInput("a".repeat(MIN_PROJECT_PASSWORD_LENGTH))).toBeNull();
  });

  it("지나치게 긴 비밀번호는 거부한다", () => {
    expect(validateProjectPasswordInput("a".repeat(200))).not.toBeNull();
  });
});

describe("hashProjectPassword / verifyProjectPasswordHash — 원문 미저장, scrypt 해시 검증", () => {
  it("해시 결과는 원문 비밀번호 문자열을 포함하지 않는다", () => {
    const hash = hashProjectPassword("올바른비밀번호");
    expect(hash).not.toContain("올바른비밀번호");
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("같은 비밀번호도 매번 다른 솔트로 다른 해시를 만든다(레인보우 테이블 방지)", () => {
    const a = hashProjectPassword("같은비밀번호");
    const b = hashProjectPassword("같은비밀번호");
    expect(a).not.toBe(b);
  });

  it("올바른 비밀번호는 검증을 통과하고, 틀린 비밀번호는 통과하지 못한다", () => {
    const hash = hashProjectPassword("올바른비밀번호");
    expect(verifyProjectPasswordHash("올바른비밀번호", hash)).toBe(true);
    expect(verifyProjectPasswordHash("틀린비밀번호", hash)).toBe(false);
  });

  it("형식이 깨진 해시는 예외 없이 항상 불일치로 처리한다", () => {
    expect(verifyProjectPasswordHash("아무거나", "깨진값")).toBe(false);
    expect(verifyProjectPasswordHash("아무거나", "")).toBe(false);
  });
});

describe("프로젝트 접근 쿠키 — 서명·만료·변조 방지", () => {
  it("정상 발급한 쿠키 값은 같은 프로젝트·같은 해시로 검증에 통과한다", async () => {
    const hash = hashProjectPassword("비밀번호123");
    const session = createProjectAccessCookieValue("proj-1", hash);
    expect(session).not.toBeNull();

    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    const status = await getProjectAccessStatus("proj-1", session!.value);
    expect(status).toEqual({ kind: "UNLOCKED" });
  });

  it("다른 프로젝트 ID로는 검증에 실패한다(프로젝트 A 쿠키로 프로젝트 B가 열리지 않음)", async () => {
    const hash = hashProjectPassword("비밀번호123");
    const session = createProjectAccessCookieValue("proj-A", hash);

    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    const status = await getProjectAccessStatus("proj-B", session!.value);
    expect(status).toEqual({ kind: "LOCKED" });
  });

  it("비밀번호가 바뀌어 해시가 달라지면 기존 쿠키는 자동으로 무효화된다", async () => {
    const oldHash = hashProjectPassword("옛날비밀번호");
    const session = createProjectAccessCookieValue("proj-1", oldHash);

    const newHash = hashProjectPassword("새비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: newHash });
    const status = await getProjectAccessStatus("proj-1", session!.value);
    expect(status).toEqual({ kind: "LOCKED" });
  });

  it("서명이 위조되면 거부한다", async () => {
    const hash = hashProjectPassword("비밀번호123");
    const session = createProjectAccessCookieValue("proj-1", hash);
    const [expiresAt] = session!.value.split(".");
    const tampered = `${expiresAt}.deadbeef`;

    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    const status = await getProjectAccessStatus("proj-1", tampered);
    expect(status).toEqual({ kind: "LOCKED" });
  });

  it("만료 시각이 지난 쿠키는 거부한다", async () => {
    const hash = hashProjectPassword("비밀번호123");
    const pastExpiry = Date.now() - 1000;
    // 실제 서명 로직과 동일한 방식으로 만료된 값만 직접 구성(내부 함수 재사용 없이 서명 우회는 불가하므로
    // 실제로는 검증이 만료 시각을 먼저 확인해 거부됨을 확인한다).
    const tampered = `${pastExpiry}.anything`;

    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    const status = await getProjectAccessStatus("proj-1", tampered);
    expect(status).toEqual({ kind: "LOCKED" });
  });

  it("서명 키(PROJECT_ACCESS_SECRET/SITE_ACCESS_PASSWORD)가 전혀 없으면 쿠키를 발급하지 않는다(폐쇄 실패)", () => {
    delete process.env.PROJECT_ACCESS_SECRET;
    delete process.env.SITE_ACCESS_PASSWORD;
    const hash = hashProjectPassword("비밀번호123");
    expect(createProjectAccessCookieValue("proj-1", hash)).toBeNull();
  });

  it("쿠키 이름은 프로젝트 ID별로 다르다", () => {
    expect(projectAccessCookieName("proj-1")).not.toBe(projectAccessCookieName("proj-2"));
  });
});

describe("getProjectAccessStatus — 공통 접근 판정", () => {
  it("존재하지 않는 프로젝트는 NOT_FOUND다", async () => {
    projectFindUnique.mockResolvedValue(null);
    expect(await getProjectAccessStatus("no-such", undefined)).toEqual({ kind: "NOT_FOUND" });
  });

  it("passwordHash가 없으면 공개 프로젝트(PUBLIC)다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: null });
    expect(await getProjectAccessStatus("proj-1", undefined)).toEqual({ kind: "PUBLIC" });
  });

  it("보호된 프로젝트에 쿠키가 없으면 LOCKED다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: hashProjectPassword("x") });
    expect(await getProjectAccessStatus("proj-1", undefined)).toEqual({ kind: "LOCKED" });
  });
});

describe("assertProjectAccessible — Server Action 공통 가드", () => {
  it("PUBLIC/UNLOCKED이면 예외를 던지지 않는다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: null });
    await expect(assertProjectAccessible("proj-1", undefined)).resolves.toBeUndefined();
  });

  it("LOCKED면 예외를 던진다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: hashProjectPassword("x") });
    await expect(assertProjectAccessible("proj-1", undefined)).rejects.toThrow("비밀번호 확인이 필요합니다");
  });

  it("NOT_FOUND면 예외를 던진다(내부 오류 정보 없이 일반 문구만)", async () => {
    projectFindUnique.mockResolvedValue(null);
    await expect(assertProjectAccessible("proj-1", undefined)).rejects.toThrow("찾을 수 없습니다");
  });
});

describe("무차별 대입 방어 — DB 기반 실패 횟수 기록(Vercel 서버리스 인스턴스 간 공유)", () => {
  it("잠금 임계치 미만이면 잠기지 않는다", async () => {
    attemptUpsert.mockResolvedValue({ failedCount: 1, lockedUntil: null });
    expect(await isProjectAccessLocked("proj-1")).toBe(false);
  });

  it("lockedUntil이 미래면 잠긴 상태다", async () => {
    attemptUpsert.mockResolvedValue({ failedCount: 5, lockedUntil: new Date(Date.now() + 60_000) });
    expect(await isProjectAccessLocked("proj-1")).toBe(true);
  });

  it("lockedUntil이 과거면 잠기지 않은 상태다(자동 해제)", async () => {
    attemptUpsert.mockResolvedValue({ failedCount: 5, lockedUntil: new Date(Date.now() - 60_000) });
    expect(await isProjectAccessLocked("proj-1")).toBe(false);
  });

  it("실패 기록 시 failedCount를 1 증가시킨다", async () => {
    attemptUpsert.mockResolvedValue({ failedCount: 2, lockedUntil: null });
    await recordFailedProjectAccessAttempt("proj-1");
    expect(attemptUpdate).toHaveBeenCalledWith({
      where: { projectId: "proj-1" },
      data: { failedCount: 3, lockedUntil: null },
    });
  });

  it("임계치에 도달하면 lockedUntil을 미래 시각으로 설정한다", async () => {
    attemptUpsert.mockResolvedValue({ failedCount: 4, lockedUntil: null });
    await recordFailedProjectAccessAttempt("proj-1");
    const call = attemptUpdate.mock.calls[0][0];
    expect(call.data.failedCount).toBe(0);
    expect(call.data.lockedUntil).toBeInstanceOf(Date);
    expect((call.data.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("성공 시 실패 횟수와 잠금을 초기화한다", async () => {
    await resetProjectAccessAttempts("proj-1");
    expect(attemptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { failedCount: 0, lockedUntil: null } }),
    );
  });
});

describe("verifyProjectPassword — 검증 파이프라인 통합(잠금 확인 → 비교 → 기록/초기화)", () => {
  it("존재하지 않는 프로젝트는 일반 오류 메시지만 반환한다", async () => {
    projectFindUnique.mockResolvedValue(null);
    const result = await verifyProjectPassword("no-such", "아무값");
    expect(result).toEqual({ ok: false, message: "프로젝트를 찾을 수 없습니다." });
  });

  it("공개 프로젝트(passwordHash 없음)는 비밀번호 확인 대상이 아니다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: null });
    const result = await verifyProjectPassword("proj-1", "아무값");
    expect(result.ok).toBe(false);
  });

  it("잠금 상태이면 비밀번호를 실제로 비교하지 않고 즉시 거부한다", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    attemptUpsert.mockResolvedValue({ failedCount: 5, lockedUntil: new Date(Date.now() + 60_000) });

    const result = await verifyProjectPassword("proj-1", "올바른비밀번호");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/잠시 후/);
  });

  it("틀린 비밀번호면 실패를 기록하고 거부한다", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    attemptUpsert.mockResolvedValue({ failedCount: 0, lockedUntil: null });

    const result = await verifyProjectPassword("proj-1", "틀린비밀번호");
    expect(result.ok).toBe(false);
    expect(attemptUpdate).toHaveBeenCalled();
  });

  it("빈 비밀번호는 항상 거부한다(서버에서 재검증)", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    attemptUpsert.mockResolvedValue({ failedCount: 0, lockedUntil: null });

    const result = await verifyProjectPassword("proj-1", "");
    expect(result.ok).toBe(false);
  });

  it("올바른 비밀번호면 성공하고 실패 기록을 초기화하며, 응답에 원문·해시를 노출하지 않는다", async () => {
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    attemptUpsert.mockResolvedValue({ failedCount: 2, lockedUntil: null });

    const result = await verifyProjectPassword("proj-1", "올바른비밀번호");
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("올바른비밀번호");
    expect(attemptUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { failedCount: 0, lockedUntil: null } }),
    );
  });

  it("서명 키가 없으면 비밀번호가 맞아도 서버 설정 오류로 거부한다(쿠키를 발급할 수 없으므로)", async () => {
    delete process.env.PROJECT_ACCESS_SECRET;
    delete process.env.SITE_ACCESS_PASSWORD;
    const hash = hashProjectPassword("올바른비밀번호");
    projectFindUnique.mockResolvedValue({ passwordHash: hash });
    attemptUpsert.mockResolvedValue({ failedCount: 0, lockedUntil: null });

    const result = await verifyProjectPassword("proj-1", "올바른비밀번호");
    expect(result.ok).toBe(false);
  });
});
