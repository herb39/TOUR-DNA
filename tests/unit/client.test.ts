// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyNonJsonBody, fetchPublicDataJson } from "@/lib/public-data/client";

describe("classifyNonJsonBody", () => {
  it("빈 본문은 EMPTY로 분류한다", () => {
    expect(classifyNonJsonBody("")).toBe("EMPTY");
    expect(classifyNonJsonBody("   \n  ")).toBe("EMPTY");
  });

  it("HTML 문서는 HTML로 분류한다(2026-07-27 VISITOR_CNT 사례 재현 — 실제 캡처 원문 대신 대표 형태만 사용)", () => {
    expect(classifyNonJsonBody("<!DOCTYPE html><html><head><title>공공데이터포털</title></head></html>")).toBe("HTML");
    expect(classifyNonJsonBody("<html><body>OpenAPI 소개</body></html>")).toBe("HTML");
  });

  it("XML 응답은 XML로 분류한다(_type=json 미반영 등 기본 응답 형식)", () => {
    expect(classifyNonJsonBody('<?xml version="1.0" encoding="UTF-8"?><response><header/></response>')).toBe("XML");
    expect(classifyNonJsonBody("<response><header><resultCode>0000</resultCode></header></response>")).toBe("XML");
  });

  it("그 외 예상 밖 형태는 UNKNOWN으로 분류한다", () => {
    expect(classifyNonJsonBody("service unavailable")).toBe("UNKNOWN");
  });
});

describe("fetchPublicDataJson — 비-JSON 응답 처리(2026-07-27 VISITOR_CNT 실패 원인 분석 보완)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function textResponse(body: string, ok = true) {
    return { ok, status: ok ? 200 : 500, text: async () => body } as Response;
  }

  it("HTML 응답이면 재시도 없이 즉시 실패로 끝난다(불필요한 반복 호출 방지) — baseUrl이 게이트웨이가 아닐 때의 전형적 증상", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      textResponse("<!DOCTYPE html><html><body>소개 페이지</body></html>"),
    );

    const result = await fetchPublicDataJson("https://example.test/broken", { sourceCode: "VISITOR_CNT", maxRetries: 2 });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("HTML");
    // maxRetries=2(최대 3회 시도 가능)여도 HTML을 받은 첫 시도에서 바로 중단해 1회만 호출한다.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("빈 응답이나 XML처럼 일시적일 수 있는 형태는 기존처럼 maxRetries만큼 재시도한다(회귀 없음)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(textResponse(""));

    const result = await fetchPublicDataJson("https://example.test/empty", { sourceCode: "TEST", maxRetries: 2 });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("EMPTY");
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 최초 시도 + 재시도 2회
  });

  it("정상 JSON 응답은 그대로 성공 처리한다(회귀 없음)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(textResponse(JSON.stringify({ response: { header: { resultCode: "0000" } } })));

    const result = await fetchPublicDataJson("https://example.test/ok", { sourceCode: "TEST" });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ response: { header: { resultCode: "0000" } } });
  });
});
