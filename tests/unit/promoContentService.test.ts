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

import {
  generatePromoContentForProject,
  getPromoContentForProject,
  savePromoContentForProject,
} from "@/lib/services/promoContentService";
import { buildPromoContent } from "@/lib/domain/promoContent";
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
    },
    evidences: [],
  });
}

beforeEach(() => {
  projectFindUnique.mockReset();
  strategyResultFindUnique.mockReset();
  selectedPlanUpdateMany.mockReset();
  selectedPlanUpdate.mockReset();
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

  it("검증 통과한 편집 입력은 재생성 없이 그대로 저장된다", async () => {
    const content = validPromoContent();
    const edited: PromoContent = { ...content, landing: { ...content.landing, title: "사용자가 직접 수정한 제목" } };
    projectFindUnique.mockResolvedValue({ selectedPlan: { id: "plan-1" } });
    selectedPlanUpdate.mockResolvedValue({});

    const result = await savePromoContentForProject(PROJECT_ID, JSON.parse(JSON.stringify(edited)));
    expect(result).toEqual({ ok: true, content: edited });
    expect(selectedPlanUpdate).toHaveBeenCalledTimes(1);
    const call = selectedPlanUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ projectId: PROJECT_ID });
    expect(call.data.promoContent.landing.title).toBe("사용자가 직접 수정한 제목");
  });
});
