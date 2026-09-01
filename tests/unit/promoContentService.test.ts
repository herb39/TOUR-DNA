// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const projectFindUnique = vi.fn();
const strategyResultFindUnique = vi.fn();
const selectedPlanUpdateMany = vi.fn();
const selectedPlanUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: (...args: unknown[]) => projectFindUnique(...args) },
    strategyResult: { findUnique: (...args: unknown[]) => strategyResultFindUnique(...args) },
    selectedPlan: {
      updateMany: (...args: unknown[]) => selectedPlanUpdateMany(...args),
      update: (...args: unknown[]) => selectedPlanUpdate(...args),
    },
  },
}));

// LLM 호출(2026-08-11)은 이 서비스 테스트의 관심사가 아니다 — 기본값을 "not_configured"(API key 없는
// 로컬 개발과 동일)로 고정해, 아래 기존 테스트 전부가 지금까지처럼 순수 규칙 기반 결과만 검증하게 한다.
// LLM 오케스트레이션 자체(성공 시 채널 교체/실패 시 조용한 fallback)는 파일 하단 별도 describe에서만
// 명시적으로 다른 반환값을 지정해 검증한다.
const generatePromoContentChannelsWithLlm = vi.fn();
vi.mock("@/lib/services/llm/promoLlmGenerator", () => ({
  generatePromoContentChannelsWithLlm: (...args: unknown[]) => generatePromoContentChannelsWithLlm(...args),
}));

import {
  generatePromoContentForProject,
  getPromoContentForProject,
  savePromoContentForProject,
} from "@/lib/services/promoContentService";
import { buildPromoContent, computeChannelPriority } from "@/lib/domain/promoContent";
import type { PromoContent } from "@/lib/domain/promoContent";

const PROJECT_ID = "project-gangneung";

function basePlanRow(promoContent: unknown = null) {
  return {
    productName: "강릉 미식 코스",
    conceptText: "콘셉트",
    background: "배경",
    targetSummary: "타깃",
    sellingPoints: ["1", "2", "3"],
    course: { days: [{ dayIndex: 1, items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "이동" }], lodging: null }] },
    kpis: [{ name: "kpi", method: "method" }],
    operationChecklist: ["체크1"],
    risks: [{ risk: "위험1", mitigation: "대응1" }],
    promoContent,
  };
}

function baseProjectRow(overrides: Partial<Omit<ReturnType<typeof baseProjectRowDefaults>, "selectedPlan">> & { selectedPlan?: ReturnType<typeof basePlanRow> | null } = {}) {
  return { ...baseProjectRowDefaults(), ...overrides };
}

function baseProjectRowDefaults() {
  return {
    role: "TRAVEL_AGENCY" as const,
    selectedStrategyResultId: "strategy-1",
    travelYear: 2026,
    travelMonth: 9,
    region: { name: "강릉시" },
    input: { nationality: "DOMESTIC" as const, preferredThemes: ["미식"] },
    selectedPlan: basePlanRow(null) as ReturnType<typeof basePlanRow> | null,
    // AnalysisResult 5축 원점수(2026-08-11) — 기본은 레거시 프로젝트처럼 null(분석 결과 없음).
    analysisResult: null as { demandScore: number | null; stayScore: number | null; spendScore: number | null; diversityScore: number | null; networkScore: number | null } | null,
  };
}

function validPromoContent(): PromoContent {
  return buildPromoContent({
    project: { role: "TRAVEL_AGENCY", regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "콘셉트",
      background: "배경",
      targetSummary: "타깃",
      sellingPoints: ["1", "2", "3"],
      course: [{ dayIndex: 1, items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "이동" }], lodging: null }],
      kpis: [{ name: "kpi", method: "method" }],
      operationChecklist: ["체크1"],
      risks: [{ risk: "위험1", mitigation: "대응1" }],
    },
    evidences: [],
  });
}

beforeEach(() => {
  projectFindUnique.mockReset();
  strategyResultFindUnique.mockReset();
  selectedPlanUpdateMany.mockReset();
  selectedPlanUpdate.mockReset();
  generatePromoContentChannelsWithLlm.mockReset();
  generatePromoContentChannelsWithLlm.mockResolvedValue({ ok: false, reason: "not_configured" });
});

describe("generatePromoContentForProject", () => {
  it("프로젝트를 찾을 수 없으면 notFound를 반환한다", async () => {
    projectFindUnique.mockResolvedValue(null);
    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result).toEqual({ ok: false, code: "notFound", message: expect.any(String) });
    expect(selectedPlanUpdateMany).not.toHaveBeenCalled();
  });

  it("실행안이 없으면 noPlan을 반환하고 저장하지 않는다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow({ selectedPlan: null }));
    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result).toEqual({ ok: false, code: "noPlan", message: expect.any(String) });
    expect(selectedPlanUpdateMany).not.toHaveBeenCalled();
  });

  it("기존 콘텐츠가 없으면 DB 조회값으로 생성해 저장한다(클라이언트 값이 아님)", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.landing.title).toContain("강릉시");
      expect(result.content.roleContent.role).toBe("TRAVEL_AGENCY");
    }
    expect(selectedPlanUpdateMany).toHaveBeenCalledTimes(1);
    const call = selectedPlanUpdateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ projectId: PROJECT_ID });
    expect(call.where.promoContent).toEqual({ equals: expect.anything() }); // DbNull 조건부 갱신
  });

  it("analysisResult가 있으면 DNA 강점이 홍보 콘텐츠에 반영된다(2026-08-11)", async () => {
    projectFindUnique.mockResolvedValue(
      baseProjectRow({ analysisResult: { demandScore: 90, stayScore: 20, spendScore: 50, diversityScore: 50, networkScore: 50 } }),
    );
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.content)).toContain("관광 수요가 활발한");
    }
  });

  it("analysisResult가 없어도(레거시 프로젝트) 크래시 없이 생성된다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow({ analysisResult: null }));
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
  });

  it("기존 콘텐츠가 있고 overwrite가 없으면 덮어쓰지 않는다(전략 조회조차 하지 않음)", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow({ selectedPlan: basePlanRow({ some: "existing" }) }));
    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result).toEqual({ ok: false, code: "alreadyExists", message: expect.any(String) });
    expect(strategyResultFindUnique).not.toHaveBeenCalled();
    expect(selectedPlanUpdateMany).not.toHaveBeenCalled();
  });

  it("기존 콘텐츠가 있고 overwrite가 true이면 재생성 후 저장한다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow({ selectedPlan: basePlanRow({ some: "existing" }) }));
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    const result = await generatePromoContentForProject(PROJECT_ID, { overwrite: true });
    expect(result.ok).toBe(true);
    const call = selectedPlanUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ projectId: PROJECT_ID });
  });

  it("동시 요청으로 저장 직전에 이미 채워졌으면(count 0) alreadyExists를 반환한다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "전략", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 0 });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result).toEqual({ ok: false, code: "alreadyExists", message: expect.any(String) });
  });

  it("저장 중 오류가 발생하면 내부 오류를 반환하고(기존 콘텐츠 유지) 원본 에러를 노출하지 않는다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "전략", evidences: [] });
    selectedPlanUpdateMany.mockRejectedValue(new Error("secret db connection string leaked"));

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("internalError");
      expect(result.message).not.toContain("secret");
    }
  });

  it("updateMany의 where가 요청한 projectId로만 범위가 좁혀진다(다른 프로젝트 수정 불가)", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "전략", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    await generatePromoContentForProject(PROJECT_ID);
    expect(selectedPlanUpdateMany.mock.calls[0][0].where.projectId).toBe(PROJECT_ID);
  });
});

describe("generatePromoContentForProject — LLM 오케스트레이션(2026-08-11)", () => {
  it("LLM이 설정 안 됨(not_configured)이면 규칙 기반 결과를 그대로 저장한다(generatedBy: rule)", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.generatedBy).toBe("rule");
  });

  it("LLM이 성공하면 문구 채널만 교체되고(generatedBy: ai) 사실 관련 필드는 규칙 기반 값을 유지한다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });

    const ruleBased = validPromoContent();
    generatePromoContentChannelsWithLlm.mockResolvedValue({
      ok: true,
      channels: {
        proposalSummary: { sentences: ["AI 문장1", "AI 문장2", "AI 문장3"] },
        landing: { title: "AI 제목", body: "AI 본문" },
        instagram: { caption: "AI 캡션", hashtags: ["AI태그"] },
        blog: { title: "AI 블로그 제목", body: "AI 블로그 본문" },
        cardNews: { slides: [{ title: "AI 표지", body: "AI 본문" }] },
        shortForm: { title: "AI 숏폼", hook: "AI 훅", scenes: [{ scene: 1, visual: "v", caption: "c", narration: "n" }], cta: "AI CTA" },
        roleContent: { role: "TRAVEL_AGENCY", productName: "AI 상품명", targetAudience: "AI 타깃", sellingPoints: ["a", "b", "c"], itineraryHighlight: "AI 일정" },
      },
    });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.generatedBy).toBe("ai");
    expect(result.content.landing.title).toBe("AI 제목");
    expect(result.content.proposalSummary.sentences[0]).toBe("AI 문장1");
    expect(result.content.roleContent).toEqual({
      role: "TRAVEL_AGENCY",
      productName: "AI 상품명",
      targetAudience: "AI 타깃",
      sellingPoints: ["a", "b", "c"],
      itineraryHighlight: "AI 일정",
    });
    // DNA/전략/POI/평가 관련 필드는 LLM이 절대 건드리지 않는다 — 규칙 기반 결과와 동일해야 한다.
    expect(result.content.evidenceReferences).toEqual(ruleBased.evidenceReferences);
    expect(result.content.courseHighlights).toEqual(ruleBased.courseHighlights);
    expect(result.content.channelPriority).toEqual(ruleBased.channelPriority);
    expect(result.content.translationNotice).toEqual(ruleBased.translationNotice);
    expect(result.content.version).toBe(ruleBased.version);
  });

  it("LLM 호출이 timeout으로 실패하면 규칙 기반 결과로 조용히 대체된다(사용자에게 오류 노출 없음)", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });
    generatePromoContentChannelsWithLlm.mockResolvedValue({ ok: false, reason: "timeout" });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.generatedBy).toBe("rule");
      expect(JSON.stringify(result.content)).not.toContain("timeout");
    }
  });

  it("허용되지 않은 모델로 LLM이 차단돼도 규칙 기반 결과로 정상 완료된다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });
    generatePromoContentChannelsWithLlm.mockResolvedValue({ ok: false, reason: "paid_model_not_allowed" });

    const result = await generatePromoContentForProject(PROJECT_ID);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.generatedBy).toBe("rule");
  });

  it("LLM 호출이 스키마 검증 실패(invalid_response)로 실패해도 홍보 콘텐츠 생성 자체는 정상 완료된다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });
    generatePromoContentChannelsWithLlm.mockResolvedValue({ ok: false, reason: "invalid_response" });

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.generatedBy).toBe("rule");
  });

  it("LLM 클라이언트가 예외를 던져도(네트워크 이상 등) 서비스 전체가 죽지 않고 규칙 기반으로 완료된다", async () => {
    projectFindUnique.mockResolvedValue(baseProjectRow());
    strategyResultFindUnique.mockResolvedValue({ name: "로컬미식·시장 연계형", evidences: [] });
    selectedPlanUpdateMany.mockResolvedValue({ count: 1 });
    generatePromoContentChannelsWithLlm.mockRejectedValue(new Error("unexpected"));

    const result = await generatePromoContentForProject(PROJECT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.generatedBy).toBe("rule");
  });
});

describe("getPromoContentForProject", () => {
  it("프로젝트가 없으면 notFound", async () => {
    projectFindUnique.mockResolvedValue(null);
    expect(await getPromoContentForProject(PROJECT_ID)).toEqual({ ok: false, code: "notFound", message: expect.any(String) });
  });

  it("promoContent가 DB NULL이면 content:null을 반환한다", async () => {
    projectFindUnique.mockResolvedValue({ selectedPlan: { promoContent: null } });
    expect(await getPromoContentForProject(PROJECT_ID)).toEqual({ ok: true, content: null });
  });

  it("정상 저장값은 검증된 PromoContent로 반환된다", async () => {
    const content = validPromoContent();
    projectFindUnique.mockResolvedValue({ selectedPlan: { promoContent: JSON.parse(JSON.stringify(content)) } });
    const result = await getPromoContentForProject(PROJECT_ID);
    expect(result).toEqual({ ok: true, content });
  });

  it("잘못된 저장 JSON은 타입 단언 없이 오류로 처리된다", async () => {
    projectFindUnique.mockResolvedValue({ selectedPlan: { promoContent: { garbage: true } } });
    const result = await getPromoContentForProject(PROJECT_ID);
    expect(result).toEqual({ ok: false, code: "invalidContent", message: expect.any(String) });
  });

  it("조회만으로는 LLM을 호출하지 않는다(비용은 명시적 생성/재생성 요청에서만 발생)", async () => {
    projectFindUnique.mockResolvedValue({ selectedPlan: { promoContent: JSON.parse(JSON.stringify(validPromoContent())) } });
    await getPromoContentForProject(PROJECT_ID);
    expect(generatePromoContentChannelsWithLlm).not.toHaveBeenCalled();
  });
});

describe("savePromoContentForProject", () => {
  it("잘못된 편집 입력은 DB를 수정하지 않는다", async () => {
    const result = await savePromoContentForProject(PROJECT_ID, { not: "valid" });
    expect(result).toEqual({ ok: false, code: "invalidContent", message: expect.any(String) });
    expect(projectFindUnique).not.toHaveBeenCalled();
    expect(selectedPlanUpdate).not.toHaveBeenCalled();
  });

  it("프로젝트가 없으면 notFound를 반환한다", async () => {
    projectFindUnique.mockResolvedValue(null);
    const result = await savePromoContentForProject(PROJECT_ID, JSON.parse(JSON.stringify(validPromoContent())));
    expect(result).toEqual({ ok: false, code: "notFound", message: expect.any(String) });
  });

  it("실행안이 없으면 noPlan을 반환한다", async () => {
    projectFindUnique.mockResolvedValue({ selectedPlan: null });
    const result = await savePromoContentForProject(PROJECT_ID, JSON.parse(JSON.stringify(validPromoContent())));
    expect(result).toEqual({ ok: false, code: "noPlan", message: expect.any(String) });
  });

  it("검증 통과한 편집 입력은 재생성 없이 그대로 저장된다(channelPriority는 프로젝트 역할 기준으로 항상 재계산됨)", async () => {
    const content = validPromoContent();
    const edited: PromoContent = { ...content, landing: { ...content.landing, title: "사용자가 직접 수정한 제목" } };
    projectFindUnique.mockResolvedValue({ role: "TRAVEL_AGENCY", selectedPlan: { id: "plan-1" } });
    selectedPlanUpdate.mockResolvedValue({});

    const result = await savePromoContentForProject(PROJECT_ID, JSON.parse(JSON.stringify(edited)));
    expect(result).toEqual({ ok: true, content: { ...edited, channelPriority: computeChannelPriority("TRAVEL_AGENCY") } });
    expect(selectedPlanUpdate).toHaveBeenCalledTimes(1);
    const call = selectedPlanUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ projectId: PROJECT_ID });
    expect(call.data.promoContent.landing.title).toBe("사용자가 직접 수정한 제목");
  });

  it("잘못된 channelPriority(순열이 아님)를 보낸 편집 입력은 저장을 거부한다", async () => {
    const content = validPromoContent();
    const tampered = { ...content, channelPriority: ["proposalSummary", "landing"] };
    const result = await savePromoContentForProject(PROJECT_ID, JSON.parse(JSON.stringify(tampered)));
    expect(result).toEqual({ ok: false, code: "invalidContent", message: expect.any(String) });
    expect(selectedPlanUpdate).not.toHaveBeenCalled();
  });

  it("클라이언트가 다른 역할 기준 channelPriority로 순서를 조작해 보내도, 저장 시 실제 프로젝트 역할(LOCAL_GOV) 기준으로 서버가 다시 계산한 값으로 덮어써 저장한다", async () => {
    const content = validPromoContent(); // TRAVEL_AGENCY 기준으로 생성됨
    const travelAgencyOrder = content.channelPriority;
    projectFindUnique.mockResolvedValue({ role: "LOCAL_GOV", selectedPlan: { id: "plan-1" } });
    selectedPlanUpdate.mockResolvedValue({});

    const result = await savePromoContentForProject(PROJECT_ID, JSON.parse(JSON.stringify(content)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedOrder = computeChannelPriority("LOCAL_GOV");
      expect(result.content.channelPriority).toEqual(expectedOrder);
      expect(result.content.channelPriority).not.toEqual(travelAgencyOrder);
    }
    const call = selectedPlanUpdate.mock.calls[0][0];
    expect(call.data.promoContent.channelPriority).toEqual(computeChannelPriority("LOCAL_GOV"));
  });
});
