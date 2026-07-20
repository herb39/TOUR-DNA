import { z } from "zod";

/**
 * 공공데이터포털 공통 응답 스키마.
 * - items는 빈 문자열("") / 객체 1건 / 배열 여러 건으로 올 수 있다.
 * - 숫자 필드가 문자열로 올 수 있어 coerce로 흡수한다.
 * - 루트 resultCode/resultMsg가 HTTP 200 안에서도 에러를 나타낼 수 있다.
 */
export const publicDataHeaderSchema = z.object({
  resultCode: z.string(),
  resultMsg: z.string(),
});

export function itemsSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.union([z.literal(""), itemSchema, z.array(itemSchema)]);
}

export function publicDataEnvelopeSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    response: z.object({
      header: publicDataHeaderSchema,
      body: z.object({
        items: z.object({ item: itemsSchema(itemSchema) }).or(z.literal("")),
        numOfRows: z.coerce.number().optional(),
        pageNo: z.coerce.number().optional(),
        totalCount: z.coerce.number().optional(),
      }),
    }),
  });
}

export const SUCCESS_RESULT_CODE = "0000";

export interface NormalizedItemsResult<T> {
  status: "SUCCESS" | "EMPTY" | "ERROR";
  items: T[];
  resultCode: string;
  resultMsg: string;
}

/** items가 ""(빈 문자열)/객체 1건/배열 중 무엇이든 항상 배열로 정규화한다. */
export function parsePublicDataEnvelope<T extends z.ZodTypeAny>(
  itemSchema: T,
  raw: unknown,
): NormalizedItemsResult<z.infer<T>> {
  const envelope = publicDataEnvelopeSchema(itemSchema).parse(raw);
  const { resultCode, resultMsg } = envelope.response.header;

  if (resultCode !== SUCCESS_RESULT_CODE) {
    return { status: "ERROR", items: [], resultCode, resultMsg };
  }

  const rawItems = envelope.response.body.items;
  if (typeof rawItems === "string") {
    return { status: "EMPTY", items: [], resultCode, resultMsg };
  }
  const itemField = (rawItems as { item: "" | z.infer<T> | z.infer<T>[] }).item;
  if (itemField === "") {
    return { status: "EMPTY", items: [], resultCode, resultMsg };
  }
  const items = Array.isArray(itemField) ? itemField : [itemField];
  return { status: items.length === 0 ? "EMPTY" : "SUCCESS", items, resultCode, resultMsg };
}
