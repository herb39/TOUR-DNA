import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { computeStrategies, type PoiLike, type ProjectInputForScoring } from "@/lib/domain/strategy";
import { buildKpis, buildOperationChecklist, buildRisks, type AudiencePlanContext } from "@/lib/domain/planBuilder";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { METRIC_FIXTURES, type MetricFixture } from "@/lib/fixtures/metrics";
import { POI_SEED } from "@/lib/fixtures/pois";
import { REGION_SEED } from "@/lib/fixtures/regions";
import { projectInputSchema } from "@/lib/validation/project-input.schema";
import { NATIONALITY_CODES, ROLE_CODES } from "@/lib/validation/codes";
import {
  getRepresentativeScenarioById,
  REPRESENTATIVE_SCENARIOS,
  type RepresentativeScenario,
} from "@/lib/domain/contestScenarios";

/**
 * 이 테스트는 대표 시나리오 카탈로그가 "입력값 묶음"일 뿐이라는 원칙(4절)을 검증하는 동시에, 세
 * 시나리오를 실제 기존 파이프라인(computeDna → computeStrategies → planBuilder)에 통과시켜 결과가
 * 진짜로 달라지는지 확인한다. 아래 헬퍼는 강릉/경주/제천의 실제 fixture 데이터(METRIC_FIXTURES,
 * POI_SEED — prisma/seed.ts가 실제로 DB에 넣는 값과 동일한 원본)만 사용하고, 어떤 값도 지어내지 않는다.
 * 강릉·경주는 로컬 POI fixture가 없어(제천만 있음) networkInputs가 비어 있다 — 이는 실제 현재 로컬
 * 데이터의 한계이며, 테스트에서 이 공백을 메우기 위해 임의 POI를 만들지 않는다.
 */

const BASE_YM = "202606";
const COHORT_REGION_CODES = [
  "SGG_DAEJEON",
  "SGG_JECHEON",
  "SGG_YANGYANG",
  "SGG_GYEONGJU",
  "SGG_GANGNEUNG",
  "SGG_JEJU",
  "SGG_TONGYEONG",
];

function fixtureFor(regionCode: string): MetricFixture {
  const found = METRIC_FIXTURES.find((m) => m.regionCode === regionCode && m.baseYm === BASE_YM);
  if (!found) throw new Error(`실제 fixture가 없는 지역: ${regionCode}`);
  return found;
}

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

const AXIS_FIELD_BY_METRIC_CODE: [string, keyof MetricFixture][] = [
  [METRIC_CODES.DEMAND_SERVICE, "tarSvcDemIxVal"],
  [METRIC_CODES.DEMAND_RESOURCE, "touResDemIxVal"],
  [METRIC_CODES.STAY, "tarSjrnDsIxVal"],
  [METRIC_CODES.SPEND, "tarExpDsIxVal"],
  [METRIC_CODES.DIVERSITY, "touDivIxVal"],
];

/** 실제 seed fixture(METRIC_FIXTURES)에 존재하는 7개 지역 전체를 코호트로 써서 buildDnaEngineInput의
 * 실제 정규화 방식(대상 지역 포함 코호트 안에서 min-max)을 그대로 재현한다 — 이 3개 시나리오 지역만
 * 뽑아 코호트를 임의로 줄이지 않는다(비교 표본을 줄이면 실제와 다른 결과가 나온다). */
function dnaInputFor(regionCode: string): DnaEngineInput {
  const metricCohorts = Object.fromEntries(
    AXIS_FIELD_BY_METRIC_CODE.map(([metricCode, field]) => [
      metricCode,
      COHORT_REGION_CODES.map((r) => metric(r, fixtureFor(r)[field] as number, metricCode)),
    ]),
  );

  const poisForRegion = POI_SEED.filter((p) => p.regionCode === regionCode);
  const networkInputs: DnaEngineInput["networkInputs"] =
    poisForRegion.length === 0
      ? {
          attractionCount: 0,
          relatedPoiCount: 0,
          foodCount: 0,
          lodgingCount: 0,
          experienceCount: 0,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 0, fixtureCount: 0, provenance: "MISSING", isSnapshotFallback: true },
          relation: null,
        }
      : {
          attractionCount: poisForRegion.filter((p) => p.category === "ATTRACTION").length,
          relatedPoiCount: 0,
          foodCount: poisForRegion.filter((p) => p.category === "FOOD").length,
          lodgingCount: poisForRegion.filter((p) => p.category === "LODGING").length,
          experienceCount: poisForRegion.filter((p) => p.category === "EXPERIENCE").length,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 0, fixtureCount: poisForRegion.length, provenance: "CURATED", isSnapshotFallback: true },
          relation: null,
        };

  return {
    regionCode,
    baseYm: BASE_YM,
    adminLevel: "SIGUNGU",
    metricCohorts,
    networkInputs,
  };
}

function poisByCategoryFor(regionCode: string): Partial<Record<PoiCategoryCode, PoiLike[]>> {
  const result: Partial<Record<PoiCategoryCode, PoiLike[]>> = {};
  for (const p of POI_SEED.filter((row) => row.regionCode === regionCode)) {
    const list = result[p.category] ?? [];
    list.push({ id: p.key, name: p.name, category: p.category });
    result[p.category] = list;
  }
  return result;
}

function toScoringInput(s: RepresentativeScenario): ProjectInputForScoring {
  return {
    ageGroups: s.ageGroups,
    companionType: s.companionType,
    primaryGoal: s.primaryGoal,
    secondaryGoal: s.secondaryGoal,
    duration: s.duration,
    budgetLevel: s.budgetLevel,
    transport: s.transport,
    groupType: s.groupType,
    travelMonth: s.travelMonth,
    preferredThemes: s.preferredThemes,
    excludedThemes: s.excludedThemes,
    role: s.role,
    nationality: s.nationality,
  };
}

function runScenario(s: RepresentativeScenario) {
  const dna = computeDna(dnaInputFor(s.sigunguCode));
  const strategies = computeStrategies(
    dna,
    toScoringInput(s),
    poisByCategoryFor(s.sigunguCode),
    MODEL_VERSION,
  );
  return { dna, strategies };
}

function audienceContextOf(s: RepresentativeScenario): AudiencePlanContext {
  return {
    role: s.role,
    nationality: s.nationality,
    travelMonth: s.travelMonth,
    preferredThemes: s.preferredThemes,
  };
}

const gangneung = REPRESENTATIVE_SCENARIOS.find((s) => s.id === "gangneung-summer-food-nature")!;
const gyeongju = REPRESENTATIVE_SCENARIOS.find((s) => s.id === "gyeongju-autumn-culture-history")!;
const jecheon = REPRESENTATIVE_SCENARIOS.find((s) => s.id === "jecheon-winter-wellness")!;

describe("REPRESENTATIVE_SCENARIOS — 카탈로그 자체 검증(입력값 묶음이어야 한다)", () => {
  it("정확히 3개, ID 중복 없음", () => {
    expect(REPRESENTATIVE_SCENARIOS).toHaveLength(3);
    expect(new Set(REPRESENTATIVE_SCENARIOS.map((s) => s.id)).size).toBe(3);
  });

  it("지역 코드가 실제 REGION_SEED에 존재하는 SIGUNGU다", () => {
    const validSigunguCodes = new Set(REGION_SEED.filter((r) => r.level === "SIGUNGU").map((r) => r.code));
    for (const s of REPRESENTATIVE_SCENARIOS) {
      expect(validSigunguCodes.has(s.sigunguCode)).toBe(true);
    }
  });

  it("역할·국적이 실제 지원되는 코드값이다(새 enum 없음)", () => {
    for (const s of REPRESENTATIVE_SCENARIOS) {
      expect(ROLE_CODES).toContain(s.role);
      expect(NATIONALITY_CODES).toContain(s.nationality);
    }
  });

  it("각 시나리오가 project-input.schema의 실제 validation을 통과한다", () => {
    for (const s of REPRESENTATIVE_SCENARIOS) {
      const parsed = projectInputSchema.safeParse({
        projectName: s.title,
        role: s.role,
        sidoCode: s.sidoCode,
        sigunguCode: s.sigunguCode,
        travelYear: s.travelYear,
        travelMonth: s.travelMonth,
        nationality: s.nationality,
        ageGroups: s.ageGroups,
        companionType: s.companionType,
        primaryGoal: s.primaryGoal,
        secondaryGoal: s.secondaryGoal,
        duration: s.duration,
        budgetLevel: s.budgetLevel,
        transport: s.transport,
        groupType: s.groupType,
        preferredThemes: s.preferredThemes,
        excludedThemes: s.excludedThemes,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("카탈로그 객체에 점수·순위·근거·KPI·실행안 등 결과성 필드가 전혀 없다(타입 자체에 없음)", () => {
    for (const s of REPRESENTATIVE_SCENARIOS) {
      const keys = Object.keys(s);
      for (const forbidden of ["score", "rank", "reasons", "kpis", "risks", "course", "dna", "strategy"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it("getRepresentativeScenarioById는 존재하는 ID만 반환하고 잘못된 ID는 undefined를 반환한다", () => {
    expect(getRepresentativeScenarioById("gangneung-summer-food-nature")).toBeDefined();
    expect(getRepresentativeScenarioById("not-a-real-id")).toBeUndefined();
  });

  it("카탈로그 순서가 고정 배열이라 비결정적으로 바뀌지 않는다", () => {
    expect(REPRESENTATIVE_SCENARIOS.map((s) => s.id)).toEqual([
      "gangneung-summer-food-nature",
      "gyeongju-autumn-culture-history",
      "jecheon-winter-wellness",
    ]);
  });
});

describe("대표 시나리오 — 기존 분석 파이프라인 통과(정상 흐름)", () => {
  it.each(REPRESENTATIVE_SCENARIOS)("$id: DNA·전략 3안·근거·evidence가 정상 생성된다", (s) => {
    const { dna, strategies } = runScenario(s);
    expect(strategies).toHaveLength(3);
    for (const strat of strategies) {
      expect(strat.reasons).toHaveLength(3);
      expect(strat.totalScore).toBeGreaterThanOrEqual(0);
      expect(strat.totalScore).toBeLessThanOrEqual(100);
    }
    expect(["LIVE", "HYBRID", "SNAPSHOT"]).toContain(dna.overallDataMode);
  });

  it.each(REPRESENTATIVE_SCENARIOS)("$id: 동일 입력을 반복 실행해도 완전히 동일한 결과다(결정론성)", (s) => {
    const first = runScenario(s);
    const second = runScenario(s);
    expect(first).toEqual(second);
  });

  it.each(REPRESENTATIVE_SCENARIOS)("$id: 체크리스트·KPI·위험요인이 정상 생성된다", (s) => {
    const { strategies } = runScenario(s);
    const top = strategies[0];
    const checklist = buildOperationChecklist(top.templateId, audienceContextOf(s));
    const kpis = buildKpis(top.templateId, audienceContextOf(s));
    const risks = buildRisks(top.templateId, audienceContextOf(s));
    expect(checklist.length).toBeGreaterThan(0);
    expect(kpis.length).toBeGreaterThan(0);
    expect(risks.length).toBeGreaterThan(0);
  });
});

describe("대표 시나리오 — 실제 결과 차별화(하드코딩 없이 파이프라인이 만든 차이)", () => {
  it("강릉과 경주는 지역 객관적 DNA(demandFit/supplyFit)가 서로 다르다(원천 데이터 차이)", () => {
    const g = runScenario(gangneung);
    const gj = runScenario(gyeongju);
    // 같은 템플릿이 두 결과 모두에 있으면 demandFit/supplyFit을 비교한다.
    const gById = new Map(g.strategies.map((s) => [s.templateId, s.scoreBreakdown]));
    const gjById = new Map(gj.strategies.map((s) => [s.templateId, s.scoreBreakdown]));
    const shared = [...gById.keys()].filter((id) => gjById.has(id));
    expect(shared.length).toBeGreaterThan(0);
    expect(
      shared.some(
        (id) =>
          gById.get(id)!.demandFit !== gjById.get(id)!.demandFit ||
          gById.get(id)!.supplyFit !== gjById.get(id)!.supplyFit,
      ),
    ).toBe(true);
  });

  it("강릉·경주·제천 세 시나리오의 전략 순위(1위 templateId)와 총점이 모두 같지는 않다", () => {
    const g = runScenario(gangneung);
    const gj = runScenario(gyeongju);
    const j = runScenario(jecheon);
    const tops = [g.strategies[0].templateId, gj.strategies[0].templateId, j.strategies[0].templateId];
    const totals = [g.strategies[0].totalScore, gj.strategies[0].totalScore, j.strategies[0].totalScore];
    // 1위가 우연히 같을 수는 있으나(억지로 순위를 조작하지 않음), 최소한 총점 구성(breakdown) 또는
    // 1위 template 중 하나는 세 시나리오가 모두 같을 수 없다 — 완전히 동일한 결과라면 차별화 실패다.
    const allTopsSame = tops[0] === tops[1] && tops[1] === tops[2];
    const allTotalsSame = totals[0] === totals[1] && totals[1] === totals[2];
    expect(allTopsSame && allTotalsSame).toBe(false);
  });

  it("역할이 다른 경주(지자체)와 강릉(여행사)은 roleFit과 추천 근거 문구가 다르다", () => {
    const g = runScenario(gangneung);
    const gj = runScenario(gyeongju);
    const gRoleFits = g.strategies.map((s) => s.scoreBreakdown.roleFit);
    const gjRoleFits = gj.strategies.map((s) => s.scoreBreakdown.roleFit);
    expect(gRoleFits).not.toEqual(gjRoleFits);
    expect(g.strategies[0].reasons[1]).not.toBe(gj.strategies[0].reasons[1]);
  });

  it("국적이 다른 경주(내국인)와 제천(외국인)은 feasibilityFit(운영 적합도)이 달라질 수 있다", () => {
    const gj = runScenario(gyeongju);
    const j = runScenario(jecheon);
    const gjFeasByTemplate = new Map(gj.strategies.map((s) => [s.templateId, s.scoreBreakdown.feasibilityFit]));
    const jFeasByTemplate = new Map(j.strategies.map((s) => [s.templateId, s.scoreBreakdown.feasibilityFit]));
    const shared = [...gjFeasByTemplate.keys()].filter((id) => jFeasByTemplate.has(id));
    if (shared.length > 0) {
      // 공유 템플릿이 있다면 국적 조정(FOREIGN에만 적용)에 따라 값이 다를 수 있음을 확인한다.
      expect(shared.some((id) => gjFeasByTemplate.get(id) !== jFeasByTemplate.get(id))).toBe(true);
    }
  });

  it("여름(강릉·8월)과 겨울(제천·12월)은 위험요인이 다르다(계절 위험 반영)", () => {
    const g = runScenario(gangneung);
    const j = runScenario(jecheon);
    const gRisks = buildRisks(g.strategies[0].templateId, audienceContextOf(gangneung));
    const jRisks = buildRisks(j.strategies[0].templateId, audienceContextOf(jecheon));
    expect(gRisks).not.toEqual(jRisks);
  });

  it("미식·자연(강릉)/문화·역사(경주)/웰니스(제천) 세 시나리오는 체크리스트가 서로 다르다", () => {
    const g = runScenario(gangneung);
    const gj = runScenario(gyeongju);
    const j = runScenario(jecheon);
    const gChecklist = buildOperationChecklist(g.strategies[0].templateId, audienceContextOf(gangneung));
    const gjChecklist = buildOperationChecklist(gj.strategies[0].templateId, audienceContextOf(gyeongju));
    const jChecklist = buildOperationChecklist(j.strategies[0].templateId, audienceContextOf(jecheon));
    expect(gChecklist).not.toEqual(gjChecklist);
    expect(gjChecklist).not.toEqual(jChecklist);
    expect(gChecklist).not.toEqual(jChecklist);
  });

  it("강릉과 경주의 1위 전략이 같은 템플릿이더라도(우연히 발생 가능), KPI 목록은 역할·국적 관점에 따라 실제로 다르다", () => {
    const g = runScenario(gangneung);
    const gj = runScenario(gyeongju);
    if (g.strategies[0].templateId === gj.strategies[0].templateId) {
      const gKpis = buildKpis(g.strategies[0].templateId, audienceContextOf(gangneung));
      const gjKpis = buildKpis(gj.strategies[0].templateId, audienceContextOf(gyeongju));
      expect(gKpis).not.toEqual(gjKpis);
    }
  });

  it("조건이 달라도 같은 지역이라면 원천 DNA는 그대로다(역할만 바꿔도 demandFit/supplyFit 불변)", () => {
    const dna = computeDna(dnaInputFor(gyeongju.sigunguCode));
    const asLocalGov = computeStrategies(
      dna,
      toScoringInput(gyeongju),
      poisByCategoryFor(gyeongju.sigunguCode),
      MODEL_VERSION,
    );
    const asTravelAgency = computeStrategies(
      dna,
      toScoringInput({ ...gyeongju, role: "TRAVEL_AGENCY" }),
      poisByCategoryFor(gyeongju.sigunguCode),
      MODEL_VERSION,
    );
    const demandByTemplate = new Map(asLocalGov.map((s) => [s.templateId, s.scoreBreakdown.demandFit]));
    for (const s of asTravelAgency) {
      if (demandByTemplate.has(s.templateId)) {
        expect(s.scoreBreakdown.demandFit).toBe(demandByTemplate.get(s.templateId));
      }
    }
  });
});
