import { describe, expect, it } from "vitest";
import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  parsePage,
  parsePageSize,
  computeTotalPages,
  clampPageToTotal,
  buildPageWindow,
} from "@/lib/pagination";

describe("parsePageSize", () => {
  it("허용된 값(10/30/50)은 그대로 통과한다", () => {
    for (const size of ALLOWED_PAGE_SIZES) {
      expect(parsePageSize(String(size))).toBe(size);
    }
  });

  it("허용되지 않은 값은 기본값(10)으로 대체한다", () => {
    expect(parsePageSize("20")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("abc")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("")).toBe(DEFAULT_PAGE_SIZE);
  });

  it("배열로 온 경우(중복 query param) 첫 값만 사용한다", () => {
    expect(parsePageSize(["30", "50"])).toBe(30);
  });
});

describe("parsePage", () => {
  it("유효한 양의 정수는 그대로 통과한다", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("42")).toBe(42);
  });

  it("숫자가 아니면 1로 대체한다", () => {
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it("0 이하 값은 1로 대체한다", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-5")).toBe(1);
  });

  it("소수는 1로 대체한다(정수만 허용)", () => {
    expect(parsePage("1.5")).toBe(1);
  });
});

describe("computeTotalPages", () => {
  it("정확히 나누어떨어지는 경우", () => {
    expect(computeTotalPages(100, 10)).toBe(10);
  });
  it("나머지가 있으면 올림한다", () => {
    expect(computeTotalPages(101, 10)).toBe(11);
  });
  it("0건이어도 최소 1페이지를 반환한다(빈 상태 화면 대응)", () => {
    expect(computeTotalPages(0, 10)).toBe(1);
  });
});

describe("clampPageToTotal", () => {
  it("범위 안이면 그대로 반환하고 wasClamped는 false다", () => {
    expect(clampPageToTotal(3, 5)).toEqual({ page: 3, wasClamped: false });
  });
  it("총 페이지보다 크면 마지막 페이지로 보정하고 wasClamped는 true다", () => {
    expect(clampPageToTotal(99, 5)).toEqual({ page: 5, wasClamped: true });
  });
});

describe("buildPageWindow", () => {
  it("전체 페이지가 적으면(7개 이하) 생략 없이 전부 보여준다", () => {
    expect(buildPageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("전체 페이지가 많고 중간 페이지면 양쪽에 생략(…)이 들어간다", () => {
    const result = buildPageWindow(6, 18);
    expect(result).toEqual([1, "…", 5, 6, 7, "…", 18]);
  });

  it("첫 페이지 근처면 왼쪽 생략 없이 오른쪽에만 생략이 붙는다", () => {
    const result = buildPageWindow(1, 18);
    expect(result[0]).toBe(1);
    expect(result.filter((p) => p === "…")).toHaveLength(1);
    expect(result[result.length - 1]).toBe(18);
  });

  it("마지막 페이지 근처면 오른쪽 생략이 없다", () => {
    const result = buildPageWindow(18, 18);
    expect(result[result.length - 1]).toBe(18);
  });
});
