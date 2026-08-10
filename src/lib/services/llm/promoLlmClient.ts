/**
 * 홍보 콘텐츠 생성 전용 LLM(Anthropic Claude) 저수준 클라이언트(2026-08-11 도입). SDK를 추가 설치하지
 * 않고 `fetchPublicDataJson`(src/lib/public-data/client.ts)과 같은 패턴 — timeout(AbortController)·
 * 에러 원문 비노출·JSON 파싱 실패 분류 — 을 그대로 따라 raw `fetch`로 Anthropic Messages API를 호출한다.
 *
 * 이 파일은 "홍보 콘텐츠에만 LLM을 쓴다"는 원칙의 유일한 네트워크 진입점이다 — DNA 분석·전략 점수·
 * POI 선택 등 다른 도메인 로직은 이 클라이언트를 참조하지 않는다.
 *
 * 모델/엔드포인트/timeout을 이 파일 한 곳에 모아두어 나중에 provider를 바꾸거나 모델을 교체할 때
 * 이 파일만 수정하면 되도록 한다.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

/** 기본 모델(2026-08 기준 최신 Haiku) — 홍보 문구 생성은 창작 난도가 낮아 비용/응답속도가 가장 좋은
 * 모델을 기본값으로 쓴다. 필요하면 ANTHROPIC_PROMO_MODEL 환경변수로 재정의할 수 있다. */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 4000;
/** Vercel 서버리스 함수의 기본 실행 시간 내에서 fallback까지 여유 있게 끝나도록 공공데이터 API
 * timeout(8초)보다 넉넉하게 잡되, 요청이 무한정 걸리지 않도록 상한을 둔다. */
const DEFAULT_TIMEOUT_MS = 20000;

export function resolvePromoLlmModel(): string {
  return process.env.ANTHROPIC_PROMO_MODEL?.trim() || DEFAULT_MODEL;
}

export function isPromoLlmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export interface PromoLlmToolCallOptions {
  system: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  /** Anthropic이 강제로 이 스키마에 맞춰 tool_use 블록을 반환하도록 하는 JSON Schema(초안 draft 형식,
   * additionalProperties 등은 호출부가 채운다). LLM의 자유 텍스트를 정규식으로 파싱하지 않기 위한
   * 유일한 통로다. */
  inputSchema: Record<string, unknown>;
  timeoutMs?: number;
  maxTokens?: number;
}

export type PromoLlmFailureReason =
  | "no_api_key"
  | "timeout"
  | "rate_limited"
  | "request_failed"
  | "invalid_response";

export type PromoLlmCallResult =
  | { ok: true; input: unknown }
  | { ok: false; reason: PromoLlmFailureReason; detail: string };

function logLlmError(scope: string, detail: string): void {
  console.error(JSON.stringify({ level: "error", scope: `promo-llm:${scope}`, message: detail }));
}

/** Anthropic Messages API를 tool_choice로 강제해 호출한다. 실패 원인을 구체적으로 분류해 반환하되,
 * API key·응답 원문 등 민감하거나 장황한 내용은 로그에만 남기고 호출부/사용자에게는 분류값만 전달한다. */
export async function callPromoLlmTool(options: PromoLlmToolCallOptions): Promise<PromoLlmCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "no_api_key", detail: "ANTHROPIC_API_KEY not set" };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: resolvePromoLlmModel(),
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: options.system,
        messages: [{ role: "user", content: options.userPrompt }],
        tools: [
          {
            name: options.toolName,
            description: options.toolDescription,
            input_schema: options.inputSchema,
          },
        ],
        tool_choice: { type: "tool", name: options.toolName },
      }),
    });
    clearTimeout(timer);

    if (res.status === 429) {
      logLlmError("call", `HTTP 429`);
      return { ok: false, reason: "rate_limited", detail: "rate limited" };
    }
    if (!res.ok) {
      logLlmError("call", `HTTP ${res.status}`);
      return { ok: false, reason: "request_failed", detail: `HTTP ${res.status}` };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      logLlmError("call", "non-JSON response body");
      return { ok: false, reason: "invalid_response", detail: "non-JSON response body" };
    }

    const toolUse = extractToolUseBlock(body, options.toolName);
    if (!toolUse) {
      logLlmError("call", "no matching tool_use block in response");
      return { ok: false, reason: "invalid_response", detail: "no tool_use block" };
    }

    return { ok: true, input: toolUse };
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      logLlmError("call", `timeout after ${timeoutMs}ms`);
      return { ok: false, reason: "timeout", detail: "timeout" };
    }
    const message = e instanceof Error ? e.message : "unknown fetch error";
    logLlmError("call", message);
    return { ok: false, reason: "request_failed", detail: message };
  }
}

/** Anthropic Messages API 응답에서 tool_use 콘텐츠 블록의 input(이미 파싱된 JSON 값)을 찾는다.
 * 응답 형태가 예상과 다르면(구조 변경, 예상 못한 오류 형식 등) null을 반환해 호출부가 invalid_response로
 * 처리하게 한다 — 여기서 타입 단언으로 통과시키지 않는다. */
function extractToolUseBlock(body: unknown, toolName: string): unknown {
  if (typeof body !== "object" || body === null) return null;
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "tool_use" &&
      (block as { name?: unknown }).name === toolName
    ) {
      return (block as { input?: unknown }).input ?? null;
    }
  }
  return null;
}
