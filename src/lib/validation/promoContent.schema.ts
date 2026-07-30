import { z } from "zod";
import { DEFAULT_CHANNEL_PRIORITY, PROMO_CONTENT_VERSION, type PromoContent } from "@/lib/domain/promoContent";

/**
 * DB에 저장된(또는 클라이언트가 편집해 보낸) 홍보자료 JSON이 Phase 5-A `PromoContent`와 실제로 일치하는지
 * 런타임으로 검증한다. `storedValue as PromoContent` 같은 단언으로 통과시키지 않기 위한 유일한 통로다 —
 * 이 스키마를 거치지 않은 값은 절대 `PromoContent`로 취급하지 않는다.
 */

const dataProvenanceSchema = z.enum(["LIVE_API", "CACHED_API", "CURATED", "ESTIMATED", "MISSING"]);
const mealPurposeSchema = z.enum(["LUNCH", "DINNER", "GENERAL"]);

const promoEvidenceReferenceSchema = z.object({
  metricCode: z.string(),
  rawValue: z.number().finite(),
  unit: z.string().nullable(),
  sourceCode: z.string(),
  baseYm: z.string(),
  provenance: dataProvenanceSchema,
  isEstimated: z.boolean(),
});

const promoCourseHighlightSchema = z.object({
  dayIndex: z.number().finite(),
  poiName: z.string(),
  category: z.string(),
  timeSlot: z.string(),
  mealPurpose: mealPurposeSchema.nullable(),
});

const proposalSummarySchema = z.object({
  sentences: z.tuple([z.string(), z.string(), z.string()]),
});

const landingSchema = z.object({ title: z.string(), body: z.string() });
const instagramSchema = z.object({ caption: z.string(), hashtags: z.array(z.string()) });
const blogSchema = z.object({ title: z.string(), body: z.string() });

const travelAgencyPromoSchema = z.object({
  role: z.literal("TRAVEL_AGENCY"),
  productName: z.string(),
  targetAudience: z.string(),
  sellingPoints: z.tuple([z.string(), z.string(), z.string()]),
  itineraryHighlight: z.string(),
});

const localGovPromoSchema = z.object({
  role: z.literal("LOCAL_GOV"),
  title: z.string(),
  lead: z.string(),
  background: z.string(),
  coreProgram: z.string(),
  dataBasedEvidence: z.array(z.string()),
  expectedEffects: z.array(z.string()),
});

const festivalPlannerPromoSchema = z.object({
  role: z.literal("FESTIVAL_PLANNER"),
  title: z.string(),
  programHighlight: z.string(),
  timeSlotPlan: z.array(z.string()),
  retentionTip: z.string(),
  operationChecklist: z.array(z.string()),
  risks: z.array(z.string()),
});

const cardNewsSlideSchema = z.object({ title: z.string(), body: z.string() });
const cardNewsSchema = z.object({ slides: z.array(cardNewsSlideSchema) });
const promoChannelSchema = z.enum(["proposalSummary", "landing", "instagram", "blog", "cardNews", "roleContent"]);

// cardNews/channelPriority/translationNotice는 2026-07-31에 추가됐다 — 그 이전에 저장된 홍보자료(v1
// 초기 형태)에는 이 필드들이 아예 없다. optional로 받아들이고 파싱 후 안전한 기본값으로 채워 넣는다
// (기존 프로젝트가 새 필드 때문에 "형식이 올바르지 않음"으로 막히지 않도록 하는 하위 호환 처리).
const promoContentSchema = z
  .object({
    version: z.literal(PROMO_CONTENT_VERSION),
    proposalSummary: proposalSummarySchema,
    landing: landingSchema,
    instagram: instagramSchema,
    blog: blogSchema,
    cardNews: cardNewsSchema.optional(),
    roleContent: z.discriminatedUnion("role", [travelAgencyPromoSchema, localGovPromoSchema, festivalPlannerPromoSchema]),
    evidenceReferences: z.array(promoEvidenceReferenceSchema),
    courseHighlights: z.array(promoCourseHighlightSchema),
    channelPriority: z.array(promoChannelSchema).optional(),
    translationNotice: z.string().nullable().optional(),
  })
  .transform((data) => ({
    ...data,
    cardNews: data.cardNews ?? { slides: [] },
    channelPriority: data.channelPriority ?? DEFAULT_CHANNEL_PRIORITY,
    translationNotice: data.translationNotice ?? null,
  }));

export type PromoContentParseResult = { ok: true; value: PromoContent } | { ok: false; message: string };

export function parsePromoContent(value: unknown): PromoContentParseResult {
  const result = promoContentSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, message: "홍보자료 데이터 형식이 올바르지 않습니다." };
  }
  return { ok: true, value: result.data };
}
