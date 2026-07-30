import { describe, expect, it } from "vitest";
import { computePoiFit, filterRecommendablePois, isExcludedFromRecommendation, type PoiFitContext } from "@/lib/domain/poiFit";
import { getTemplateById } from "@/lib/domain/strategyTemplates";

// CULTURE_HISTORY: poiCategories=["ATTRACTION","EXPERIENCE","FOOD"](FOOD 제외 core=[ATTRACTION,EXPERIENCE]),
// TOUCHPOINT_SUPPLEMENT_CATEGORIES=[FOOD,EXPERIENCE,SHOPPING] 중 core에 없는 SHOPPING만 supplement,
// 나머지(FESTIVAL 등)는 fallback. idealMonths=[3,4,5,9,10,11].
const cultureHistory = getTemplateById("CULTURE_HISTORY");

function context(overrides: Partial<PoiFitContext> = {}): PoiFitContext {
  return { template: cultureHistory, travelMonth: 10, preferredThemes: ["문화·역사"], ...overrides };
}

describe("computePoiFit — 저적합 POI 판정(2026-07-30 보완)", () => {
  it("카테고리만 이 전략과 일치하고 선호 테마(실제 입력됨)와 이름이 명백히 불일치하면 LOW+BELOW_MINIMUM_FIT이다(강동 워터파크 재현)", () => {
    const fit = computePoiFit(
      { id: "p1", name: "강동 워터파크", category: "ATTRACTION", sourceType: "API", operatingHours: null, closedDays: null },
      context(),
    );
    expect(fit.breakdown.categoryFit.tier).toBe("CORE");
    expect(fit.breakdown.themeFit).toMatchObject({ evaluated: true, matched: false });
    expect(fit.grade).toBe("LOW");
    expect(fit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
  });

  it("카테고리가 이 전략과 전혀 무관한 FALLBACK 티어이면 테마 평가와 무관하게 BELOW_MINIMUM_FIT이다", () => {
    const fit = computePoiFit(
      { id: "p2", name: "이름에 아무 키워드도 없는 곳", category: "FESTIVAL", sourceType: "API", operatingHours: null, closedDays: null },
      context({ preferredThemes: [] }),
    );
    expect(fit.breakdown.categoryFit.tier).toBe("FALLBACK");
    expect(fit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
  });

  it("선호 테마를 아예 입력하지 않아 테마 판단 근거가 없으면, 등급이 낮아도 정보 부족으로 처리하고 제외 대상이 아니다", () => {
    // SUPPLEMENT 티어(SHOPPING) + 비수기(1월) + 테마 미입력 조합 → 낮은 점수(LOW)가 나오지만,
    // 테마 판단 근거 자체가 없으므로(themeFit.evaluated===false) "명백한 저적합"으로 단정하지 않는다.
    const fit = computePoiFit(
      { id: "p3", name: "이름만으로는 테마를 알 수 없는 일반 상점", category: "SHOPPING", sourceType: "API", operatingHours: null, closedDays: null },
      { template: cultureHistory, travelMonth: 1, preferredThemes: [] },
    );
    expect(fit.breakdown.categoryFit.tier).toBe("SUPPLEMENT");
    expect(fit.breakdown.themeFit.evaluated).toBe(false);
    expect(fit.grade).toBe("LOW");
    expect(fit.recommendationStatus).toBe("INSUFFICIENT_EVALUATION_DATA");
    expect(isExcludedFromRecommendation(fit)).toBe(false);
  });

  it("실제 선호 테마와 장소명 키워드가 일치하면 등급이 높고 추천 대상이다", () => {
    const fit = computePoiFit(
      { id: "p4", name: "경주 문화유적 전시관", category: "ATTRACTION", sourceType: "API", operatingHours: null, closedDays: null },
      context(),
    );
    expect(fit.grade).toBe("HIGH");
    expect(fit.recommendationStatus).toBe("RECOMMENDED");
  });

  it("FOOD/LODGING은 카테고리·테마·계절과 무관하게 항상 REQUIRED_SLOT이다(테마 키워드가 없고 비수기여도 제거 대상 아님)", () => {
    const foodFit = computePoiFit(
      { id: "food1", name: "이름에 문화 키워드 없는 식당", category: "FOOD", sourceType: "API", operatingHours: null, closedDays: null },
      context({ travelMonth: 1, preferredThemes: [] }),
    );
    const lodgingFit = computePoiFit(
      { id: "lodge1", name: "이름에 아무 키워드도 없는 숙소", category: "LODGING", sourceType: "API", operatingHours: null, closedDays: null },
      context({ travelMonth: 1, preferredThemes: [] }),
    );
    expect(foodFit.recommendationStatus).toBe("REQUIRED_SLOT");
    expect(lodgingFit.recommendationStatus).toBe("REQUIRED_SLOT");
    expect(isExcludedFromRecommendation(foodFit)).toBe(false);
    expect(isExcludedFromRecommendation(lodgingFit)).toBe(false);
  });

  it("점수 계산에 실제로 반영된 근거만 문장화한다 — BELOW_MINIMUM_FIT이면 그 사유가 cautions에 그대로 드러난다", () => {
    const fit = computePoiFit(
      { id: "p5", name: "강동 워터파크", category: "ATTRACTION", sourceType: "API", operatingHours: null, closedDays: null },
      context(),
    );
    expect(fit.cautions.some((c) => c.includes("전략 적합 기준에 미달"))).toBe(true);
  });

  it("정보 부족 상태이면 그 사실이 cautions에 그대로 드러난다(부적합 문구와 구분됨)", () => {
    const fit = computePoiFit(
      { id: "p6", name: "이름만으로는 테마를 알 수 없는 일반 상점", category: "SHOPPING", sourceType: "API", operatingHours: null, closedDays: null },
      { template: cultureHistory, travelMonth: 1, preferredThemes: [] },
    );
    expect(fit.cautions.some((c) => c.includes("전략 적합 기준에 미달"))).toBe(false);
    expect(fit.cautions.some((c) => c.includes("충분히 판단하기 어려워"))).toBe(true);
  });
});

describe("filterRecommendablePois — 필터링 위치를 한 곳으로 일원화한 순수 함수", () => {
  it("LOW+BELOW_MINIMUM_FIT인 일반 관광 POI만 제외하고, HIGH POI는 유지한다(경주 시나리오 축소 재현)", () => {
    const pois = [
      { id: "waterpark", name: "강동 워터파크", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "heritage", name: "경주 문화유적 전시관", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "camp", name: "경주초우오토캠핑장", category: "EXPERIENCE" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const { recommended, excluded } = filterRecommendablePois(pois, context());

    expect(recommended.map((p) => p.id)).toEqual(["heritage"]);
    expect(excluded.map((e) => e.poi.id).sort()).toEqual(["camp", "waterpark"]);
    for (const { fit } of excluded) {
      expect(fit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
    }
  });

  it("선호 테마 자체가 없어 정보가 부족하면 등급이 낮아도 제외하지 않는다", () => {
    const ctx: PoiFitContext = { template: cultureHistory, travelMonth: 1, preferredThemes: [] };
    const pois = [
      { id: "shop", name: "이름만으로는 테마를 알 수 없는 일반 상점", category: "SHOPPING" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const { recommended, excluded } = filterRecommendablePois(pois, ctx);
    expect(recommended.map((p) => p.id)).toEqual(["shop"]);
    expect(excluded).toHaveLength(0);
  });

  it("제외된 자리를 다시 채우지 않는다 — 필터링 결과는 순수하게 recommended/excluded 분리일 뿐, 새 POI를 만들어내지 않는다", () => {
    const pois = [
      { id: "waterpark", name: "강동 워터파크", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const { recommended, excluded } = filterRecommendablePois(pois, context());
    expect(recommended).toHaveLength(0);
    expect(excluded).toHaveLength(1);
    expect(recommended.length + excluded.length).toBe(pois.length);
  });
});
