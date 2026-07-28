// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { currentBaseYm, lookbackCandidates, findLatestCompleteVisitorBaseYm } from "@/lib/services/visitorBaseYmFinder";
import { expectedDatesOfMonth } from "@/lib/services/visitorMonthCompleteness";
import type { VisitorCntFetchResult, VisitorCntParams } from "@/lib/public-data/adapters/visitorCnt";

// 이 파일은 findLatestCompleteVisitorBaseYm의 탐색 순서·최대 개월 제한·캐시 우선·오류 중단 로직만
// 검증한다 — fetchLocgo/fetchMetco/checkCache 전부 순수 함수 인자로 주입하므로 실제 API/DB에는
// 전혀 접근하지 않는다.

const NOW = new Date(2026, 6, 28); // 2026-07-28 → currentBaseYm은 "202607"

function successFor(baseYm: string, code: string): VisitorCntFetchResult {
  return {
    status: "SUCCESS",
    resultCode: "0000",
    resultMsg: "OK",
    rawPages: [{ dummy: true }],
    byCode: new Map([
      [
        code,
        {
          code,
          name: null,
          localNum: 0,
          otherDomesticNum: 0,
          foreignNum: 0,
          visitorCnt: 0,
          rawItems: expectedDatesOfMonth(baseYm).map((baseYmd) => ({ code, touDivCd: "2", touNum: 1, baseYmd })),
        },
      ],
    ]),
  };
}

function partialFor(baseYm: string, code: string): VisitorCntFetchResult {
  const full = successFor(baseYm, code);
  if (full.status !== "SUCCESS") throw new Error("unreachable");
  const agg = full.byCode.get(code)!;
  return { ...full, byCode: new Map([[code, { ...agg, rawItems: agg.rawItems.slice(0, 5) }]]) };
}

function emptyResult(): VisitorCntFetchResult {
  return { status: "EMPTY", resultCode: "0000", resultMsg: "OK", rawPages: [{ dummy: true }], byCode: new Map() };
}

function errorResult(msg = "SERVICE ERROR"): VisitorCntFetchResult {
  return { status: "ERROR", byCode: null, resultCode: "99", resultMsg: msg, rawPages: [{ dummy: true }] };
}

describe("currentBaseYm / lookbackCandidates", () => {
  it("주입한 now 기준 진행 중인 달의 baseYm을 계산한다", () => {
    expect(currentBaseYm(NOW)).toBe("202607");
  });

  it("이번 달을 절대 포함하지 않고 직전 달부터 과거 방향으로 반환한다", () => {
    const candidates = lookbackCandidates(NOW, 6);
    expect(candidates).not.toContain("202607");
    expect(candidates).toEqual(["202606", "202605", "202604", "202603", "202602", "202601"]);
  });

  it("maxLookback을 넘겨주면 그 개수만큼만 반환한다(기본 6개월 제한)", () => {
    expect(lookbackCandidates(NOW, 3)).toHaveLength(3);
    expect(lookbackCandidates(NOW)).toHaveLength(6);
  });
});

describe("findLatestCompleteVisitorBaseYm", () => {
  const baseDeps = { serviceKey: "test-key", baseUrl: "https://example.test", now: NOW };

  it("가장 최근 후보가 완전하면 즉시 LIVE_COMPLETE로 반환하고 더 과거는 확인하지 않는다", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30200"));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30"));
    const checkCache = vi.fn(async () => false);

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("LIVE_COMPLETE");
    expect(result.state === "LIVE_COMPLETE" && result.baseYm).toBe("202606");
    expect(fetchLocgo).toHaveBeenCalledTimes(1);
    expect(fetchMetco).toHaveBeenCalledTimes(1);
  });

  it("기초지자체가 불완전한 달은 건너뛰고 그 이전 완전한 달을 선택한다", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => (p.baseYm === "202606" ? partialFor(p.baseYm, "30200") : successFor(p.baseYm, "30200")));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30"));
    const checkCache = vi.fn(async () => false);

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("LIVE_COMPLETE");
    expect(result.state === "LIVE_COMPLETE" && result.baseYm).toBe("202605");
    expect(result.checked.map((c) => c.baseYm)).toEqual(["202606"]);
    expect(result.checked[0].reason).toBe("LOCGO_INCOMPLETE_DATES");
  });

  it("광역지자체가 불완전한 달도 동일하게 건너뛴다", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30200"));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => (p.baseYm === "202606" ? partialFor(p.baseYm, "30") : successFor(p.baseYm, "30")));
    const checkCache = vi.fn(async () => false);

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("LIVE_COMPLETE");
    expect(result.state === "LIVE_COMPLETE" && result.baseYm).toBe("202605");
    expect(result.checked[0].reason).toBe("METCO_INCOMPLETE_DATES");
  });

  it("EMPTY인 달은 불완전으로 건너뛰고 계속 과거로 탐색한다", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => (p.baseYm === "202606" ? emptyResult() : successFor(p.baseYm, "30200")));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30"));
    const checkCache = vi.fn(async () => false);

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("LIVE_COMPLETE");
    expect(result.state === "LIVE_COMPLETE" && result.baseYm).toBe("202605");
  });

  it("ERROR가 발생하면 그 시점에서 즉시 탐색을 중단하고 API_ERROR를 반환한다(더 과거를 시도하지 않음)", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => (p.baseYm === "202606" ? errorResult("NETWORK_ERROR") : successFor(p.baseYm, "30200")));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30"));
    const checkCache = vi.fn(async () => false);

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("API_ERROR");
    expect(result.state === "API_ERROR" && result.baseYm).toBe("202606");
    expect(fetchLocgo).toHaveBeenCalledTimes(1); // 202605 등 과거 달은 시도하지 않았다.
  });

  it("6개월 모두 불완전하면 더 이상 탐색하지 않고 NONE_AVAILABLE을 반환한다", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => partialFor(p.baseYm, "30200"));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30"));
    const checkCache = vi.fn(async () => false);

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("NONE_AVAILABLE");
    expect(result.checked).toHaveLength(6);
    expect(fetchLocgo).toHaveBeenCalledTimes(6);
  });

  it("가장 최근 후보가 이미 캐시돼 있으면 API를 전혀 호출하지 않고 CACHED를 반환한다", async () => {
    const fetchLocgo = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30200"));
    const fetchMetco = vi.fn(async (p: VisitorCntParams) => successFor(p.baseYm, "30"));
    const checkCache = vi.fn(async (baseYm: string) => baseYm === "202606");

    const result = await findLatestCompleteVisitorBaseYm({ ...baseDeps, fetchLocgo, fetchMetco, checkCache });

    expect(result.state).toBe("CACHED");
    expect(result.state === "CACHED" && result.baseYm).toBe("202606");
    expect(fetchLocgo).not.toHaveBeenCalled();
    expect(fetchMetco).not.toHaveBeenCalled();
  });
});
