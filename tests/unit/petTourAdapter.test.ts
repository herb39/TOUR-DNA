import { describe, expect, it } from "vitest";
import {
  buildPetTourDetailUrl,
  parsePetTourDetailResponse,
  parsePetTourListResponse,
} from "@/lib/public-data/adapters/petTour";

function envelope(items: unknown, resultCode = "0000", resultMsg = "OK", totalCount = 1) {
  return {
    response: {
      header: { resultCode, resultMsg },
      body: { items: { item: items }, totalCount, pageNo: 1, numOfRows: 10 },
    },
  };
}

describe("petTour adapter", () => {
  it("목록의 단일 객체·배열을 contentId 기준으로 읽는다", () => {
    const single = parsePetTourListResponse(
      envelope({ contentid: 123, title: "테스트", modifiedtime: "20260819010101", showflag: "1" }),
    );
    const multiple = parsePetTourListResponse(
      envelope([
        { contentid: "123", title: "하나" },
        { contentid: "456", title: "둘" },
      ], "0000", "OK", 2),
    );

    expect(single.status).toBe("SUCCESS");
    expect(single.items[0].contentid).toBe("123");
    expect(multiple.items.map((item) => item.contentid)).toEqual(["123", "456"]);
  });

  it("항목 일부가 깨져도 유효한 항목은 보존하고 전부 깨지면 ERROR로 남긴다", () => {
    const partial = parsePetTourListResponse(
      envelope([{ contentid: "123", title: "정상" }, { title: "contentId 없음" }], "0000", "OK", 2),
    );
    const malformed = parsePetTourListResponse(envelope([{ title: "contentId 없음" }]));

    expect(partial.status).toBe("SUCCESS");
    expect(partial.items).toHaveLength(1);
    expect(partial.malformedItemCount).toBe(1);
    expect(malformed.status).toBe("ERROR");
    expect(malformed.resultCode).toBe("MALFORMED_ITEM");
  });

  it("공식 no-data 응답은 EMPTY이며 상세 URL에는 contentTypeId를 넣지 않는다", () => {
    const empty = parsePetTourListResponse(envelope("", "03", "NO DATA", 0));
    const detailUrl = buildPetTourDetailUrl({ serviceKey: "test-key", contentId: "123" });
    const detail = parsePetTourDetailResponse(
      envelope({ contentid: "123", acmpyTypeCd: "전구역 동반가능", acmpyNeedMtr: "목줄" }),
    );

    expect(empty.status).toBe("EMPTY");
    expect(detailUrl).not.toContain("contentTypeId");
    expect(detail.items[0].rawPayload.acmpyTypeCd).toBe("전구역 동반가능");
  });
});
