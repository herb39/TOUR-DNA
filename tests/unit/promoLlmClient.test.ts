// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callPromoLlmTool, isPromoLlmConfigured, resolvePromoLlmModel } from "@/lib/services/llm/promoLlmClient";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const baseOptions = {
  system: "system prompt",
  userPrompt: "user prompt",
  toolName: "emit_promo_content",
  toolDescription: "desc",
  inputSchema: { type: "object", properties: {} },
};

describe("isPromoLlmConfigured / resolvePromoLlmModel", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_PROMO_MODEL;
  });

  it("ANTHROPIC_API_KEY가 없으면 false다", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isPromoLlmConfigured()).toBe(false);
  });

  it("ANTHROPIC_API_KEY가 공백뿐이면 false다", () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    expect(isPromoLlmConfigured()).toBe(false);
  });

  it("ANTHROPIC_API_KEY가 있으면 true다", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(isPromoLlmConfigured()).toBe(true);
  });

  it("ANTHROPIC_PROMO_MODEL이 없으면 기본 모델을 쓴다", () => {
    delete process.env.ANTHROPIC_PROMO_MODEL;
    expect(resolvePromoLlmModel()).toBe("claude-haiku-4-5-20251001");
  });

  it("ANTHROPIC_PROMO_MODEL이 있으면 그 값을 쓴다", () => {
    process.env.ANTHROPIC_PROMO_MODEL = "claude-sonnet-5";
    expect(resolvePromoLlmModel()).toBe("claude-sonnet-5");
  });
});

describe("callPromoLlmTool", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("API key가 없으면 네트워크를 호출하지 않고 no_api_key를 반환한다", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "no_api_key", detail: expect.any(String) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("정상 tool_use 응답은 input을 그대로 반환한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        content: [
          { type: "text", text: "무시되어야 함" },
          { type: "tool_use", name: "emit_promo_content", input: { hello: "world" } },
        ],
      }),
    );
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: true, input: { hello: "world" } });
  });

  it("429 응답은 rate_limited로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "rate_limited", detail: expect.any(String) });
  });

  it("그 외 비-2xx 응답은 request_failed로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 500));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "request_failed", detail: expect.any(String) });
  });

  it("응답 본문이 JSON이 아니면 invalid_response로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "invalid_response", detail: expect.any(String) });
  });

  it("tool_use 블록이 없으면 invalid_response로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "자유 텍스트만" }] }));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "invalid_response", detail: expect.any(String) });
  });

  it("fetch가 AbortError를 던지면 timeout으로 분류한다", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "timeout", detail: expect.any(String) });
  });

  it("fetch가 일반 네트워크 오류를 던지면 request_failed로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "request_failed", detail: expect.any(String) });
  });

  it("실제 요청 body에 model/system/tool_choice가 올바르게 채워진다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ content: [{ type: "tool_use", name: "emit_promo_content", input: {} }] }),
    );
    await callPromoLlmTool(baseOptions);
    const call = fetchSpy.mock.calls[0];
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.system).toBe("system prompt");
    expect(body.messages).toEqual([{ role: "user", content: "user prompt" }]);
    expect(body.tool_choice).toEqual({ type: "tool", name: "emit_promo_content" });
    expect(body.tools[0].name).toBe("emit_promo_content");
    expect(typeof body.model).toBe("string");
  });
});
