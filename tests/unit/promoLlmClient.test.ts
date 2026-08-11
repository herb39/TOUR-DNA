// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callPromoLlmTool, isPromoLlmConfigured, resolvePromoLlmModel } from "@/lib/services/llm/promoLlmClient";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const baseOptions = {
  system: "system prompt",
  userPrompt: "user prompt",
  toolName: "emit_promo_content",
  toolDescription: "desc",
  inputSchema: { type: "object", properties: {} },
};

function chatCompletion(contentObj: unknown, overrides: Record<string, unknown> = {}) {
  return {
    model: "qwen/qwen3-next-80b-a3b-instruct:free",
    choices: [{ message: { role: "assistant", content: JSON.stringify(contentObj) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    ...overrides,
  };
}

describe("isPromoLlmConfigured / resolvePromoLlmModel", () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_PROMO_MODEL;
  });

  it("OPENROUTER_API_KEY가 없으면 false다", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(isPromoLlmConfigured()).toBe(false);
  });

  it("OPENROUTER_API_KEY가 공백뿐이면 false다", () => {
    process.env.OPENROUTER_API_KEY = "   ";
    expect(isPromoLlmConfigured()).toBe(false);
  });

  it("OPENROUTER_API_KEY가 있으면 true다", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    expect(isPromoLlmConfigured()).toBe(true);
  });

  it("OPENROUTER_PROMO_MODEL이 없으면 기본 무료 Qwen 모델을 쓴다", () => {
    delete process.env.OPENROUTER_PROMO_MODEL;
    expect(resolvePromoLlmModel()).toBe("qwen/qwen3-next-80b-a3b-instruct:free");
  });

  it("OPENROUTER_PROMO_MODEL이 있으면 그 값을 쓴다", () => {
    process.env.OPENROUTER_PROMO_MODEL = "some/other-model:free";
    expect(resolvePromoLlmModel()).toBe("some/other-model:free");
  });
});

describe("callPromoLlmTool", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.restoreAllMocks();
  });

  it("API key가 없으면 네트워크를 호출하지 않고 no_api_key를 반환한다", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "no_api_key", detail: expect.any(String) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("정상 응답은 message.content를 JSON.parse한 값을 반환하고, 사용량 정보를 함께 담는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(chatCompletion({ hello: "world" })));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({
      ok: true,
      input: { hello: "world" },
      usage: {
        model: "qwen/qwen3-next-80b-a3b-instruct:free",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    });
  });

  it("429 응답은 rate_limited로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 429));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "rate_limited", detail: expect.any(String) });
  });

  it("5xx 응답은 request_failed로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "boom" }, 503));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "request_failed", detail: expect.any(String) });
  });

  it("json_schema structured output을 지원하지 않는 모델/provider의 400은 structured_output_unsupported로 분류한다(다른 유료 모델로 자동 전환하지 않음)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "response_format.json_schema is not supported by this model" } }, 400),
    );
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "structured_output_unsupported", detail: expect.any(String) });
  });

  it("json_schema와 무관한 400은 request_failed로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: { message: "invalid api key" } }, 400));
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
      text: async () => "not json",
    } as unknown as Response);
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "invalid_response", detail: expect.any(String) });
  });

  it("choices[0].message.content가 없으면 invalid_response로 분류한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ choices: [{ message: { content: "" } }] }));
    const result = await callPromoLlmTool(baseOptions);
    expect(result).toEqual({ ok: false, reason: "invalid_response", detail: expect.any(String) });
  });

  it("message.content가 유효한 JSON 문자열이 아니면 invalid_response로 분류한다(regex 추출 시도 없음)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "이건 JSON이 아니라 자유 텍스트입니다 { 어쩌구" } }] }),
    );
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

  it("실제 요청 body에 무료 모델/system·user 메시지/json_schema strict/provider.allow_fallbacks:false가 채워진다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(chatCompletion({})));
    await callPromoLlmTool(baseOptions);
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-or-test");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.model).toBe("qwen/qwen3-next-80b-a3b-instruct:free");
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "emit_promo_content", strict: true, schema: baseOptions.inputSchema },
    });
    // 무료 endpoint 실패 시 OpenRouter가 임의로 유료 provider/모델로 대체하지 못하게 막는 설정 —
    // 이 프로젝트의 LLM 비용 목표는 0원이다.
    expect(body.provider).toEqual({ allow_fallbacks: false });
  });

  it("OPENROUTER_PROMO_MODEL을 설정하면 요청 body의 model이 그 값으로 바뀐다", async () => {
    process.env.OPENROUTER_PROMO_MODEL = "some/other-model:free";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(chatCompletion({})));
    await callPromoLlmTool(baseOptions);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("some/other-model:free");
    delete process.env.OPENROUTER_PROMO_MODEL;
  });
});
