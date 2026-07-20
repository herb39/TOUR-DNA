import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePublicDataEnvelope } from "@/lib/public-data/types";

const itemSchema = z.object({
  areaCd: z.string().nullable().optional(),
  baseYm: z.string(),
  tarSvcDemIxVal: z.coerce.number(),
});

function envelope(resultCode: string, resultMsg: string, items: unknown) {
  return {
    response: {
      header: { resultCode, resultMsg },
      body: { items: { item: items }, numOfRows: 1, pageNo: 1, totalCount: 1 },
    },
  };
}

describe("parsePublicDataEnvelope", () => {
  it("배열 응답을 그대로 정규화한다", () => {
    const raw = envelope("0000", "OK", [
      { baseYm: "202509", tarSvcDemIxVal: "74" },
      { baseYm: "202509", tarSvcDemIxVal: "60" },
    ]);
    const result = parsePublicDataEnvelope(itemSchema, raw);
    expect(result.status).toBe("SUCCESS");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].tarSvcDemIxVal).toBe(74);
  });

  it("객체 1건 응답을 배열로 정규화한다", () => {
    const raw = envelope("0000", "OK", { baseYm: "202509", tarSvcDemIxVal: "74" });
    const result = parsePublicDataEnvelope(itemSchema, raw);
    expect(result.status).toBe("SUCCESS");
    expect(result.items).toHaveLength(1);
  });

  it("빈 문자열 items를 EMPTY로 처리한다 (성공이지만 0건)", () => {
    const raw = envelope("0000", "OK", "");
    const result = parsePublicDataEnvelope(itemSchema, raw);
    expect(result.status).toBe("EMPTY");
    expect(result.items).toHaveLength(0);
  });

  it("HTTP 200이어도 루트 resultCode가 실패면 ERROR로 처리한다", () => {
    const raw = envelope("99", "SERVICE ERROR", [{ baseYm: "202509", tarSvcDemIxVal: "74" }]);
    const result = parsePublicDataEnvelope(itemSchema, raw);
    expect(result.status).toBe("ERROR");
    expect(result.items).toHaveLength(0);
  });

  it("문자열 숫자를 숫자로 강제 변환한다", () => {
    const raw = envelope("0000", "OK", { baseYm: "202509", tarSvcDemIxVal: "74.5" });
    const result = parsePublicDataEnvelope(itemSchema, raw);
    expect(typeof result.items[0].tarSvcDemIxVal).toBe("number");
    expect(result.items[0].tarSvcDemIxVal).toBe(74.5);
  });
});
