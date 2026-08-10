import { z } from "zod";
import {
  ALL_PROMO_CHANNELS,
  DEFAULT_CHANNEL_PRIORITY,
  PROMO_CONTENT_VERSION,
  isValidChannelPriority,
  type PromoContent,
} from "@/lib/domain/promoContent";

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

const shortFormSceneSchema = z.object({
  scene: z.number().finite(),
  visual: z.string(),
  caption: z.string(),
  narration: z.string(),
});
const shortFormSchema = z.object({
  title: z.string(),
  hook: z.string(),
  scenes: z.array(shortFormSceneSchema),
  cta: z.string(),
});
/** shortForm 도입(2026-08-11) 이전 저장된 홍보자료에 대한 fallback — cardNews와 동일한 원칙. */
const EMPTY_SHORT_FORM = { title: "", hook: "", scenes: [], cta: "" };

const promoChannelSchema = z.enum(ALL_PROMO_CHANNELS);

/** `channelPriority`가 지원 채널 전체를 정확히 한 번씩 포함한 순열인지 확인한다(2026-08-01) —
 * `isValidChannelPriority`(promoContent.ts)를 그대로 재사용해 "전체 채널 목록"의 단일 소스를
 * 유지한다(zod enum도 같은 `ALL_PROMO_CHANNELS`에서 파생). 빈 배열/중복/일부 누락/순서 조작으로
 * 채널을 숨기는 값을 모두 거부한다. */
const strictChannelPrioritySchema = z
  .array(promoChannelSchema)
  .refine(isValidChannelPriority, {
    message: `channelPriority는 지원 채널(${ALL_PROMO_CHANNELS.join(", ")})을 정확히 한 번씩 포함해야 합니다.`,
  });

const baseObjectShape = {
  version: z.literal(PROMO_CONTENT_VERSION),
  proposalSummary: proposalSummarySchema,
  landing: landingSchema,
  instagram: instagramSchema,
  blog: blogSchema,
  cardNews: cardNewsSchema.optional(),
  roleContent: z.discriminatedUnion("role", [travelAgencyPromoSchema, localGovPromoSchema, festivalPlannerPromoSchema]),
  shortForm: shortFormSchema.optional(),
  evidenceReferences: z.array(promoEvidenceReferenceSchema),
  courseHighlights: z.array(promoCourseHighlightSchema),
  translationNotice: z.string().nullable().optional(),
} as const;

// cardNews/channelPriority/translationNotice는 2026-07-31에, shortForm은 2026-08-11에 추가됐다 —
// 그 이전에 저장된 홍보자료(v1 초기 형태)에는 이 필드들이 아예 없다. 조회(레거시 파싱) 경로는 관대하게
// 받는다: 필드가 없으면 기본값, "있지만 형식은 맞고 값 자체가 잘못된"(빈 배열·중복·일부 누락)
// channelPriority도 조용히 채널을 숨기지 않도록 기본 순서로 안전하게 복구한다 — 기존 정상 데이터가
// "형식 오류"로 막히지 않아야 하기 때문에 여기서는 절대 실패시키지 않는다(2026-08-01 보완).
const promoContentReadSchema = z
  .object({
    ...baseObjectShape,
    channelPriority: z.array(promoChannelSchema).optional(),
  })
  .transform((data) => ({
    ...data,
    cardNews: data.cardNews ?? { slides: [] },
    shortForm: data.shortForm ?? EMPTY_SHORT_FORM,
    channelPriority: data.channelPriority && isValidChannelPriority(data.channelPriority) ? data.channelPriority : DEFAULT_CHANNEL_PRIORITY,
    translationNotice: data.translationNotice ?? null,
  }));

// 신규 저장 입력(사용자가 편집해 보낸 값)은 엄격하게 검증한다 — channelPriority가 전체 순열이 아니면
// 저장 자체를 거부한다(2026-08-01 보완). 저장 시점에는 서비스 계층(promoContentService.ts)이 이 값을
//그대로 신뢰하지 않고 실제 프로젝트 역할로 다시 계산해 덮어쓰지만, 그 전에도 형식 자체는 명확히
// 검증해 잘못된 값이 애초에 통과하지 않게 한다.
const promoContentSaveSchema = z
  .object({
    ...baseObjectShape,
    channelPriority: strictChannelPrioritySchema,
  })
  .transform((data) => ({
    ...data,
    cardNews: data.cardNews ?? { slides: [] },
    shortForm: data.shortForm ?? EMPTY_SHORT_FORM,
    translationNotice: data.translationNotice ?? null,
  }));

export type PromoContentParseResult = { ok: true; value: PromoContent } | { ok: false; message: string };

/** 조회(저장된 값을 화면에 보여줄 때) 전용 — 레거시 데이터를 관대하게 받아들인다. */
export function parsePromoContent(value: unknown): PromoContentParseResult {
  const result = promoContentReadSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, message: "홍보자료 데이터 형식이 올바르지 않습니다." };
  }
  return { ok: true, value: result.data };
}

/** 저장(사용자가 편집한 값을 DB에 쓸 때) 전용 — channelPriority 등 형식을 엄격하게 검증한다. */
export function parsePromoContentForSave(value: unknown): PromoContentParseResult {
  const result = promoContentSaveSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, message: "홍보자료 데이터 형식이 올바르지 않습니다." };
  }
  return { ok: true, value: result.data };
}
