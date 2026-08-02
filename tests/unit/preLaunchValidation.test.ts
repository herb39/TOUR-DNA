import { describe, expect, it } from "vitest";
import {
  classifyAxisProvenance,
  computePreLaunchValidation,
  PRE_LAUNCH_RULE_VERSION,
  type PreLaunchValidationInput,
} from "@/lib/domain/preLaunchValidation";
import type { DataProvenance, DnaAxisKey } from "@/lib/domain/types";

/** 축 하나를 "이 축 evidence들의 provenance 목록"으로 직접 지정하는 헬퍼 — MISSING은 빈 배열([])로
 * 표현한다(evidence 자체가 없다는 뜻, dna.ts의 실제 규약과 동일). */
function axisScores(overrides: Partial<Record<DnaAxisKey, (DataProvenance | null)[]>> = {}) {
  const axes: DnaAxisKey[] = ["demand", "stay", "spend", "diversity", "network"];
  const base: Record<DnaAxisKey, (DataProvenance | null)[]> = {
    demand: ["LIVE_API"],
    stay: ["LIVE_API"],
    spend: ["LIVE_API"],
    diversity: ["LIVE_API"],
    network: ["LIVE_API"],
  };
  const merged = { ...base, ...overrides };
  return axes.map((axis) => ({
    axis,
    score: merged[axis].length === 0 ? null : 60,
    evidenceProvenances: merged[axis],
  }));
}

function baseInput(overrides: Partial<PreLaunchValidationInput> = {}): PreLaunchValidationInput {
  return {
    axisScores: axisScores(),
    poiShortage: null,
    travelNoticeCount: 0,
    totalCourseDays: 2,
    regionComparisonCount: 3,
    regionUniqueStrengthNote: "다양성 축은 비교한 3개 지역 모두보다 높아, 이 지역만의 강점으로 활용할 수 있습니다.",
    riskMitigations: [{ risk: "기상 악화", mitigation: "실내 대체 코스 준비" }],
    ...overrides,
  };
}

describe("computePreLaunchValidation — 기본 동작", () => {
  it("네 신호가 모두 OK면 '권장'으로 판정한다", () => {
    const result = computePreLaunchValidation(baseInput());
    expect(result.recommendation).toBe("RECOMMENDED");
    expect(result.recommendationLabel).toBe("권장");
    expect(result.dataReliability.status).toBe("OK");
    expect(result.poiSupplySufficiency.status).toBe("OK");
    expect(result.travelFeasibility.status).toBe("OK");
    expect(result.regionalDifferentiation.status).toBe("OK");
    expect(result.requiredImprovements).toHaveLength(0);
  });

  it("규칙 버전과 판정 기준 문구를 항상 반환한다", () => {
    const result = computePreLaunchValidation(baseInput());
    expect(result.ruleVersion).toBe(PRE_LAUNCH_RULE_VERSION);
    expect(result.criteria.length).toBeGreaterThan(0);
  });

  it("동일 입력을 반복 호출해도 완전히 동일한 결과를 낸다(재현성)", () => {
    const input = baseInput();
    expect(computePreLaunchValidation(input)).toEqual(computePreLaunchValidation(input));
  });

  it("위험·대응안은 최대 5개까지만, 'risk — mitigation' 형식으로 반환한다", () => {
    const risks = Array.from({ length: 8 }, (_, i) => ({ risk: `위험${i}`, mitigation: `대응${i}` }));
    const result = computePreLaunchValidation(baseInput({ riskMitigations: risks }));
    expect(result.keyRisks).toHaveLength(5);
    expect(result.keyRisks[0]).toBe("위험0 — 대응0");
  });
});

describe("computePreLaunchValidation — 치명적 조건이 있으면 다른 항목이 좋아도 권장하지 않는다", () => {
  it("DNA 축이 2개 이상 MISSING이면(데이터 신뢰도 BLOCKER) 나머지가 전부 OK여도 '보완 후 재검토'다", () => {
    const result = computePreLaunchValidation(
      baseInput({ axisScores: axisScores({ spend: [], diversity: [] }) }),
    );
    expect(result.dataReliability.status).toBe("BLOCKER");
    expect(result.recommendation).toBe("NEEDS_IMPROVEMENT");
    expect(result.reason).toContain("데이터 신뢰도");
  });

  it("POI 공급이 지역 데이터 자체 부족(dataInsufficient)이면 나머지가 전부 OK여도 '보완 후 재검토'다", () => {
    const result = computePreLaunchValidation(
      baseInput({
        poiShortage: { dataInsufficient: true, message: "목표보다 부족합니다.", suggestion: "데이터를 보강하세요." },
      }),
    );
    expect(result.poiSupplySufficiency.status).toBe("BLOCKER");
    expect(result.recommendation).toBe("NEEDS_IMPROVEMENT");
    expect(result.reason).toContain("POI 공급 충분성");
  });

  it("이동 경고가 3건 이상이면(이동 현실성 BLOCKER) 나머지가 전부 OK여도 '보완 후 재검토'다", () => {
    const result = computePreLaunchValidation(baseInput({ travelNoticeCount: 3 }));
    expect(result.travelFeasibility.status).toBe("BLOCKER");
    expect(result.recommendation).toBe("NEEDS_IMPROVEMENT");
    expect(result.reason).toContain("이동 현실성");
  });

  it("단일 평균 점수가 아니라 개별 신호로 판정한다 — 3개 신호가 완벽해도 1개가 BLOCKER면 전체가 내려간다", () => {
    // dataReliability/travel/region 모두 완벽(OK)한 상태에서 POI 공급만 BLOCKER
    const result = computePreLaunchValidation(
      baseInput({
        poiShortage: { dataInsufficient: true, message: "부족", suggestion: "보강" },
      }),
    );
    expect(result.dataReliability.status).toBe("OK");
    expect(result.travelFeasibility.status).toBe("OK");
    expect(result.regionalDifferentiation.status).toBe("OK");
    expect(result.recommendation).not.toBe("RECOMMENDED");
    expect(result.recommendation).toBe("NEEDS_IMPROVEMENT");
  });
});

describe("computePreLaunchValidation — 경미한 문제는 조건부 권장으로만 낮춘다", () => {
  it("DNA 축이 1개만 MISSING이면 CAUTION이고 전체는 조건부 권장이다", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ spend: [] }) }));
    expect(result.dataReliability.status).toBe("CAUTION");
    expect(result.recommendation).toBe("CONDITIONAL");
  });

  it("POI 부족이지만 지역 데이터 자체는 충분(dataInsufficient=false)하면 CAUTION이다", () => {
    const result = computePreLaunchValidation(
      baseInput({
        poiShortage: { dataInsufficient: false, message: "적합 기준 미달로 일부 제외", suggestion: "후보 추가 검토" },
      }),
    );
    expect(result.poiSupplySufficiency.status).toBe("CAUTION");
    expect(result.recommendation).toBe("CONDITIONAL");
  });

  it("이동 경고가 1~2건이면 CAUTION이다(3건 미만은 BLOCKER 아님)", () => {
    const result = computePreLaunchValidation(baseInput({ travelNoticeCount: 2 }));
    expect(result.travelFeasibility.status).toBe("CAUTION");
    expect(result.recommendation).toBe("CONDITIONAL");
  });

  it("비교 지역은 있지만 뚜렷한 차별점이 없으면 CAUTION이다", () => {
    const result = computePreLaunchValidation(baseInput({ regionUniqueStrengthNote: null }));
    expect(result.regionalDifferentiation.status).toBe("CAUTION");
    expect(result.recommendation).toBe("CONDITIONAL");
  });
});

describe("computePreLaunchValidation — 근거 부족은 점수를 지어내지 않고 '확인 필요'로 표시한다", () => {
  it("비교 지역이 0곳이면 지역 차별성은 UNKNOWN이다(강제로 OK/CAUTION을 만들지 않음)", () => {
    const result = computePreLaunchValidation(baseInput({ regionComparisonCount: 0, regionUniqueStrengthNote: null }));
    expect(result.regionalDifferentiation.status).toBe("UNKNOWN");
    expect(result.requiredImprovements.some((s) => s.includes("확인 필요"))).toBe(true);
  });

  it("코스가 비어 있으면(totalCourseDays=0) POI 공급·이동 현실성 모두 UNKNOWN이다", () => {
    const result = computePreLaunchValidation(baseInput({ totalCourseDays: 0 }));
    expect(result.poiSupplySufficiency.status).toBe("UNKNOWN");
    expect(result.travelFeasibility.status).toBe("UNKNOWN");
  });

  it("UNKNOWN이 있으면 전체 판정은 최소 조건부 권장으로 낮아진다(권장으로 지어내지 않음)", () => {
    const result = computePreLaunchValidation(baseInput({ regionComparisonCount: 0, regionUniqueStrengthNote: null }));
    expect(result.recommendation).not.toBe("RECOMMENDED");
  });
});

describe("classifyAxisProvenance — provenance별 축 신뢰도 등급 판정 정책", () => {
  it("LIVE_API만 있으면 TRUSTED다", () => {
    expect(classifyAxisProvenance(["LIVE_API"])).toBe("TRUSTED");
    expect(classifyAxisProvenance(["LIVE_API", "LIVE_API"])).toBe("TRUSTED");
  });

  it("CACHED_API만 있어도(LIVE가 아니어도) TRUSTED다 — 단순히 LIVE가 아니라는 이유로 낮추지 않는다", () => {
    expect(classifyAxisProvenance(["CACHED_API"])).toBe("TRUSTED");
  });

  it("CURATED만 있어도 TRUSTED다(사람이 검수한 데이터)", () => {
    expect(classifyAxisProvenance(["CURATED"])).toBe("TRUSTED");
  });

  it("LIVE_API와 CACHED_API가 섞여 있어도 TRUSTED다", () => {
    expect(classifyAxisProvenance(["LIVE_API", "CACHED_API"])).toBe("TRUSTED");
  });

  it("ESTIMATED가 하나라도 섞여 있으면 ESTIMATED다(다른 근거가 LIVE_API여도 약한 고리가 등급을 결정)", () => {
    expect(classifyAxisProvenance(["LIVE_API", "ESTIMATED"])).toBe("ESTIMATED");
    expect(classifyAxisProvenance(["ESTIMATED"])).toBe("ESTIMATED");
  });

  it("null(레거시 미분류)이 섞여 있으면 UNCLASSIFIED다 — ESTIMATED와 별도로 구분한다", () => {
    expect(classifyAxisProvenance([null])).toBe("UNCLASSIFIED");
    expect(classifyAxisProvenance(["LIVE_API", null])).toBe("UNCLASSIFIED");
  });

  it("문자 그대로의 'MISSING' provenance 값도 UNCLASSIFIED로 취급한다(ESTIMATED와 다른 사유)", () => {
    expect(classifyAxisProvenance(["MISSING"])).toBe("UNCLASSIFIED");
  });

  it("evidence 자체가 없으면(빈 배열) MISSING이다 — ESTIMATED('값은 있는데 추정')와 명확히 다르다", () => {
    expect(classifyAxisProvenance([])).toBe("MISSING");
  });

  it("ESTIMATED와 null이 둘 다 섞여 있으면 ESTIMATED가 우선한다(우선순위 명시)", () => {
    expect(classifyAxisProvenance(["ESTIMATED", null])).toBe("ESTIMATED");
  });
});

describe("computePreLaunchValidation — provenance 조합별 데이터 신뢰도 판정(전체 조합 커버)", () => {
  it("전부 LIVE_API면 OK다", () => {
    const result = computePreLaunchValidation(baseInput());
    expect(result.dataReliability.status).toBe("OK");
    expect(result.dataReliability.detail).not.toContain("참고:");
  });

  it("LIVE_API + CACHED_API 혼합이면 OK다(SNAPSHOT이라는 이유만으로 낮추지 않음) — 대신 노후도 참고 문구가 붙는다", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ demand: ["CACHED_API"] }) }));
    expect(result.dataReliability.status).toBe("OK");
    expect(result.dataReliability.detail).toContain("참고");
    expect(result.dataReliability.detail).toContain("CACHED_API");
    expect(result.recommendation).toBe("RECOMMENDED");
  });

  it("CURATED가 포함돼도 OK다(사람이 검수한 데이터는 신뢰도를 낮추지 않음)", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ stay: ["CURATED"] }) }));
    expect(result.dataReliability.status).toBe("OK");
  });

  it("ESTIMATED가 포함되면 CAUTION이고, 어떤 축이 왜(ESTIMATED) 그런지 이유에 명시된다", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ demand: ["ESTIMATED"] }) }));
    expect(result.dataReliability.status).toBe("CAUTION");
    expect(result.dataReliability.detail).toContain("수요(Demand)");
    expect(result.dataReliability.detail).toContain("추정값(ESTIMATED)");
    expect(result.recommendation).toBe("CONDITIONAL");
  });

  it("출처 미상(null) 근거가 포함되면 CAUTION이고, ESTIMATED와는 다른 문구로 표시된다", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ spend: [null] }) }));
    expect(result.dataReliability.status).toBe("CAUTION");
    expect(result.dataReliability.detail).toContain("출처 판정 정보가 없는");
    expect(result.dataReliability.detail).not.toContain("추정값(ESTIMATED)");
  });

  it("MISSING(evidence 없음) 1개는 CAUTION이다 — ESTIMATED와 다른 문구('데이터 자체가 없음')를 쓴다", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ diversity: [] }) }));
    expect(result.dataReliability.status).toBe("CAUTION");
    expect(result.dataReliability.detail).toContain("데이터 자체가 없음");
    expect(result.recommendation).toBe("CONDITIONAL");
  });

  it("MISSING이 2개 이상이면 BLOCKER다 — 나머지 3개 축이 전부 LIVE_API여도 '보완 후 재검토'다", () => {
    const result = computePreLaunchValidation(baseInput({ axisScores: axisScores({ demand: [], stay: [] }) }));
    expect(result.dataReliability.status).toBe("BLOCKER");
    expect(result.recommendation).toBe("NEEDS_IMPROVEMENT");
  });

  it("ESTIMATED와 CACHED_API가 서로 다른 축에 섞여 있으면, ESTIMATED 축만 판정 이유에 나열된다(CACHED_API는 참고 문구로 분리)", () => {
    const result = computePreLaunchValidation(
      baseInput({ axisScores: axisScores({ demand: ["ESTIMATED"], stay: ["CACHED_API"] }) }),
    );
    expect(result.dataReliability.status).toBe("CAUTION");
    expect(result.dataReliability.detail).toContain("수요(Demand)(추정값(ESTIMATED) 근거 포함)");
    expect(result.dataReliability.detail).not.toContain("체류(Stay)(추정값");
    expect(result.dataReliability.detail).toContain("참고");
    expect(result.dataReliability.detail).toContain("체류(Stay)");
  });
});
