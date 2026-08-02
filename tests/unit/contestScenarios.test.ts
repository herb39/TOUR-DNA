import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { computeStrategies, type PoiLike, type ProjectInputForScoring } from "@/lib/domain/strategy";
import { buildKpis, buildOperationChecklist, buildRisks, type AudiencePlanContext } from "@/lib/domain/planBuilder";
import { computeBusinessOpportunities } from "@/lib/domain/businessOpportunity";
import { computeRegionSimilarityComparisons, type RegionAxisProfile } from "@/lib/domain/regionSimilarity";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { DNA_AXES, METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";
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

  it("P0-1: 제천(외국인·프리미엄·웰니스·12월) 시나리오는 자연·웰니스형이 1위다", () => {
    // 운영 검증에서 발견된 문제: 웰니스 테마를 명시적으로 고른 시나리오에서도 계절이 안 맞는 다른
    // 템플릿(가족 체험형)이 1위였다. targetFit 가중치 인상 + NATURE_WELLNESS 겨울 이상적 월 반영으로
    // 실제 데이터·조건을 종합했을 때 자연·웰니스형이 1위가 되는지 확인한다(순위를 강제로 조작하지 않음).
    const { strategies } = runScenario(jecheon);
    expect(strategies[0].templateId).toBe("NATURE_WELLNESS");
  });

  it("강릉(여름) 시나리오는 야간·체류 확대형이 1위를 유지한다(불필요한 회귀 없음)", () => {
    const { strategies } = runScenario(gangneung);
    expect(strategies[0].templateId).toBe("NIGHT_STAY_EXTENSION");
  });

  it("테마만 바꾸면 전략 순위가 일관된 규칙(테마 연관 템플릿의 targetFit 상승)으로 변한다", () => {
    const dna = computeDna(dnaInputFor(jecheon.sigunguCode));
    const withWellness = computeStrategies(
      dna,
      toScoringInput(jecheon),
      poisByCategoryFor(jecheon.sigunguCode),
      MODEL_VERSION,
    );
    const withoutTheme = computeStrategies(
      dna,
      toScoringInput({ ...jecheon, preferredThemes: [] }),
      poisByCategoryFor(jecheon.sigunguCode),
      MODEL_VERSION,
    );
    const wellnessWith = withWellness.find((s) => s.templateId === "NATURE_WELLNESS")!;
    const wellnessWithout = withoutTheme.find((s) => s.templateId === "NATURE_WELLNESS")!;
    expect(wellnessWith.scoreBreakdown.targetFit).toBeGreaterThan(wellnessWithout.scoreBreakdown.targetFit);
  });
});

/**
 * 관광사업 기회 3안(Phase, 2026-08-02) — 강릉/경주/제천 대표 시나리오의 실제 fixture 데이터(위에서
 * 이미 검증한 dnaInputFor/poisByCategoryFor)를 그대로 재사용해, 세 지역의 기회 3안이 실질적으로
 * 달라지는지 확인한다. 어떤 값도 새로 지어내지 않는다.
 */
function opportunitiesFor(s: RepresentativeScenario) {
  const dna = computeDna(dnaInputFor(s.sigunguCode));
  const poiCategoryLists = poisByCategoryFor(s.sigunguCode) as Partial<Record<PoiCategoryCode, PoiLike[]>>;
  const poiCountByCategory = Object.fromEntries(
    (Object.entries(poiCategoryLists) as [PoiCategoryCode, PoiLike[]][]).map(([category, list]) => [
      category,
      list.length,
    ]),
  ) as Partial<Record<PoiCategoryCode, number>>;

  return computeBusinessOpportunities({
    regionName: s.regionLabel,
    axisScores: DNA_AXES.map((axis) => ({ axis, score: dna[axis].score, status: dna[axis].status })),
    role: s.role,
    travelMonth: s.travelMonth,
    preferredThemes: s.preferredThemes,
    poiCountByCategory,
  });
}

describe("관광사업 기회 3안 — 강릉/경주/제천 실질적 차별화", () => {
  it("세 지역 모두 최소 1개 이상 근거 있는 기회를 도출한다(DNA·여행월 데이터가 있으므로)", () => {
    for (const s of [gangneung, gyeongju, jecheon]) {
      const result = opportunitiesFor(s);
      expect(result.items.length).toBeGreaterThan(0);
    }
  });

  it("세 지역의 기회 제목 집합이 서로 다르다(문제·타깃·자원이 실질적으로 다르게 생성됨)", () => {
    const gangneungTitles = opportunitiesFor(gangneung).items.map((i) => i.title);
    const gyeongjuTitles = opportunitiesFor(gyeongju).items.map((i) => i.title);
    const jecheonTitles = opportunitiesFor(jecheon).items.map((i) => i.title);

    expect(gangneungTitles).not.toEqual(gyeongjuTitles);
    expect(gangneungTitles).not.toEqual(jecheonTitles);
    expect(gyeongjuTitles).not.toEqual(jecheonTitles);
  });

  it("전략 3안(computeStrategies)과 기회 3안(computeBusinessOpportunities)의 제목이 겹치지 않는다", () => {
    for (const s of [gangneung, gyeongju, jecheon]) {
      const { strategies } = runScenario(s);
      const opportunities = opportunitiesFor(s);
      const strategyNames = new Set(strategies.map((st) => st.name));
      for (const item of opportunities.items) {
        expect(strategyNames.has(item.title)).toBe(false);
      }
    }
  });

  it("여행월 분류(강릉 8월=비수기, 경주 10월=성수기)가 각 지역의 계절 격차형 제목에 정확히 반영된다", () => {
    // 이전에는 "강릉과 경주의 제목이 다르다"는 지역 간 불일치만 확인했으나, 강릉·경주는 역할도 함께
    // 다르므로(여행사 vs 지자체) 제목 차이가 여행월 때문인지 역할 때문인지 이 비교만으로는 구분할 수
    // 없었다. 대신 각 지역이 "자기 자신의" 여행월 분류(비수기/성수기)를 정확히 반영하는지 개별
    // 검증한다 — 역할 차이는 아래 사업 방향 테스트가 별도로 검증한다.
    const gangneungSeason = opportunitiesFor(gangneung).items.find((i) => i.category === "SEASONALITY_GAP");
    const gyeongjuSeason = opportunitiesFor(gyeongju).items.find((i) => i.category === "SEASONALITY_GAP");
    expect(gangneungSeason).toBeTruthy();
    expect(gyeongjuSeason).toBeTruthy();
    expect(gangneungSeason!.title).toBe("비수기 수요 분산 기회"); // 8월 = 비수기(OFF_PEAK_MONTHS)
    expect(gyeongjuSeason!.title).toBe("성수기 수용력 활용 기회"); // 10월 = 성수기
  });

  it("역할이 다르면(강릉=여행사, 경주=지자체) 계절 격차형 기회의 사업 방향·타깃 문구가 달라진다", () => {
    const gangneungSeason = opportunitiesFor(gangneung).items.find((i) => i.category === "SEASONALITY_GAP");
    const gyeongjuSeason = opportunitiesFor(gyeongju).items.find((i) => i.category === "SEASONALITY_GAP");
    expect(gangneungSeason!.direction).not.toBe(gyeongjuSeason!.direction);
    expect(gangneungSeason!.targetAudience).not.toBe(gyeongjuSeason!.targetAudience);
  });

  it("근거가 부족한 유형(POI fixture가 없는 강릉·경주의 공급 격차형)은 지어내지 않고 생략한다", () => {
    // contestScenarios.test.ts 상단 주석대로 강릉·경주는 로컬 POI fixture가 없다(제천만 있음) —
    // 이 경우 SUPPLY_GAP/TARGET_THEME_GAP을 억지로 만들지 않아야 한다.
    const gangneungResult = opportunitiesFor(gangneung);
    const gyeongjuResult = opportunitiesFor(gyeongju);
    expect(gangneungResult.items.some((i) => i.category === "SUPPLY_GAP")).toBe(false);
    expect(gyeongjuResult.items.some((i) => i.category === "SUPPLY_GAP")).toBe(false);
  });
});

/**
 * 유사지역 비교(2026-08-02) — 실제 fixture 코호트(COHORT_REGION_CODES, 7개 지역 전체)로 강릉·경주·
 * 제천 각각의 유사지역 비교 결과를 계산해 실질적으로 달라지는지 확인한다. 어떤 값도 새로 지어내지
 * 않는다(dnaInputFor/poisByCategoryFor를 그대로 재사용).
 */
function regionProfileFor(regionCode: string): RegionAxisProfile {
  const dna = computeDna(dnaInputFor(regionCode));
  const name = REGION_SEED.find((r) => r.code === regionCode)?.name ?? regionCode;
  const poiCategoryLists = poisByCategoryFor(regionCode) as Partial<Record<PoiCategoryCode, PoiLike[]>>;
  const poiCountByCategory = Object.fromEntries(
    (Object.entries(poiCategoryLists) as [PoiCategoryCode, PoiLike[]][]).map(([category, list]) => [
      category,
      list.length,
    ]),
  ) as Partial<Record<PoiCategoryCode, number>>;

  return {
    code: regionCode,
    name,
    baseYm: BASE_YM,
    axisScores: Object.fromEntries(
      DNA_AXES.map((axis) => [axis, { score: dna[axis].score, status: dna[axis].status }]),
    ) as RegionAxisProfile["axisScores"],
    poiCountByCategory,
  };
}

const ALL_COHORT_PROFILES = COHORT_REGION_CODES.map(regionProfileFor);

function comparisonsFor(s: RepresentativeScenario) {
  const target = ALL_COHORT_PROFILES.find((p) => p.code === s.sigunguCode)!;
  return computeRegionSimilarityComparisons(target, ALL_COHORT_PROFILES);
}

describe("유사지역 비교 — 강릉/경주/제천 실질적 차별화", () => {
  it("세 지역 모두 최소 1곳 이상의 유사지역을 찾는다(7개 지역 코호트가 있으므로)", () => {
    for (const s of [gangneung, gyeongju, jecheon]) {
      const result = comparisonsFor(s);
      expect(result.comparisons.length).toBeGreaterThan(0);
    }
  });

  it("자기 자신은 비교 결과에 포함되지 않는다", () => {
    for (const s of [gangneung, gyeongju, jecheon]) {
      const result = comparisonsFor(s);
      expect(result.comparisons.some((c) => c.regionCode === s.sigunguCode)).toBe(false);
    }
  });

  it("세 지역의 유사지역 목록(비교 대상 지역 코드 순서)이 서로 다르다", () => {
    const gangneungPeers = comparisonsFor(gangneung).comparisons.map((c) => c.regionCode);
    const gyeongjuPeers = comparisonsFor(gyeongju).comparisons.map((c) => c.regionCode);
    const jecheonPeers = comparisonsFor(jecheon).comparisons.map((c) => c.regionCode);

    expect(gangneungPeers).not.toEqual(gyeongjuPeers);
    expect(gangneungPeers).not.toEqual(jecheonPeers);
    expect(gyeongjuPeers).not.toEqual(jecheonPeers);
  });

  it("동일 입력으로 반복 계산해도 완전히 동일한 결과다(결정론성)", () => {
    const first = comparisonsFor(gangneung);
    const second = comparisonsFor(gangneung);
    expect(first).toEqual(second);
  });

  it("강릉·경주는 로컬 POI fixture가 없어 관광 자원 구성 비교를 만들지 않는다(지어내지 않음)", () => {
    const gangneungResult = comparisonsFor(gangneung);
    const gyeongjuResult = comparisonsFor(gyeongju);
    for (const c of [...gangneungResult.comparisons, ...gyeongjuResult.comparisons]) {
      expect(c.poiCompositionNote).toContain("반영하지 못했습니다");
    }
  });
});
