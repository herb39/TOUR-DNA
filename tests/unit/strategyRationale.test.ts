import { describe, expect, it } from "vitest";
import { buildStrategyRationale, buildShortStrategyRationaleLine } from "@/lib/domain/strategyRationale";

function baseInput(overrides: Partial<Parameters<typeof buildStrategyRationale>[0]> = {}) {
  return {
    role: "TRAVEL_AGENCY" as const,
    strategyName: "야간·체류 확대형",
    coreProblem: "일몰 이후 즐길 거리가 부족해 당일 방문에 그치고 숙박 소비로 이어지지 않음",
    coreResource: "야경 명소, 야시장, 야간 조명·공연 프로그램",
    stayStyle: "저녁부터 심야까지 이어지는 1박 이상 체류형",
    reasons: [
      "체류(Stay) 축 점수(100)가 반영되어 수요 적합도 90점",
      "지역 내 연계 인프라가 제한적이라 공급 적합도 52점 — 보완 필요 · 여행사/DMC 적합도 88점 — 여행사/DMC 관점의 목표 우선순위(기획 규칙) 반영",
      "여행 시기가 이 전략의 성수기(5, 6, 7, 8, 9월)와 잘 맞아 시즌 적합도 100점",
      "방문자는 전년 동월 대비 219.3% 증가했지만 소비 지표는 비교군 내 상대적으로 낮습니다(19점). 유료 체험·로컬 상품 연계를 우선 추천합니다.",
    ],
    roleFitReason: "여행사/DMC 관점의 목표 우선순위(기획 규칙) 반영",
    consumptionTouchpoints: { food: true, lodging: true, experience: false },
    ...overrides,
  };
}

describe("buildStrategyRationale — 데이터 진단→해석→추천 이유→실행 방향(2026-08-13)", () => {
  it("coreProblem/coreResource/stayStyle이 모두 있으면 4단계 근거를 만든다", () => {
    const rationale = buildStrategyRationale(baseInput());
    expect(rationale).not.toBeNull();
    expect(rationale!.interpretation).toBe(
      "일몰 이후 즐길 거리가 부족해 당일 방문에 그치고 숙박 소비로 이어지지 않음",
    );
    expect(rationale!.dataDiagnosis).toContain("219.3%");
    expect(rationale!.recommendationReason).toContain("야간·체류 확대형");
    expect(rationale!.executionDirection).toContain("식음·숙박");
  });

  it("레거시(coreProblem 등 5필드가 null)이면 근거를 지어내지 않고 null을 반환한다", () => {
    expect(
      buildStrategyRationale(baseInput({ coreProblem: null, coreResource: null, stayStyle: null })),
    ).toBeNull();
  });

  it("reasons가 비어 있으면 null을 반환한다(근거 없이 만들지 않음)", () => {
    expect(buildStrategyRationale(baseInput({ reasons: [] }))).toBeNull();
  });

  it("지표 기반 서술(reasons[3])이 없으면 수요 근거(reasons[0])를 데이터 진단으로 쓴다", () => {
    const rationale = buildStrategyRationale(
      baseInput({ reasons: baseInput().reasons.slice(0, 3) }),
    );
    expect(rationale!.dataDiagnosis).toBe("체류(Stay) 축 점수(100)가 반영되어 수요 적합도 90점");
  });

  it("역할에 따라 추천 이유 문장이 실제로 달라진다(단순 역할명 치환이 아님)", () => {
    const agency = buildStrategyRationale(baseInput({ role: "TRAVEL_AGENCY" }));
    const gov = buildStrategyRationale(
      baseInput({ role: "LOCAL_GOV", roleFitReason: "지자체/관광재단 관점의 목표 우선순위(기획 규칙) 반영" }),
    );
    expect(agency!.recommendationReason).not.toEqual(gov!.recommendationReason);
    expect(gov!.recommendationReason).toContain("지자체/관광재단");
  });

  it("역할이 없으면(레거시) 역할 문구 없이 추천 이유를 만든다", () => {
    const rationale = buildStrategyRationale(baseInput({ role: undefined }));
    expect(rationale!.recommendationReason).not.toContain("관점");
    expect(rationale!.recommendationReason).toContain("1순위로 추천됩니다");
  });

  it("roleDecisionSummary와 달리 DNA 약점 축 문구를 반복하지 않는다(책임 분리)", () => {
    const rationale = buildStrategyRationale(baseInput());
    expect(rationale!.recommendationReason).not.toContain("상대적 약점");
  });

  it("소비 접점이 전혀 없으면(모두 false) 코스 참고 안내로 대체한다(지어내지 않음)", () => {
    const rationale = buildStrategyRationale(
      baseInput({ consumptionTouchpoints: { food: false, lodging: false, experience: false } }),
    );
    expect(rationale!.executionDirection).toContain("실행안 코스 구성을 참고");
  });
});

describe("buildShortStrategyRationaleLine — plan/print용 축약형 한 줄", () => {
  it("coreProblem·coreResource가 있으면 한 줄로 합친다", () => {
    const line = buildShortStrategyRationaleLine(
      "일몰 이후 즐길 거리가 부족해 당일 방문에 그치고 숙박 소비로 이어지지 않음",
      "야경 명소, 야시장, 야간 조명·공연 프로그램",
    );
    expect(line).toBe(
      "일몰 이후 즐길 거리가 부족해 당일 방문에 그치고 숙박 소비로 이어지지 않음 — 야경 명소, 야시장, 야간 조명·공연 프로그램 기반으로 보완하는 전략입니다.",
    );
  });

  it("레거시(둘 중 하나라도 null)면 null을 반환한다", () => {
    expect(buildShortStrategyRationaleLine(null, "자원")).toBeNull();
    expect(buildShortStrategyRationaleLine("문제", null)).toBeNull();
  });
});
