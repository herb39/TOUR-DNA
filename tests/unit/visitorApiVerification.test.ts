// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runVisitorApiVerification } from "@/lib/services/visitorApiVerification";
import type { VisitorCntFetchResult, VisitorCntParams } from "@/lib/public-data/adapters/visitorCnt";
import { expectedDatesOfMonth } from "@/lib/services/visitorMonthCompleteness";

const NOW = new Date(2026, 6, 28); // "202607"

function successFor(baseYm: string, code: string): VisitorCntFetchResult {
  return {
    status: "SUCCESS",
    resultCode: "0000",
    resultMsg: "OK",
    rawPages: [{ dummy: true }],
    byCode: new Map([
      [code, { code, name: null, localNum: 0, otherDomesticNum: 0, foreignNum: 0, visitorCnt: 0, rawItems: expectedDatesOfMonth(baseYm).map((baseYmd) => ({ code, touDivCd: "2", touNum: 1, baseYmd })) }],
    ]),
  };
}

describe("runVisitorApiVerification — verify:visitor-api의 핵심 로직", () => {
  it("완전한 월을 찾으면 그 상세 결과(locgo/metco)를 탐색 중 받은 값 그대로 재사용하고, 다시 조회하지 않는다", async () => {
    const locgoData = successFor("202606", "30200");
    const metcoData = successFor("202606", "30");
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => (p.baseYm === "202606" ? locgoData : successFor(p.baseYm, "30200")));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => (p.baseYm === "202606" ? metcoData : successFor(p.baseYm, "30")));
    const checkCache = vi.fn(async () => false);

    const report = await runVisitorApiVerification({ serviceKey: "test-key", baseUrl: "https://example.test", now: NOW, fetchLocgo, fetchMetco, checkCache });

    expect(report.searchResult.state).toBe("LIVE_COMPLETE");
    expect(report.locgo).toBe(locgoData);
    expect(report.metco).toBe(metcoData);
    // 202606 하나만 확인해서 바로 완전했으므로 fetch는 각각 정확히 1회씩만 호출된다 — 상세 보고를 위한
    // 추가 호출이 없다.
    expect(fetchLocgo).toHaveBeenCalledTimes(1);
    expect(fetchMetco).toHaveBeenCalledTimes(1);
  });

  it("완전한 월을 찾지 못하면 locgo/metco 필드 없이 탐색 결과만 반환한다", async () => {
    const fetchLocgo = vi.fn(async () => ({ status: "EMPTY", resultCode: "0000", resultMsg: "OK", rawPages: [], byCode: new Map() }) as VisitorCntFetchResult);
    const fetchMetco = vi.fn(async () => ({ status: "EMPTY", resultCode: "0000", resultMsg: "OK", rawPages: [], byCode: new Map() }) as VisitorCntFetchResult);
    const checkCache = vi.fn(async () => false);

    const report = await runVisitorApiVerification({ serviceKey: "test-key", baseUrl: "https://example.test", now: NOW, fetchLocgo, fetchMetco, checkCache });

    expect(report.searchResult.state).toBe("NONE_AVAILABLE");
    expect(report.locgo).toBeUndefined();
    expect(report.metco).toBeUndefined();
  });
});
