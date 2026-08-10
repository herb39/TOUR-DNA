// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 유사지역 비교와 무관한 별개 버그 수정(2026-08-10) — baseYm=202606 전국 배치 중 인천 신설
 * 자치구(제물포구·영종구·서해구·검단구) 4곳에서 TOU_DIV_IX가 매번 ERROR("모든 코드 호출/파싱 실패")로
 * 떨어지는 것을 발견했다. 실제 원본 응답을 확인해보니 공공데이터포털이 resultCode=0000(정상)으로
 * 응답했고 단지 그 지역에 해당 통계가 없을 뿐이었다(TAR_SVC_DEM 등 다른 소스는 같은 지역을 EMPTY로
 * 정상 처리함). fetchTouDivIx가 "13개 코드 전부 값이 null"이면 무조건 ERROR로 판정해, 정상
 * 호출/파싱(EMPTY)과 진짜 네트워크·파싱 실패를 구분하지 못한 것이 원인이었다 — 이 테스트가 그 구분을
 * 고정한다.
 */

const fetchPublicDataJson = vi.fn();
vi.mock("../../src/lib/public-data/client", () => ({
  fetchPublicDataJson: (...args: unknown[]) => fetchPublicDataJson(...args),
}));

import { fetchTouDivIx } from "@/lib/public-data/adapters/touDivIx";

function emptyEnvelope() {
  return {
    ok: true,
    data: {
      response: {
        header: { resultCode: "0000", resultMsg: "OK" },
        body: { items: "", pageNo: 1, numOfRows: 0, totalCount: 0 },
      },
    },
  };
}

function successEnvelope(code: string, valKey: string, val: number) {
  return {
    ok: true,
    data: {
      response: {
        header: { resultCode: "0000", resultMsg: "OK" },
        body: { items: { item: { [valKey]: val } }, pageNo: 1, numOfRows: 1, totalCount: 1 },
      },
    },
  };
}

const params = {
  serviceKey: "test-key",
  baseUrl: "https://example.test",
  areaCd: "28",
  signguCd: "28125",
  baseYm: "202606",
};

beforeEach(() => {
  fetchPublicDataJson.mockReset();
});

describe("fetchTouDivIx — EMPTY vs ERROR 판정", () => {
  it("13개 코드 전부 정상 응답(resultCode=0000)인데 값이 없으면 EMPTY다(ERROR 아님)", async () => {
    fetchPublicDataJson.mockResolvedValue(emptyEnvelope());

    const result = await fetchTouDivIx(params);

    expect(result.status).toBe("EMPTY");
    expect(result.composite).toBeNull();
  });

  it("13개 코드 전부 네트워크 호출 자체가 실패하면 ERROR고, 실제 실패 사유를 그대로 노출한다", async () => {
    fetchPublicDataJson.mockResolvedValue({ ok: false, errorMessage: "HTTP 500" });

    const result = await fetchTouDivIx(params);

    expect(result.status).toBe("ERROR");
    if (result.status === "ERROR") {
      expect(result.resultMsg).toBe("HTTP 500");
    }
  });

  it("일부 코드만 값이 있어도 SUCCESS로 종합 점수를 계산한다(기존 동작 회귀 없음)", async () => {
    fetchPublicDataJson.mockImplementation((url: string) => {
      if (url.includes("touDivIxCd=3101")) return Promise.resolve(successEnvelope("3101", "touDivIxVal", 50));
      return Promise.resolve(emptyEnvelope());
    });

    const result = await fetchTouDivIx(params);

    expect(result.status).toBe("SUCCESS");
    expect(result.composite).not.toBeNull();
  });
});

/**
 * 2026-08-10 발견 — baseYm=202606 3차 전국 배치에서 TOU_DIV_IX가 HTTP 429를 1,566회 받았는데도
 * 모든 지역이 SUCCESS/EMPTY로 끝나 `failed: 0`으로 보고돼 quota 초과 자체를 완전히 놓쳤다. 13개
 * 코드 중 일부만 429를 맞고 나머지가 정상이면 전체 status는 정상 계산되지만(부분 실패 흡수는 의도된
 * 동작), quota 신호 자체는 quotaSignal로 별도로 드러나야 한다.
 */
describe("fetchTouDivIx — 부분 429도 quotaSignal로 드러낸다", () => {
  it("13개 중 일부만 429고 나머지가 정상 응답이면 status는 정상 계산되지만 quotaSignal이 채워진다", async () => {
    fetchPublicDataJson.mockImplementation((url: string) => {
      if (url.includes("touDivIxCd=3101")) return Promise.resolve(successEnvelope("3101", "touDivIxVal", 50));
      if (url.includes("touDivIxCd=3102")) return Promise.resolve({ ok: false, errorMessage: "HTTP 429" });
      return Promise.resolve(emptyEnvelope());
    });

    const result = await fetchTouDivIx(params);

    expect(result.status).toBe("SUCCESS");
    expect(result.quotaSignal).toBe("HTTP 429");
  });

  it("429가 전혀 없으면 quotaSignal은 null이다", async () => {
    fetchPublicDataJson.mockResolvedValue(emptyEnvelope());

    const result = await fetchTouDivIx(params);

    expect(result.quotaSignal).toBeNull();
  });
});
