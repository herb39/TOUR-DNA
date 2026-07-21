import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSessionCookieValue, isValidSessionCookieValue } from "@/lib/services/siteAuth";

describe("siteAuth", () => {
  it("올바른 비밀번호로 만든 쿠키는 같은 비밀번호로 검증하면 유효하다", () => {
    const { value } = createSessionCookieValue("secret123");
    expect(isValidSessionCookieValue(value, "secret123")).toBe(true);
  });

  it("다른 비밀번호로 검증하면 무효하다(위조 방지)", () => {
    const { value } = createSessionCookieValue("secret123");
    expect(isValidSessionCookieValue(value, "wrong-password")).toBe(false);
  });

  it("쿠키 값이 없으면 무효하다", () => {
    expect(isValidSessionCookieValue(undefined, "secret123")).toBe(false);
  });

  it("형식이 깨진 쿠키 값은 무효하다", () => {
    expect(isValidSessionCookieValue("garbage", "secret123")).toBe(false);
    expect(isValidSessionCookieValue("", "secret123")).toBe(false);
  });

  it("만료 시각을 조작하면(서명 불일치) 무효하다", () => {
    const { value } = createSessionCookieValue("secret123");
    const [, signature] = value.split(".");
    const tamperedFutureExpiry = Date.now() + 365 * 24 * 60 * 60 * 1000;
    const tampered = `${tamperedFutureExpiry}.${signature}`;
    expect(isValidSessionCookieValue(tampered, "secret123")).toBe(false);
  });

  it("만료 시각이 지난 쿠키는 무효하다", () => {
    const expiredExpiry = Date.now() - 1000;
    const password = "secret123";
    const signature = crypto.createHmac("sha256", password).update(String(expiredExpiry)).digest("hex");
    const expiredValue = `${expiredExpiry}.${signature}`;
    expect(isValidSessionCookieValue(expiredValue, password)).toBe(false);
  });
});
