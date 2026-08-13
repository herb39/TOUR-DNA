// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { PreLaunchValidationSection } from "@/components/plan/PreLaunchValidationSection";
import type { PreLaunchValidationReport } from "@/lib/domain/preLaunchValidation";

function report(overrides: Partial<PreLaunchValidationReport> = {}): PreLaunchValidationReport {
  return {
    recommendation: "CONDITIONAL",
    recommendationLabel: "조건부 권장",
    reason: "데이터 신뢰도에 보완이 필요해 조건부 권장으로 판단합니다.",
    dataReliability: { status: "CAUTION", detail: "수요(Demand) 축은 추정값 근거를 포함합니다." },
    poiSupplySufficiency: {
      status: "UNKNOWN",
      detail: "코스에 담긴 일정이 없어 POI 공급 충분성을 확인할 수 없습니다.",
    },
    travelFeasibility: {
      status: "UNKNOWN",
      detail: "코스에 담긴 일정이 없어 이동 현실성을 확인할 수 없습니다.",
    },
    regionalDifferentiation: { status: "OK", detail: "체류(Stay) 축은 비교한 지역보다 높습니다." },
    keyRisks: [],
    requiredImprovements: ["[데이터 신뢰도] 부족한 축의 실측 데이터를 보강한 뒤 다시 분석하세요."],
    criteria: "이 판정은 이미 계산된 값만 사용하는 정해진 규칙입니다.",
    ruleVersion: "pre-launch-validation-rules-v1",
    dataReliabilityFlaggedAxes: ["demand"],
    weakestAxis: "spend",
    expectedOutcomeIfImproved: "위 보완 조건을 충족하면 실행안 검토 단계로 안정적으로 진행할 수 있습니다.",
    ...overrides,
  };
}

/** analysis(분석) 단계와 plan(실행안) 단계를 혼동하지 않도록 preliminary prop으로 표시를 구분한다
 * (2026-08-13) — 판정 산식(report 자체)은 절대 바꾸지 않고 같은 report를 다르게 보여주기만 한다. */
describe("PreLaunchValidationSection — preliminary(예비) 표시", () => {
  it("preliminary를 주지 않으면(기본값 false, plan/print와 동일) 예비 표시가 전혀 없다(회귀 방지)", () => {
    render(<PreLaunchValidationSection report={report()} />);
    expect(screen.queryByText("예비")).not.toBeInTheDocument();
    expect(screen.queryByText(/예비 판정/)).not.toBeInTheDocument();
    expect(screen.getByText(/추진 권고: 조건부 권장/)).toBeInTheDocument();
    expect(screen.queryByText(/실행안을 만든 뒤 확인/)).not.toBeInTheDocument();
  });

  it("preliminary=true면 '예비' 배지와 잠정 판단 안내 문장이 보인다", () => {
    render(<PreLaunchValidationSection report={report()} preliminary />);
    expect(screen.getByText("예비")).toBeInTheDocument();
    expect(screen.getByText(/실행안을 만들기 전 단계의 잠정 판단입니다/)).toBeInTheDocument();
    expect(screen.getByText(/추진 권고: 조건부 권장 \(예비 판정\)/)).toBeInTheDocument();
  });

  it("preliminary=true면 UNKNOWN 신호에만 '실행안을 만든 뒤 확인' 보조 문구가 붙는다(OK/CAUTION에는 붙지 않음)", () => {
    render(<PreLaunchValidationSection report={report()} preliminary />);
    const poiCard = screen.getByText("POI 공급 충분성").closest("div")!.parentElement!;
    expect(poiCard).toHaveTextContent("실행안을 만든 뒤 확인");

    const regionCard = screen.getByText("지역 차별성").closest("div")!.parentElement!;
    expect(regionCard).not.toHaveTextContent("실행안을 만든 뒤 확인");
  });

  it("판정 산식 값 자체(recommendation/status)는 preliminary와 무관하게 그대로 유지된다", () => {
    const r = report();
    render(<PreLaunchValidationSection report={r} preliminary />);
    expect(screen.getByText(/추진 권고: 조건부 권장/)).toBeInTheDocument();
    // report 객체 자체는 컴포넌트가 전혀 변형하지 않는다.
    expect(r.recommendation).toBe("CONDITIONAL");
    expect(r.dataReliability.status).toBe("CAUTION");
  });
});

/** 직전 작업에서 요구됐던 레거시/누락 상태 검증(2026-08-13) — kpis를 아예 넘기지 않는 경우(레거시
 * 호출부, 또는 아직 실행안이 없어 KPI 자체가 없는 analysis 단계)에도 크래시 없이 안전하게 KPI 관련
 * 문구를 생략해야 한다(근거 없이 KPI를 지어내지 않음). */
describe("PreLaunchValidationSection — 레거시/누락 필드 fallback", () => {
  it("kpis prop을 넘기지 않으면(undefined) 크래시 없이 KPI 관련 문구를 전부 생략한다", () => {
    render(<PreLaunchValidationSection report={report()} preliminary />);
    expect(screen.queryByText(/보완 KPI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/연결된 KPI/)).not.toBeInTheDocument();
  });

  it("weakestAxis가 null이어도(축 점수가 전부 없는 레거시) 크래시 없이 취약 축 KPI 문구를 생략한다", () => {
    render(<PreLaunchValidationSection report={report({ weakestAxis: null })} kpis={[]} preliminary />);
    expect(screen.queryByText(/연결된 KPI/)).not.toBeInTheDocument();
  });

  it("requiredImprovements/keyRisks가 빈 배열이어도 크래시 없이 해당 블록을 생략한다", () => {
    render(<PreLaunchValidationSection report={report({ requiredImprovements: [], keyRisks: [] })} preliminary />);
    expect(screen.queryByText("필수 보완사항")).not.toBeInTheDocument();
    expect(screen.queryByText("주요 위험")).not.toBeInTheDocument();
  });
});
