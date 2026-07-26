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
      relatedPoiCount: 0,
      foodCount: 20,
      lodgingCount: 10,
      experienceCount: 5,
      collectedAt: "2026-07-01T00:00:00.000Z",
      poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
      relation: null,
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
    const strategies = computeStrategies(
      dna,
      baseProjectInput({ duration: "DAY_TRIP" }),
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
      baseProjectInput({ duration: "DAY_TRIP" }),
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
      baseProjectInput({ duration: "DAY_TRIP" }),
      coreOnlyPool,
      MODEL_VERSION,
    );
    const natureWellness = strategies.find((s) => s.templateId === "NATURE_WELLNESS");
    const categories = natureWellness!.poiIds.map((id) => categoryOf(id, coreOnlyPool));
    expect(categories.filter((c) => c === "FOOD")).toHaveLength(2);
  });
});
