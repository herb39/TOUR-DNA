import { describe, expect, it } from "vitest";
import {
  computeBusinessOpportunities,
  OPPORTUNITY_RULE_VERSION,
  type AxisScoreInput,
  type ComputeBusinessOpportunitiesInput,
} from "@/lib/domain/businessOpportunity";

function axis(overrides: Partial<Record<AxisScoreInput["axis"], number | null>> = {}): AxisScoreInput[] {
  const base: Record<AxisScoreInput["axis"], number | null> = {
    demand: 60,
    stay: 70,
    spend: 40,
    diversity: 55,
    network: 65,
  };
  return (Object.entries({ ...base, ...overrides }) as [AxisScoreInput["axis"], number | null][]).map(
    ([a, score]) => ({ axis: a, score, status: score === null ? "MISSING" : "LIVE" }),
  );
}

function baseInput(overrides: Partial<ComputeBusinessOpportunitiesInput> = {}): ComputeBusinessOpportunitiesInput {
  return {
    regionName: "테스트시",
    axisScores: axis(),
    role: "TRAVEL_AGENCY",
    travelMonth: 8,
    preferredThemes: ["미식"],
    poiCountByCategory: { ATTRACTION: 10, FOOD: 10, LODGING: 10, EXPERIENCE: 10, FESTIVAL: 10, SHOPPING: 10 },
    ...overrides,
  };
}

describe("computeBusinessOpportunities — 기본 동작", () => {
  it("정상적인 입력이면 최대 3개까지 반환하고 note가 없다(근거 충분)", () => {
    const result = computeBusinessOpportunities(
      baseInput({ poiCountByCategory: { ATTRACTION: 20, FOOD: 2, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 } }),
    );
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(3);
  });

  it("규칙 버전(ruleVersion)을 항상 함께 반환한다(CURATED 규칙 표시용, 2026-08-02)", () => {
    const result = computeBusinessOpportunities(baseInput());
    expect(result.ruleVersion).toBe(OPPORTUNITY_RULE_VERSION);
    expect(result.ruleVersion.length).toBeGreaterThan(0);
  });

  it("각 항목은 필수 필드(제목/문제/강점/타깃/시기/방향/근거/한계)를 모두 채운다", () => {
    const result = computeBusinessOpportunities(baseInput());
    for (const item of result.items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.problem.length).toBeGreaterThan(0);
      expect(item.strengthsToLeverage.length).toBeGreaterThan(0);
      expect(item.targetAudience.length).toBeGreaterThan(0);
      expect(item.timing.length).toBeGreaterThan(0);
      expect(item.direction.length).toBeGreaterThan(0);
      expect(item.evidence.length).toBeGreaterThan(0);
      expect(item.limitations.length).toBeGreaterThan(0);
    }
  });

  it("세 후보(취약축/계절/테마)가 서로 다른 category·problem·targetAudience를 갖는다(실질적 차별화)", () => {
    const result = computeBusinessOpportunities(
      baseInput({ poiCountByCategory: { ATTRACTION: 20, FOOD: 1, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 } }),
    );
    const categories = result.items.map((i) => i.category);
    expect(new Set(categories).size).toBe(categories.length); // 카테고리 중복 없음
    const problems = result.items.map((i) => i.problem);
    expect(new Set(problems).size).toBe(problems.length); // 문제 문구도 서로 다름
  });
});

describe("computeBusinessOpportunities — 근거 부족 시 지어내지 않는다", () => {
  it("DNA 5축이 전부 MISSING이면 취약축 보완형 기회를 만들지 않는다", () => {
    const result = computeBusinessOpportunities(baseInput({ axisScores: axis({ demand: null, stay: null, spend: null, diversity: null, network: null }) }));
    expect(result.items.some((i) => i.category === "WEAKNESS_RECOVERY")).toBe(false);
  });

  it("여행월이 없으면 계절 격차형 기회를 만들지 않는다", () => {
    const result = computeBusinessOpportunities(baseInput({ travelMonth: undefined }));
    expect(result.items.some((i) => i.category === "SEASONALITY_GAP")).toBe(false);
  });

  it("선호 테마가 없으면 타깃·테마 격차형 기회를 만들지 않는다", () => {
    const result = computeBusinessOpportunities(baseInput({ preferredThemes: [] }));
    expect(result.items.some((i) => i.category === "TARGET_THEME_GAP")).toBe(false);
  });

  it("대응하는 POI 카테고리가 없는 테마(반려동물 동반)만 선택하면 타깃·테마 격차형을 만들지 않는다", () => {
    const result = computeBusinessOpportunities(baseInput({ preferredThemes: ["반려동물"] }));
    expect(result.items.some((i) => i.category === "TARGET_THEME_GAP")).toBe(false);
  });

  it("지역 POI 데이터 자체가 없으면(전부 0건) 공급 격차형·타깃·테마 격차형을 만들지 않는다", () => {
    const result = computeBusinessOpportunities(
      baseInput({ poiCountByCategory: { ATTRACTION: 0, FOOD: 0, LODGING: 0, EXPERIENCE: 0, FESTIVAL: 0, SHOPPING: 0 } }),
    );
    expect(result.items.some((i) => i.category === "SUPPLY_GAP")).toBe(false);
    expect(result.items.some((i) => i.category === "TARGET_THEME_GAP")).toBe(false);
  });

  it("카테고리 공급이 완전히 균등하면 공급 격차형을 만들지 않는다(의미 있는 격차 아님)", () => {
    const result = computeBusinessOpportunities(
      baseInput({ poiCountByCategory: { ATTRACTION: 10, FOOD: 10, LODGING: 10, EXPERIENCE: 10, FESTIVAL: 10, SHOPPING: 10 } }),
    );
    expect(result.items.some((i) => i.category === "SUPPLY_GAP")).toBe(false);
  });

  it("유효한 후보가 3개 미만이면 note에 사유를 명시하고, 3개 확보되면 note가 null이다", () => {
    const scarce = computeBusinessOpportunities(baseInput({ travelMonth: undefined, preferredThemes: [] }));
    expect(scarce.items.length).toBeLessThan(3);
    expect(scarce.note).toBeTruthy();

    const plenty = computeBusinessOpportunities(
      baseInput({ poiCountByCategory: { ATTRACTION: 20, FOOD: 1, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 } }),
    );
    expect(plenty.items.length).toBe(3);
    expect(plenty.note).toBeNull();
  });

  it("모든 신호가 근거 부족이면 items가 빈 배열이고 note가 채워진다(임의로 채우지 않음)", () => {
    const result = computeBusinessOpportunities({
      regionName: "데이터없음시",
      axisScores: axis({ demand: null, stay: null, spend: null, diversity: null, network: null }),
      role: undefined,
      travelMonth: undefined,
      preferredThemes: [],
      poiCountByCategory: {},
    });
    expect(result.items).toEqual([]);
    expect(result.note).toBeTruthy();
  });
});

describe("computeBusinessOpportunities — 역할·여행월·테마 반영", () => {
  it("역할(role)에 따라 계절 격차형의 사업 방향·타깃 문구가 달라진다", () => {
    const localGov = computeBusinessOpportunities(baseInput({ role: "LOCAL_GOV", travelMonth: 8 }));
    const travelAgency = computeBusinessOpportunities(baseInput({ role: "TRAVEL_AGENCY", travelMonth: 8 }));
    const localGovSeason = localGov.items.find((i) => i.category === "SEASONALITY_GAP");
    const agencySeason = travelAgency.items.find((i) => i.category === "SEASONALITY_GAP");
    expect(localGovSeason?.direction).not.toBe(agencySeason?.direction);
    expect(localGovSeason?.targetAudience).not.toBe(agencySeason?.targetAudience);
  });

  it("여행월이 비수기(8월)와 성수기(10월)면 계절 격차형의 제목·문제가 달라진다", () => {
    const offPeak = computeBusinessOpportunities(baseInput({ travelMonth: 8 }));
    const peak = computeBusinessOpportunities(baseInput({ travelMonth: 10 }));
    const offItem = offPeak.items.find((i) => i.category === "SEASONALITY_GAP")!;
    const peakItem = peak.items.find((i) => i.category === "SEASONALITY_GAP")!;
    expect(offItem.title).not.toBe(peakItem.title);
    expect(offItem.problem).not.toBe(peakItem.problem);
  });

  it("선호 테마가 다르면(미식 vs 문화·역사) 타깃·테마 격차형의 제목이 달라진다", () => {
    const food = computeBusinessOpportunities(
      baseInput({ preferredThemes: ["미식"], poiCountByCategory: { ATTRACTION: 20, FOOD: 1, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 } }),
    );
    const culture = computeBusinessOpportunities(
      baseInput({ preferredThemes: ["문화"], poiCountByCategory: { ATTRACTION: 1, FOOD: 20, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 } }),
    );
    const foodItem = food.items.find((i) => i.category === "TARGET_THEME_GAP");
    const cultureItem = culture.items.find((i) => i.category === "TARGET_THEME_GAP");
    expect(foodItem?.title).not.toBe(cultureItem?.title);
  });
});

describe("computeBusinessOpportunities — 전략 카탈로그와 무관하게 동작한다", () => {
  it("전략 템플릿 이름(예: '자연·웰니스형')과 기회 제목이 겹치지 않는다", () => {
    const result = computeBusinessOpportunities(
      baseInput({ poiCountByCategory: { ATTRACTION: 20, FOOD: 1, LODGING: 20, EXPERIENCE: 20, FESTIVAL: 20, SHOPPING: 20 } }),
    );
    const strategyNames = ["로컬미식·시장 연계형", "야간·체류 확대형", "자연·웰니스형", "문화·역사 체험형", "축제·이벤트 연계형", "가족 체험형", "청년 로컬·감성 콘텐츠형"];
    for (const item of result.items) {
      expect(strategyNames).not.toContain(item.title);
    }
  });
});
