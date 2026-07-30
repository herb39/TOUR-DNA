import crypto from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * 프로젝트별 비밀번호 접근 보호(2026-07-30). 계정/로그인 시스템은 없다 — "비밀번호를 아는 사람은
 * 해당 프로젝트에 한해 접근할 수 있다"는 수준의 보호이며, 소유권이나 역할별 권한을 흉내 내지 않는다.
 * `src/lib/services/siteAuth.ts`(사이트 전체 게이트)와 별개로, 프로젝트 단위로 잠금을 건다.
 */

export const MIN_PROJECT_PASSWORD_LENGTH = 6;
export const MAX_PROJECT_PASSWORD_LENGTH = 100;

const PROJECT_ACCESS_COOKIE_PREFIX = "tour_dna_project_access_";
const PROJECT_ACCESS_TTL_MS = 12 * 60 * 60 * 1000; // 12시간
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10분

export function projectAccessCookieName(projectId: string): string {
  return `${PROJECT_ACCESS_COOKIE_PREFIX}${projectId}`;
}

/** 빈 비밀번호·지나치게 짧거나 긴 비밀번호를 기본 검증한다. 통과하면 null. */
export function validateProjectPasswordInput(password: string): string | null {
  if (password.length === 0) return "비밀번호를 입력해주세요.";
  if (password.length < MIN_PROJECT_PASSWORD_LENGTH) {
    return `비밀번호는 최소 ${MIN_PROJECT_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  }
  if (password.length > MAX_PROJECT_PASSWORD_LENGTH) {
    return `비밀번호는 ${MAX_PROJECT_PASSWORD_LENGTH}자 이내로 입력해주세요.`;
  }
  return null;
}

const SCRYPT_KEY_LENGTH = 64;

/** scrypt로 해시한다. 저장 형식은 "<saltHex>:<hashHex>" — 원문 비밀번호는 어디에도 저장하지 않는다. */
export function hashProjectPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** 입력 비밀번호가 저장된 해시와 일치하는지 서버에서만 비교한다(timing-safe). 형식이 깨진 해시는
 * 항상 불일치로 처리한다(예외를 던져 오류 정보를 노출하지 않는다). */
export function verifyProjectPasswordHash(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** 쿠키 서명 키. 전용 비밀(PROJECT_ACCESS_SECRET)이 없으면 사이트 게이트 비밀번호로 대체한다 —
 * 둘 다 없으면 서명할 수 없으므로(null) 잠금을 절대 풀어주지 않는다(폐쇄 실패, 열림 실패 아님). */
function getAccessSigningSecret(): string | null {
  return process.env.PROJECT_ACCESS_SECRET || process.env.SITE_ACCESS_PASSWORD || null;
}

/** 서명 대상에 passwordHash를 포함시켜, 비밀번호가 바뀌면 기존 쿠키가 자동으로 무효화되게 한다. */
function signAccess(projectId: string, passwordHash: string, expiresAtMs: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${projectId}.${expiresAtMs}.${passwordHash}`)
    .digest("hex");
}

export function createProjectAccessCookieValue(
  projectId: string,
  passwordHash: string,
): { value: string; expires: Date } | null {
  const secret = getAccessSigningSecret();
  if (!secret) return null;
  const expiresAtMs = Date.now() + PROJECT_ACCESS_TTL_MS;
  return { value: `${expiresAtMs}.${signAccess(projectId, passwordHash, expiresAtMs, secret)}`, expires: new Date(expiresAtMs) };
}

function isValidProjectAccessCookieValue(
  cookieValue: string | undefined,
  projectId: string,
  passwordHash: string,
): boolean {
  if (!cookieValue) return false;
  const secret = getAccessSigningSecret();
  if (!secret) return false;

  const [expiresAtRaw, signature] = cookieValue.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAtMs = Number(expiresAtRaw);
  if (Number.isNaN(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const expected = Buffer.from(signAccess(projectId, passwordHash, expiresAtMs, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export type ProjectAccessStatus =
  | { kind: "NOT_FOUND" }
  | { kind: "PUBLIC" }
  | { kind: "UNLOCKED" }
  | { kind: "LOCKED" };

/**
 * 공통 접근 판정 함수 — 프로젝트 상세, 분석, 전략 선택, 실행안, 홍보자료, 인쇄 화면과 관련 Server
 * Action이 모두 이 함수 하나만 호출한다(화면마다 다른 방식으로 판정하지 않는다). `cookieValue`는
 * 호출부(레이아웃 또는 Server Action)가 `next/headers`의 `cookies()`에서 직접 읽어 전달한다 — 이
 * 파일은 Next.js 요청 컨텍스트에 의존하지 않는 순수 서비스 계층으로 유지한다.
 */
export async function getProjectAccessStatus(
  projectId: string,
  cookieValue: string | undefined,
): Promise<ProjectAccessStatus> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { passwordHash: true },
  });
  if (!project) return { kind: "NOT_FOUND" };
  if (!project.passwordHash) return { kind: "PUBLIC" };
  if (isValidProjectAccessCookieValue(cookieValue, projectId, project.passwordHash)) {
    return { kind: "UNLOCKED" };
  }
  return { kind: "LOCKED" };
}

async function getOrCreateAttempt(projectId: string) {
  return prisma.projectAccessAttempt.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });
}

/** 잠겨 있으면(최근 실패가 임계치를 넘어 lockedUntil이 미래이면) true를 반환한다. */
export async function isProjectAccessLocked(projectId: string): Promise<boolean> {
  const attempt = await getOrCreateAttempt(projectId);
  return attempt.lockedUntil !== null && attempt.lockedUntil.getTime() > Date.now();
}

/** 실패를 기록하고, 임계치에 도달하면 잠금을 건다. DB 행 단위 UPDATE라 단일 요청 처리량에서는
 * 원자적이다(다만 아주 짧은 시간에 동시 요청이 몰리면 카운트가 약간 어긋날 수 있다 — 서버 인스턴스
 * 메모리 카운터보다는 훨씬 신뢰할 수 있지만, 분산 락 수준의 완전한 보장은 아니다). */
export async function recordFailedProjectAccessAttempt(projectId: string): Promise<void> {
  const attempt = await getOrCreateAttempt(projectId);
  const nextCount = attempt.failedCount + 1;
  await prisma.projectAccessAttempt.update({
    where: { projectId },
    data: {
      failedCount: nextCount >= MAX_FAILED_ATTEMPTS ? 0 : nextCount,
      lockedUntil: nextCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : attempt.lockedUntil,
    },
  });
}

export async function resetProjectAccessAttempts(projectId: string): Promise<void> {
  await prisma.projectAccessAttempt.upsert({
    where: { projectId },
    create: { projectId },
    update: { failedCount: 0, lockedUntil: null },
  });
}

export type VerifyProjectPasswordResult =
  | { ok: true; passwordHash: string }
  | { ok: false; message: string };

/**
 * 비밀번호 검증(잠금 상태 확인 → 무차별 대입 방어 → scrypt 비교 → 실패 기록/초기화)을 한 곳에 모은다.
 * 성공하면 쿠키 서명에 쓸 passwordHash를 반환한다(Server Action이 쿠키를 직접 설정한다 — 이 함수는
 * Next.js 쿠키 API에 의존하지 않는다).
 */
export async function verifyProjectPassword(projectId: string, password: string): Promise<VerifyProjectPasswordResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { passwordHash: true } });
  if (!project) return { ok: false, message: "프로젝트를 찾을 수 없습니다." };
  if (!project.passwordHash) return { ok: false, message: "공개 프로젝트입니다." };

  if (await isProjectAccessLocked(projectId)) {
    return { ok: false, message: "여러 번 잘못 입력해 잠시 후 다시 시도해야 합니다." };
  }

  if (!getAccessSigningSecret()) {
    return { ok: false, message: "서버 설정 오류로 접근 확인을 처리할 수 없습니다. 운영자에게 문의하세요." };
  }

  if (!password || !verifyProjectPasswordHash(password, project.passwordHash)) {
    await recordFailedProjectAccessAttempt(projectId);
    return { ok: false, message: "비밀번호가 올바르지 않습니다." };
  }

  await resetProjectAccessAttempts(projectId);
  return { ok: true, passwordHash: project.passwordHash };
}

/**
 * Server Action에서 호출하는 공통 가드. `cookieValue`는 호출부가 `cookies()`에서 읽어 넘긴다.
 * 화면(레이아웃)의 잠금 여부 판정과 동일한 `getProjectAccessStatus`를 그대로 재사용해, 직접 API/
 * Server Action 호출로 화면 잠금을 우회할 수 없게 한다.
 */
export async function assertProjectAccessible(projectId: string, cookieValue: string | undefined): Promise<void> {
  const status = await getProjectAccessStatus(projectId, cookieValue);
  if (status.kind === "NOT_FOUND") throw new Error("프로젝트를 찾을 수 없습니다.");
  if (status.kind === "LOCKED") throw new Error("이 프로젝트는 비밀번호 확인이 필요합니다.");
}
