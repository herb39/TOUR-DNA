import { describe, expect, it } from "vitest";
import { buildRoleDecisionSummary } from "@/lib/domain/roleDecisionSummary";
import type { DnaAxisKey } from "@/lib/domain/types";

const AXIS_SCORES: { axis: DnaAxisKey; score: number | null }[] = [
  { axis: "demand", score: 70 },
  { axis: "stay", score: 20 },
  { axis: "spend", score: 55 },
  { axis: "diversity", score: 60 },
  { axis: "network", score: 65 },
];

describe("buildRoleDecisionSummary — 역할별 핵심 의사결정 요약(2026-08-13)", () => {
  it("role이 없으면(레거시) null을 반환한다", () => {
    expect(buildRoleDecisionSummary({ role: undefined, axisScores: AXIS_SCORES, topStrategyName: null })).toBeNull();
  });

  it("DNA 축 데이터가 전부 없으면 null을 반환한다(근거 없이 지어내지 않음)", () => {
    const empty = AXIS_SCORES.map((a) => ({ axis: a.axis, score: null }));
    expect(buildRoleDecisionSummary({ role: "TRAVEL_AGENCY", axisScores: empty, topStrategyName: null })).toBeNull();
  });

  it("가장 약한 축(stay)을 기준으로 역할별로 서로 다른 문장을 만든다", () => {
    const agency = buildRoleDecisionSummary({ role: "TRAVEL_AGENCY", axisScores: AXIS_SCORES, topStrategyName: null });
    const gov = buildRoleDecisionSummary({ role: "LOCAL_GOV", axisScores: AXIS_SCORES, topStrategyName: null });
    const festival = buildRoleDecisionSummary({ role: "FESTIVAL_PLANNER", axisScores: AXIS_SCORES, topStrategyName: null });

    expect(agency).toContain("체류(Stay)");
    expect(gov).toContain("체류(Stay)");
    expect(festival).toContain("체류(Stay)");
    expect(agency).not.toEqual(gov);
    expect(gov).not.toEqual(festival);
    expect(agency).not.toEqual(festival);

    expect(agency).toContain("숙박 연계 상품 구성이 우선");
    expect(gov).toContain("야간·숙박 인프라 연계가 우선");
    expect(festival).toContain("야간 프로그램과 연결");
  });

  it("추천 전략명이 있으면 문장에 그대로 인용한다", () => {
    const summary = buildRoleDecisionSummary({
      role: "TRAVEL_AGENCY",
      axisScores: AXIS_SCORES,
      topStrategyName: "야간·체류 확대형",
    });
    expect(summary).toContain("야간·체류 확대형");
  });
});
