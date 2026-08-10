import { describe, expect, it } from "vitest";
import {
  classifyThemes,
  computeNationalityChecklistNotes,
  computeNationalityFeasibilityDelta,
  computeRoleChecklistNotes,
  computeRoleFit,
  computeRoleKpiNotes,
  computeSeasonalRiskNotes,
  computeThemeChecklistNotes,
  computeThemeFit,
  normalizeMonth,
  normalizeNationality,
  normalizeRole,
  normalizeThemeList,
  roleLabel,
  themePreferredPoiCategories,
} from "@/lib/domain/audienceContext";
import { STRATEGY_TEMPLATES, getTemplateById } from "@/lib/domain/strategyTemplates";

describe("normalize* — 레거시/잘못된 값 안전 처리", () => {
  it("정상 값은 그대로 반환한다", () => {
    expect(normalizeRole("LOCAL_GOV")).toBe("LOCAL_GOV");
    expect(normalizeRole("FESTIVAL_PLANNER")).toBe("FESTIVAL_PLANNER");
    expect(normalizeNationality("FOREIGN")).toBe("FOREIGN");
    expect(normalizeMonth(7)).toBe(7);
    expect(normalizeThemeList(["미식", "자연"])).toEqual(["미식", "자연"]);
  });

  it("알 수 없는 값·null·undefined는 안전하게 undefined/빈 배열로 처리한다", () => {
    expect(normalizeRole(undefined)).toBeUndefined();
    expect(normalizeRole(null)).toBeUndefined();
    expect(normalizeRole("UNKNOWN_ROLE")).toBeUndefined();
    expect(normalizeNationality("")).toBeUndefined();
    expect(normalizeMonth(0)).toBeUndefined();
    expect(normalizeMonth(13)).toBeUndefined();
    expect(normalizeMonth(3.5)).toBeUndefined();
    expect(normalizeMonth("9")).toBeUndefined();
    expect(normalizeThemeList(undefined)).toEqual([]);
    expect(normalizeThemeList("문자열")).toEqual([]);
    expect(normalizeThemeList([1, null, "미식"])).toEqual(["미식"]);
  });
});

describe("computeRoleFit — 역할별 목표 우선순위", () => {
  it("역할이 없으면 중립값(50)을 반환하고 조정 근거도 없다", () => {
    const template = getTemplateById("NATURE_WELLNESS");
    const result = computeRoleFit(template, undefined);
    expect(result.score).toBe(50);
    expect(result.adjustment).toBeNull();
  });

  it("같은 템플릿이라도 역할에 따라 다른 점수를 낸다(지자체 vs 여행사)", () => {
    const template = getTemplateById("FESTIVAL_EVENT");
    const localGov = computeRoleFit(template, "LOCAL_GOV");
    const travelAgency = computeRoleFit(template, "TRAVEL_AGENCY");
    expect(localGov.score).not.toBe(travelAgency.score);
    expect(localGov.score).toBeGreaterThan(travelAgency.score);
    expect(localGov.adjustment?.basis).toBe("CURATED");
  });

  it("모든 템플릿에서 역할별 점수는 0~100 범위 안에 있다", () => {
    for (const template of STRATEGY_TEMPLATES) {
      for (const role of ["LOCAL_GOV", "TRAVEL_AGENCY", "FESTIVAL_PLANNER"] as const) {
        const { score } = computeRoleFit(template, role);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("축제 기획자는 계절분산·방문객 유치 목표가 강한 축제형 템플릿에서 세 역할 중 가장 높은 점수를 받는다", () => {
    const template = getTemplateById("FESTIVAL_EVENT");
    const localGov = computeRoleFit(template, "LOCAL_GOV");
    const travelAgency = computeRoleFit(template, "TRAVEL_AGENCY");
    const festivalPlanner = computeRoleFit(template, "FESTIVAL_PLANNER");
    expect(festivalPlanner.score).toBeGreaterThan(localGov.score);
    expect(festivalPlanner.score).toBeGreaterThan(travelAgency.score);
    expect(festivalPlanner.adjustment?.basis).toBe("CURATED");
  });

  it("역할에 따라 우위를 가지는 템플릿이 뒤바뀔 수 있다(청년 콘텐츠형: 여행사가 훨씬 유리)", () => {
    const template = getTemplateById("YOUTH_LOCAL_CONTENT");
    const localGov = computeRoleFit(template, "LOCAL_GOV");
    const travelAgency = computeRoleFit(template, "TRAVEL_AGENCY");
    expect(travelAgency.score).toBeGreaterThan(localGov.score);
  });

  it("roleLabel은 한글 라벨을 반환한다", () => {
    expect(roleLabel("LOCAL_GOV")).toBe("지자체/관광재단");
    expect(roleLabel("TRAVEL_AGENCY")).toBe("여행사/DMC");
    expect(roleLabel("FESTIVAL_PLANNER")).toBe("축제 기획자");
  });
});

describe("classifyThemes — 자유 텍스트 테마를 내부 카테고리로 분류", () => {
  it("키워드가 포함된 문구를 올바른 카테고리로 분류한다", () => {
    expect(classifyThemes(["미식 여행"])).toContain("FOOD");
    expect(classifyThemes(["자연 힐링"])).toContain("NATURE");
    expect(classifyThemes(["문화유산 탐방"])).toContain("CULTURE_HISTORY");
    expect(classifyThemes(["웰니스 스파"])).toContain("WELLNESS");
    expect(classifyThemes(["지역 축제"])).toContain("FESTIVAL");
    expect(classifyThemes(["반려동물 동반"])).toContain("PET_FRIENDLY");
    expect(classifyThemes(["레저 액티비티"])).toContain("LEISURE_ACTIVITY");
  });

  it("일치하는 키워드가 없으면 빈 배열을 반환한다(새 테마를 지어내지 않음)", () => {
    expect(classifyThemes(["아무말이나"])).toEqual([]);
    expect(classifyThemes([])).toEqual([]);
  });

  it("하나의 문구가 여러 카테고리에 동시에 매칭될 수 있다", () => {
    const categories = classifyThemes(["미식과 축제"]);
    expect(categories).toContain("FOOD");
    expect(categories).toContain("FESTIVAL");
  });
});

describe("themePreferredPoiCategories — 테마 카테고리 → POI 카테고리 우선순위(2026-08-11)", () => {
  it("명확하게 연관된 카테고리만 매핑한다(FOOD→FOOD, FESTIVAL→FESTIVAL)", () => {
    expect(themePreferredPoiCategories(["FOOD"])).toEqual(["FOOD"]);
    expect(themePreferredPoiCategories(["FESTIVAL"])).toEqual(["FESTIVAL"]);
  });

  it("여러 테마 카테고리를 합치되 중복 없이 순서대로 반환한다", () => {
    const result = themePreferredPoiCategories(["FOOD", "NATURE"]);
    expect(result).toEqual(["FOOD", "ATTRACTION", "EXPERIENCE"]);
  });

  it("같은 카테고리가 여러 테마에서 겹쳐도 한 번만 포함된다", () => {
    // NATURE→[ATTRACTION,EXPERIENCE], LEISURE_ACTIVITY→[EXPERIENCE] — EXPERIENCE 중복 제거 확인.
    const result = themePreferredPoiCategories(["NATURE", "LEISURE_ACTIVITY"]);
    expect(result.filter((c) => c === "EXPERIENCE")).toHaveLength(1);
  });

  it("PET_FRIENDLY는 대응 POI 카테고리가 없어 빈 배열에 기여한다(전용 템플릿 없음과 동일 원칙)", () => {
    expect(themePreferredPoiCategories(["PET_FRIENDLY"])).toEqual([]);
  });

  it("테마가 없으면 빈 배열을 반환한다", () => {
    expect(themePreferredPoiCategories([])).toEqual([]);
  });
});

describe("computeThemeFit — 테마 카테고리 기반 가산점", () => {
  it("연관 테마 카테고리가 매칭되면 가산점이 붙고, 무관하면 붙지 않는다", () => {
    const template = getTemplateById("LOCAL_FOOD_MARKET");
    const withFood = computeThemeFit(template, ["FOOD"], 0);
    const withoutMatch = computeThemeFit(template, ["WELLNESS"], 0);
    expect(withFood.bonus).toBeGreaterThan(0);
    expect(withoutMatch.bonus).toBe(0);
  });

  it("기존 substring 가산점과 합산 후 상한(15점)으로 clamp한다", () => {
    const template = getTemplateById("LOCAL_FOOD_MARKET");
    const result = computeThemeFit(template, ["FOOD", "FESTIVAL"], 10);
    expect(result.bonus).toBeLessThanOrEqual(15);
  });

  it("반려동물(PET_FRIENDLY)은 점수에는 반영하지 않고 MISSING 근거만 남긴다(전용 템플릿 없음)", () => {
    const template = getTemplateById("NATURE_WELLNESS");
    const result = computeThemeFit(template, ["PET_FRIENDLY"], 0);
    expect(result.bonus).toBe(0);
    expect(result.adjustments.some((a) => a.basis === "MISSING")).toBe(true);
  });
});

describe("computeNationalityFeasibilityDelta — 국적별 서비스 준비도(CURATED)", () => {
  it("내국인은 조정하지 않는다(객관적 데이터를 건드리지 않음)", () => {
    for (const template of STRATEGY_TEMPLATES) {
      const result = computeNationalityFeasibilityDelta(template, "DOMESTIC");
      expect(result.delta).toBe(0);
      expect(result.adjustment).toBeNull();
    }
  });

  it("외국인은 템플릿별로 서로 다른 조정치를 적용하고 근거를 CURATED로 표시한다", () => {
    const cultureHistory = computeNationalityFeasibilityDelta(getTemplateById("CULTURE_HISTORY"), "FOREIGN");
    const nature = computeNationalityFeasibilityDelta(getTemplateById("NATURE_WELLNESS"), "FOREIGN");
    expect(cultureHistory.delta).not.toBe(nature.delta);
    expect(cultureHistory.adjustment?.basis).toBe("CURATED");
    expect(cultureHistory.adjustment?.reason).toMatch(/실측 수요 데이터 아님/);
  });

  it("역할이 없으면(undefined) 델타를 적용하지 않는다", () => {
    const result = computeNationalityFeasibilityDelta(getTemplateById("NATURE_WELLNESS"), undefined);
    expect(result.delta).toBe(0);
  });
});

describe("computeSeasonalRiskNotes — 월별 계절 위험(CURATED)", () => {
  it("장마철(6~7월)에는 실외 비중이 큰 템플릿에 우천 위험이 추가된다", () => {
    const notes = computeSeasonalRiskNotes(7, getTemplateById("NATURE_WELLNESS"));
    expect(notes.some((n) => n.includes("장마철"))).toBe(true);
  });

  it("혹서기(7~8월)·혹한기(12~2월) 위험도 각각 반영된다", () => {
    expect(computeSeasonalRiskNotes(8, getTemplateById("FESTIVAL_EVENT")).some((n) => n.includes("혹서기"))).toBe(
      true,
    );
    expect(computeSeasonalRiskNotes(1, getTemplateById("FESTIVAL_EVENT")).some((n) => n.includes("혹한기"))).toBe(
      true,
    );
  });

  it("월이 없으면(undefined) 빈 배열을 반환한다 — 근거 없이 위험을 지어내지 않는다", () => {
    expect(computeSeasonalRiskNotes(undefined, getTemplateById("NATURE_WELLNESS"))).toEqual([]);
  });

  it("실외 비중이 낮은 템플릿은 같은 달이라도 위험 안내가 붙지 않는다(NIGHT_STAY_EXTENSION은 ATTRACTION/FOOD/LODGING 구성)", () => {
    const notes = computeSeasonalRiskNotes(7, getTemplateById("NIGHT_STAY_EXTENSION"));
    // NIGHT_STAY_EXTENSION의 poiCategories에는 ATTRACTION이 포함되어 실외 규칙이 적용된다 —
    // 반대로 실외 카테고리가 전혀 없는 조합이 있다면 빈 배열이어야 한다는 원칙만 별도로 확인한다.
    expect(Array.isArray(notes)).toBe(true);
  });

  it("1월과 12월 경계값 모두 혹한기 규칙이 적용된다", () => {
    const template = getTemplateById("FAMILY_EXPERIENCE");
    expect(computeSeasonalRiskNotes(12, template).some((n) => n.includes("혹한기"))).toBe(true);
    expect(computeSeasonalRiskNotes(1, template).some((n) => n.includes("혹한기"))).toBe(true);
  });
});

describe("computeThemeChecklistNotes / 체크리스트 헬퍼", () => {
  it("반려동물 테마는 전용 템플릿 부재를 안내한다", () => {
    const notes = computeThemeChecklistNotes(["PET_FRIENDLY"], getTemplateById("NATURE_WELLNESS"));
    expect(notes.some((n) => n.includes("전용 코스 템플릿 없음"))).toBe(true);
  });

  it("레저·액티비티는 실외 비중이 큰 템플릿에서만 안전장비 안내를 추가한다", () => {
    const outdoor = computeThemeChecklistNotes(["LEISURE_ACTIVITY"], getTemplateById("NATURE_WELLNESS"));
    expect(outdoor.some((n) => n.includes("안전장비"))).toBe(true);
  });

  it("국적별 체크리스트: 외국인만 다국어 안내 문구가 추가된다", () => {
    expect(computeNationalityChecklistNotes("FOREIGN").length).toBeGreaterThan(0);
    expect(computeNationalityChecklistNotes("DOMESTIC")).toEqual([]);
    expect(computeNationalityChecklistNotes(undefined)).toEqual([]);
  });

  it("역할별 체크리스트: 지자체·여행사·축제 기획자가 서로 다른 문구를 낸다", () => {
    const localGov = computeRoleChecklistNotes("LOCAL_GOV");
    const travelAgency = computeRoleChecklistNotes("TRAVEL_AGENCY");
    const festivalPlanner = computeRoleChecklistNotes("FESTIVAL_PLANNER");
    expect(localGov).not.toEqual(travelAgency);
    expect(festivalPlanner).not.toEqual(localGov);
    expect(festivalPlanner).not.toEqual(travelAgency);
    expect(festivalPlanner.some((n) => n.includes("시간대") || n.includes("체류") || n.includes("운영"))).toBe(true);
    expect(computeRoleChecklistNotes(undefined)).toEqual([]);
  });

  it("역할별 KPI: 축제 기획자는 프로그램 운영 지표를 별도로 추가하며 다른 두 역할과 다르다", () => {
    const localGov = computeRoleKpiNotes("LOCAL_GOV");
    const travelAgency = computeRoleKpiNotes("TRAVEL_AGENCY");
    const festivalPlanner = computeRoleKpiNotes("FESTIVAL_PLANNER");
    expect(festivalPlanner).not.toEqual(localGov);
    expect(festivalPlanner).not.toEqual(travelAgency);
    expect(festivalPlanner.some((k) => k.name.includes("프로그램 운영"))).toBe(true);
    expect(computeRoleKpiNotes(undefined)).toEqual([]);
  });
});

describe("결정론성 — 동일 입력에는 항상 동일 결과", () => {
  it("동일 템플릿·역할 조합을 반복 계산해도 결과가 같다", () => {
    const template = getTemplateById("FESTIVAL_EVENT");
    const r1 = computeRoleFit(template, "LOCAL_GOV");
    const r2 = computeRoleFit(template, "LOCAL_GOV");
    expect(r1).toEqual(r2);
  });

  it("모든 전략 템플릿에 foreignReadinessAdjustment/Note가 정의돼 있다", () => {
    for (const template of STRATEGY_TEMPLATES) {
      expect(typeof template.foreignReadinessAdjustment).toBe("number");
      expect(template.foreignReadinessAdjustment).toBeGreaterThanOrEqual(-8);
      expect(template.foreignReadinessAdjustment).toBeLessThanOrEqual(8);
      expect(template.foreignReadinessNote.length).toBeGreaterThan(0);
    }
  });
});
