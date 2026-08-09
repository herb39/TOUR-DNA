import { recordApiRequest } from "./requestCounter";

export interface FetchJsonOptions {
  timeoutMs?: number;
  maxRetries?: number;
  sourceCode: string; // 로그 식별용 (예: "TAR_SVC_DEM")
}

export interface FetchJsonResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  errorMessage?: string;
}

/**
 * JSON 파싱에 실패한 응답 본문을 대략적으로 분류한다(본문 내용 자체는 로그/에러메시지에 남기지 않는다 —
 * 민감정보 여부와 무관하게 원문을 노출하지 않기 위함). 2026-07-27 VISITOR_CNT 동기화 실패 원인 분석
 * 중 발견: `DATA_SOURCE_SEED`의 VISITOR_CNT baseUrl이 실제 REST 게이트웨이가 아니라 data.go.kr의 사람이
 * 보는 소개 페이지(HTML)였다 — 그 결과가 매번 "invalid JSON response"로만 뭉뚱그려 기록돼 원인 파악이
 * 어려웠다. 이 분류를 로그/DataSnapshot.resultMsg에 남겨 향후 같은 원인(잘못된 baseUrl, `_type=json`
 * 미반영으로 XML 응답, 빈 응답)을 더 빨리 구분할 수 있게 한다.
 */
export function classifyNonJsonBody(text: string): "EMPTY" | "HTML" | "XML" | "UNKNOWN" {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "EMPTY";
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return "HTML";
  if (trimmed.startsWith("<?xml") || /^<[a-zA-Z]/.test(trimmed)) return "XML";
  return "UNKNOWN";
}

/** 서비스키/전체 요청 URL을 로그에 남기지 않고, timeout과 제한된 retry로 공공데이터 API를 호출한다. */
export async function fetchPublicDataJson(
  url: string,
  { timeoutMs = 8000, maxRetries = 2, sourceCode }: FetchJsonOptions,
): Promise<FetchJsonResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // 실제로 네트워크에 나가는 시점 — 성공/실패/재시도 여부와 무관하게 "요청을 시도했다"는
      // 사실 자체를 기준으로 집계한다(withRequestCounter 컨텍스트 밖이면 아무 효과 없음).
      recordApiRequest(sourceCode);
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        console.error(
          JSON.stringify({ level: "error", source: sourceCode, attempt, status: res.status, message: "non-2xx response" }),
        );
        continue;
      }

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        const bodyKind = classifyNonJsonBody(text);
        lastError = `non-JSON response (${bodyKind})`;
        console.error(
          JSON.stringify({ level: "error", source: sourceCode, attempt, message: "non-JSON response", bodyKind }),
        );
        // HTML 응답은 대부분 baseUrl 자체가 REST 게이트웨이가 아니라는 뜻이라 같은 요청을 재시도해도
        // 결과가 달라지지 않는다(2026-07-27 VISITOR_CNT 사례) — 불필요한 반복 호출을 피하려 즉시
        // 중단한다. EMPTY/XML/UNKNOWN은 일시적일 수 있어(예: 트래픽 순간 초과, 게이트웨이 임시 오류)
        // 기존처럼 재시도한다.
        if (bodyKind === "HTML") break;
        continue;
      }
      return { ok: true, status: res.status, data };
    } catch (e) {
      clearTimeout(timer);
      lastError = e instanceof Error ? e.message : "unknown fetch error";
      console.error(
        JSON.stringify({ level: "error", source: sourceCode, attempt, message: lastError }),
      );
    }
  }

  return { ok: false, errorMessage: lastError };
}
