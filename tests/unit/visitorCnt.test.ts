// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVisitorCnt } from "@/lib/public-data/adapters/visitorCnt";

// 2026-07-27 원인 분석: DataSource.baseUrl(VISITOR_CNT)이 공공데이터포털 소개 페이지(HTML)를 가리켜
// 매 동기화가 실패한다(운영 오류 로그로 실측 확인). 여기서는 실제로 캡처한 응답 원문 대신, 그 실패를
// 재현하는 대표적인 HTML 형태(민감정보 없음)로 어댑터의 ERROR 처리 경로를 검증한다.
describe("fetchVisitorCnt — baseUrl이 REST 게이트웨이가 아닐 때(HTML 응답)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("HTML 응답을 받으면 재시도 없이 ERROR로 끝나고, 원인을 알 수 있는 resultMsg를 남긴다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<!DOCTYPE html><html><head><title>공공데이터포털</title></head><body></body></html>",
    } as Response);

    const result = await fetchVisitorCnt({
      serviceKey: "test-key",
      baseUrl: "https://example.test/intro-page",
      areaCd: "51",
      baseYm: "202606",
    });

    expect(result.status).toBe("ERROR");
    expect(result.items).toEqual([]);
    expect(result.resultMsg).toContain("HTML");
  });

  it("정상 JSON 응답이면 그대로 성공 처리한다(회귀 없음)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          response: {
            header: { resultCode: "0000", resultMsg: "NORMAL SERVICE." },
            body: { items: { item: { areaCd: "51", baseYm: "202606", visitorCnt: "123456" } }, numOfRows: 1, pageNo: 1, totalCount: 1 },
          },
        }),
    } as Response);

    const result = await fetchVisitorCnt({
      serviceKey: "test-key",
      baseUrl: "https://example.test/real-gateway",
      areaCd: "51",
      baseYm: "202606",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.items[0]?.visitorCnt).toBe(123456);
  });
});
