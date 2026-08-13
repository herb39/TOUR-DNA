import { z } from "zod";
import type { PromoGenerationContext, PromoUserRole } from "@/lib/domain/promoContent";
import {
  proposalSummarySchema,
  landingSchema,
  instagramSchema,
  blogSchema,
  cardNewsSchema,
  shortFormSchema,
  travelAgencyPromoSchema,
  localGovPromoSchema,
  festivalPlannerPromoSchema,
} from "@/lib/validation/promoContent.schema";
import { callPromoLlmTool, isPromoLlmConfigured, type PromoLlmFailureReason } from "./promoLlmClient";

/**
 * `PromoGenerationContext`(promoContent.ts)를 입력으로 받아 LLM에게 홍보 콘텐츠 7개 채널 중
 * (roleContent 포함) 문구 채널만 생성하게 하는 오케스트레이션 계층(2026-08-11).
 *
 * DNA 점수·전략 후보·POI 선택·실행안·KPI 계산은 이 파일에서 절대 다시 계산하거나 LLM에게 판단을
 * 맡기지 않는다 — ctx에 이미 확정된 값만 "사실"로 프롬프트에 전달하고, 그 값만으로 문구를 쓰게 한다.
 * evidenceReferences/courseHighlights/channelPriority/translationNotice/version은 이 파일이 건드리지
 * 않는다(호출부인 promoContentService.ts가 규칙 기반 결과에서 그대로 가져와 합성한다).
 */

const TOOL_NAME = "emit_promo_content";

/** 채널 공통 필드(roleContent 제외) — role별 스키마 3개가 이 shape을 반복하지 않도록 공유한다. */
const commonChannelsShape = {
  proposalSummary: proposalSummarySchema,
  landing: landingSchema,
  instagram: instagramSchema,
  blog: blogSchema,
  cardNews: cardNewsSchema,
  shortForm: shortFormSchema,
};

const travelAgencyLlmOutputSchema = z.object({
  ...commonChannelsShape,
  roleContent: travelAgencyPromoSchema.omit({ role: true }),
});
const localGovLlmOutputSchema = z.object({
  ...commonChannelsShape,
  roleContent: localGovPromoSchema.omit({ role: true }),
});
const festivalPlannerLlmOutputSchema = z.object({
  ...commonChannelsShape,
  roleContent: festivalPlannerPromoSchema.omit({ role: true }),
});

export type PromoLlmChannels = {
  proposalSummary: z.infer<typeof proposalSummarySchema>;
  landing: z.infer<typeof landingSchema>;
  instagram: z.infer<typeof instagramSchema>;
  blog: z.infer<typeof blogSchema>;
  cardNews: z.infer<typeof cardNewsSchema>;
  shortForm: z.infer<typeof shortFormSchema>;
  roleContent:
    | ({ role: "TRAVEL_AGENCY" } & z.infer<typeof travelAgencyPromoSchema>)
    | ({ role: "LOCAL_GOV" } & z.infer<typeof localGovPromoSchema>)
    | ({ role: "FESTIVAL_PLANNER" } & z.infer<typeof festivalPlannerPromoSchema>);
};

export type PromoLlmGenerationResult =
  | { ok: true; channels: PromoLlmChannels }
  | { ok: false; reason: PromoLlmFailureReason | "not_configured" };

const roleContentJsonSchemaByRole: Record<PromoUserRole, Record<string, unknown>> = {
  TRAVEL_AGENCY: {
    type: "object",
    additionalProperties: false,
    properties: {
      productName: { type: "string" },
      targetAudience: { type: "string" },
      sellingPoints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      itineraryHighlight: { type: "string" },
    },
    required: ["productName", "targetAudience", "sellingPoints", "itineraryHighlight"],
  },
  LOCAL_GOV: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      lead: { type: "string" },
      background: { type: "string" },
      coreProgram: { type: "string" },
      dataBasedEvidence: { type: "array", items: { type: "string" } },
      expectedEffects: { type: "array", items: { type: "string" } },
    },
    required: ["title", "lead", "background", "coreProgram", "dataBasedEvidence", "expectedEffects"],
  },
  FESTIVAL_PLANNER: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      programHighlight: { type: "string" },
      timeSlotPlan: { type: "array", items: { type: "string" } },
      retentionTip: { type: "string" },
      operationChecklist: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["title", "programHighlight", "timeSlotPlan", "retentionTip", "operationChecklist", "risks"],
  },
};

/** OpenRouter의 `response_format: { type: "json_schema", strict: true }`가 강제로 채우게 할 JSON
 * Schema. 자유 텍스트 응답을 regex로 파싱하지 않기 위해 채널별 필드를 전부 명시한다 — role별로
 * roleContent 모양만 다르다. 모든 object 노드에 `additionalProperties: false`를 명시해 strict
 * structured output 요구사항(모든 object가 닫혀 있어야 함)을 만족한다. */
function buildToolInputSchema(role: PromoUserRole): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      proposalSummary: {
        type: "object",
        additionalProperties: false,
        properties: { sentences: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 } },
        required: ["sentences"],
      },
      landing: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
      instagram: {
        type: "object",
        additionalProperties: false,
        properties: { caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } } },
        required: ["caption", "hashtags"],
      },
      blog: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
      cardNews: {
        type: "object",
        additionalProperties: false,
        properties: {
          // maxItems=7(2026-08-13 추가): 규칙 기반 생성기(buildCardNews)의 실제 최대 슬라이드 수(표지·
          // 문제/기회·핵심전략·대표 방문지 최대 3장·마무리 = 최대 7장)와 맞춘 상한이다 — 사용자가 보는
          // 카드뉴스 분량을 줄이는 게 아니라, 이전에 상한이 없어 LLM이 그보다 훨씬 많은 슬라이드를
          // 생성할 수 있었던(불필요하게 큰 응답 payload/토큰 소모) 여지만 없앤다.
          slides: {
            type: "array",
            minItems: 3,
            maxItems: 7,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { title: { type: "string" }, body: { type: "string" } },
              required: ["title", "body"],
            },
          },
        },
        required: ["slides"],
      },
      shortForm: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          hook: { type: "string" },
          // maxItems=4(2026-08-13 추가): 규칙 기반 생성기(buildShortForm)의 실제 최대 장면 수(Hook 1 +
          // 대표 POI 최대 2 + CTA 1 = 최대 4)와 맞춘 상한이다 — 같은 이유로 상한만 추가한다.
          scenes: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                scene: { type: "integer" },
                visual: { type: "string" },
                caption: { type: "string" },
                narration: { type: "string" },
              },
              required: ["scene", "visual", "caption", "narration"],
            },
          },
          cta: { type: "string" },
        },
        required: ["title", "hook", "scenes", "cta"],
      },
      roleContent: roleContentJsonSchemaByRole[role],
    },
    required: ["proposalSummary", "landing", "instagram", "blog", "cardNews", "shortForm", "roleContent"],
  };
}

const ROLE_LABEL: Record<PromoUserRole, string> = {
  TRAVEL_AGENCY: "여행사/DMC — 판매 가능한 여행 상품·패키지를 제안하는 톤",
  LOCAL_GOV: "지자체 — 지역 홍보 사업/정책 추진을 제안하는 톤(보도자료·사업 제안 성격)",
  FESTIVAL_PLANNER: "축제 기획자 — 방문 유도와 프로그램 운영·홍보를 목적으로 하는 톤",
};

const SYSTEM_PROMPT = `당신은 TOUR-DNA의 관광 마케팅 콘텐츠 작성자입니다.

# 입력 사실
사용자 메시지에 "확인된 사실" 목록으로 제공되는 값만 사실로 취급하십시오. 그 목록에 없는 내용은
절대 만들지 마십시오.

# 금지 사항
다음은 입력에 명시적으로 없으면 절대 만들지 않습니다:
- 축제 실제 개최 여부, 운영시간, 가격, 할인, 교통편, 시설·서비스, 예약 가능 여부, 공식 이벤트 일정
- 외국어 안내 가능 여부, 외국인 친화 시설 여부, 특정 국가 관광객의 선호
- 검증되지 않은 통계 수치(제공된 근거 수치 외에는 새 숫자를 만들지 않음)
"해외 타깃"이라는 사실이 주어져도, 그로부터 다국어 안내·외국인 전용 서비스·특정 국적 취향을 추론해
새로 만들지 마십시오. 다국어 번역 자체도 만들지 마십시오(한국어로만 작성).

# 품질
지역명·전략명·실제 코스 방문지(POI)·DNA 강점·타깃·테마·여행월 등 제공된 구체적인 사실을 최대한
활용해, 어느 지역에나 적용 가능한 뻔한 일반 문구를 피하십시오. DNA 축의 내부 점수(숫자)가 주어지더라도
숫자를 문장에 그대로 쓰지 말고, 그 의미를 자연어 특성으로 풀어서 쓰십시오(예: "다양한 관광자원이
강점인 지역 특성").

# 채널별 스타일
- proposalSummary: 실무 제안서용 3문장 요약.
- landing: headline 역할의 title과, 핵심 가치·실제 코스 근거·CTA를 담은 subcopy 성격의 body.
- instagram: Hook으로 시작해 읽기 쉬운 짧은 문단들(줄바꿈 두 번으로 구분)로 caption을 구성하고,
  마지막에 CTA. hashtags는 '#' 없이 순수 텍스트로.
- blog: 실제 게시 가능한 초안 수준. title은 글 제목, body는 도입-추천 이유-동선-CTA 순서를 포함.
- cardNews: 슬라이드별로 역할이 분명해야 합니다(표지/지역 문제·기회/핵심 전략/코스/기대효과·CTA).
- shortForm: 15~30초 분량. Hook 장면 → 실제 POI 활용 장면들 → CTA 장면 순서. 각 장면은
  scene(번호)/visual(화면 구성 힌트)/caption(자막)/narration(내레이션 대본 한 줄)을 채웁니다.
- roleContent: 아래 "역할" 섹션의 톤을 반드시 반영하고, 역할명만 바꾼 것처럼 보이는 동일한 문장을
  피하십시오.

# 역할
`;

function buildEvidenceBullets(ctx: PromoGenerationContext): string[] {
  return ctx.evidenceHighlights.map((e) => {
    const valuePart = e.unit ? `${e.rawValue} ${e.unit}` : `${e.rawValue}`;
    return `- ${e.metricCode}: ${valuePart} (출처 ${e.sourceCode}, 기준월 ${e.baseYm}${e.isEstimated ? ", 추정값" : ""})`;
  });
}

function buildUserPrompt(ctx: PromoGenerationContext): string {
  const lines: string[] = [];
  lines.push("# 확인된 사실");
  lines.push(`- 지역: ${ctx.regionName}`);
  lines.push(`- 여행 시기: ${ctx.travelYear}년 ${ctx.travelMonth}월`);
  lines.push(`- 국적: ${ctx.nationality ?? "미지정"}`);
  if (ctx.preferredThemes.length > 0) lines.push(`- 선호 테마: ${ctx.preferredThemes.join(", ")}`);
  lines.push(`- 선택 전략: ${ctx.strategyName}`);
  lines.push(`- 전략 컨셉: ${ctx.strategyConcept}`);
  lines.push(`- 타깃 설명: ${ctx.targetDescription}`);

  if (ctx.dnaStrengths.length > 0) {
    lines.push(`- DNA 강점 축: ${ctx.dnaStrengths.map((s) => s.label).join(", ")}`);
  }
  if (ctx.dnaWeaknesses.length > 0) {
    lines.push(`- DNA 약점(보완 기회) 축: ${ctx.dnaWeaknesses.map((s) => s.label).join(", ")}`);
  }

  if (ctx.coursePois.length > 0) {
    lines.push("- 실제 코스 방문지(순서대로):");
    for (const p of ctx.coursePois) {
      lines.push(`  - ${p.dayIndex}일차 ${p.timeSlot} ${p.poiName}(${p.category})`);
    }
  } else {
    lines.push("- 실제 코스 방문지 정보 없음(POI가 아직 부족합니다 — 전략 컨셉으로 대체해 작성하십시오).");
  }

  if (ctx.timeSlots.length > 0) {
    lines.push("- 시간대별 일정 문장(이미 확정된 문구, 그대로 참고):");
    for (const t of ctx.timeSlots) lines.push(`  - ${t}`);
  }

  const evidenceBullets = buildEvidenceBullets(ctx);
  if (evidenceBullets.length > 0) {
    lines.push("- 데이터 근거(수치를 지어내지 말고 이 값만 인용):");
    lines.push(...evidenceBullets);
  } else {
    lines.push("- 데이터 근거 없음 — 근거를 인용하는 문장을 만들지 마십시오.");
  }

  if (ctx.kpis.length > 0) {
    lines.push(`- KPI: ${ctx.kpis.map((k) => `${k.name}(${k.method})`).join(", ")}`);
  }
  if (ctx.risks.length > 0) {
    lines.push(`- 위험요소: ${ctx.risks.map((r) => `${r.risk} — ${r.mitigation}`).join(", ")}`);
  }

  if (ctx.nationality === "FOREIGN") {
    lines.push(
      "- 이 콘텐츠는 해외 타깃용입니다. '해외 방문객 대상' 목적만 언급하고, 실제 번역이나 특정 국적 취향은 만들지 마십시오.",
    );
  }

  lines.push("");
  lines.push(`역할: ${ROLE_LABEL[ctx.role]}`);
  lines.push("");
  lines.push(`위 사실만 사용해 ${TOOL_NAME} 도구를 호출해 7개 채널 문구를 작성하십시오.`);

  return lines.join("\n");
}

/** ctx로부터 프롬프트를 구성해 LLM을 호출하고, 응답을 role에 맞는 zod 스키마로 검증한다. API key가
 * 없으면 네트워크 호출 자체를 시도하지 않고 즉시 "not_configured"를 반환한다(불필요한 호출 방지). */
export async function generatePromoContentChannelsWithLlm(
  ctx: PromoGenerationContext,
): Promise<PromoLlmGenerationResult> {
  if (!isPromoLlmConfigured()) return { ok: false, reason: "not_configured" };

  const result = await callPromoLlmTool({
    system: SYSTEM_PROMPT + ROLE_LABEL[ctx.role],
    userPrompt: buildUserPrompt(ctx),
    toolName: TOOL_NAME,
    toolDescription: "TOUR-DNA 홍보 콘텐츠 7개 채널 문구를 구조화된 형태로 반환합니다.",
    inputSchema: buildToolInputSchema(ctx.role),
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  // role별로 스키마 타입이 달라 zod 추론이 그대로 살아있도록 분기한다(ZodTypeAny로 통합해 캐스팅하지
  // 않는다) — roleContent에서 빠뜨린 role 리터럴만 각 분기에서 그대로 채워 넣는다.
  if (ctx.role === "TRAVEL_AGENCY") {
    const parsed = travelAgencyLlmOutputSchema.safeParse(result.input);
    if (!parsed.success) return { ok: false, reason: "invalid_response" };
    const { roleContent, ...rest } = parsed.data;
    return { ok: true, channels: { ...rest, roleContent: { role: "TRAVEL_AGENCY", ...roleContent } } };
  }
  if (ctx.role === "LOCAL_GOV") {
    const parsed = localGovLlmOutputSchema.safeParse(result.input);
    if (!parsed.success) return { ok: false, reason: "invalid_response" };
    const { roleContent, ...rest } = parsed.data;
    return { ok: true, channels: { ...rest, roleContent: { role: "LOCAL_GOV", ...roleContent } } };
  }
  const parsed = festivalPlannerLlmOutputSchema.safeParse(result.input);
  if (!parsed.success) return { ok: false, reason: "invalid_response" };
  const { roleContent, ...rest } = parsed.data;
  return { ok: true, channels: { ...rest, roleContent: { role: "FESTIVAL_PLANNER", ...roleContent } } };
}
