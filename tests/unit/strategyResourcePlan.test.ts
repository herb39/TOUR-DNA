import { describe, expect, it } from "vitest";
import {
  BUDGET_AMOUNT_PLACEHOLDER,
  BUDGET_CATEGORIES,
  LEGACY_STRATEGY_FIELD_NOTICE,
  PARTNER_CATEGORIES,
  PARTIAL_MISSING_STRATEGY_FIELD_NOTICE,
  buildRoleFitRanking,
  buildStrategyBudgetItems,
  buildStrategyComparisonRows,
  buildStrategyPartners,
  classifyStrategyDifferentiationAvailability,
  describeMissingStrategyField,
  formatRoleFitRanking,
  type StrategyComparisonSourceRow,
} from "@/lib/domain/strategyResourcePlan";
import { computeRoleFit } from "@/lib/domain/audienceContext";
import { getTemplateById } from "@/lib/domain/strategyTemplates";

const COMPLETE_FIELDS = {
  coreProblem: "문제",
  coreResource: "자원",
  stayStyle: "체류",
  executionDifficulty: "LOW" as const,
  expectedEffect: "효과",
};

const NULL_FIELDS = {
  coreProblem: null,
  coreResource: null,
  stayStyle: null,
  executionDifficulty: null,
  expectedEffect: null,
};

describe("strategyResourcePlan", () => {
  describe("buildStrategyBudgetItems", () => {
    it("모든 템플릿·역할 조합에서 6개 카테고리를 중복·누락 없이 정확히 한 번씩 생성한다", () => {
      const roles = ["LOCAL_GOV", "TRAVEL_AGENCY", "FESTIVAL_PLANNER", undefined] as const;
      const templateIds = [
        "LOCAL_FOOD_MARKET",
        "NIGHT_STAY_EXTENSION",
        "NATURE_WELLNESS",
        "CULTURE_HISTORY",
        "FESTIVAL_EVENT",
        "FAMILY_EXPERIENCE",
        "YOUTH_LOCAL_CONTENT",
      ];
      for (const templateId of templateIds) {
        for (const role of roles) {
          const items = buildStrategyBudgetItems(templateId, role);
          expect(items.map((i) => i.category)).toEqual([...BUDGET_CATEGORIES]);
          for (const item of items) {
            expect(item.amount).toBe(BUDGET_AMOUNT_PLACEHOLDER);
            expect(item.description.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it("금액을 절대 지어내지 않고 항상 '기관 산정 필요'로 표시한다", () => {
      const items = buildStrategyBudgetItems("FESTIVAL_EVENT", "LOCAL_GOV");
      expect(items.every((i) => i.amount === "기관 산정 필요")).toBe(true);
    });

    it("역할에 따라 인력·홍보 항목 설명이 달라진다", () => {
      const govItems = buildStrategyBudgetItems("LOCAL_FOOD_MARKET", "LOCAL_GOV");
      const agencyItems = buildStrategyBudgetItems("LOCAL_FOOD_MARKET", "TRAVEL_AGENCY");
      const festivalItems = buildStrategyBudgetItems("LOCAL_FOOD_MARKET", "FESTIVAL_PLANNER");

      const staffOf = (items: ReturnType<typeof buildStrategyBudgetItems>) =>
        items.find((i) => i.category === "인력")!.description;
      const promoOf = (items: ReturnType<typeof buildStrategyBudgetItems>) =>
        items.find((i) => i.category === "홍보")!.description;

      expect(new Set([staffOf(govItems), staffOf(agencyItems), staffOf(festivalItems)]).size).toBe(3);
      expect(new Set([promoOf(govItems), promoOf(agencyItems), promoOf(festivalItems)]).size).toBe(3);
    });

    it("실행 난이도가 HIGH인 전략은 인력 항목에 여유분 확보 안내가 추가된다", () => {
      const highDifficulty = getTemplateById("FESTIVAL_EVENT");
      expect(highDifficulty.executionDifficulty).toBe("HIGH");
      const items = buildStrategyBudgetItems("FESTIVAL_EVENT", "LOCAL_GOV");
      expect(items.find((i) => i.category === "인력")!.description).toContain("인력 여유분 추가 확보 필요");
    });

    it("전략 유형에 따라 장소·시설 항목 설명이 달라진다(축제형 vs 미식·시장형)", () => {
      const festivalItems = buildStrategyBudgetItems("FESTIVAL_EVENT", undefined);
      const marketItems = buildStrategyBudgetItems("LOCAL_FOOD_MARKET", undefined);
      expect(festivalItems.find((i) => i.category === "장소·시설")!.description).not.toBe(
        marketItems.find((i) => i.category === "장소·시설")!.description,
      );
    });
  });

  describe("buildStrategyPartners", () => {
    it("모든 템플릿·역할 조합에서 6개 협력 대상 카테고리를 중복·누락 없이 정확히 한 번씩 생성한다", () => {
      const roles = ["LOCAL_GOV", "TRAVEL_AGENCY", "FESTIVAL_PLANNER", undefined] as const;
      const templateIds = ["LOCAL_FOOD_MARKET", "FESTIVAL_EVENT", "CULTURE_HISTORY", "CULTURE_ARTS", "NATURE_WELLNESS"];
      for (const templateId of templateIds) {
        for (const role of roles) {
          const partners = buildStrategyPartners(templateId, role);
          expect(partners.map((p) => p.category)).toEqual([...PARTNER_CATEGORIES]);
          for (const partner of partners) {
            expect(partner.name.length).toBeGreaterThan(0);
            expect(partner.reason.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it("숙박이 필요한 전략은 숙박업체를, 당일형 전략은 교통업체를 협력 대상으로 연결한다", () => {
      const overnight = buildStrategyPartners("NIGHT_STAY_EXTENSION", undefined);
      const dayTrip = buildStrategyPartners("LOCAL_FOOD_MARKET", undefined);
      expect(overnight.find((p) => p.category === "숙박·교통 업체")!.name).toBe("숙박업체");
      expect(dayTrip.find((p) => p.category === "숙박·교통 업체")!.name).toBe("교통업체");
    });

    it("축제·문화 전용 템플릿만 실제 문화·축제 기관을 연결하고 나머지는 해당 없음으로 표시한다", () => {
      const festival = buildStrategyPartners("FESTIVAL_EVENT", undefined);
      const culture = buildStrategyPartners("CULTURE_HISTORY", undefined);
      const arts = buildStrategyPartners("CULTURE_ARTS", undefined);
      const nature = buildStrategyPartners("NATURE_WELLNESS", undefined);
      expect(festival.find((p) => p.category === "문화·축제 기관")!.name).toBe("축제 운영위원회");
      expect(culture.find((p) => p.category === "문화·축제 기관")!.name).toBe("지역 문화원·문화재 관리기관");
      expect(arts.find((p) => p.category === "문화·축제 기관")!.name).toBe("미술관·공연장·문화예술기관");
      expect(nature.find((p) => p.category === "문화·축제 기관")!.name).toBe("해당 없음");
    });

    it("미식·시장형처럼 소비 접점이 강한 전략은 지역 상인회를 명시적으로 연결한다", () => {
      const market = buildStrategyPartners("LOCAL_FOOD_MARKET", undefined);
      expect(market.find((p) => p.category === "지역 상인·사업자")!.name).toBe("전통시장 상인회·로컬 매장");
    });
  });

  describe("buildRoleFitRanking", () => {
    it("computeRoleFit과 동일한 점수로 3개 역할을 내림차순 정렬해 반환한다", () => {
      const ranking = buildRoleFitRanking("FESTIVAL_EVENT");
      expect(ranking).toHaveLength(3);
      const template = getTemplateById("FESTIVAL_EVENT");
      for (const entry of ranking) {
        expect(entry.score).toBe(computeRoleFit(template, entry.role).score);
      }
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score);
      }
    });

    it("전략마다 역할 적합도 순위가 다르게 나온다(축제형은 지자체/축제 기획자가 여행사보다 우위)", () => {
      const ranking = buildRoleFitRanking("FESTIVAL_EVENT");
      const agencyEntry = ranking.find((r) => r.role === "TRAVEL_AGENCY")!;
      const topEntry = ranking[0];
      expect(topEntry.role).not.toBe("TRAVEL_AGENCY");
      expect(topEntry.score).toBeGreaterThan(agencyEntry.score);
    });
  });

  // 2026-08-04: 전략 3안 비교표가 실제로는 값이 있는 최신 분석 결과에도 "재분석 필요"를 잘못 붙이는
  // 것처럼 보인 원인 조사 결과, 실제 원인은 코드 버그가 아니라 2026-07-31 마이그레이션 이전 레거시
  // 분석 결과(coreProblem 등 5개 필드가 DB에 실제로 null)였다. 아래 테스트는 그 판정 로직 자체를
  // 검증한다 — 5개 전부 null이면 레거시, 전부 값이 있으면 정상, 일부만 null이면(정상 경로에서는
  // 나올 수 없는 이상 상태) 일반 "재분석 필요"로 남긴다.
  describe("classifyStrategyDifferentiationAvailability", () => {
    it("5개 필드가 모두 값이 있으면 COMPLETE로 판정한다", () => {
      expect(classifyStrategyDifferentiationAvailability(COMPLETE_FIELDS)).toBe("COMPLETE");
    });

    it("5개 필드가 모두 null이면 LEGACY로 판정한다(2026-07-31 마이그레이션 이전 분석)", () => {
      expect(classifyStrategyDifferentiationAvailability(NULL_FIELDS)).toBe("LEGACY");
    });

    it("일부 필드만 null이면(정상 경로에서 나올 수 없는 이상 상태) PARTIAL_MISSING으로 판정한다", () => {
      expect(
        classifyStrategyDifferentiationAvailability({ ...COMPLETE_FIELDS, coreProblem: null }),
      ).toBe("PARTIAL_MISSING");
    });
  });

  describe("describeMissingStrategyField", () => {
    it("LEGACY면 '이전 분석 결과' 안내를, 그 외에는 일반 '재분석 필요' 안내를 반환한다", () => {
      expect(describeMissingStrategyField("LEGACY")).toBe(LEGACY_STRATEGY_FIELD_NOTICE);
      expect(describeMissingStrategyField("PARTIAL_MISSING")).toBe(PARTIAL_MISSING_STRATEGY_FIELD_NOTICE);
    });
  });

  describe("buildStrategyComparisonRows", () => {
    function sourceRow(overrides: Partial<StrategyComparisonSourceRow> = {}): StrategyComparisonSourceRow {
      return {
        id: "s1",
        rank: 1,
        name: "문화·역사 체험형",
        totalScore: 80,
        templateId: "CULTURE_HISTORY",
        risks: ["위험1"],
        ...COMPLETE_FIELDS,
        ...overrides,
      };
    }

    it("최신 분석 결과(5개 필드 모두 존재)는 dataAvailability가 COMPLETE이고 값을 그대로 보존한다", () => {
      const [row] = buildStrategyComparisonRows([sourceRow()]);
      expect(row.dataAvailability).toBe("COMPLETE");
      expect(row.coreProblem).toBe(COMPLETE_FIELDS.coreProblem);
      expect(row.roleFitRanking).toHaveLength(3);
    });

    it("레거시 분석 결과(5개 필드 모두 null)는 dataAvailability가 LEGACY이고 필드는 null로 남는다(허위 기본값 채우지 않음)", () => {
      const [row] = buildStrategyComparisonRows([sourceRow(NULL_FIELDS)]);
      expect(row.dataAvailability).toBe("LEGACY");
      expect(row.coreProblem).toBeNull();
      expect(row.coreResource).toBeNull();
      expect(row.stayStyle).toBeNull();
      expect(row.executionDifficulty).toBeNull();
      expect(row.expectedEffect).toBeNull();
    });

    it("전략마다 레거시 여부가 다르면 서로 다른 dataAvailability를 독립적으로 반환한다(표 전체를 덮지 않음)", () => {
      const rows = buildStrategyComparisonRows([
        sourceRow({ id: "legacy", ...NULL_FIELDS }),
        sourceRow({ id: "fresh" }),
      ]);
      expect(rows.find((r) => r.id === "legacy")!.dataAvailability).toBe("LEGACY");
      expect(rows.find((r) => r.id === "fresh")!.dataAvailability).toBe("COMPLETE");
    });

    it("templateId를 기반으로 roleFitRanking을 computeRoleFit과 동일하게 계산한다", () => {
      const [row] = buildStrategyComparisonRows([sourceRow({ templateId: "FESTIVAL_EVENT" })]);
      expect(row.roleFitRanking).toEqual(buildRoleFitRanking("FESTIVAL_EVENT"));
    });
  });

  describe("formatRoleFitRanking", () => {
    it("역할명(점수) 형식을 '>' 로 이어붙인다", () => {
      const ranking = buildRoleFitRanking("CULTURE_HISTORY");
      const formatted = formatRoleFitRanking(ranking);
      expect(formatted).toBe(ranking.map((r) => `${r.roleLabel}(${r.score}점)`).join(" > "));
    });
  });
});
