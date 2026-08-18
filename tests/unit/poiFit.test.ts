import { describe, expect, it } from "vitest";
import {
  computePoiFit,
  filterRecommendablePois,
  isExcludedFromRecommendation,
  applyCoreMinimumReserve,
  type PoiFitContext,
} from "@/lib/domain/poiFit";
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

  it("레거시처럼 선호 테마가 비어 있어도 호출부가 전달한 활성 전략 테마로 평가할 수 있다", () => {
    const fit = computePoiFit(
      {
        id: "p3-active",
        name: "경주 첨성대",
        category: "ATTRACTION",
        sourceType: "API",
        operatingHours: null,
        closedDays: null,
        lclsSystm1: "HS",
        lclsSystm2: "HS01",
      },
      { template: cultureHistory, travelMonth: 10, preferredThemes: [], themeCategories: ["CULTURE_HISTORY"] },
    );
    expect(fit.breakdown.themeFit).toMatchObject({ evaluated: true, matched: true, source: "STRUCTURAL" });
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

/** 2026-08-14(POI 추천 품질 2차 고도화) — 이름 키워드보다 신뢰할 수 있는 TourAPI 공식 분류 신호
 * (lclsSystm1/2)가 있으면 그것을 우선 쓰고, 없으면 기존 이름 키워드로 안전하게 fallback하는지 검증한다.
 * 실제 로컬 DB 검증(경주 첨성대=lclsSystm1 "HS", 대릉원=lclsSystm1 "HS")에서 재현된 값을 그대로 쓴다. */
describe("computePoiFit — 구조적 분류 신호(lclsSystm1/2) 우선 + 키워드 fallback(2026-08-14)", () => {
  it("이름에 문화/역사 키워드가 전혀 없어도 lclsSystm1=HS이면 구조 신호로 테마가 일치한다(경주 첨성대 재현)", () => {
    const fit = computePoiFit(
      {
        id: "cheomseongdae",
        name: "경주 첨성대",
        category: "ATTRACTION",
        sourceType: "API",
        operatingHours: null,
        closedDays: null,
        lclsSystm1: "HS",
        lclsSystm2: "HS01",
      },
      context(),
    );
    expect(fit.breakdown.themeFit).toMatchObject({ evaluated: true, matched: true, source: "STRUCTURAL" });
    expect(fit.grade).toBe("HIGH");
    expect(fit.recommendationStatus).toBe("RECOMMENDED");
    expect(fit.positiveReasons.some((r) => r.includes("공식 분류"))).toBe(true);
  });

  it("lclsSystm2=VE07(전시시설)이면 대분류 VE 전체가 아니라 이 중분류만으로 문화·역사 테마가 일치한다(박물관류)", () => {
    const fit = computePoiFit(
      {
        id: "museum",
        name: "OO기념관",
        category: "ATTRACTION",
        sourceType: "API",
        operatingHours: null,
        closedDays: null,
        lclsSystm1: "VE",
        lclsSystm2: "VE07",
      },
      context(),
    );
    expect(fit.breakdown.themeFit).toMatchObject({ matched: true, source: "STRUCTURAL" });
  });

  it("lclsSystm1=VE(전시시설 외 나머지 중분류)는 문화·역사와 무관한 신호가 없어 이름 키워드로 fallback한다(강동 워터파크 재현)", () => {
    const fit = computePoiFit(
      {
        id: "waterpark",
        name: "강동 워터파크",
        category: "ATTRACTION",
        sourceType: "API",
        operatingHours: null,
        closedDays: null,
        lclsSystm1: "VE",
        lclsSystm2: "VE02",
      },
      context(),
    );
    // VE02(테마공원)는 매핑에 없어 구조 신호가 없다고 판단하고, 기존처럼 이름 키워드로 판정한다.
    expect(fit.breakdown.themeFit).toMatchObject({ matched: false, source: "KEYWORD" });
    expect(fit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
  });

  it("구조 신호가 확인한 실제 분류(NATURE)가 선호 테마(CULTURE_HISTORY)와 다르면, 이름에 우연히 다른 키워드가 있어도 구조 신호가 우선한다", () => {
    const fit = computePoiFit(
      {
        id: "nature-with-culture-word",
        name: "OO전통정원", // 이름에 "전통"(문화·역사 키워드)이 있지만 공식 분류는 자연(NA)
        category: "ATTRACTION",
        sourceType: "API",
        operatingHours: null,
        closedDays: null,
        lclsSystm1: "NA",
        lclsSystm2: "NA04",
      },
      context(),
    );
    expect(fit.breakdown.themeFit).toMatchObject({ matched: false, source: "STRUCTURAL" });
  });

  it("웰니스 테마에서 lclsSystm2=EX05(웰니스관광)이면 온천/스파처럼 이름에 '웰니스' 단어가 없어도 구조 신호로 일치한다", () => {
    const wellness = getTemplateById("NATURE_WELLNESS");
    const fit = computePoiFit(
      {
        id: "hotspring",
        name: "OO온천랜드",
        category: "ATTRACTION",
        sourceType: "API",
        operatingHours: null,
        closedDays: null,
        lclsSystm1: "EX",
        lclsSystm2: "EX05",
      },
      { template: wellness, travelMonth: 10, preferredThemes: ["웰니스"] },
    );
    expect(fit.breakdown.themeFit).toMatchObject({ matched: true, source: "STRUCTURAL" });
  });

  it("lclsSystm1/2를 넘기지 않는(레거시 호출부·FIXTURE) 기존 방식은 그대로 이름 키워드로 판정한다(하위 호환)", () => {
    const fit = computePoiFit(
      { id: "legacy", name: "경주 문화유적 전시관", category: "ATTRACTION", sourceType: "FIXTURE", operatingHours: null, closedDays: null },
      context(),
    );
    expect(fit.breakdown.themeFit).toMatchObject({ matched: true, source: "KEYWORD" });
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

  it("입력에 없는 POI를 새로 만들어내지 않는다 — recommended+excluded 합은 항상 입력 개수와 같다", () => {
    const pois = [
      { id: "waterpark", name: "강동 워터파크", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "heritage", name: "경주 문화유적 전시관", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const { recommended, excluded } = filterRecommendablePois(pois, context());
    expect(recommended.length + excluded.length).toBe(pois.length);
    // heritage(테마 키워드 확인됨)가 이미 테마 핵심 카테고리를 채우므로 복귀 로직이 발동하지 않는다 —
    // waterpark는 그대로 제외된다(2026-07-30 워터파크 오인 방지 정책 유지).
    expect(recommended.map((p) => p.id)).toEqual(["heritage"]);
    expect(excluded.map((e) => e.poi.id)).toEqual(["waterpark"]);
  });

  it("2026-08-13: 테마 핵심 카테고리가 완전히 0개가 되면(대안 후보가 없을 때) 최소 보존을 위해 유일한 CORE 후보를 복귀시킨다", () => {
    // heritage 같은 확인된 CORE 후보가 전혀 없는 상황 — 워터파크 하나뿐이라도 아예 배제하면 전략의
    // 테마 핵심 카테고리(ATTRACTION)가 코스에서 0개가 되므로, 최소 보존을 위해 복귀시킨다.
    const pois = [
      { id: "waterpark", name: "강동 워터파크", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const { recommended, excluded } = filterRecommendablePois(pois, context());
    expect(recommended.map((p) => p.id)).toEqual(["waterpark"]);
    expect(excluded).toHaveLength(0);
  });
});

describe("computePoiFit — 미식(FOOD) 단독 테마의 비-FOOD 카테고리 예외(2026-08-13, 강릉 코스 밀도 버그 수정)", () => {
  const nightStay = getTemplateById("NIGHT_STAY_EXTENSION"); // poiCategories=["ATTRACTION","FOOD","LODGING"]
  const foodOnlyContext = (overrides: Partial<PoiFitContext> = {}): PoiFitContext => ({
    template: nightStay,
    travelMonth: 9,
    preferredThemes: ["미식"],
    ...overrides,
  });

  it("FOOD 단독 테마에서는 ATTRACTION(CORE) POI에 이름 키워드 불일치를 근거로 삼지 않는다(사천해변 재현)", () => {
    const fit = computePoiFit(
      { id: "beach", name: "사천해변(사천해수욕장)", category: "ATTRACTION", sourceType: "API", operatingHours: null, closedDays: null },
      foodOnlyContext(),
    );
    expect(fit.breakdown.categoryFit.tier).toBe("CORE");
    expect(fit.breakdown.themeFit.evaluated).toBe(false);
    expect(fit.grade).toBe("HIGH");
    expect(fit.recommendationStatus).toBe("RECOMMENDED");
  });

  it("FOOD 단독 테마에서 FOOD 카테고리 POI는 기존과 동일하게 이름 키워드로 테마를 평가한다(정책 유지)", () => {
    const fit = computePoiFit(
      { id: "food1", name: "그냥 동네 식당", category: "FOOD", sourceType: "API", operatingHours: null, closedDays: null },
      foodOnlyContext(),
    );
    expect(fit.breakdown.themeFit.evaluated).toBe(true);
    expect(fit.breakdown.themeFit.matched).toBe(false);
    // FOOD는 REQUIRED_SLOT이라 grade와 무관하게 항상 유지된다(기존 정책 그대로).
    expect(fit.recommendationStatus).toBe("REQUIRED_SLOT");
  });

  it("테마가 미식 하나만이 아니라 여러 개 섞이면(예: 미식+문화·역사) 기존 보수 정책을 그대로 유지한다(예외 미적용)", () => {
    const fit = computePoiFit(
      { id: "beach2", name: "사천해변(사천해수욕장)", category: "ATTRACTION", sourceType: "API", operatingHours: null, closedDays: null },
      foodOnlyContext({ preferredThemes: ["미식", "문화 역사"] }),
    );
    expect(fit.breakdown.themeFit.evaluated).toBe(true);
  });

  it("CULTURE_HISTORY 전략에서 EXPERIENCE(CORE) 카테고리는 여전히 기존 보수 정책이 적용된다(경주 캠핑장 회귀 없음)", () => {
    const fit = computePoiFit(
      { id: "camp", name: "경주초우오토캠핑장", category: "EXPERIENCE", sourceType: "API", operatingHours: null, closedDays: null },
      { template: cultureHistory, travelMonth: 10, preferredThemes: ["문화 역사"] },
    );
    expect(fit.breakdown.categoryFit.tier).toBe("CORE");
    expect(fit.breakdown.themeFit.evaluated).toBe(true);
    expect(fit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
  });
});

describe("filterRecommendablePois — CORE_MINIMUM_RESERVE(2026-08-13, 경주/제천 FOOD-only 코스 버그 일반 수정)", () => {
  it("확인된 CORE 후보가 하나도 없으면(경주 실제 재현) 자전거공원·컨트리클럽이 CORE_MINIMUM_RESERVE로 복귀하고, 코스에 실제로 포함된다는 사실과 배지 문구가 일치한다", () => {
    const pois = [
      { id: "bike", name: "경주시 자전거공원", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "golf", name: "보문골프클럽", category: "EXPERIENCE" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "food1", name: "화산숯불&손두부", category: "FOOD" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const { recommended, excluded } = filterRecommendablePois(pois, context());
    expect(recommended.map((p) => p.id).sort()).toEqual(["bike", "food1", "golf"]);
    expect(excluded).toHaveLength(0);
  });

  it("applyCoreMinimumReserve로 재분류된 fit은 recommendationStatus=CORE_MINIMUM_RESERVE이고, '제외되었습니다' 문구가 남지 않는다", () => {
    const pois = [
      { id: "bike", name: "경주시 자전거공원", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const evaluations = applyCoreMinimumReserve(
      pois.map((poi) => ({ poi, fit: computePoiFit(poi, context()) })),
      cultureHistory,
    );
    const fit = evaluations[0].fit;
    expect(fit.recommendationStatus).toBe("CORE_MINIMUM_RESERVE");
    expect(fit.cautions.some((c) => c.includes("제외되었습니다"))).toBe(false);
    expect(fit.cautions.some((c) => c.includes("최소한으로 포함"))).toBe(true);
  });

  it("이미 확인된 CORE 후보(heritage)가 있으면 CORE_MINIMUM_RESERVE로 재분류하지 않는다(워터파크 오인 방지 회귀 없음)", () => {
    const pois = [
      { id: "waterpark", name: "강동 워터파크", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "heritage", name: "경주 문화유적 전시관", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const evaluations = applyCoreMinimumReserve(
      pois.map((poi) => ({ poi, fit: computePoiFit(poi, context()) })),
      cultureHistory,
    );
    const waterparkFit = evaluations.find((e) => e.poi.id === "waterpark")!.fit;
    expect(waterparkFit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
  });
});

describe("applyCoreMinimumReserve — 카테고리당 최소 개수만 복구(2026-08-14, 경주 '강동 워터파크' 과다 보완 추천 수정)", () => {
  it("카테고리당 탈락 CORE 후보가 3곳 이하이면(경주 EXPERIENCE 실제 재현 규모) 전부 복구한다 — 코스가 불필요하게 얇아지지 않는다", () => {
    const pois = [
      { id: "bike", name: "경주시 자전거공원", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "resort", name: "한화리조트 경주", category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "golf", name: "보문골프클럽", category: "EXPERIENCE" as const, sourceType: "API", operatingHours: null, closedDays: null },
      { id: "country", name: "경주컨트리클럽", category: "EXPERIENCE" as const, sourceType: "API", operatingHours: null, closedDays: null },
    ];
    const evaluations = applyCoreMinimumReserve(
      pois.map((poi) => ({ poi, fit: computePoiFit(poi, context()) })),
      cultureHistory,
    );
    const reserved = evaluations.filter((e) => e.fit.recommendationStatus === "CORE_MINIMUM_RESERVE");
    // 카테고리당 후보가 3곳(cap) 이하이므로 전부 복구된다 — cap은 "지나치게 많을 때만" 개입한다.
    expect(reserved).toHaveLength(4);
    expect(reserved.map((e) => e.poi.id).sort()).toEqual(["bike", "country", "golf", "resort"].sort());
  });

  it("카테고리당 탈락 CORE 후보가 cap(3곳)을 넘으면(경주 ATTRACTION 실제 재현: 6곳) 점수 상위 3곳만 복구하고 나머지(강동 워터파크 등)는 BELOW_MINIMUM_FIT으로 남긴다", () => {
    // 실제 경주 데이터 재현 — ATTRACTION 6곳이 전부 테마 미매칭으로 탈락한 상황(2026-08-13 수정
    // 이전에는 6곳 전부 복구되어 "강동 워터파크"까지 코스에 포함됐다).
    const names = ["경주시 자전거공원", "한화리조트 경주", "강동 워터파크", "강동리조트 프라이빗콘도", "감포항", "건천편백나무숲"];
    const pois = names.map((name, i) => ({
      id: `attr${i}`,
      name,
      category: "ATTRACTION" as const,
      sourceType: "API",
      operatingHours: null,
      closedDays: null,
    }));
    const evaluations = applyCoreMinimumReserve(
      pois.map((poi) => ({ poi, fit: computePoiFit(poi, context()) })),
      cultureHistory,
    );
    const reserved = evaluations.filter((e) => e.fit.recommendationStatus === "CORE_MINIMUM_RESERVE");
    const stillExcluded = evaluations.filter((e) => e.fit.recommendationStatus === "BELOW_MINIMUM_FIT");

    expect(reserved).toHaveLength(3); // cap=3
    expect(stillExcluded).toHaveLength(3);
    // 점수가 전부 동점이므로(테마 미매칭+CORE+성수기) 원래 순서(안정 정렬) 상위 3곳이 복구된다 —
    // "강동 워터파크"는 순서상 3번째 후보라 cap을 넘겨 제외된다.
    expect(reserved.map((e) => e.poi.id)).toEqual(["attr0", "attr1", "attr2"]);
    expect(stillExcluded.map((e) => e.poi.id).sort()).toEqual(["attr3", "attr4", "attr5"]);
  });

  it("점수가 다르면(계절 일치 여부 차이) 카테고리당 점수가 높은 순으로 cap만큼만 복구한다 — 새 키워드 목록 없이 기존 fit 점수를 재사용한다", () => {
    const inSeasonCtx = context({ travelMonth: 10 }); // cultureHistory idealMonths에 10월 포함
    const offSeasonCtx = context({ travelMonth: 1 }); // 비수기 → seasonScore 0점, totalScore 더 낮음

    function make(id: string, name: string, ctx: PoiFitContext) {
      const poi = { id, name, category: "ATTRACTION" as const, sourceType: "API", operatingHours: null, closedDays: null };
      return { poi, fit: computePoiFit(poi, ctx) };
    }
    // 성수기 후보 3곳(고득점) + 비수기 후보 1곳(저득점) — cap=3이므로 저득점 후보만 제외된다.
    const evaluations = applyCoreMinimumReserve(
      [
        make("low", "낮은 점수 후보", offSeasonCtx),
        make("high1", "높은 점수 후보1", inSeasonCtx),
        make("high2", "높은 점수 후보2", inSeasonCtx),
        make("high3", "높은 점수 후보3", inSeasonCtx),
      ],
      cultureHistory,
    );
    const reserved = evaluations.filter((e) => e.fit.recommendationStatus === "CORE_MINIMUM_RESERVE");
    expect(reserved.map((e) => e.poi.id).sort()).toEqual(["high1", "high2", "high3"]);
    expect(evaluations.find((e) => e.poi.id === "low")!.fit.recommendationStatus).toBe("BELOW_MINIMUM_FIT");
  });
});
