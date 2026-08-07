import { describe, expect, it } from "vitest";
import { buildPromoContent, type BuildPromoContentInput } from "@/lib/domain/promoContent";
import {
  buildPromoCardNewsViewModel,
  buildPromoPosterViewModel,
  truncateAtBoundary,
  type PromoProjectSummary,
} from "@/lib/domain/promoPreview";

/** 포스터/카드뉴스 미리보기 view model(Phase 1, 2026-08-07) — 이미 저장된 PromoContent를 재조합만
 * 하는지, 없는 값을 지어내지 않는지, 긴 문구를 의미 있는 경계에서 자르는지를 검증한다. */

const BASE_PROJECT: PromoProjectSummary = {
  regionName: "강릉시",
  travelYear: 2026,
  travelMonth: 9,
  strategyName: "로컬미식·시장 연계형",
};

function baseInput(overrides: Partial<BuildPromoContentInput> = {}): BuildPromoContentInput {
  return {
    project: { role: "TRAVEL_AGENCY", regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "콘셉트",
      background: "배경",
      targetSummary: "미식에 관심이 높은 소규모 동행 여행객",
      sellingPoints: ["포인트1", "포인트2", "포인트3"],
      course: [
        {
          dayIndex: 1,
          items: [
            { order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "09:00", stayMinutes: 60, travel: "이동" },
            { order: 2, poiId: "p2", poiName: "중앙시장", category: "FOOD", timeSlot: "12:00", stayMinutes: 60, travel: "이동" },
            { order: 3, poiId: "p3", poiName: "경포호수", category: "ATTRACTION", timeSlot: "15:00", stayMinutes: 60, travel: "이동" },
          ],
          lodging: null,
        },
      ],
      kpis: [{ name: "kpi", method: "method" }],
      operationChecklist: ["체크1"],
      risks: [{ risk: "위험1", mitigation: "대응1" }],
    },
    evidences: [],
    ...overrides,
  };
}

describe("truncateAtBoundary", () => {
  it("최대 길이 이하면 그대로 반환한다", () => {
    expect(truncateAtBoundary("짧은 문장", 40)).toBe("짧은 문장");
  });

  it("최대 길이를 넘으면 마지막 공백/구두점 경계에서 자르고 말줄임표를 붙인다", () => {
    const text = "강릉시 로컬미식·시장 연계형 여행 코스입니다 자세히 보기";
    const result = truncateAtBoundary(text, 15);
    expect(result.length).toBeLessThanOrEqual(16);
    expect(result.endsWith("…")).toBe(true);
    expect(text.startsWith(result.slice(0, -1).trim())).toBe(true);
  });

  it("경계를 찾지 못하면 문자 수 기준으로만 자른다", () => {
    const text = "가".repeat(50);
    const result = truncateAtBoundary(text, 10);
    expect(result).toBe(`${"가".repeat(10)}…`);
  });
});

describe("buildPromoPosterViewModel", () => {
  it("기존 promoContent 필드만 재조합하고 새 문구를 만들지 않는다", () => {
    const content = buildPromoContent(baseInput());
    const poster = buildPromoPosterViewModel(content, BASE_PROJECT);

    expect(poster.regionName).toBe(BASE_PROJECT.regionName);
    expect(poster.strategyName).toBe(BASE_PROJECT.strategyName);
    expect(poster.travelPeriodLabel).toBe("2026년 9월");
    expect(content.landing.title.startsWith(poster.headline.replace(/…$/, ""))).toBe(true);
    expect(content.instagram.caption.startsWith(poster.tagline.replace(/…$/, ""))).toBe(true);
  });

  it("대표 코스는 최대 3곳까지, course의 기존 순서를 유지한다", () => {
    const content = buildPromoContent(baseInput());
    const poster = buildPromoPosterViewModel(content, BASE_PROJECT);
    expect(poster.courseItems).toHaveLength(3);
    expect(poster.courseItems.map((c) => c.name)).toEqual(["경포대", "중앙시장", "경포호수"]);
    expect(poster.courseItems.map((c) => c.order)).toEqual([1, 2, 3]);
  });

  it("course가 비어 있으면 대표 코스 없이도 깨지지 않는다", () => {
    const content = buildPromoContent(baseInput({ plan: { ...baseInput().plan, course: [] } }));
    const poster = buildPromoPosterViewModel(content, BASE_PROJECT);
    expect(poster.courseItems).toEqual([]);
  });

  it("역할별 roleLabel과 closingNote가 roleContent 값을 그대로 재사용한다(TRAVEL_AGENCY)", () => {
    const content = buildPromoContent(baseInput());
    const poster = buildPromoPosterViewModel(content, BASE_PROJECT);
    expect(poster.roleLabel).toBe("여행사/DMC");
    expect(content.roleContent.role).toBe("TRAVEL_AGENCY");
    if (content.roleContent.role === "TRAVEL_AGENCY") {
      expect(poster.closingNote.replace(/…$/, "")).toContain(content.roleContent.itineraryHighlight.slice(0, 10));
    }
  });

  it("역할별 roleLabel이 LOCAL_GOV/FESTIVAL_PLANNER에서도 올바르다", () => {
    const localGovContent = buildPromoContent(baseInput({ project: { ...baseInput().project, role: "LOCAL_GOV" } }));
    const festivalContent = buildPromoContent(baseInput({ project: { ...baseInput().project, role: "FESTIVAL_PLANNER" } }));
    expect(buildPromoPosterViewModel(localGovContent, BASE_PROJECT).roleLabel).toBe("지자체/관광재단");
    expect(buildPromoPosterViewModel(festivalContent, BASE_PROJECT).roleLabel).toBe("축제 기획자");
  });

  it("긴 지역명·전략명이 들어와도 headline/tagline이 최대 길이를 넘지 않는다", () => {
    const longProject: PromoProjectSummary = {
      regionName: "아주아주아주아주아주아주아주긴지역이름특별자치시광역시",
      travelYear: 2026,
      travelMonth: 12,
      strategyName: "매우매우매우매우매우매우매우긴전략이름로컬미식시장연계형프로그램",
    };
    const content = buildPromoContent(
      baseInput({ project: { ...baseInput().project, regionName: longProject.regionName } , strategy: { name: longProject.strategyName } }),
    );
    const poster = buildPromoPosterViewModel(content, longProject);
    expect(poster.headline.length).toBeLessThanOrEqual(41);
    expect(poster.tagline.length).toBeLessThanOrEqual(61);
  });
});

describe("buildPromoCardNewsViewModel", () => {
  it("저장된 cardNews.slides 개수·순서를 그대로 따른다(새 슬라이드를 추가하지 않는다)", () => {
    const content = buildPromoContent(baseInput());
    const slides = buildPromoCardNewsViewModel(content);
    expect(slides).toHaveLength(content.cardNews.slides.length);
    expect(slides.map((s) => s.index)).toEqual(content.cardNews.slides.map((_, i) => i + 1));
  });

  it("첫 슬라이드는 cover, 마지막은 closing, 중간은 course로 분류한다", () => {
    const content = buildPromoContent(baseInput());
    const slides = buildPromoCardNewsViewModel(content);
    expect(slides[0].kind).toBe("cover");
    expect(slides[slides.length - 1].kind).toBe("closing");
    for (const s of slides.slice(1, -1)) expect(s.kind).toBe("course");
  });

  it("슬라이드가 2개뿐이어도(course 없음) cover/closing만으로 깨지지 않는다", () => {
    const content = buildPromoContent(baseInput({ plan: { ...baseInput().plan, course: [] } }));
    const slides = buildPromoCardNewsViewModel(content);
    expect(slides.length).toBeGreaterThanOrEqual(1);
    expect(slides[0].kind).toBe("cover");
  });

  it("본문이 길면 미리보기용으로만 잘리고 원본 title/body 내용을 기반으로 한다", () => {
    const content = buildPromoContent(baseInput());
    const slides = buildPromoCardNewsViewModel(content);
    for (const s of slides) {
      const original = content.cardNews.slides[s.index - 1];
      expect(original.body.startsWith(s.body.replace(/…$/, ""))).toBe(true);
    }
  });
});
