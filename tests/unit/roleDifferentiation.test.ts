import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { computeStrategies, type ProjectInputForScoring } from "@/lib/domain/strategy";
import { buildOperationChecklist, buildKpis, buildRisks } from "@/lib/domain/planBuilder";
import { computeRoleRiskNotes } from "@/lib/domain/audienceContext";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { PoiLike } from "@/lib/domain/strategy";

/** "동일 조건, 역할만 변경" 비교(2026-08-08 도입) — 지역·기준월·DNA·여행월·타깃·목표·테마를 전부
 * 고정하고 role만 세 값(TRAVEL_AGENCY/LOCAL_GOV/FESTIVAL_PLANNER)으로 바꿔, 실제로 의미 있게 다른
 * 결과(구조적 필드 기준 — 문장 전체 exact match가 아니라 roleFit 점수, KPI/체크리스트/위험 항목 이름·
 * 내용)가 나오는지 검증한다. 단순 "역할명만 문장에 삽입"이 아니라는 것을 KPI name/risk 내용 자체가
 * 역할마다 다른 것으로 확인한다. DNA 원시 축 점수(demandFit/supplyFit)는 역할과 무관하게 그대로여야
 * 한다(회귀 방지). */

const BASE_YM = "202509";
const ROLES: Array<ProjectInputForScoring["role"]> = ["TRAVEL_AGENCY", "LOCAL_GOV", "FESTIVAL_PLANNER"];

function metric(regionCode: string, rawValue: number, metricCode: string): RegionMetricValue {
  return {
    regionCode,
    baseYm: BASE_YM,
    metricCode,
    rawValue,
    unit: "index",
    adminLevel: "SIGUNGU",
    sourceCode: "TAR_SVC_DEM",
    collectedAt: "2026-07-01T00:00:00.000Z",
    provenance: "LIVE_API",
    isSnapshotFallback: false,
  };
}

function dnaInput(): DnaEngineInput {
  const cohortFor = (metricCode: string, values: [string, number][]) =>
    values.map(([region, v]) => metric(region, v, metricCode));

  return {
    regionCode: "JECHEON",
    baseYm: BASE_YM,
    adminLevel: "SIGUNGU",
    metricCohorts: {
      [METRIC_CODES.DEMAND_SERVICE]: cohortFor(METRIC_CODES.DEMAND_SERVICE, [
        ["JECHEON", 60],
        ["DAEJEON", 80],
        ["YANGYANG", 40],
      ]),
      [METRIC_CODES.DEMAND_RESOURCE]: cohortFor(METRIC_CODES.DEMAND_RESOURCE, [
        ["JECHEON", 50],
        ["DAEJEON", 70],
        ["YANGYANG", 90],
      ]),
      [METRIC_CODES.STAY]: cohortFor(METRIC_CODES.STAY, [
        ["JECHEON", 65],
        ["DAEJEON", 55],
        ["YANGYANG", 95],
      ]),
      [METRIC_CODES.SPEND]: cohortFor(METRIC_CODES.SPEND, [
        ["JECHEON", 30],
        ["DAEJEON", 60],
        ["YANGYANG", 45],
      ]),
      [METRIC_CODES.DIVERSITY]: cohortFor(METRIC_CODES.DIVERSITY, [
        ["JECHEON", 40],
        ["DAEJEON", 90],
        ["YANGYANG", 55],
      ]),
    },
    networkInputs: {
      attractionCount: 8,
      foodCount: 20,
      lodgingCount: 10,
      experienceCount: 5,
      collectedAt: "2026-07-01T00:00:00.000Z",
      poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
    },
  };
}

function fixedProjectInput(role: ProjectInputForScoring["role"]): ProjectInputForScoring {
  return {
    role,
    ageGroups: ["AGE_30S"],
    companionType: "COMPANION_COUPLE",
    primaryGoal: "GOAL_VISITOR_GROWTH",
    secondaryGoal: null,
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "PUBLIC_TRANSPORT",
    groupType: "FIT",
    travelMonth: 10,
    nationality: "DOMESTIC",
    preferredThemes: [],
    excludedThemes: [],
  };
}

const poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
  ATTRACTION: [{ id: "a1", name: "명소1", category: "ATTRACTION" }],
  FOOD: [{ id: "f1", name: "식당1", category: "FOOD" }],
  LODGING: [{ id: "l1", name: "숙소1", category: "LODGING" }],
};

describe("동일 조건·역할만 변경 — 전략 3안", () => {
  const dna = computeDna(dnaInput());
  const byRole = new Map(
    ROLES.map((role) => [role, computeStrategies(dna, fixedProjectInput(role), poisByCategory, MODEL_VERSION)]),
  );

  it("DNA 원시 축 점수(demandFit/supplyFit)는 역할과 무관하게 동일하다(상위 3위 안에 같이 든 템플릿 기준)", () => {
    // computeStrategies는 상위 3개만 반환하므로(roleFit이 달라 3위 후보 자체가 역할마다 바뀔 수 있음),
    // 세 역할 결과에 공통으로 등장하는 templateId만 비교 대상으로 삼는다 — "상위 3위 안에 어떤 템플릿이
    // 드는지"는 역할에 따라 달라지는 게 정상이며(roleFit이 10% 반영되므로), 그 자체가 차별화의 증거다.
    const reference = byRole.get("TRAVEL_AGENCY")!;
    let comparedCount = 0;
    for (const role of ROLES) {
      const strategies = byRole.get(role)!;
      for (const s of strategies) {
        const ref = reference.find((r) => r.templateId === s.templateId);
        if (!ref) continue;
        comparedCount++;
        expect(s.scoreBreakdown.demandFit).toBe(ref.scoreBreakdown.demandFit);
        expect(s.scoreBreakdown.supplyFit).toBe(ref.scoreBreakdown.supplyFit);
      }
    }
    expect(comparedCount).toBeGreaterThan(0);
  });

  it("roleFit은 같은 템플릿이라도 세 역할 모두 서로 다른 값을 가질 수 있다(적어도 두 역할 쌍은 다르다)", () => {
    // 세 역할 결과 모두에 공통으로 등장하는 templateId 중 하나를 골라 roleFit을 비교한다.
    const [first, ...rest] = ROLES.map((role) => byRole.get(role)!);
    const commonTemplateId = first.find((s) => rest.every((strategies) => strategies.some((r) => r.templateId === s.templateId)))?.templateId;
    expect(commonTemplateId).toBeDefined();
    const roleFits = ROLES.map((role) => byRole.get(role)!.find((s) => s.templateId === commonTemplateId)!.scoreBreakdown.roleFit);
    const distinct = new Set(roleFits);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("세 역할의 전체 결과가 서로 다르다(단순 역할명 치환이 아니라 점수·구성 자체가 다름)", () => {
    const [a, b, c] = ROLES.map((role) => byRole.get(role)!);
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });
});

describe("동일 조건·역할만 변경 — 실행안(체크리스트·KPI·위험)", () => {
  const templateId = "NATURE_WELLNESS";

  it("체크리스트가 역할마다 다르고, 역할별 고유 문구를 포함한다", () => {
    const results = new Map(
      ROLES.map((role) => [role, buildOperationChecklist(templateId, { role, travelMonth: 10, nationality: "DOMESTIC", preferredThemes: [] })]),
    );
    expect(results.get("TRAVEL_AGENCY")).not.toEqual(results.get("LOCAL_GOV"));
    expect(results.get("LOCAL_GOV")).not.toEqual(results.get("FESTIVAL_PLANNER"));
    expect(results.get("LOCAL_GOV")!.some((c) => c.includes("정책 보고"))).toBe(true);
    expect(results.get("FESTIVAL_PLANNER")!.some((c) => c.includes("혼잡"))).toBe(true);
  });

  it("KPI 이름이 역할마다 다르다(같은 전략이라도 정책/판매/프로그램 관점 KPI가 각각 추가됨)", () => {
    const kpiNames = new Map(
      ROLES.map((role) => [
        role,
        buildKpis(templateId, { role, travelMonth: 10, nationality: "DOMESTIC", preferredThemes: [] }).map((k) => k.name),
      ]),
    );
    expect(kpiNames.get("TRAVEL_AGENCY")).toContain("상품 판매 전환율");
    expect(kpiNames.get("LOCAL_GOV")).toContain("정책 성과 보고 지표");
    expect(kpiNames.get("FESTIVAL_PLANNER")).toContain("프로그램 운영 지표");
  });

  it("위험 목록이 역할마다 다르다(2026-08-08 이전에는 역할과 무관하게 완전히 동일했던 항목)", () => {
    const risks = new Map(
      ROLES.map((role) => [
        role,
        buildRisks(templateId, { role, travelMonth: 10, nationality: "DOMESTIC", preferredThemes: [] }),
      ]),
    );
    const travelAgency = risks.get("TRAVEL_AGENCY")!;
    const localGov = risks.get("LOCAL_GOV")!;
    const festivalPlanner = risks.get("FESTIVAL_PLANNER")!;

    expect(travelAgency).not.toEqual(localGov);
    expect(localGov).not.toEqual(festivalPlanner);
    expect(travelAgency).not.toEqual(festivalPlanner);

    // 템플릿 고유 위험(riskTemplates)·계절 위험은 세 역할 모두 동일하게 포함돼야 한다(공통 부분).
    const commonCount = Math.min(travelAgency.length, localGov.length, festivalPlanner.length) - 1;
    for (let i = 0; i < commonCount; i++) {
      expect(travelAgency[i]).toEqual(localGov[i]);
      expect(localGov[i]).toEqual(festivalPlanner[i]);
    }

    expect(localGov.some((r) => r.risk.includes("정책 보고"))).toBe(true);
    expect(festivalPlanner.some((r) => r.risk.includes("혼잡"))).toBe(true);
    expect(travelAgency.some((r) => r.risk.includes("노쇼") || r.risk.includes("취소"))).toBe(true);
  });

  it("역할이 없으면(레거시) 역할별 위험 항목이 추가되지 않는다", () => {
    expect(computeRoleRiskNotes(undefined)).toEqual([]);
  });
});
