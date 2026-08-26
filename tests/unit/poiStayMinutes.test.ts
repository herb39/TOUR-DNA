import { describe, expect, it } from "vitest";
import { recommendedPoiStayMinutes } from "@/lib/domain/poiStayMinutes";

describe("recommendedPoiStayMinutes", () => {
  it("카테고리와 확인된 세부 신호를 설명 가능한 기본값으로 매핑한다", () => {
    expect(recommendedPoiStayMinutes({ category: "FOOD", foodSubcategory: "MEAL" })).toBe(60);
    expect(recommendedPoiStayMinutes({ category: "FOOD", foodSubcategory: "CAFE" })).toBe(45);
    expect(recommendedPoiStayMinutes({ category: "ATTRACTION" })).toBe(90);
    expect(recommendedPoiStayMinutes({ category: "ATTRACTION", lclsSystm2: "VE07" })).toBe(120);
    expect(recommendedPoiStayMinutes({ category: "EXPERIENCE" })).toBe(120);
    expect(recommendedPoiStayMinutes({ category: "EXPERIENCE", lclsSystm1: "LS", lclsSystm2: "LS02" })).toBe(180);
    expect(recommendedPoiStayMinutes({ category: "SHOPPING" })).toBe(60);
    expect(recommendedPoiStayMinutes({ category: "FESTIVAL" })).toBe(120);
  });

  it("숙박과 알 수 없는 유형은 별도 보호값·fallback을 사용한다", () => {
    expect(recommendedPoiStayMinutes({ category: "LODGING" })).toBe(0);
    expect(recommendedPoiStayMinutes({ category: "UNKNOWN" })).toBe(60);
    expect(recommendedPoiStayMinutes({})).toBe(60);
  });

  it("같은 메타데이터에는 항상 같은 값을 반환한다", () => {
    const input = { category: "ATTRACTION", lclsSystm2: "VE07" } as const;
    expect(recommendedPoiStayMinutes(input)).toBe(recommendedPoiStayMinutes(input));
  });
});
