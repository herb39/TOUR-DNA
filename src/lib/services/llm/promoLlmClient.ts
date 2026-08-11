/**
 * 홍보 콘텐츠 생성 전용 LLM(OpenRouter 무료 오픈모델) 저수준 클라이언트(2026-08-11, Anthropic →
 * OpenRouter 전환). SDK를 추가 설치하지 않고 `fetchPublicDataJson`(src/lib/public-data/client.ts)과
 * 같은 패턴 — timeout(AbortController)·에러 원문 비노출·JSON 파싱 실패 분류 — 을 그대로 따라 raw
 * `fetch`로 OpenRouter의 OpenAI 호환 Chat Completions API를 호출한다.
 *
 * 이 파일은 "홍보 콘텐츠에만 LLM을 쓴다"는 원칙의 유일한 네트워크 진입점이다 — DNA 분석·전략 점수·
 * POI 선택 등 다른 도메인 로직은 이 클라이언트를 참조하지 않는다.
 *
 * 이 프로젝트(공모전 제출·시연용)의 LLM 비용 목표는 0원이다 — 기본 모델은 항상 OpenRouter의 무료
 * 오픈모델(`qwen/qwen3-next-80b-a3b-instruct:free`)이고, `provider.allow_fallbacks: false`로 무료
 * endpoint를 쓸 수 없을 때 OpenRouter가 임의로 유료 provider/모델로 대체하지 못하게 막는다 — 그
 * 경우에는 이 클라이언트가 실패를 반환하고, 호출부(promoContentService.ts)가 기존 규칙 기반
 * 생성기로 대체한다.
 *
 * 모델/엔드포인트/timeout을 이 파일 한 곳에 모아두어 나중에 provider를 바꾸거나 모델을 교체할 때
 * 이 파일만 수정하면 되도록 한다.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/** 기본 모델(2026-08-11, OpenRouter 무료 오픈모델) — 공모전 시연 목적상 유료 API 없이 자연스러운
 * 홍보 문구를 만드는 것이 목표다. 필요하면 OPENROUTER_PROMO_MODEL 환경변수로 재정의할 수 있지만,
 * 기본값은 항상 이 무료 모델이어야 한다.
 *
 * 원래 기본값이었던 `qwen/qwen3-next-80b-a3b-instruct:free`는 실제 호출에서 404("This model is
 * unavailable for free")를 반환해 사용할 수 없었다(OpenRouter 모델 카탈로그 조회 결과 Qwen 계열
 * `:free` 모델 자체가 카탈로그에 존재하지 않았음). 실제 카탈로그에서 무료(가격 0/0)·
 * structured_outputs 지원이 명시된 `google/gemma-4-26b-a4b-it:free`로 교체해 실제 호출(HTTP 200,
 * json_schema strict 성공, 7채널 Zod 검증 통과, 자연스러운 한국어 출력)로 확인했다. */
const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
const DEFAULT_MAX_TOKENS = 4000;
/** Vercel 서버리스 함수의 기본 실행 시간 내에서 fallback까지 여유 있게 끝나도록 공공데이터 API
 * timeout(8초)보다 넉넉하게 잡되, 요청이 무한정 걸리지 않도록 상한을 둔다. 무료 오픈모델은 유료
 * provider보다 응답이 느릴 수 있지만, 공모전 시연에서는 사용자가 오래 기다리는 것보다 규칙 기반
 * fallback이 빠르게 나오는 편이 낫다 — 20초를 그대로 유지한다. */
const DEFAULT_TIMEOUT_MS = 20000;

export function resolvePromoLlmModel(): string {
  return process.env.OPENROUTER_PROMO_MODEL?.trim() || DEFAULT_MODEL;
}

export function isPromoLlmConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export interface PromoLlmToolCallOptions {
  system: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  /** OpenRouter의 `response_format: { type: "json_schema" }`가 강제로 이 스키마에 맞춰 응답하도록
   * 하는 JSON Schema. LLM의 자유 텍스트를 정규식으로 파싱하지 않기 위한 유일한 통로다. */
  inputSchema: Record<string, unknown>;
  timeoutMs?: number;
  maxTokens?: number;
}

export type PromoLlmFailureReason =
  | "no_api_key"
  | "timeout"
  | "rate_limited"
  | "request_failed"
  | "structured_output_unsupported"
  | "invalid_response";

/** QA 시 어떤 모델이 얼마나 사용됐는지 확인하기 위한 사용량 정보(2026-08-11) — DB 저장이나 UI 노출
 * 없이 서버 로그에만 남긴다. */
export interface PromoLlmUsage {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export type PromoLlmCallResult =
  | { ok: true; input: unknown; usage: PromoLlmUsage }
  | { ok: false; reason: PromoLlmFailureReason; detail: string };

function logLlmError(scope: string, detail: string): void {
  console.error(JSON.stringify({ level: "error", scope: `promo-llm:${scope}`, message: detail }));
}

/** QA 확인용 — 실제 사용된 model/토큰 사용량만 info 레벨로 남긴다(사용자에게는 노출하지 않음). */
function logLlmUsage(usage: PromoLlmUsage): void {
  console.log(JSON.stringify({ level: "info", scope: "promo-llm:usage", ...usage }));
}

/** QA/운영 확인용 — 응답 헤더 수신까지 걸린 시간과 본문을 읽는 데 걸린 시간을 구분해 남긴다
 * (2026-08-11). 무료 오픈모델은 헤더가 먼저 오고 본문(실제 생성 결과)이 그보다 훨씬 늦게 오는 경우가
 * 있어, 이 둘을 합친 전체 시간만으로는 "timeout이 왜 안 걸렸는지"를 진단할 수 없었다. */
function logLlmTiming(fetchMs: number, bodyReadMs: number): void {
  console.log(
    JSON.stringify({ level: "info", scope: "promo-llm:timing", fetchMs: Math.round(fetchMs), bodyReadMs: Math.round(bodyReadMs), totalMs: Math.round(fetchMs + bodyReadMs) }),
  );
}

/** OpenRouter Chat Completions API를 `response_format: { type: "json_schema", strict: true }`로
 * 강제해 호출한다. 실패 원인을 구체적으로 분류해 반환하되, API key·응답 원문 등 민감하거나 장황한
 * 내용은 로그에만 남기고 호출부/사용자에게는 분류값만 전달한다. */
export async function callPromoLlmTool(options: PromoLlmToolCallOptions): Promise<PromoLlmCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "no_api_key", detail: "OPENROUTER_API_KEY not set" };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchStart = performance.now();

  // 주의(2026-08-11): 이전에는 `await fetch(...)` 직후(= 응답 헤더 수신 시점)에 곧바로
  // clearTimeout을 호출했다. `fetch()`의 Promise는 헤더가 도착하면 resolve되고 본문은 그 뒤
  // `res.json()`/`res.text()`로 별도로 읽으므로, 그 시점에 타이머를 지우면 본문을 읽는 동안은
  // timeout 보호가 전혀 없어진다 — 무료 오픈모델이 헤더는 빨리 보내고 본문(실제 생성 결과)을
  // 그보다 훨씬 늦게 스트리밍하는 경우, 실제 소요시간이 `timeoutMs`를 몇 배 넘겨도 abort되지 않는
  // 실제 버그였다(2026-08-11 실 호출에서 42~79초가 걸리는 것을 발견해 확인). 이제 `clearTimeout`은
  // 함수를 벗어나는 모든 경로(finally)에서 한 번만 호출해, 같은 AbortController가 헤더 수신부터
  // 본문 파싱까지 전체 구간을 보호하게 한다.
  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvePromoLlmModel(),
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        // 무료 endpoint를 쓸 수 없으면 OpenRouter가 다른(유료일 수 있는) provider/모델로 임의
        // 대체하지 않도록 막는다 — 이 프로젝트의 LLM 비용 목표는 0원이다. 실패하면 그대로 반환받아
        // 호출부가 규칙 기반 생성기로 대체한다.
        provider: { allow_fallbacks: false },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: options.toolName, strict: true, schema: options.inputSchema },
        },
      }),
    });
    const fetchResolved = performance.now();

    if (res.status === 429) {
      logLlmError("call", `HTTP 429`);
      return { ok: false, reason: "rate_limited", detail: "rate limited" };
    }
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        // 본문을 읽지 못해도 상태 코드만으로 분류를 진행한다.
      }
      logLlmError("call", `HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
      // 모델/provider가 json_schema structured output을 지원하지 않으면 OpenRouter는 보통 400을
      // 반환한다 — 이 경우 다른 유료 모델로 자동 전환하지 않고 곧바로 규칙 기반 fallback으로
      // 넘어가도록 별도 사유로 분류한다(원문에 "response_format"/"json_schema"가 언급되면 그
      // 사유일 가능성이 높다).
      if (res.status === 400 && /response_format|json_schema/i.test(bodyText)) {
        return { ok: false, reason: "structured_output_unsupported", detail: `HTTP ${res.status}` };
      }
      return { ok: false, reason: "request_failed", detail: `HTTP ${res.status}` };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      // AbortError는 본문을 읽는 도중 timeout이 발생했다는 뜻이다 — "본문이 JSON이 아니다"와는
      // 다른 사유이므로 여기서 삼키지 않고 바깥 catch(timeout 분류)로 넘긴다.
      if (e instanceof Error && e.name === "AbortError") throw e;
      logLlmError("call", "non-JSON response body");
      return { ok: false, reason: "invalid_response", detail: "non-JSON response body" };
    }
    logLlmTiming(fetchResolved - fetchStart, performance.now() - fetchResolved);

    const content = extractMessageContent(body);
    if (content === null) {
      logLlmError("call", "no message content in response");
      return { ok: false, reason: "invalid_response", detail: "no message content" };
    }

    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(content);
    } catch {
      logLlmError("call", "message content is not valid JSON");
      return { ok: false, reason: "invalid_response", detail: "invalid JSON content" };
    }

    const usage = extractUsage(body);
    logLlmUsage(usage);

    return { ok: true, input: parsedInput, usage };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      logLlmError("call", `timeout after ${timeoutMs}ms`);
      return { ok: false, reason: "timeout", detail: "timeout" };
    }
    const message = e instanceof Error ? e.message : "unknown fetch error";
    logLlmError("call", message);
    return { ok: false, reason: "request_failed", detail: message };
  } finally {
    clearTimeout(timer);
  }
}

/** OpenRouter(OpenAI 호환) 응답에서 `choices[0].message.content` 문자열을 찾는다. 응답 형태가
 * 예상과 다르면(구조 변경, 예상 못한 오류 형식 등) null을 반환해 호출부가 invalid_response로
 * 처리하게 한다 — 여기서 타입 단언으로 통과시키지 않는다. */
function extractMessageContent(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim().length > 0 ? content : null;
}

/** 실제 사용된 model ID와 토큰 사용량을 응답에서 뽑는다(QA 확인용) — 값이 없거나 형태가 다르면
 * null로 안전하게 채운다. */
function extractUsage(body: unknown): PromoLlmUsage {
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const usage = typeof obj.usage === "object" && obj.usage !== null ? (obj.usage as Record<string, unknown>) : {};
  const toNumberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    model: typeof obj.model === "string" ? obj.model : resolvePromoLlmModel(),
    promptTokens: toNumberOrNull(usage.prompt_tokens),
    completionTokens: toNumberOrNull(usage.completion_tokens),
    totalTokens: toNumberOrNull(usage.total_tokens),
  };
}
