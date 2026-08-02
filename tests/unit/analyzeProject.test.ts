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
