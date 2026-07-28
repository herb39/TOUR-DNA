// @vitest-environment node
import { describe, expect, it } from "vitest";
import { maskServiceKeyInUrl } from "@/lib/public-data/urlMasking";

describe("maskServiceKeyInUrl", () => {
  it("serviceKey 값만 마스킹하고 다른 파라미터는 그대로 둔다", () => {
    const url = "https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList?serviceKey=SECRET123&numOfRows=1000&pageNo=1";
    const masked = maskServiceKeyInUrl(url);
    expect(masked).not.toContain("SECRET123");
    expect(masked).toContain("numOfRows=1000");
    expect(masked).toContain("pageNo=1");
    expect(masked).toContain("serviceKey=***MASKED***");
  });

  it("serviceKey가 URL 인코딩된 특수문자를 포함해도 값 전체를 마스킹한다", () => {
    const url = "https://example.test/x?serviceKey=abc%2Bdef%3D%3D&_type=json";
    const masked = maskServiceKeyInUrl(url);
    expect(masked).not.toContain("abc%2Bdef");
    expect(masked).toContain("_type=json");
  });

  it("대소문자와 무관하게(파라미터 순서 무관) 마스킹한다", () => {
    const url = "https://example.test/x?a=1&serviceKey=SECRET&b=2";
    const masked = maskServiceKeyInUrl(url);
    expect(masked).toBe("https://example.test/x?a=1&serviceKey=***MASKED***&b=2");
  });

  it("serviceKey 파라미터가 없는 URL은 그대로 반환한다", () => {
    const url = "https://example.test/x?a=1&b=2";
    expect(maskServiceKeyInUrl(url)).toBe(url);
  });
});
