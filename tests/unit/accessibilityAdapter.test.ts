import { describe, expect, it } from "vitest";
import {
  buildAccessibilityDetailUrl,
  parseAccessibilityDetailResponse,
  parseAccessibilityListResponse,
} from "@/lib/public-data/adapters/accessibility";

function envelope(items: unknown, resultCode = "0000", resultMsg = "OK", totalCount = 1) {
  return {
    response: {
      header: { resultCode, resultMsg },
      body: { items: { item: items }, totalCount, pageNo: 1, numOfRows: 10 },
    },
  };
}

describe("accessibility adapter", () => {
  it("목록과 상세의 단일 객체·배열을 읽는다", () => {
    const single = parseAccessibilityListResponse(
      envelope({ contentid: 123, title: "테스트", modifiedtime: "20260819010101", showflag: "1" }),
    );
    const multiple = parseAccessibilityListResponse(
      envelope([{ contentid: "123", title: "하나" }, { contentid: "456", title: "둘" }], "0000", "OK", 2),
    );
    const detail = parseAccessibilityDetailResponse(
      envelope({ contentid: "123", wheelchair: "휠체어 접근 가능", restroom: "있음" }),
    );

    expect(single.status).toBe("SUCCESS");
    expect(single.items[0].contentid).toBe("123");
    expect(multiple.items.map((item) => item.contentid)).toEqual(["123", "456"]);
    expect(detail.items[0].contentId).toBe("123");
    expect(detail.items[0].rawPayload.wheelchair).toBe("휠체어 접근 가능");
  });

  it("공식 no-data, API 오류, 비정상 응답을 구분한다", () => {
    expect(parseAccessibilityListResponse(envelope("", "03", "NO DATA", 0)).status).toBe("EMPTY");
    expect(parseAccessibilityDetailResponse(envelope({ contentid: "123" }, "10", "SERVICE ERROR")).status).toBe("ERROR");
    expect(parseAccessibilityListResponse({ response: { header: { resultCode: "0000" }, body: { items: [] } } }).status).toBe("ERROR");
    expect(parseAccessibilityListResponse(envelope([{ title: "contentId 없음" }])).resultCode).toBe("MALFORMED_ITEM");
  });

  it("상세 URL은 contentId만 사용하고 contentTypeId는 사용하지 않는다", () => {
    const url = buildAccessibilityDetailUrl({ serviceKey: "test-key", contentId: "123" });
    expect(url).toContain("contentId=123");
    expect(url).not.toContain("contentTypeId");
  });
});
