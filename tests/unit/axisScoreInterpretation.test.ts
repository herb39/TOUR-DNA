import { describe, expect, it } from "vitest";
import { interpretAxisExtreme } from "@/lib/domain/axisScoreInterpretation";

describe("interpretAxisExtreme — 0점/100점의 확정/근접 여부 판별", () => {
  it("정규화값이 정확히 0이면(확정 최저) '비교지역 내 최저'를 반환한다", () => {
    const r = interpretAxisExtreme("demand", 0, [0]);
    expect(r.level).toBe("CONFIRMED_LOWEST");
    expect(r.badgeLabel).toBe("비교지역 내 최저");
    expect(r.helperText).toContain("실제 값이 0이라는 뜻이 아니라");
  });

  it("화천군 실제 사례 — 정규화값이 0.03(반올림으로만 0)이면 확정 최저가 아니라 '매우 낮음'이다", () => {
    const r = interpretAxisExtreme("demand", 0, [0.03]);
    expect(r.level).toBe("NEAR_LOWEST");
    expect(r.badgeLabel).toBe("비교지역 내 매우 낮음");
    expect(r.badgeLabel).not.toBe("비교지역 내 최저");
  });

  it("정규화값이 정확히 100이면(확정 최고) '비교지역 내 최고'를 반환한다", () => {
    const r = interpretAxisExtreme("diversity", 100, [100]);
    expect(r.level).toBe("CONFIRMED_HIGHEST");
    expect(r.badgeLabel).toBe("비교지역 내 최고");
    expect(r.helperText).toContain("절대적인 만점이 아니라");
  });

  it("정규화값이 99.6처럼 100에 근접하지만 정확하지 않으면 '매우 높음'이다", () => {
    const r = interpretAxisExtreme("diversity", 100, [99.6]);
    expect(r.level).toBe("NEAR_HIGHEST");
    expect(r.badgeLabel).toBe("비교지역 내 매우 높음");
  });

  it("여러 근거 중 하나라도 0이 아니면 확정 최저로 판정하지 않는다(수요 축이 여러 지표 평균인 경우)", () => {
    const r = interpretAxisExtreme("demand", 0, [0, 0.4]);
    expect(r.level).toBe("NEAR_LOWEST");
  });

  it("여러 근거가 모두 정확히 0이면 확정 최저로 판정한다", () => {
    const r = interpretAxisExtreme("spend", 0, [0, 0]);
    expect(r.level).toBe("CONFIRMED_LOWEST");
  });

  it("연계(network) 축은 비교 방식이 달라 항상 NONE을 반환한다", () => {
    expect(interpretAxisExtreme("network", 0, [0])).toEqual({ level: "NONE", badgeLabel: null, helperText: null });
    expect(interpretAxisExtreme("network", 100, [100])).toEqual({ level: "NONE", badgeLabel: null, helperText: null });
  });

  it("점수가 0/100이 아닌 일반 값이면 NONE을 반환한다(일반 점수 카드는 건드리지 않음)", () => {
    expect(interpretAxisExtreme("stay", 4, [4])).toEqual({ level: "NONE", badgeLabel: null, helperText: null });
    expect(interpretAxisExtreme("stay", 50, [50])).toEqual({ level: "NONE", badgeLabel: null, helperText: null });
  });

  it("점수가 null이거나 근거가 없으면 NONE을 반환한다", () => {
    expect(interpretAxisExtreme("demand", null, [])).toEqual({ level: "NONE", badgeLabel: null, helperText: null });
    expect(interpretAxisExtreme("demand", 0, [])).toEqual({ level: "NONE", badgeLabel: null, helperText: null });
  });
});
