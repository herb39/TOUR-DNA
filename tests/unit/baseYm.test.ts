import { describe, expect, it } from "vitest";
import { previousBaseYm, previousYearSameMonth, validateBaseYmFormat } from "@/lib/services/baseYm";

describe("previousBaseYm", () => {
  it("월이 1이 아니면 같은 해의 전월을 반환한다", () => {
    expect(previousBaseYm("202606")).toBe("202605");
  });
  it("1월이면 전년 12월로 넘어간다", () => {
    expect(previousBaseYm("202601")).toBe("202512");
  });
});

describe("previousYearSameMonth", () => {
  it("연도만 1 줄이고 월은 그대로 둔다", () => {
    expect(previousYearSameMonth("202606")).toBe("202506");
  });
});

const NOW = new Date("2026-08-08T00:00:00Z");

describe("validateBaseYmFormat — baseYm 형식·범위 검증(2026-08-08 도입)", () => {
  it("유효한 YYYYMM 값을 통과시킨다", () => {
    expect(validateBaseYmFormat("202606", NOW)).toEqual({ ok: true, baseYm: "202606" });
  });

  it("숫자 6자리가 아니면 거부한다", () => {
    expect(validateBaseYmFormat("20266", NOW).ok).toBe(false);
    expect(validateBaseYmFormat("2026066", NOW).ok).toBe(false);
    expect(validateBaseYmFormat("2026-6", NOW).ok).toBe(false);
    expect(validateBaseYmFormat("", NOW).ok).toBe(false);
  });

  it("월이 00 또는 13 이상이면 거부한다", () => {
    expect(validateBaseYmFormat("202600", NOW).ok).toBe(false);
    expect(validateBaseYmFormat("202613", NOW).ok).toBe(false);
  });

  it("월 경계값 01, 12는 통과시킨다", () => {
    expect(validateBaseYmFormat("202601", NOW).ok).toBe(true);
    expect(validateBaseYmFormat("202612", NOW).ok).toBe(true);
  });

  it("연도가 너무 오래되면(2020 미만) 거부한다", () => {
    expect(validateBaseYmFormat("201912", NOW).ok).toBe(false);
    expect(validateBaseYmFormat("202001", NOW).ok).toBe(true);
  });

  it("연도가 지나치게 미래(now 기준 내년 초과)면 거부한다", () => {
    expect(validateBaseYmFormat("202712", NOW).ok).toBe(true); // now=2026이므로 내년(2027)까지는 허용
    expect(validateBaseYmFormat("202801", NOW).ok).toBe(false);
  });

  it("옵션 문자열이 그대로 값으로 들어온 경우(--base-ym=202606)를 거부한다", () => {
    expect(validateBaseYmFormat("--base-ym=202606", NOW).ok).toBe(false);
  });
});
