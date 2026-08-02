// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 6 리팩터 회귀 확인 — analyzeProject.ts를 계산(`computeProjectAnalysis`, DB 미접근)과
 * 저장(`persistProjectAnalysis`, 주입된 client만 사용)으로 분리했다. 재분석 액션
 * (`edit/actions.ts`)의 트랜잭션 안전성은 전적으로 "persistProjectAnalysis가 인자로 받은 client만
 * 쓰고 전역 prisma를 직접 건드리지 않는다"는 전제에 의존하므로, 이를 독립적으로 고정한다.
 */

const poisonReason = "persistProjectAnalysis가 주입된 client 대신 전역 prisma를 직접 호출했습니다";
function poison() {
  return vi.fn(() => {
    throw new Error(poisonReason);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    analysisResult: { deleteMany: poison(), create: poison() },
    evidence: { createMany: poison(), findMany: poison() },
    strategyResult: { create: poison(), update: poison() },
    project: { findUniqueOrThrow: poison(), update: poison() },
  },
}));

const buildDnaEngineInput = vi.fn();
vi.mock("@/lib/services/buildDnaEngineInput", () => ({
  buildDnaEngineInput: (...args: unknown[]) => buildDnaEngineInput(...args),
}));

const fetchPoisByCategory = vi.fn();
vi.mock("@/lib/services/fetchPoisByCategory", () => ({
  fetchPoisByCategory: (...args: unknown[]) => fetchPoisByCategory(...args),
}));

import { computeProjectAnalysis, persistProjectAnalysis, type AnalysisComputeInput } from "@/lib/services/analyzeProject";

function minimalComputeInput(overrides: Partial<AnalysisComputeInput> = {}): AnalysisComputeInput {
  return {
    regionCode: "SGG_TESTCITY",
    role: "TRAVEL_AGENCY",
    nationality: "DOMESTIC",
    travelYear: 2026,
    travelMonth: 9,
    ageGroups: ["AGE_30S"],
    companionType: "COMPANION_SOLO",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: null,
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "MIXED",
    groupType: "FIT",
    preferredThemes: [],
    excludedThemes: [],
    ...overrides,
  };
}

beforeEach(() => {
  buildDnaEngineInput.mockReset();
  fetchPoisByCategory.mockReset();
  buildDnaEngineInput.mockResolvedValue({
    regionCode: "SGG_TESTCITY",
    baseYm: "202606",
    adminLevel: "SIGUNGU",
    metricCohorts: {},
    networkInputs: null,
  });
  fetchPoisByCategory.mockResolvedValue({});
});

describe("computeProjectAnalysis — DB에 아무것도 쓰지 않는다", () => {
  it("읽기 전용 조회(buildDnaEngineInput/fetchPoisByCategory)만 사용하고 정상적으로 계산 결과를 반환한다", async () => {
    const result = await computeProjectAnalysis(minimalComputeInput());

    expect(result.dna).toBeDefined();
    expect(typeof result.dataVersion).toBe("string");
    expect(typeof result.analysisKey).toBe("string");
    expect(Array.isArray(result.strategies)).toBe(true);
    // prisma의 어떤 메서드도 호출되지 않았어야 한다(모두 poison — 호출됐다면 위에서 이미 throw했을 것).
  });

  it("읽기 전용 조회가 실패해도(예: 외부 데이터 조회 오류) 예외만 던지고 DB에는 아무 영향이 없다", async () => {
    buildDnaEngineInput.mockRejectedValue(new Error("지역 코드를 찾을 수 없습니다"));
    await expect(computeProjectAnalysis(minimalComputeInput())).rejects.toThrow("지역 코드를 찾을 수 없습니다");
  });
});

describe("poiCategorySummary — 관광사업 기회 3안 재현성 보완(2026-08-02)", () => {
  it("computeProjectAnalysis는 fetchPoisByCategory 조회 결과를 카테고리별 개수로 요약해 반환한다", async () => {
    fetchPoisByCategory.mockResolvedValue({
      FOOD: [
        { id: "1", name: "식당1" },
        { id: "2", name: "식당2" },
      ],
      ATTRACTION: [{ id: "3", name: "명소1" }],
    });

    const result = await computeProjectAnalysis(minimalComputeInput());

    expect(result.poiCategorySummary).toEqual({ FOOD: 2, ATTRACTION: 1 });
  });

  it("재현성 위험 재현: POI 동기화로 최신 조회 결과가 바뀌어도, 이미 계산해 저장한 스냅샷 값 자체는 그대로다", async () => {
    // 과거 분석 시점 — 당시 지역에 FOOD 5건이 있었다고 가정.
    fetchPoisByCategory.mockResolvedValue({
      FOOD: Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `식당${i}` })),
    });
    const pastComputed = await computeProjectAnalysis(minimalComputeInput());
    expect(pastComputed.poiCategorySummary).toEqual({ FOOD: 5 });

    // persist 시점에 넘긴 스냅샷은 이 객체 그대로 저장된다(아래 create 호출 검증).
    const txAnalysisResult = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn() };
    txAnalysisResult.create.mockResolvedValue({ id: "analysis-past" });
    const fakeTx = {
      analysisResult: txAnalysisResult,
      evidence: { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      strategyResult: { create: vi.fn(), update: vi.fn() },
    };
    await persistProjectAnalysis(fakeTx as unknown as Parameters<typeof persistProjectAnalysis>[0], "proj-1", pastComputed);
    const persistedSummary = txAnalysisResult.create.mock.calls[0][0].data.poiCategorySummary;
    expect(persistedSummary).toEqual({ FOOD: 5 });

    // 이후 POI 동기화로 지역에 FOOD가 1건만 남았다고 가정 — 새로 조회하면 값이 달라진다(위험 재현).
    fetchPoisByCategory.mockResolvedValue({ FOOD: [{ id: "f0", name: "식당0" }] });
    const freshLiveQuery = await computeProjectAnalysis(minimalComputeInput());
    expect(freshLiveQuery.poiCategorySummary).toEqual({ FOOD: 1 });

    // 하지만 과거에 저장된 스냅샷(persistedSummary)은 이 변화와 무관하게 그대로다 — 화면이
    // analysisResult.poiCategorySummary(저장된 값)를 읽는 한, 과거 프로젝트의 기회 결과는
    // 최신 POI 상태가 아니라 분석 당시 값으로 고정된다.
    expect(persistedSummary).toEqual({ FOOD: 5 });
    expect(persistedSummary).not.toEqual(freshLiveQuery.poiCategorySummary);
  });
});

describe("persistProjectAnalysis — 인자로 받은 client만 사용한다(전역 prisma 직접 접근 금지)", () => {
  it("트랜잭션 클라이언트를 넘기면 그 클라이언트의 메서드만 호출되고 전역 prisma는 전혀 건드리지 않는다", async () => {
    const txAnalysisResult = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn() };
    const txEvidence = { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) };
    const txStrategyResult = { create: vi.fn(), update: vi.fn() };

    txAnalysisResult.create.mockResolvedValue({ id: "analysis-1" });

    const fakeTx = {
      analysisResult: txAnalysisResult,
      evidence: txEvidence,
      strategyResult: txStrategyResult,
    };

    const computed = await computeProjectAnalysis(minimalComputeInput());
    const id = await persistProjectAnalysis(
      fakeTx as unknown as Parameters<typeof persistProjectAnalysis>[0],
      "proj-1",
      computed,
    );

    expect(id).toBe("analysis-1");
    expect(txAnalysisResult.deleteMany).toHaveBeenCalledWith({ where: { projectId: "proj-1" } });
    expect(txAnalysisResult.create).toHaveBeenCalledTimes(1);
    // strategies가 빈 배열(POI 없는 지역 fixture)이라 strategyResult.create는 템플릿 수만큼 호출된다 —
    // 최소한 한 번 이상 호출되는지만 확인(정확한 개수는 strategy.ts 템플릿 목록에 의존하므로 여기서
    // 단정하지 않는다).
    expect(txStrategyResult.create).toHaveBeenCalled();
  });
});
