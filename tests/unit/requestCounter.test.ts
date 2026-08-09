// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicDataJson } from "@/lib/public-data/client";
import { recordApiRequest, withRequestCounter } from "@/lib/public-data/requestCounter";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) } as Response;
}
function errorResponse(status: number) {
  return { ok: false, status, text: async () => "" } as Response;
}

const OK_BODY = { response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: { item: [] }, totalCount: 0 } } };

describe("requestCounter — recordApiRequest/withRequestCounter 단독 동작", () => {
  it("withRequestCounter 밖에서 recordApiRequest를 호출해도 에러 없이 아무 효과가 없다", () => {
    expect(() => recordApiRequest("TAR_SVC_DEM:STAY")).not.toThrow();
  });

  it("단일 요청 1회를 정확히 집계한다", async () => {
    const { requestCounts } = await withRequestCounter(async () => {
      recordApiRequest("TAR_SVC_DEM:STAY");
    });
    expect(requestCounts.byDataSource).toEqual({ TAR_SVC_DEM: 1 });
    expect(requestCounts.total).toBe(1);
  });

  it("sourceCode의 콜론 앞부분 기준으로 여러 데이터소스를 독립적으로 집계한다", async () => {
    const { requestCounts } = await withRequestCounter(async () => {
      recordApiRequest("TAR_SVC_DEM:STAY");
      recordApiRequest("TAR_SVC_DEM:SPEND");
      recordApiRequest("TOU_DIV_IX:tou");
      recordApiRequest("TOUR_INFO");
    });
    expect(requestCounts.byDataSource).toEqual({ TAR_SVC_DEM: 2, TOU_DIV_IX: 1, TOUR_INFO: 1 });
    expect(requestCounts.total).toBe(4);
  });

  it("동시에 실행되는 두 컨텍스트의 카운터가 서로 섞이지 않는다", async () => {
    const [a, b] = await Promise.all([
      withRequestCounter(async () => {
        recordApiRequest("TAR_SVC_DEM:STAY");
        await new Promise((r) => setTimeout(r, 10));
        recordApiRequest("TAR_SVC_DEM:SPEND");
      }),
      withRequestCounter(async () => {
        recordApiRequest("TOU_DIV_IX:tou");
        recordApiRequest("TOU_DIV_IX:exp");
        recordApiRequest("TOU_DIV_IX:intl");
      }),
    ]);
    expect(a.requestCounts.byDataSource).toEqual({ TAR_SVC_DEM: 2 });
    expect(b.requestCounts.byDataSource).toEqual({ TOU_DIV_IX: 3 });
  });

  it("콜백이 값을 반환하면 그 결과도 함께 돌려준다", async () => {
    const { result, requestCounts } = await withRequestCounter(async () => {
      recordApiRequest("TOUR_INFO");
      return "done";
    });
    expect(result).toBe("done");
    expect(requestCounts.total).toBe(1);
  });
});

describe("requestCounter — fetchPublicDataJson과의 실제 연동(실제 fetch()를 기준으로 집계)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("성공 응답 1건은 요청 1회로 집계된다(단순 adapter 호출 횟수가 아니라 실제 fetch 시도 기준)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(OK_BODY));
    const { requestCounts } = await withRequestCounter(async () => {
      await fetchPublicDataJson("https://example.test/a", { sourceCode: "TAR_SVC_DEM:STAY" });
    });
    expect(requestCounts.byDataSource).toEqual({ TAR_SVC_DEM: 1 });
  });

  it("pagination — 같은 데이터소스를 여러 페이지 호출하면 페이지 수만큼 집계된다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(OK_BODY));
    const { requestCounts } = await withRequestCounter(async () => {
      await fetchPublicDataJson("https://example.test/page1", { sourceCode: "TOUR_INFO" });
      await fetchPublicDataJson("https://example.test/page2", { sourceCode: "TOUR_INFO" });
      await fetchPublicDataJson("https://example.test/page3", { sourceCode: "TOUR_INFO" });
    });
    expect(requestCounts.byDataSource).toEqual({ TOUR_INFO: 3 });
  });

  it("retry — 실제로 재시도가 발생하면 그 재시도 요청도 집계에 포함된다", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(jsonResponse(OK_BODY));

    const { requestCounts } = await withRequestCounter(async () => {
      await fetchPublicDataJson("https://example.test/retry", { sourceCode: "TOU_RES_DEM:SVC", maxRetries: 2 });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2); // 최초 실패 + 재시도 1회 성공
    expect(requestCounts.byDataSource).toEqual({ TOU_RES_DEM: 2 });
  });

  it("quota(HTTP 429) 오류를 유발한 시도도 실제 요청이었으므로 집계된다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errorResponse(429));

    const { result, requestCounts } = await withRequestCounter(async () => {
      return fetchPublicDataJson("https://example.test/quota", { sourceCode: "TOU_DIV_IX:tou", maxRetries: 2 });
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("HTTP 429");
    // maxRetries=2 → 최초 시도 + 재시도 2회 = 총 3회 시도, 전부 429였지만 전부 실제 요청이었다.
    expect(requestCounts.byDataSource).toEqual({ TOU_DIV_IX: 3 });
  });

  it("HTML 응답으로 즉시 중단되는 경우(재시도 안 함)도 실제 시도한 1회만 집계된다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<!DOCTYPE html><html><body>소개 페이지</body></html>",
    } as Response);

    const { requestCounts } = await withRequestCounter(async () => {
      await fetchPublicDataJson("https://example.test/html", { sourceCode: "VISITOR_CNT:locgo", maxRetries: 2 });
    });

    expect(requestCounts.byDataSource).toEqual({ VISITOR_CNT: 1 });
  });

  it("withRequestCounter 밖에서 호출한 fetchPublicDataJson은 어떤 카운터에도 집계되지 않는다(부작용 없음 확인)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(OK_BODY));
    // 컨텍스트 없이 직접 호출 — 에러 없이 정상 동작해야 하고, 이후 별도 컨텍스트에 영향을 주면 안 된다.
    await fetchPublicDataJson("https://example.test/outside", { sourceCode: "TAR_SVC_DEM:STAY" });

    const { requestCounts } = await withRequestCounter(async () => {
      await fetchPublicDataJson("https://example.test/inside", { sourceCode: "TAR_SVC_DEM:STAY" });
    });
    expect(requestCounts.byDataSource).toEqual({ TAR_SVC_DEM: 1 });
  });
});
