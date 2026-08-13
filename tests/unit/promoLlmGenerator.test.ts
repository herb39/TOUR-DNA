// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromoGenerationContext } from "@/lib/domain/promoContent";

const callPromoLlmTool = vi.fn();
const isPromoLlmConfigured = vi.fn();

vi.mock("@/lib/services/llm/promoLlmClient", () => ({
  callPromoLlmTool: (...args: unknown[]) => callPromoLlmTool(...args),
  isPromoLlmConfigured: () => isPromoLlmConfigured(),
}));

import { generatePromoContentChannelsWithLlm } from "@/lib/services/llm/promoLlmGenerator";

function baseCtx(overrides: Partial<PromoGenerationContext> = {}): PromoGenerationContext {
  return {
    regionName: "강릉시",
    role: "TRAVEL_AGENCY",
    nationality: "DOMESTIC",
    travelYear: 2026,
    travelMonth: 9,
    preferredThemes: ["미식"],
    strategyName: "로컬미식·시장 연계형",
    strategyConcept: "전통시장과 로컬 맛집을 엮은 코스",
    targetDescription: "미식에 관심 높은 소규모 동행 여행객",
    dnaStrengths: [{ axis: "spend", label: "소비", displayScore: 82 }],
    dnaWeaknesses: [{ axis: "stay", label: "체류", displayScore: 22 }],
    evidenceHighlights: [
      { metricCode: "m1", rawValue: 90, unit: null, sourceCode: "SRC", baseYm: "202606", provenance: "LIVE_API", isEstimated: false },
    ],
    coursePois: [{ dayIndex: 1, poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", mealPurpose: null }],
    timeSlots: ["1일차 10:00 — 경포대"],
    kpis: [{ name: "재방문 의사율", method: "설문" }],
    risks: [{ risk: "우천", mitigation: "실내 동선 대체" }],
    ...overrides,
  };
}

function validCommonChannels() {
  return {
    proposalSummary: { sentences: ["문장1", "문장2", "문장3"] },
    landing: { title: "제목", body: "본문" },
    instagram: { caption: "캡션", hashtags: ["강릉", "미식"] },
    blog: { title: "블로그 제목", body: "블로그 본문" },
    cardNews: { slides: [{ title: "표지", body: "본문1" }, { title: "전략", body: "본문2" }, { title: "마무리", body: "본문3" }] },
    shortForm: {
      title: "숏폼 제목",
      hook: "훅",
      scenes: [
        { scene: 1, visual: "장면1", caption: "자막1", narration: "내레이션1" },
        { scene: 2, visual: "장면2", caption: "자막2", narration: "내레이션2" },
      ],
      cta: "CTA",
    },
  };
}

beforeEach(() => {
  callPromoLlmTool.mockReset();
  isPromoLlmConfigured.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("generatePromoContentChannelsWithLlm — 설정/실패 분기", () => {
  it("LLM이 설정돼 있지 않으면 네트워크를 호출하지 않고 not_configured를 반환한다", async () => {
    isPromoLlmConfigured.mockReturnValue(false);
    const result = await generatePromoContentChannelsWithLlm(baseCtx());
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(callPromoLlmTool).not.toHaveBeenCalled();
  });

  it("callPromoLlmTool이 실패 사유를 반환하면 그대로 전달한다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({ ok: false, reason: "timeout", detail: "timeout" });
    const result = await generatePromoContentChannelsWithLlm(baseCtx());
    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("429/invalid_response 등 다른 실패 사유도 그대로 전달한다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({ ok: false, reason: "rate_limited", detail: "429" });
    const result = await generatePromoContentChannelsWithLlm(baseCtx());
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("응답이 스키마와 맞지 않으면(필수 필드 누락) invalid_response를 반환한다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    const invalid: Record<string, unknown> = { ...validCommonChannels(), landing: { title: "제목만 있음" } };
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: { ...invalid, roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" } },
    });
    const result = await generatePromoContentChannelsWithLlm(baseCtx());
    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("proposalSummary.sentences가 3개가 아니면 invalid_response를 반환한다(사실성 가드가 아닌 구조 가드)", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    const invalid = { ...validCommonChannels(), proposalSummary: { sentences: ["딱 한 문장"] } };
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: { ...invalid, roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" } },
    });
    const result = await generatePromoContentChannelsWithLlm(baseCtx());
    expect(result).toEqual({ ok: false, reason: "invalid_response" });
  });
});

describe("generatePromoContentChannelsWithLlm — 역할별 roleContent 구조", () => {
  it("TRAVEL_AGENCY는 role 리터럴이 채워진 TravelAgencyPromo 구조를 반환한다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { productName: "강릉 미식 코스", targetAudience: "소규모 동행", sellingPoints: ["a", "b", "c"], itineraryHighlight: "경포대 포함" },
      },
    });
    const result = await generatePromoContentChannelsWithLlm(baseCtx({ role: "TRAVEL_AGENCY" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channels.roleContent).toEqual({
        role: "TRAVEL_AGENCY",
        productName: "강릉 미식 코스",
        targetAudience: "소규모 동행",
        sellingPoints: ["a", "b", "c"],
        itineraryHighlight: "경포대 포함",
      });
    }
  });

  it("LOCAL_GOV는 role 리터럴이 채워진 LocalGovPromo 구조를 반환한다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: {
          title: "제목",
          lead: "리드",
          background: "배경",
          coreProgram: "프로그램",
          dataBasedEvidence: ["근거1"],
          expectedEffects: ["효과1"],
        },
      },
    });
    const result = await generatePromoContentChannelsWithLlm(baseCtx({ role: "LOCAL_GOV" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.channels.roleContent.role).toBe("LOCAL_GOV");
  });

  it("FESTIVAL_PLANNER는 role 리터럴이 채워진 FestivalPlannerPromo 구조를 반환한다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: {
          title: "제목",
          programHighlight: "프로그램",
          timeSlotPlan: ["1일차 10:00 — 경포대"],
          retentionTip: "체류 팁",
          operationChecklist: ["체크1"],
          risks: ["위험1"],
        },
      },
    });
    const result = await generatePromoContentChannelsWithLlm(baseCtx({ role: "FESTIVAL_PLANNER" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.channels.roleContent.role).toBe("FESTIVAL_PLANNER");
  });
});

describe("generatePromoContentChannelsWithLlm — 프롬프트에 generation context 사실이 반영된다", () => {
  it("지역명·전략명·POI·DNA강점/약점·근거·KPI·위험요소가 사용자 프롬프트에 포함된다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" },
      },
    });
    await generatePromoContentChannelsWithLlm(baseCtx());
    const call = callPromoLlmTool.mock.calls[0][0];
    expect(call.userPrompt).toContain("강릉시");
    expect(call.userPrompt).toContain("로컬미식·시장 연계형");
    expect(call.userPrompt).toContain("경포대");
    expect(call.userPrompt).toContain("소비");
    expect(call.userPrompt).toContain("체류");
    expect(call.userPrompt).toContain("m1");
    expect(call.userPrompt).toContain("재방문 의사율");
    expect(call.userPrompt).toContain("우천");
  });

  it("코스 POI가 없으면 '전략 컨셉으로 대체' 안내가 프롬프트에 들어간다(사실 지어내기 방지)", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" },
      },
    });
    await generatePromoContentChannelsWithLlm(baseCtx({ coursePois: [] }));
    const call = callPromoLlmTool.mock.calls[0][0];
    expect(call.userPrompt).toContain("POI가 아직 부족합니다");
  });

  it("nationality가 FOREIGN이면 해외 타깃 안내가 들어가고, 번역/국적 취향을 만들지 말라는 지시가 포함된다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" },
      },
    });
    await generatePromoContentChannelsWithLlm(baseCtx({ nationality: "FOREIGN" }));
    const call = callPromoLlmTool.mock.calls[0][0];
    expect(call.userPrompt).toContain("해외 타깃");
    expect(call.userPrompt).toContain("특정 국적 취향은 만들지");
  });

  it("역할에 따라 system 프롬프트에 다른 톤 지시가 포함된다(역할명만 바뀌는 것이 아님)", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { title: "제목", lead: "리드", background: "배경", coreProgram: "프로그램", dataBasedEvidence: [], expectedEffects: [] },
      },
    });
    await generatePromoContentChannelsWithLlm(baseCtx({ role: "LOCAL_GOV" }));
    const call = callPromoLlmTool.mock.calls[0][0];
    expect(call.system).toContain("지자체");
    expect(call.system).not.toContain("여행사/DMC — 판매");
  });

  it("금지 사항(축제 개최/운영시간/가격/통계 등)이 system 프롬프트에 명시된다", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" },
      },
    });
    await generatePromoContentChannelsWithLlm(baseCtx());
    const call = callPromoLlmTool.mock.calls[0][0];
    expect(call.system).toContain("운영시간");
    expect(call.system).toContain("가격");
    expect(call.system).toContain("검증되지 않은 통계 수치");
  });
});

describe("generatePromoContentChannelsWithLlm — 출력 스키마 상한(2026-08-13, OpenRouter latency 조사)", () => {
  it("cardNews.slides와 shortForm.scenes에 maxItems가 있다(무제한 출력으로 인한 불필요한 응답 크기 방지 — 규칙 기반 생성기의 실제 최대치와 일치)", async () => {
    isPromoLlmConfigured.mockReturnValue(true);
    callPromoLlmTool.mockResolvedValue({
      ok: true,
      input: {
        ...validCommonChannels(),
        roleContent: { productName: "p", targetAudience: "t", sellingPoints: ["a", "b", "c"], itineraryHighlight: "h" },
      },
    });
    await generatePromoContentChannelsWithLlm(baseCtx());
    const call = callPromoLlmTool.mock.calls[0][0];
    const schema = call.inputSchema as {
      properties: {
        cardNews: { properties: { slides: { maxItems?: number } } };
        shortForm: { properties: { scenes: { maxItems?: number } } };
      };
    };
    expect(schema.properties.cardNews.properties.slides.maxItems).toBe(7);
    expect(schema.properties.shortForm.properties.scenes.maxItems).toBe(4);
  });
});
