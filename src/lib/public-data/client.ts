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
        lastError = "invalid JSON response";
        console.error(
          JSON.stringify({ level: "error", source: sourceCode, attempt, message: "invalid JSON response" }),
        );
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
