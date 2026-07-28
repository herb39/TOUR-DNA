// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocgoRegnVisitr, fetchMetcoRegnVisitr, monthToYmdRange } from "@/lib/public-data/adapters/visitorCnt";

// 2026-07-28 DataLabService 신규 API 구조로 전면 재작성(docs/public-api-status.md §5-B). 이 API는
// 지역 필터가 없어 전국 응답을 시군구/광역 각각 조회한 뒤 signguCode/areaCode로 매핑한다.

function envelope(resultCode: string, resultMsg: string, items: unknown, totalCount: number) {
  return {
    response: {
      header: { resultCode, resultMsg },
      body: { items: items === "" ? "" : { item: items }, numOfRows: 1000, pageNo: 1, totalCount },
    },
  };
}

function mockFetchOnce(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("fetchLocgoRegnVisitr / fetchMetcoRegnVisitr", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("현지인/외지인/외국인(touDivCd 1/2/3) 행을 분리해서 집계한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchOnce(
        envelope(
          "0000",
          "NORMAL SERVICE.",
          [
            { signguCode: "51150", touDivCd: "1", touNum: "1000", baseYmd: "20260601" },
            { signguCode: "51150", touDivCd: "2", touNum: "300", baseYmd: "20260601" },
            { signguCode: "51150", touDivCd: "3", touNum: "50", baseYmd: "20260601" },
          ],
          3,
        ),
      ),
    );

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });

    expect(result.status).toBe("SUCCESS");
    const agg = result.byCode?.get("51150");
    expect(agg?.localNum).toBe(1000);
    expect(agg?.otherDomesticNum).toBe(300);
    expect(agg?.foreignNum).toBe(50);
  });

  it("VISITOR_CNT는 외지인+외국인 합계이며 현지인은 포함하지 않는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchOnce(
        envelope(
          "0000",
          "NORMAL SERVICE.",
          [
            { signguCode: "51150", touDivCd: "1", touNum: "1000", baseYmd: "20260601" },
            { signguCode: "51150", touDivCd: "2", touNum: "300", baseYmd: "20260601" },
            { signguCode: "51150", touDivCd: "3", touNum: "50", baseYmd: "20260601" },
          ],
          3,
        ),
      ),
    );

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    const agg = result.byCode?.get("51150");
    expect(agg?.visitorCnt).toBe(350);
  });

  it("touNum의 소수점을 반올림하지 않고 그대로 보존한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchOnce(
        envelope(
          "0000",
          "NORMAL SERVICE.",
          [
            { signguCode: "51150", touDivCd: "2", touNum: "123.7", baseYmd: "20260601" },
            { signguCode: "51150", touDivCd: "3", touNum: "0.3", baseYmd: "20260601" },
          ],
          2,
        ),
      ),
    );

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    const agg = result.byCode?.get("51150");
    expect(agg?.otherDomesticNum).toBeCloseTo(123.7);
    expect(agg?.visitorCnt).toBeCloseTo(124.0);
  });

  it("같은 지역·같은 touDivCd의 여러 baseYmd(일자) 값을 월간 합계로 더한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchOnce(
        envelope(
          "0000",
          "NORMAL SERVICE.",
          [
            { signguCode: "51150", touDivCd: "2", touNum: "100", baseYmd: "20260601" },
            { signguCode: "51150", touDivCd: "2", touNum: "150", baseYmd: "20260602" },
            { signguCode: "51150", touDivCd: "2", touNum: "200", baseYmd: "20260603" },
          ],
          3,
        ),
      ),
    );

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    const agg = result.byCode?.get("51150");
    expect(agg?.otherDomesticNum).toBe(450);
  });

  it("totalCount가 numOfRows보다 크면 다음 페이지를 추가로 조회해 항목을 합친다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("pageNo=1")) {
        return mockFetchOnce(envelope("0000", "NORMAL SERVICE.", [{ signguCode: "51150", touDivCd: "2", touNum: "100", baseYmd: "20260601" }], 1500));
      }
      return mockFetchOnce(envelope("0000", "NORMAL SERVICE.", [{ signguCode: "51150", touDivCd: "2", touNum: "50", baseYmd: "20260602" }], 1500));
    });

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });

    // 이 테스트 자체가 "실제 페이지 요청 횟수" 계산이 정확함을 보여준다 — fetchLocgoRegnVisitr 호출은
    // 1번이지만 실제 HTTP 요청(fetch)은 페이지 수만큼(2회) 발생한다. 어댑터 호출 횟수를 API 호출
    // 횟수로 잘못 세면 이 값이 1이 되어야 하므로, 이 assertion이 그 착오를 막는다.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const agg = result.byCode?.get("51150");
    expect(agg?.otherDomesticNum).toBe(150);
  });

  it("필요한 페이지가 안전 상한(MAX_PAGES=500)을 초과하면 일부만 받고 SUCCESS로 반환하지 않고 ERROR로 처리한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // numOfRows=1000이므로 totalCount=500,001건이면 필요한 페이지가 501개 — 500개 상한을 넘는다.
      mockFetchOnce(envelope("0000", "NORMAL SERVICE.", [{ signguCode: "51150", touDivCd: "2", touNum: "1", baseYmd: "20260601" }], 500_001)),
    );

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });

    expect(result.status).toBe("ERROR");
    expect(result.byCode).toBeNull();
    // 상한 초과를 확인하는 데는 첫 페이지 응답(totalCount)만 있으면 충분하다 — 나머지 500페이지를
    // 실제로 받아보지 않고 즉시 중단한다.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("첫 페이지 totalCount 기준으로 더 받아야 하는데 후속 페이지가 EMPTY면 부분 응답으로 보고 ERROR 처리하며, 그 시점에서 중단한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("pageNo=1")) {
        return mockFetchOnce(envelope("0000", "NORMAL SERVICE.", [{ signguCode: "51150", touDivCd: "2", touNum: "100", baseYmd: "20260601" }], 2500));
      }
      if (url.includes("pageNo=2")) {
        return mockFetchOnce(envelope("0000", "NORMAL SERVICE.", "", 2500)); // 2페이지가 예상과 달리 EMPTY
      }
      throw new Error("3페이지는 요청되면 안 된다 — 2페이지 EMPTY에서 이미 중단했어야 한다.");
    });

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });

    expect(result.status).toBe("ERROR");
    expect(result.byCode).toBeNull();
    if (result.status === "ERROR") {
      expect(result.resultCode).toBe("PARTIAL_PAGE_EMPTY");
    }
    // 1페이지(정상)+2페이지(EMPTY)까지만 요청하고 3페이지는 요청하지 않는다.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("signguCode/areaCode로 각각 다른 지역을 구분해 매핑한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchOnce(
        envelope(
          "0000",
          "NORMAL SERVICE.",
          [
            { signguCode: "51150", touDivCd: "2", touNum: "100", baseYmd: "20260601" },
            { signguCode: "47130", touDivCd: "2", touNum: "200", baseYmd: "20260601" },
          ],
          2,
        ),
      ),
    );

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    expect(result.byCode?.get("51150")?.otherDomesticNum).toBe(100);
    expect(result.byCode?.get("47130")?.otherDomesticNum).toBe(200);
  });

  it("metco(광역) 응답은 areaCode로 매핑하고, signgu 값을 합산해 대체하지 않는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockFetchOnce(
        envelope("0000", "NORMAL SERVICE.", [{ areaCode: "51", touDivCd: "3", touNum: "999", baseYmd: "20260601" }], 1),
      ),
    );

    const result = await fetchMetcoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    expect(result.byCode?.get("51")?.foreignNum).toBe(999);
  });

  it("성공 응답이지만 0건이면 EMPTY로, 기존 SUCCESS를 덮어쓸 값이 없다고 표시한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockFetchOnce(envelope("0000", "NORMAL SERVICE.", "", 0)));

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    expect(result.status).toBe("EMPTY");
    expect(result.byCode?.size).toBe(0);
  });

  it("루트 resultCode가 실패면 ERROR로 처리하고 byCode를 만들지 않는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockFetchOnce(envelope("99", "SERVICE ERROR", [], 0)));

    const result = await fetchLocgoRegnVisitr({ serviceKey: "test-key", baseUrl: "https://example.test", baseYm: "202606" });
    expect(result.status).toBe("ERROR");
    expect(result.byCode).toBeNull();
  });

  it("baseYm(YYYYMM)을 월의 1일~말일 YYYYMMDD 범위로 변환한다", () => {
    expect(monthToYmdRange("202602")).toEqual({ startYmd: "20260201", endYmd: "20260228" });
    expect(monthToYmdRange("202606")).toEqual({ startYmd: "20260601", endYmd: "20260630" });
  });
});
