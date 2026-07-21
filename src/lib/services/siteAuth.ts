import crypto from "node:crypto";

/**
 * 계정/로그인 없이 사이트 전체를 공유 비밀번호 하나로 잠그는 최소 구현이다(프로젝트별 소유권 분리는
 * 하지 않음 — 비밀번호를 아는 사람은 모든 프로젝트를 볼 수 있다). 쿠키 값은 `만료시각.서명` 형태이며,
 * 서명은 SITE_ACCESS_PASSWORD를 키로 한 HMAC-SHA256이라 비밀번호를 모르면 위조할 수 없다.
 */
export const SITE_ACCESS_COOKIE_NAME = "tour_dna_site_access";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

function sign(expiresAtMs: number, password: string): string {
  return crypto.createHmac("sha256", password).update(String(expiresAtMs)).digest("hex");
}

export function createSessionCookieValue(password: string): { value: string; expires: Date } {
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  return { value: `${expiresAtMs}.${sign(expiresAtMs, password)}`, expires: new Date(expiresAtMs) };
}

export function isValidSessionCookieValue(cookieValue: string | undefined, password: string): boolean {
  if (!cookieValue) return false;
  const [expiresAtRaw, signature] = cookieValue.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAtMs = Number(expiresAtRaw);
  if (Number.isNaN(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const expected = Buffer.from(sign(expiresAtMs, password));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
