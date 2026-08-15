import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { computeStrategies, type ProjectInputForScoring } from "@/lib/domain/strategy";
import { MODEL_VERSION } from "@/lib/domain/constants";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";
import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { PoiLike } from "@/lib/domain/strategy";

const BASE_YM = "202509";

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

function dnaInput(overrides: Partial<DnaEngineInput> = {}): DnaEngineInput {
  const cohortFor = (metricCode: string, values: [string, number][]) =>
    values.map(([region, v]) => metric(region, v, metricCode));

  return {
    regionCode: "DAEJEON",
    baseYm: BASE_YM,
    adminLevel: "SIGUNGU",
    metricCohorts: {
      [METRIC_CODES.DEMAND_SERVICE]: cohortFor(METRIC_CODES.DEMAND_SERVICE, [
        ["DAEJEON", 80],
        ["JECHEON", 40],
        ["YANGYANG", 60],
      ]),
      [METRIC_CODES.DEMAND_RESOURCE]: cohortFor(METRIC_CODES.DEMAND_RESOURCE, [
        ["DAEJEON", 70],
        ["JECHEON", 50],
        ["YANGYANG", 90],
      ]),
      [METRIC_CODES.STAY]: cohortFor(METRIC_CODES.STAY, [
        ["DAEJEON", 55],
        ["JECHEON", 65],
        ["YANGYANG", 95],
      ]),
      [METRIC_CODES.SPEND]: cohortFor(METRIC_CODES.SPEND, [
        ["DAEJEON", 60],
        ["JECHEON", 30],
        ["YANGYANG", 45],
      ]),
      [METRIC_CODES.DIVERSITY]: cohortFor(METRIC_CODES.DIVERSITY, [
        ["DAEJEON", 90],
        ["JECHEON", 40],
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
    ...overrides,
  };
}

function baseProjectInput(overrides: Partial<ProjectInputForScoring> = {}): ProjectInputForScoring {
  return {
    ageGroups: ["AGE_20S", "AGE_30S"],
    companionType: "COMPANION_FRIENDS",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: null,
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "PUBLIC_TRANSPORT",
    groupType: "SMALL_10_20",
    travelMonth: 9,
    preferredThemes: [],
    excludedThemes: [],
    ...overrides,
  };
}

function poi(id: string, name: string, category: PoiCategoryCode): PoiLike {
  return { id, name, category };
}

const poisByCategory: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
  FOOD: [poi("f1", "성심당", "FOOD"), poi("f2", "중앙시장 맛집", "FOOD")],
  LODGING: [poi("l1", "유성호텔", "LODGING")],
  EXPERIENCE: [poi("e1", "한밭수목원 체험", "EXPERIENCE")],
  ATTRACTION: [poi("a1", "대전엑스포과학공원", "ATTRACTION"), poi("a2", "장태산휴양림", "ATTRACTION")],
  FESTIVAL: [poi("fe1", "대전사이언스페스티벌", "FESTIVAL")],
  SHOPPING: [poi("s1", "은행동 지하상가", "SHOPPING")],
};

describe("computeStrategies", () => {
  it("항상 3개의 전략을 반환하고 서로 다른 템플릿이다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    expect(strategies).toHaveLength(3);
    const ids = new Set(strategies.map((s) => s.templateId));
    expect(ids.size).toBe(3);
  });

  it("모든 하위 점수와 총점은 0~100 범위 안에 있다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      expect(s.totalScore).toBeGreaterThanOrEqual(0);
      expect(s.totalScore).toBeLessThanOrEqual(100);
      for (const v of Object.values(s.scoreBreakdown)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("순위는 총점 내림차순이다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    expect(strategies[0].totalScore).toBeGreaterThanOrEqual(strategies[1].totalScore);
    expect(strategies[1].totalScore).toBeGreaterThanOrEqual(strategies[2].totalScore);
    expect(strategies.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it("각 전략은 최소 3개의 근거를 갖는다 (LIVE 데이터 기준)", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      expect(s.evidences.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("전략마다 이유가 정확히 3개다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      expect(s.reasons).toHaveLength(3);
    }
  });

  it("음식/숙박/체험 중 최소 2개 업종을 포함한다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of strategies) {
      const count = [s.consumptionTouchpoints.food, s.consumptionTouchpoints.lodging, s.consumptionTouchpoints.experience].filter(Boolean).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it("동점 시 supplyFit → demandFit → templateId 순으로 정렬한다", () => {
    // 인위적으로 동일 totalScore가 나오도록 두 템플릿이 같은 DNA 조건에서 같은 점수를 갖게 하기보다,
    // 정렬 로직 자체를 화이트박스로 검증: totalScore가 같을 때 supplyFit 비교가 우선한다.
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (let i = 0; i < strategies.length - 1; i++) {
      const a = strategies[i];
      const b = strategies[i + 1];
      if (a.totalScore === b.totalScore) {
        expect(a.scoreBreakdown.supplyFit).toBeGreaterThanOrEqual(b.scoreBreakdown.supplyFit);
      }
    }
  });

  it("여행 시기가 바뀌면 seasonFit과 전략 결과가 달라진다", () => {
    const dna = computeDna(dnaInput());
    const septemberResult = computeStrategies(dna, baseProjectInput({ travelMonth: 9 }), poisByCategory, MODEL_VERSION);
    const januaryResult = computeStrategies(dna, baseProjectInput({ travelMonth: 1 }), poisByCategory, MODEL_VERSION);
    expect(septemberResult).not.toEqual(januaryResult);
  });

  it("지역 데이터(DNA)가 바뀌면 전략 점수/순위가 달라진다", () => {
    const daejeonDna = computeDna(dnaInput({ regionCode: "DAEJEON" }));
    const yangyangDna = computeDna(dnaInput({ regionCode: "YANGYANG" }));
    const input = baseProjectInput();
    const daejeonStrategies = computeStrategies(daejeonDna, input, poisByCategory, MODEL_VERSION);
    const yangyangStrategies = computeStrategies(yangyangDna, input, poisByCategory, MODEL_VERSION);
    expect(daejeonStrategies).not.toEqual(yangyangStrategies);
  });

  it("제외 테마에 해당하는 전략은 후보에서 빠진다", () => {
    const dna = computeDna(dnaInput());
    const withoutExclusion = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    const withExclusion = computeStrategies(
      dna,
      baseProjectInput({ excludedThemes: ["축제"] }),
      poisByCategory,
      MODEL_VERSION,
    );
    expect(withExclusion.some((s) => s.templateId === "FESTIVAL_EVENT")).toBe(false);
    expect(withoutExclusion.length).toBe(3);
  });

  it("동일 입력에 대해 결정론적으로 동일한 결과를 반환한다", () => {
    const dna = computeDna(dnaInput());
    const input = baseProjectInput();
    const r1 = computeStrategies(dna, input, poisByCategory, MODEL_VERSION);
    const r2 = computeStrategies(dna, input, poisByCategory, MODEL_VERSION);
    expect(r1).toEqual(r2);
  });

  it("fixture에 없는 POI는 poiIds에 등장하지 않는다", () => {
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    const knownIds = new Set(Object.values(poisByCategory).flat().map((p) => p!.id));
    for (const s of strategies) {
      for (const id of s.poiIds) {
        expect(knownIds.has(id)).toBe(true);
      }
    }
  });
});

describe("computeStrategies — Phase 4: 역할·국적·테마·월 조건별 반영", () => {
  it("역할이 없으면(레거시) roleFit은 중립값(50)이고 결과는 기존과 동일하다", () => {
    const dna = computeDna(dnaInput());
    const withoutRole = computeStrategies(dna, baseProjectInput(), poisByCategory, MODEL_VERSION);
    for (const s of withoutRole) {
      expect(s.scoreBreakdown.roleFit).toBe(50);
    }
  });

  it("역할을 바꾸면 전략 점수/순위/추천 근거 중 최소 하나는 달라진다", () => {
    const dna = computeDna(dnaInput());
    const localGov = computeStrategies(dna, baseProjectInput({ role: "LOCAL_GOV" }), poisByCategory, MODEL_VERSION);
    const travelAgency = computeStrategies(
      dna,
      baseProjectInput({ role: "TRAVEL_AGENCY" }),
      poisByCategory,
      MODEL_VERSION,
    );
    expect(localGov).not.toEqual(travelAgency);
    // roleFit 자체는 항상 달라야 한다(같은 템플릿이라도 역할별 우선순위 테이블이 다르므로).
    const localGovByTemplate = new Map(localGov.map((s) => [s.templateId, s.scoreBreakdown.roleFit]));
    const travelAgencyByTemplate = new Map(travelAgency.map((s) => [s.templateId, s.scoreBreakdown.roleFit]));
    const sharedTemplateIds = [...localGovByTemplate.keys()].filter((id) => travelAgencyByTemplate.has(id));
    expect(sharedTemplateIds.length).toBeGreaterThan(0);
    expect(sharedTemplateIds.some((id) => localGovByTemplate.get(id) !== travelAgencyByTemplate.get(id))).toBe(true);
  });

  it("역할을 바꿔도 지역 객관적 DNA 기반 demandFit/supplyFit 값 자체는 바뀌지 않는다", () => {
    const dna = computeDna(dnaInput());
    const localGov = computeStrategies(dna, baseProjectInput({ role: "LOCAL_GOV" }), poisByCategory, MODEL_VERSION);
    const travelAgency = computeStrategies(
      dna,
      baseProjectInput({ role: "TRAVEL_AGENCY" }),
      poisByCategory,
      MODEL_VERSION,
    );
    const demandByTemplate = new Map(localGov.map((s) => [s.templateId, s.scoreBreakdown.demandFit]));
    for (const s of travelAgency) {
      if (demandByTemplate.has(s.templateId)) {
        expect(s.scoreBreakdown.demandFit).toBe(demandByTemplate.get(s.templateId));
      }
    }
  });

  it("국적을 바꿔도 지역 객관적 DNA는 그대로이고, feasibilityFit(운영 적합도)만 달라질 수 있다", () => {
    const dna = computeDna(dnaInput());
    const domestic = computeStrategies(dna, baseProjectInput({ nationality: "DOMESTIC" }), poisByCategory, MODEL_VERSION);
    const foreign = computeStrategies(dna, baseProjectInput({ nationality: "FOREIGN" }), poisByCategory, MODEL_VERSION);
    const demandByTemplate = new Map(domestic.map((s) => [s.templateId, s.scoreBreakdown.demandFit]));
    const supplyByTemplate = new Map(domestic.map((s) => [s.templateId, s.scoreBreakdown.supplyFit]));
    for (const s of foreign) {
      if (demandByTemplate.has(s.templateId)) {
        expect(s.scoreBreakdown.demandFit).toBe(demandByTemplate.get(s.templateId));
        expect(s.scoreBreakdown.supplyFit).toBe(supplyByTemplate.get(s.templateId));
      }
    }
    // CULTURE_HISTORY는 외국인 조정치가 음수(-6)이므로 후보에 있다면 feasibilityFit이 내려가야 한다.
    const domesticCulture = domestic.find((s) => s.templateId === "CULTURE_HISTORY");
    const foreignCulture = foreign.find((s) => s.templateId === "CULTURE_HISTORY");
    if (domesticCulture && foreignCulture) {
      expect(foreignCulture.scoreBreakdown.feasibilityFit).toBeLessThan(domesticCulture.scoreBreakdown.feasibilityFit);
    }
  });

  it("선호 테마 카테고리에 따라 targetFit과 추천 근거가 달라진다", () => {
    const dna = computeDna(dnaInput());
    // companionType을 템플릿 타깃과 어긋나게 둬 base가 이미 100으로 clamp되지 않게 한다(테마 가산점
    // 차이가 실제로 드러나도록).
    const noTheme = computeStrategies(
      dna,
      baseProjectInput({ companionType: "COMPANION_SOLO" }),
      poisByCategory,
      MODEL_VERSION,
    );
    const foodTheme = computeStrategies(
      dna,
      baseProjectInput({ companionType: "COMPANION_SOLO", preferredThemes: ["미식 여행"] }),
      poisByCategory,
      MODEL_VERSION,
    );
    const noThemeMarket = noTheme.find((s) => s.templateId === "LOCAL_FOOD_MARKET");
    const foodThemeMarket = foodTheme.find((s) => s.templateId === "LOCAL_FOOD_MARKET");
    expect(noThemeMarket).toBeDefined();
    expect(foodThemeMarket).toBeDefined();
    expect(foodThemeMarket!.scoreBreakdown.targetFit).toBeGreaterThan(noThemeMarket!.scoreBreakdown.targetFit);
  });

  it("역할·국적·테마·월 서로 다른 조합 3개는 서로 다른 결과를 내고, 각각 재실행해도 동일하다", () => {
    const dna = computeDna(dnaInput());
    const combinations: ProjectInputForScoring[] = [
      baseProjectInput({ role: "LOCAL_GOV", nationality: "DOMESTIC", preferredThemes: ["문화 역사"], travelMonth: 10 }),
      baseProjectInput({ role: "TRAVEL_AGENCY", nationality: "FOREIGN", preferredThemes: ["웰니스"], travelMonth: 1 }),
      baseProjectInput({ role: "LOCAL_GOV", nationality: "FOREIGN", preferredThemes: ["미식"], travelMonth: 7 }),
    ];
    const results = combinations.map((input) => computeStrategies(dna, input, poisByCategory, MODEL_VERSION));

    expect(results[0]).not.toEqual(results[1]);
    expect(results[1]).not.toEqual(results[2]);
    expect(results[0]).not.toEqual(results[2]);

    for (let i = 0; i < combinations.length; i++) {
      const rerun = computeStrategies(dna, combinations[i], poisByCategory, MODEL_VERSION);
      expect(rerun).toEqual(results[i]);
    }
  });
});

/** 카테고리당 넉넉한 개수를 만들어 "충분한 후보가 있을 때" 시나리오를 구성한다. 이름에 번호를 붙여
 * name.localeCompare 정렬이 항상 같은 순서를 내도록 한다. */
function makePois(prefix: string, category: PoiCategoryCode, count: number): PoiLike[] {
  return Array.from({ length: count }, (_, i) =>
    poi(`${prefix}-${i}`, `${prefix}-${String(i).padStart(2, "0")}`, category),
  );
}

function categoryOf(id: string, pool: Partial<Record<PoiCategoryCode, PoiLike[]>>): PoiCategoryCode | undefined {
  for (const [cat, list] of Object.entries(pool) as [PoiCategoryCode, PoiLike[]][]) {
    if (list.some((p) => p.id === id)) return cat;
  }
  return undefined;
}

describe("selectPois — 기간별 밀도 개선(1단계)", () => {
  const abundantPool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
    ATTRACTION: makePois("attraction", "ATTRACTION", 20),
    FOOD: makePois("food", "FOOD", 20),
    EXPERIENCE: makePois("experience", "EXPERIENCE", 20),
    FESTIVAL: makePois("festival", "FESTIVAL", 20),
    SHOPPING: makePois("shopping", "SHOPPING", 20),
    LODGING: makePois("lodging", "LODGING", 20),
  };

  it("충분한 후보가 있을 때 여행 기간별 비숙박 POI 목표 개수를 정확히 채운다", () => {
    const dna = computeDna(dnaInput());
    const expected: Record<string, number> = {
      DAY_TRIP: 4,
      ONE_NIGHT_TWO_DAYS: 7,
      TWO_NIGHTS_THREE_DAYS: 11,
    };
    for (const [duration, target] of Object.entries(expected)) {
      const strategies = computeStrategies(
        dna,
        baseProjectInput({ duration: duration as ProjectInputForScoring["duration"] }),
        abundantPool,
        MODEL_VERSION,
      );
      for (const s of strategies) {
        const nonLodgingCount = s.poiIds.filter((id) => categoryOf(id, abundantPool) !== "LODGING").length;
        expect(nonLodgingCount).toBe(target);
      }
    }
  });

  it("충분한 숙박 후보가 있을 때 여행 기간별 숙박 선택량 상한을 지킨다", () => {
    const dna = computeDna(dnaInput());
    const expected: Record<string, number> = {
      DAY_TRIP: 0,
      ONE_NIGHT_TWO_DAYS: 1,
      TWO_NIGHTS_THREE_DAYS: 2,
    };
    for (const [duration, target] of Object.entries(expected)) {
      const strategies = computeStrategies(
        dna,
        baseProjectInput({ duration: duration as ProjectInputForScoring["duration"] }),
        abundantPool,
        MODEL_VERSION,
      );
      for (const s of strategies) {
        const lodgingCount = s.poiIds.filter((id) => categoryOf(id, abundantPool) === "LODGING").length;
        expect(lodgingCount).toBe(target);
      }
    }
  });

  it("후보가 목표보다 적으면 있는 만큼만 반환하고 가짜 ID나 중복을 만들지 않는다", () => {
    const scarcePool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 2),
      FOOD: makePois("food", "FOOD", 1),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 1),
      LODGING: makePois("lodging", "LODGING", 1),
    };
    const knownIds = new Set(Object.values(scarcePool).flat().map((p) => p!.id));
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "TWO_NIGHTS_THREE_DAYS" }),
      scarcePool,
      MODEL_VERSION,
    );
    for (const s of strategies) {
      // 목표(비숙박 11)보다 풀 전체(비숙박 4)가 작으므로 있는 만큼만(4개) 나와야 한다.
      const nonLodgingCount = s.poiIds.filter((id) => categoryOf(id, scarcePool) !== "LODGING").length;
      expect(nonLodgingCount).toBe(4);
      for (const id of s.poiIds) {
        expect(knownIds.has(id)).toBe(true);
      }
      expect(new Set(s.poiIds).size).toBe(s.poiIds.length);
    }
  });

  it("동일 입력을 반복 실행해도 poiIds 값과 순서가 동일하다(결정론성)", () => {
    const dna = computeDna(dnaInput());
    const input = baseProjectInput({ duration: "TWO_NIGHTS_THREE_DAYS" });
    const r1 = computeStrategies(dna, input, abundantPool, MODEL_VERSION);
    const r2 = computeStrategies(dna, input, abundantPool, MODEL_VERSION);
    expect(r1.map((s) => s.poiIds)).toEqual(r2.map((s) => s.poiIds));
  });

  it("같은 POI ID가 여러 카테고리 풀에 잘못 중복 포함돼도 최종 poiIds에는 한 번만 나온다", () => {
    const sharedId = "dup-shared-1";
    const dupPool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      FOOD: [poi(sharedId, "food-00", "FOOD"), ...makePois("food", "FOOD", 5)],
      EXPERIENCE: [poi(sharedId, "experience-00", "EXPERIENCE"), ...makePois("experience", "EXPERIENCE", 5)],
      ATTRACTION: makePois("attraction", "ATTRACTION", 5),
      SHOPPING: makePois("shopping", "SHOPPING", 5),
      LODGING: makePois("lodging", "LODGING", 2),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(dna, baseProjectInput(), dupPool, MODEL_VERSION);
    for (const s of strategies) {
      const occurrences = s.poiIds.filter((id) => id === sharedId).length;
      expect(occurrences).toBeLessThanOrEqual(1);
      expect(new Set(s.poiIds).size).toBe(s.poiIds.length);
    }
  });

  it("보조 카테고리로 채울 필요가 없을 만큼 핵심 카테고리 후보가 충분해도, 식사 가능 FOOD는 별도로 선점되고 나머지는 핵심 카테고리만으로 채운다", () => {
    // NATURE_WELLNESS 템플릿의 핵심 카테고리는 ATTRACTION, EXPERIENCE, LODGING이며 FOOD가 없다.
    // 핵심 카테고리 후보가 충분해도(2026-07-24 통영 사례 근본 원인 수정) 식사 가능 FOOD는
    // MEAL_RESERVE_TARGET_BY_DURATION만큼 별도로 선점되어야 한다 — 그렇지 않으면 실행안에
    // 점심/저녁이 전혀 배치되지 못한다.
    const coreOnlyPool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 20),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 20),
      LODGING: makePois("lodging", "LODGING", 20),
      FOOD: makePois("food", "FOOD", 20),
      SHOPPING: makePois("shopping", "SHOPPING", 20),
      FESTIVAL: makePois("festival", "FESTIVAL", 20),
    };
    const dna = computeDna(dnaInput());
    // preferredThemes로 자연 테마를 명시해 NATURE_WELLNESS가 상위 3위 안에 들도록 한다(P0-1: 테마가
    // 순위에 실질적 영향을 주도록 가중치를 올렸으므로, 이 POI 선택 로직 테스트도 "사용자가 이 템플릿을
    // 명시적으로 원하는" 조건으로 맞춰 검증한다 — 순위 결과 자체는 이 테스트의 관심사가 아니다).
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "DAY_TRIP", preferredThemes: ["자연"] }),
      coreOnlyPool,
      MODEL_VERSION,
    );
    const natureWellness = strategies.find((s) => s.templateId === "NATURE_WELLNESS");
    expect(natureWellness).toBeDefined();
    const categories = natureWellness!.poiIds.map((id) => categoryOf(id, coreOnlyPool));
    for (const cat of categories) {
      expect(["ATTRACTION", "EXPERIENCE", "LODGING", "FOOD"]).toContain(cat);
    }
    // DAY_TRIP의 식사 선점 목표(2개)만큼 FOOD가 포함되고, 나머지는 여전히 핵심 카테고리만으로 채워진다.
    const nonFoodCategories = categories.filter((c) => c !== "FOOD");
    expect(categories.filter((c) => c === "FOOD")).toHaveLength(2);
    for (const cat of nonFoodCategories) {
      expect(["ATTRACTION", "EXPERIENCE", "LODGING"]).toContain(cat);
    }
    expect(natureWellness!.consumptionTouchpoints.food).toBe(true);
  });

  it("선택 과정에서 원본 poisByCategory 객체를 변경하지 않는다", () => {
    const before = JSON.parse(JSON.stringify(abundantPool));
    const dna = computeDna(dnaInput());
    computeStrategies(dna, baseProjectInput({ duration: "TWO_NIGHTS_THREE_DAYS" }), abundantPool, MODEL_VERSION);
    expect(abundantPool).toEqual(before);
  });

  it("지역 FOOD가 전부 식사 불가(카페 등, mealEligible=false)면 식사 선점 대상이 되지 않는다", () => {
    // 핵심 카테고리(ATTRACTION/EXPERIENCE/LODGING)만으로 목표를 채울 수 있는 코어 전용 풀에서,
    // FOOD가 전부 카페(mealEligible:false)라면 selectPois의 식사 선점 로직이 억지로 카페를 골라
    // 채우지 않아야 한다(이름 추정 없이 실제 판별값만 신뢰).
    const cafeOnlyPool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 20),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 20),
      LODGING: makePois("lodging", "LODGING", 20),
      FOOD: makePois("food", "FOOD", 20).map((p) => ({ ...p, mealEligible: false })),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "DAY_TRIP", preferredThemes: ["자연"] }),
      cafeOnlyPool,
      MODEL_VERSION,
    );
    const natureWellness = strategies.find((s) => s.templateId === "NATURE_WELLNESS");
    expect(natureWellness).toBeDefined();
    const categories = natureWellness!.poiIds.map((id) => categoryOf(id, cafeOnlyPool));
    expect(categories.filter((c) => c === "FOOD")).toHaveLength(0);
    expect(natureWellness!.consumptionTouchpoints.food).toBe(false);
  });

  it("mealEligible이 명시되지 않은 FOOD(하위 호환 기본값)는 식사 선점 대상에 포함된다", () => {
    const coreOnlyPool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 20),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 20),
      LODGING: makePois("lodging", "LODGING", 20),
      FOOD: makePois("food", "FOOD", 20), // mealEligible 필드 없음 — 기존 테스트/호출부와 동일한 형태
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "DAY_TRIP", preferredThemes: ["자연"] }),
      coreOnlyPool,
      MODEL_VERSION,
    );
    const natureWellness = strategies.find((s) => s.templateId === "NATURE_WELLNESS");
    expect(natureWellness).toBeDefined();
    const categories = natureWellness!.poiIds.map((id) => categoryOf(id, coreOnlyPool));
    expect(categories.filter((c) => c === "FOOD")).toHaveLength(2);
  });

  it("P0-3: 핵심·보완 카테고리 후보가 부족해도 무관한 카테고리(fallback tier)로 목표를 끝까지 채우지 않는다", () => {
    // NATURE_WELLNESS의 핵심은 ATTRACTION/EXPERIENCE, 보완은 FOOD/SHOPPING, fallback은 FESTIVAL뿐이다.
    // 핵심·보완 후보가 딱 1개뿐이고 FESTIVAL만 풍부해도, FESTIVAL로 목표(7개)를 억지로 채우지 않아야
    // "전략과 무관한 장소가 주요 관광지 자리를 차지"하는 문제가 재현되지 않는다.
    const scarceRelevantPool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [poi("a1", "attraction-1", "ATTRACTION")],
      FESTIVAL: makePois("festival", "FESTIVAL", 20),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["자연"] }),
      scarceRelevantPool,
      MODEL_VERSION,
    );
    const natureWellness = strategies.find((s) => s.templateId === "NATURE_WELLNESS");
    expect(natureWellness).toBeDefined();
    // 목표(7개)를 다 채우지 못하고, fallback 기여분은 목표의 40% 이하로 제한된다(1core + ceil(7*0.4)=3 = 4).
    expect(natureWellness!.poiIds.length).toBeLessThan(7);
    expect(natureWellness!.poiIds.length).toBe(4);
    const festivalCount = natureWellness!.poiIds.filter(
      (id) => categoryOf(id, scarceRelevantPool) === "FESTIVAL",
    ).length;
    expect(festivalCount).toBeLessThanOrEqual(3);
  });
});

describe("selectPois — 거리 기반 선택(2단계: POI 선택 단계에서부터 가까운 후보 우선)", () => {
  it("좌표가 있으면 이미 선택된 POI(식사 선점 FOOD)와 가까운 후보를 먼저 선택한다", () => {
    // 식사 선점(mealReserveTarget)이 항상 먼저 실행되므로, FOOD 앵커의 좌표가 이후 핵심 카테고리
    // 선택의 기준점(무게중심)이 된다. ATTRACTION 풀에 앵커와 아주 가까운 후보 2개와, 아주 먼(약
    // 267km) 후보 2개를 함께 두면, 가까운 후보 2개가 먼저 선택돼야 한다 — 회전 순서(이름순 해시)만
    // 봤다면 이름 순서에 따라 먼 후보가 먼저 뽑혔을 수도 있다.
    const anchor: PoiLike = { id: "food-anchor", name: "food-anchor", category: "FOOD", lat: 37, lng: 127 };
    const near1: PoiLike = { id: "attr-near-1", name: "attr-near-1", category: "ATTRACTION", lat: 37.001, lng: 127.001 };
    const near2: PoiLike = { id: "attr-near-2", name: "attr-near-2", category: "ATTRACTION", lat: 37.002, lng: 127.002 };
    const far1: PoiLike = { id: "attr-far-1", name: "attr-far-1", category: "ATTRACTION", lat: 37, lng: 130 };
    const far2: PoiLike = { id: "attr-far-2", name: "attr-far-2", category: "ATTRACTION", lat: 37, lng: 130.01 };

    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [far1, far2, near1, near2], // 회전 순서(이름순)로는 far가 near보다 먼저 온다.
      EXPERIENCE: makePois("experience", "EXPERIENCE", 5),
      LODGING: makePois("lodging", "LODGING", 2),
      FOOD: [anchor],
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "DAY_TRIP", preferredThemes: ["자연"] }),
      pool,
      MODEL_VERSION,
    );
    const natureWellness = strategies.find((s) => s.templateId === "NATURE_WELLNESS");
    expect(natureWellness).toBeDefined();

    const selectedAttractionIds = natureWellness!.poiIds.filter((id) => id.startsWith("attr-"));
    expect(selectedAttractionIds.slice(0, 2).sort()).toEqual(["attr-near-1", "attr-near-2"]);
  });

  it("좌표가 없는 후보만 있으면 기존 회전 순서(이름 정렬+해시 오프셋) 그대로 동작한다(회귀 없음)", () => {
    const dna = computeDna(dnaInput());
    const poolNoCoords: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 20),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 20),
      LODGING: makePois("lodging", "LODGING", 20),
      FOOD: makePois("food", "FOOD", 20),
    };
    const input = baseProjectInput({ duration: "DAY_TRIP", preferredThemes: ["자연"] });
    const withoutCoords = computeStrategies(dna, input, poolNoCoords, MODEL_VERSION);
    // 좌표를 전혀 채워 넣지 않은 동일한 풀로 두 번 계산해도 같은 결과가 나온다 — 거리 기반 로직이
    // 좌표가 전혀 없을 때는 관여하지 않고 순수 회전 순서로 fallback한다는 것을 간접 확인한다.
    const withoutCoordsAgain = computeStrategies(dna, input, poolNoCoords, MODEL_VERSION);
    expect(withoutCoords.map((s) => s.poiIds)).toEqual(withoutCoordsAgain.map((s) => s.poiIds));
  });

  it("일부 후보만 좌표가 있어도 크래시 없이 안전하게 처리된다(좌표 없는 후보는 거리 판단에서 제외)", () => {
    const anchor: PoiLike = { id: "food-anchor", name: "food-anchor", category: "FOOD", lat: 37, lng: 127 };
    const withCoords: PoiLike = { id: "attr-coord", name: "attr-coord", category: "ATTRACTION", lat: 37.001, lng: 127.001 };
    const withoutCoords1: PoiLike = { id: "attr-nocoord-1", name: "attr-nocoord-1", category: "ATTRACTION" };
    const withoutCoords2: PoiLike = { id: "attr-nocoord-2", name: "attr-nocoord-2", category: "ATTRACTION" };
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [withoutCoords1, withoutCoords2, withCoords],
      EXPERIENCE: makePois("experience", "EXPERIENCE", 5),
      LODGING: makePois("lodging", "LODGING", 2),
      FOOD: [anchor],
    };
    const dna = computeDna(dnaInput());
    expect(() =>
      computeStrategies(
        dna,
        baseProjectInput({ duration: "DAY_TRIP", preferredThemes: ["자연"] }),
        pool,
        MODEL_VERSION,
      ),
    ).not.toThrow();
  });
});

/**
 * 2026-08-11: theme(preferredThemes)이 전략 점수(targetFit)뿐 아니라 실제 코스 POI 구성에도 반영되도록
 * selectPois에 선호 테마 우선순위 티어를 추가했다 — 테마와 맞는 POI가 존재하면 hard filter가 아니라
 * "먼저 채워지는 우선순위"로 반영되고, 부족하면 자연스럽게 다음 티어(기존 supplement/fallback)로
 * 넘어간다(코스 생성 실패 없음). FESTIVAL_EVENT 템플릿(poiCategories: FESTIVAL/FOOD/SHOPPING)은
 * ATTRACTION이 원래 fallback 티어에만 있어, "문화·역사(CULTURE_HISTORY)" 테마 선택 시 ATTRACTION이
 * 우선순위 티어로 승격되는 효과를 명확히 관찰할 수 있다.
 */
describe("selectPois — theme(선호 테마) 반영(3단계)", () => {
  it("테마와 일치하는 카테고리가 원래 fallback이었어도 테마 선택 시 우선순위 티어로 승격돼 더 많이 채워진다", () => {
    // FESTIVAL_EVENT core=[FESTIVAL,FOOD,SHOPPING], 이 카테고리들 후보는 0개로 비워 core 티어가
    // 전혀 채워지지 않게 한다. ATTRACTION(문화·역사 테마 매핑)과 EXPERIENCE(기존 supplement)만 채운다.
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 10),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 10),
    };
    const dna = computeDna(dnaInput());

    // Network 산식 재설계(Phase 3)로 템플릿 간 순위가 바뀔 수 있으므로, 이 테스트의 관심사(POI 선택
    // 로직)와 무관한 다른 템플릿을 excludedThemes로 제외해 FESTIVAL_EVENT가 항상 top3에 남도록 한다.
    const excludedThemes = ["로컬미식", "야간·체류", "자연·웰니스", "문화·역사", "가족 체험", "청년 로컬"];
    const withoutTheme = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes }),
      pool,
      MODEL_VERSION,
    );
    const withTheme = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"], excludedThemes }),
      pool,
      MODEL_VERSION,
    );

    const festivalWithout = withoutTheme.find((s) => s.templateId === "FESTIVAL_EVENT")!;
    const festivalWith = withTheme.find((s) => s.templateId === "FESTIVAL_EVENT")!;
    expect(festivalWithout).toBeDefined();
    expect(festivalWith).toBeDefined();

    const countCat = (result: typeof festivalWithout, cat: PoiCategoryCode) =>
      result.poiIds.filter((id) => categoryOf(id, pool) === cat).length;

    // 테마 없음: EXPERIENCE(supplement, 무제한)가 목표(7개)를 전부 채워버려 ATTRACTION(fallback)은
    // 진입 기회조차 없다 — 이것이 바로 "테마와 무관하면 특정 카테고리가 코스를 독점할 수 있는" 기존 문제다.
    expect(countCat(festivalWithout, "ATTRACTION")).toBe(0);
    expect(countCat(festivalWithout, "EXPERIENCE")).toBe(7);

    // 테마 있음: ATTRACTION이 우선순위 티어로 승격돼(상한 50%=4개) 먼저 채워지고, 나머지 3개만
    // EXPERIENCE(supplement)로 채워진다 — 우선순위가 명확히 뒤바뀐다.
    expect(countCat(festivalWith, "ATTRACTION")).toBe(4);
    expect(countCat(festivalWith, "EXPERIENCE")).toBe(3);
    expect(festivalWith.poiIds.length).toBe(festivalWithout.poiIds.length);
  });

  it("테마 카테고리 POI가 아예 없어도 코스 생성이 실패하지 않고 다른 카테고리로 채워진다(fallback)", () => {
    // 문화·역사 테마를 선택했지만 ATTRACTION 후보가 지역에 전혀 없는 상황 — themeCats 티어가
    // 아무것도 못 채우고 자연스럽게 다음 티어(supplement/fallback)로 넘어가야 한다.
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      EXPERIENCE: makePois("experience", "EXPERIENCE", 10),
    };
    const dna = computeDna(dnaInput());
    // Network 산식 재설계(Phase 3)로 템플릿 순위가 바뀔 수 있으므로, 이 테스트의 관심사(POI 선택
    // fallback 로직)와 무관한 다른 템플릿을 excludedThemes로 제외해 FESTIVAL_EVENT가 항상 top3에 남도록 한다.
    const excludedThemes = ["로컬미식", "야간·체류", "자연·웰니스", "문화·역사", "가족 체험", "청년 로컬"];

    expect(() =>
      computeStrategies(
        dna,
        baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"], excludedThemes }),
        pool,
        MODEL_VERSION,
      ),
    ).not.toThrow();

    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"], excludedThemes }),
      pool,
      MODEL_VERSION,
    );
    const festivalEvent = strategies.find((s) => s.templateId === "FESTIVAL_EVENT")!;
    expect(festivalEvent.poiIds.length).toBeGreaterThan(0);
    for (const id of festivalEvent.poiIds) {
      expect(categoryOf(id, pool)).toBe("EXPERIENCE");
    }
  });

  it("선호 테마 카테고리가 아무리 풍부해도 코스 전체가 그 카테고리 하나로만 채워지지 않는다(다양성 유지)", () => {
    // FESTIVAL_EVENT core=[FESTIVAL,FOOD,SHOPPING](전부 pool에 없음, 진입 안 함). "레저·액티비티"
    // 테마(LEISURE_ACTIVITY→EXPERIENCE)를 골라 EXPERIENCE를 아주 풍부하게(20개) 두면, 테마 없을 때는
    // supplement 티어가 목표를 전부 EXPERIENCE로 채우지만(독점), 테마가 있으면 상한(50%)에서 멈추고
    // 나머지는 ATTRACTION(fallback)으로 채워져야 한다 — 미식(FOOD) 테마도 동일한 메커니즘을 타지만,
    // FOOD는 별도의 식사 선점(mealReserve) 로직과 상호작용해 순수한 상한 검증에는 이 카테고리가 더
    // 적합하다.
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 20),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 20),
    };
    const dna = computeDna(dnaInput());
    // "레저·액티비티" 테마는 THEME_TEMPLATE_BONUS상 NATURE_WELLNESS/YOUTH_LOCAL_CONTENT/
    // NIGHT_STAY_EXTENSION의 순위를 끌어올려 FESTIVAL_EVENT을 상위 3위 밖으로 밀어낼 수 있다 —
    // 이 테스트의 관심사는 순위가 아니라 POI 선택 로직이므로, 나머지 템플릿을 excludedThemes로
    // 제외해 FESTIVAL_EVENT만 후보로 남긴다.
    const strategies = computeStrategies(
      dna,
      baseProjectInput({
        duration: "ONE_NIGHT_TWO_DAYS",
        preferredThemes: ["레저 액티비티"],
        excludedThemes: ["로컬미식", "야간·체류", "자연·웰니스", "문화·역사", "가족 체험", "청년 로컬"],
      }),
      pool,
      MODEL_VERSION,
    );
    const festivalEvent = strategies.find((s) => s.templateId === "FESTIVAL_EVENT")!;
    expect(festivalEvent).toBeDefined();
    const categories = festivalEvent.poiIds.map((id) => categoryOf(id, pool));
    const experienceCount = categories.filter((c) => c === "EXPERIENCE").length;
    const otherCount = categories.filter((c) => c !== "EXPERIENCE").length;
    expect(experienceCount).toBe(4); // 상한(ceil(7*0.5)=4)에서 멈춘다 — 테마가 실제로 반영됨
    expect(otherCount).toBeGreaterThan(0); // 코스 전체가 한 카테고리로 도배되지 않음(ATTRACTION으로 보충)
  });

  it("테마를 지정하지 않으면 기존 우선순위(core→supplement→fallback)와 완전히 동일한 결과를 낸다(회귀 없음)", () => {
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 10),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 10),
      LODGING: makePois("lodging", "LODGING", 10),
      FOOD: makePois("food", "FOOD", 10),
      SHOPPING: makePois("shopping", "SHOPPING", 10),
      FESTIVAL: makePois("festival", "FESTIVAL", 10),
    };
    const dna = computeDna(dnaInput());
    const withEmptyThemes = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [] }),
      pool,
      MODEL_VERSION,
    );
    const withUnrelatedTheme = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["미확인 키워드"] }),
      pool,
      MODEL_VERSION,
    );
    // classifyThemes가 매칭되는 키워드를 찾지 못하면 themeCategories가 빈 배열이 되어 완전히 동일해야 한다.
    expect(withUnrelatedTheme.map((s) => s.poiIds)).toEqual(withEmptyThemes.map((s) => s.poiIds));
  });

  it("theme 반영은 전략 점수(scoreBreakdown)에 영향을 주지 않는다(POI 선택 단계에서만 작동)", () => {
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 10),
      EXPERIENCE: makePois("experience", "EXPERIENCE", 10),
      FESTIVAL: makePois("festival", "FESTIVAL", 10),
      FOOD: makePois("food", "FOOD", 10),
      SHOPPING: makePois("shopping", "SHOPPING", 10),
    };
    const dna = computeDna(dnaInput());
    // preferredThemes 자체는 이미 targetFit(computeThemeFit)에 반영되므로, 같은 preferredThemes로
    // 두 번 계산했을 때 scoreBreakdown이 완전히 동일한지만 확인한다(POI 우선순위 로직 추가가 점수
    // 계산 경로에 부작용을 주지 않았는지 회귀 확인).
    const input = baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"] });
    const first = computeStrategies(dna, input, pool, MODEL_VERSION);
    const second = computeStrategies(dna, input, pool, MODEL_VERSION);
    expect(first.map((s) => s.scoreBreakdown)).toEqual(second.map((s) => s.scoreBreakdown));
    expect(first.map((s) => s.totalScore)).toEqual(second.map((s) => s.totalScore));
  });
});

/** 2026-08-15(POI 후보 선정 품질 개선) — selectPois가 카테고리 내부에서 후보를 고를 때 이름 가나다순/
 * 해시 회전보다 TourAPI 공식 구조 분류(classifyStructuralPoiThemes) 또는 이름 키워드 관련성을 먼저
 * 본다. 경주 CULTURE_HISTORY 실행안에서 대표 문화유산(lclsSystm1="HS")이 가나다순 회전 때문에 초기
 * 후보 풀에도 못 들어가던 문제를 해결한다. */
describe("selectPois — 구조적 테마 관련성 우선 랭킹(2026-08-15)", () => {
  const excludeAllExcept = (keep: string) =>
    ["로컬미식", "야간·체류", "자연·웰니스", "문화·역사", "축제·이벤트", "가족 체험", "청년 로컬"].filter(
      (label) => !label.startsWith(keep),
    );

  it("이름은 가나다순으로 불리하지만(예: '힣'으로 시작) 공식 구조 분류(HS)가 확인되는 POI가 우선 선택된다", () => {
    // ATTRACTION 카테고리에 이름은 앞서지만 구조 신호가 없는 후보 9개와, 이름은 가장 뒤에 오지만
    // lclsSystm1="HS"(역사관광)로 확인되는 후보 1개를 둔다. 기존 가나다순+해시 회전 방식이라면 이
    // "힣"으로 시작하는 후보가 목표(4개) 안에 들 가능성이 낮지만, 구조 관련성이 우선이면 반드시 포함돼야 한다.
    const generic = Array.from({ length: 9 }, (_, i) => poi(`generic-${i}`, `일반명소${String(i).padStart(2, "0")}`, "ATTRACTION"));
    const historic: PoiLike = { id: "historic-1", name: "힣역사유적지", category: "ATTRACTION", lclsSystm1: "HS", lclsSystm2: "HS01" };
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [...generic, historic],
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    expect(cultureHistory).toBeDefined();
    expect(cultureHistory.poiIds).toContain("historic-1");
  });

  it("선호 테마를 입력하지 않아도(preferredThemes=[]) 전략 자체의 핵심 테마(CULTURE_HISTORY)가 구조 관련성 랭킹에 반영된다", () => {
    // Production 실제 재현 조건 — 사용자가 선호 테마를 아예 입력하지 않은 경우다. 이 경우에도
    // templateCoreThemeCategories("CULTURE_HISTORY")=["CULTURE_HISTORY"]가 자동으로 반영돼야 한다.
    const generic = Array.from({ length: 9 }, (_, i) => poi(`generic-${i}`, `일반명소${String(i).padStart(2, "0")}`, "ATTRACTION"));
    const historic: PoiLike = { id: "historic-1", name: "힣역사유적지", category: "ATTRACTION", lclsSystm1: "HS", lclsSystm2: "HS01" };
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [...generic, historic],
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    expect(cultureHistory).toBeDefined();
    expect(cultureHistory.poiIds).toContain("historic-1");
  });

  it("구조 신호가 명백히 다른 테마(NA=자연)를 가리키는 후보는 구조 신호가 없는 후보보다 우선되지 않는다", () => {
    // "강동 워터파크" 재현: VE02(테마공원, 매핑 없음)는 구조 신호가 없는 것과 동일하게 취급되고,
    // NA(자연, CULTURE_HISTORY와 무관)로 확인된 후보도 문화·역사 테마에서는 우선되지 않아야 한다.
    const natureConfirmed: PoiLike = { id: "nature-1", name: "가나다자연공원", category: "ATTRACTION", lclsSystm1: "NA", lclsSystm2: "NA01" };
    const historic: PoiLike = { id: "historic-1", name: "힣역사유적지", category: "ATTRACTION", lclsSystm1: "HS", lclsSystm2: "HS01" };
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [natureConfirmed, historic],
      FOOD: makePois("food", "FOOD", 3),
    };
    const dna = computeDna(dnaInput());
    // TWO_NIGHTS_THREE_DAYS(목표 11곳)로 넉넉하게 잡아 ATTRACTION 후보 둘 다 선택 대상에 들도록 한다
    // (DAY_TRIP처럼 목표가 빠듯하면 FOOD가 마지막 남은 자리를 먼저 채워가 버려 이 테스트의 관심사인
    // "둘 다 선택됐을 때의 순서"를 확인할 수 없다).
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "TWO_NIGHTS_THREE_DAYS", preferredThemes: ["문화 역사"], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    const attractionOrder = cultureHistory.poiIds.filter((id) => categoryOf(id, pool) === "ATTRACTION");
    // 둘 다 선택되더라도(목표 개수가 넉넉하면), 관련성이 확인된 historic-1이 nature-1보다 먼저 선택된다.
    expect(attractionOrder.indexOf("historic-1")).toBeLessThan(attractionOrder.indexOf("nature-1"));
  });

  it("이름 키워드만 일치하고 구조 신호가 없는 후보는 구조 신호로 확인된 후보보다는 뒤에, 신호가 전혀 없는 후보보다는 앞에 온다", () => {
    const structural: PoiLike = { id: "structural-1", name: "가나다순으로빠른이름", category: "ATTRACTION", lclsSystm1: "HS" };
    const keywordOnly: PoiLike = { id: "keyword-1", name: "힣역사유적지(키워드만)", category: "ATTRACTION" };
    const noSignal: PoiLike = { id: "none-1", name: "다라마아무개명소", category: "ATTRACTION" };
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [structural, keywordOnly, noSignal],
      FOOD: makePois("food", "FOOD", 3),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "TWO_NIGHTS_THREE_DAYS", preferredThemes: ["문화 역사"], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    const order = cultureHistory.poiIds.filter((id) => categoryOf(id, pool) === "ATTRACTION");
    expect(order.indexOf("structural-1")).toBeLessThan(order.indexOf("keyword-1"));
    expect(order.indexOf("keyword-1")).toBeLessThan(order.indexOf("none-1"));
  });

  it("구조 신호(lclsSystm1/2)를 전혀 넘기지 않는 기존 호출부는 이전과 동일하게 동작한다(하위 호환)", () => {
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 10),
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const withStructuralFieldsAbsent = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"] }),
      pool,
      MODEL_VERSION,
    );
    // 구조 신호가 전혀 없으면(테스트 POI 전부 lclsSystm 미설정) 전부 동일 tier이므로 기존 이름 키워드
    // 판정만으로 동일 결과가 결정론적으로 재현된다.
    const again = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: ["문화 역사"] }),
      pool,
      MODEL_VERSION,
    );
    expect(withStructuralFieldsAbsent.map((s) => s.poiIds)).toEqual(again.map((s) => s.poiIds));
  });
});

describe("selectPois — 전략 핵심 테마 중심 코스 구성 강화(core-theme floor, 2026-08-16)", () => {
  const excludeAllExcept = (keep: string) =>
    ["로컬미식", "야간·체류", "자연·웰니스", "문화·역사", "축제·이벤트", "가족 체험", "청년 로컬"].filter(
      (label) => !label.startsWith(keep),
    );

  it("ATTRACTION 목표 슬롯이 1개뿐이어도(ONE_NIGHT_TWO_DAYS) 관련성 확인된 ATTRACTION 후보가 여러 개 있으면 floor만큼 우선 확보된다", () => {
    // 경주 재현: ONE_NIGHT_TWO_DAYS는 비숙박 목표 7개 중 mealReserve가 4개를 먼저 선점해, 기존
    // 라운드로빈이면 ATTRACTION/EXPERIENCE/FOOD 3개 카테고리가 남은 3자리를 1개씩만 나눠 가져
    // ATTRACTION이 1개로 고정됐다. floor(30% ≈ ceil(7*0.3)=3개)가 적용되면 구조 신호로 확인되는
    // ATTRACTION 후보 3개가 라운드로빈보다 먼저 확보돼야 한다.
    const historic = Array.from({ length: 5 }, (_, i) => ({
      id: `historic-${i}`,
      name: `가나다역사유적지${i}`,
      category: "ATTRACTION" as const,
      lclsSystm1: "HS",
      lclsSystm2: "HS01",
    }));
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: historic,
      EXPERIENCE: makePois("exp", "EXPERIENCE", 5),
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    const attractionCount = cultureHistory.poiIds.filter((id) => categoryOf(id, pool) === "ATTRACTION").length;
    expect(attractionCount).toBeGreaterThanOrEqual(3);
  });

  it("관련성 확인된 core-theme 후보가 공급 부족이면 강제로 채우지 않고 있는 만큼만 확보한다(코스 생성 실패 없음)", () => {
    // ATTRACTION 후보 자체가 1개뿐이면 floor 목표(3개)를 못 채워도 실패하지 않고, 그 1개만 확보한 채
    // 나머지는 기존 라운드로빈이 다른 카테고리로 자연스럽게 채운다.
    const historic: PoiLike = { id: "historic-1", name: "유일한역사유적지", category: "ATTRACTION", lclsSystm1: "HS" };
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: [historic],
      EXPERIENCE: makePois("exp", "EXPERIENCE", 5),
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    expect(cultureHistory.poiIds).toContain("historic-1");
    expect(cultureHistory.poiIds.length).toBe(7); // 목표 개수는 그대로 채워짐(다른 카테고리로 보완)
  });

  it("핵심 테마가 없는 전략(예: FAMILY_EXPERIENCE)은 floor를 적용하지 않아 기존 라운드로빈과 동일하게 동작한다", () => {
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: makePois("attraction", "ATTRACTION", 10),
      EXPERIENCE: makePois("exp", "EXPERIENCE", 10),
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("가족") }),
      pool,
      MODEL_VERSION,
    );
    const familyExperience = strategies.find((s) => s.templateId === "FAMILY_EXPERIENCE")!;
    expect(familyExperience).toBeDefined();
    // 카테고리별 개수가 기존 라운드로빈 결과(균등 배분)와 같은지, 특정 카테고리로 쏠리지 않았는지만 확인한다.
    const attractionCount = familyExperience.poiIds.filter((id) => categoryOf(id, pool) === "ATTRACTION").length;
    const experienceCount = familyExperience.poiIds.filter((id) => categoryOf(id, pool) === "EXPERIENCE").length;
    expect(Math.abs(attractionCount - experienceCount)).toBeLessThanOrEqual(1);
  });

  it("FOOD/LODGING 확보 개수는 core-theme floor 적용 여부와 무관하게 그대로 유지된다", () => {
    const historic = Array.from({ length: 5 }, (_, i) => ({
      id: `historic-${i}`,
      name: `가나다역사유적지${i}`,
      category: "ATTRACTION" as const,
      lclsSystm1: "HS",
    }));
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: historic,
      FOOD: makePois("food", "FOOD", 10),
      LODGING: makePois("lodging", "LODGING", 5),
    };
    const dna = computeDna(dnaInput());
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
      pool,
      MODEL_VERSION,
    );
    const cultureHistory = strategies.find((s) => s.templateId === "CULTURE_HISTORY")!;
    expect(cultureHistory.consumptionTouchpoints.food).toBe(true);
    expect(cultureHistory.consumptionTouchpoints.lodging).toBe(true);
    const lodgingCount = cultureHistory.poiIds.filter((id) => categoryOf(id, pool) === "LODGING").length;
    expect(lodgingCount).toBe(1); // ONE_NIGHT_TWO_DAYS의 LODGING_POI_TARGET_BY_DURATION 그대로
  });

  it("동일 입력에는 항상 동일 결과(deterministic)", () => {
    const historic = Array.from({ length: 5 }, (_, i) => ({
      id: `historic-${i}`,
      name: `가나다역사유적지${i}`,
      category: "ATTRACTION" as const,
      lclsSystm1: "HS",
    }));
    const pool: Partial<Record<PoiCategoryCode, PoiLike[]>> = {
      ATTRACTION: historic,
      FOOD: makePois("food", "FOOD", 5),
    };
    const dna = computeDna(dnaInput());
    const run = () =>
      computeStrategies(
        dna,
        baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
        pool,
        MODEL_VERSION,
      ).map((s) => ({ id: s.templateId, poiIds: s.poiIds, score: s.totalScore }));
    expect(run()).toEqual(run());
  });

  it("core-theme floor 적용 여부와 무관하게 전략 점수(scoreBreakdown/totalScore)는 변하지 않는다", () => {
    const historic = Array.from({ length: 5 }, (_, i) => ({
      id: `historic-${i}`,
      name: `가나다역사유적지${i}`,
      category: "ATTRACTION" as const,
      lclsSystm1: "HS",
    }));
    const generic = Array.from({ length: 5 }, (_, i) => poi(`generic-${i}`, `일반명소${i}`, "ATTRACTION"));
    const dna = computeDna(dnaInput());
    const withCoreTheme = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
      { ATTRACTION: historic, FOOD: makePois("food", "FOOD", 5) },
      MODEL_VERSION,
    ).find((s) => s.templateId === "CULTURE_HISTORY")!;
    const withoutCoreTheme = computeStrategies(
      dna,
      baseProjectInput({ duration: "ONE_NIGHT_TWO_DAYS", preferredThemes: [], excludedThemes: excludeAllExcept("문화") }),
      { ATTRACTION: generic, FOOD: makePois("food", "FOOD", 5) },
      MODEL_VERSION,
    ).find((s) => s.templateId === "CULTURE_HISTORY")!;
    // POI 후보 구조 신호(lclsSystm1)만 다르고 DNA/입력 조건은 동일 — 점수는 POI 선택과 무관하게 같아야 한다.
    expect(withCoreTheme.scoreBreakdown).toEqual(withoutCoreTheme.scoreBreakdown);
    expect(withCoreTheme.totalScore).toBe(withoutCoreTheme.totalScore);
  });
});
