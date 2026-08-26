// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DNA 점수 0/100 절대값 오해 방지 UX 개선(2026-08-07, 표시지수 도입으로 갱신) — 실제 화면 소스
 * 코드에서 다음을 정적으로 확인한다: (1) 잘못된 "상대 순위" 표현이 남아있지 않은지, (2) 내부 규칙
 * 버전 문자열(`pre-launch-validation-rules-v1` 등)이 사용자 화면에 그대로 노출되지 않는지. 화면
 * 텍스트를 실제로 렌더링하지 않고도(서버 컴포넌트 렌더링은 무거운 의존성이 많아 여기서는 소스 검사로
 * 대체) 회귀를 잡을 수 있다.
 */
function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8");
}

const ANALYSIS_PAGE = "src/app/projects/[id]/analysis/page.tsx";
const PRE_LAUNCH_SECTION = "src/components/plan/PreLaunchValidationSection.tsx";

describe("DNA 분석 화면 — 점수 설명 문구 정확성", () => {
  it("실제 산식과 맞지 않는 '상대 순위' 표현이 더 이상 없다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).not.toContain("상대 순위");
  });

  it("'절대평가가 아닌 상대지수'라는 정확한 의미의 문구가 존재한다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).toContain("절대평가가 아니라, 현재 비교지역 안에서 극단적인 차이를 완화해 보여주는 상대");
  });
});

describe("DNA 분석 화면 — 내부 분석점수와 사용자 표시지수 분리(2026-08-07)", () => {
  it("카드와 레이더 차트가 같은 표시지수(axisDisplayScoreByAxis)를 참조한다(서로 다른 값으로 보이지 않음)", () => {
    const source = readSource(ANALYSIS_PAGE);
    const occurrences = source.match(/axisDisplayScoreByAxis\.get\(a\.axisKey\)/g) ?? [];
    // 카드 점수 표시(1곳)와 레이더 차트 데이터 매핑(1곳)에서 모두 같은 Map을 참조해야 한다.
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("강점/개선 판정(topAxes/bottomAxes)은 여전히 axisData의 원본 내부점수로 계산한다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).toContain("const topAxes = [...scoredAxes].sort((a, b) => b.score - a.score)");
    expect(source).toContain('.sort((a, b) => a.score - b.score)');
  });

  it("사용자 화면 라벨이 '상대점수' 대신 'DNA 상대지수'로 통일됐다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).toContain("DNA 상대지수");
  });

  it("DNA 표시값과 개별 근거 정규화값을 서로 다른 label로 구분한다", () => {
    const analysis = readSource(ANALYSIS_PAGE);
    const evidence = readSource("src/components/evidence/EvidenceTable.tsx");
    expect(analysis).toContain("DNA 상대지수");
    expect(evidence).toContain("원천 지표 정규화값");
    expect(analysis).toContain("원천 지표 정규화값은 개별 지표 값입니다");
  });
});

describe("DNA 분석 화면 — 내부 개발용 규칙 버전 문자열 미노출", () => {
  it("analysis 페이지 화면 텍스트에 pre-launch-validation-rules-v1 등 원문 버전 식별자를 직접 출력하지 않는다", () => {
    const source = readSource(ANALYSIS_PAGE);
    // ruleVersion 값을 그대로 화면에 꽂아 넣는 JSX 표현식(`{...ruleVersion}` 형태)이 없어야 한다.
    expect(source).not.toMatch(/\{[a-zA-Z.]*[Rr]uleVersion\}/);
    expect(source).not.toMatch(/\{[A-Z_]*RULE_VERSION\}/);
  });

  it("사업 사전검증 리포트 화면에도 원문 버전 식별자를 그대로 출력하지 않는다", () => {
    const source = readSource(PRE_LAUNCH_SECTION);
    expect(source).not.toMatch(/\{[a-zA-Z.]*[Rr]uleVersion\}/);
  });
});

/** 전략 비교 화면 정보 위계 개선(2026-08-07) — "5초 안에 3안 차이를 이해한다"는 목표에 맞춰 반복
 * 면책 문구를 통합하고, CURATED·roleFit 같은 내부 식별자를 사용자 화면에서 제거했는지 확인한다. */
describe("전략 비교 화면 — 반복 면책 문구 통합", () => {
  it("유사지역 비교·관광사업 기회 섹션에는 더 이상 '한계 및 추가 확인사항'을 각각 표시하지 않는다", () => {
    const source = readSource(ANALYSIS_PAGE);
    const occurrences = source.match(/한계 및 추가 확인사항/g) ?? [];
    // 통합 섹션(데이터 기준 및 확인사항) 1곳에서만 이 라벨을 쓴다.
    expect(occurrences.length).toBe(1);
  });

  it("'데이터 기준 및 확인사항'이라는 통합 섹션이 존재한다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).toContain("데이터 기준 및 확인사항");
  });
});

describe("전략 비교 화면 — 전략 점수 의미 label", () => {
  it("전략 카드와 비교표가 총점을 '전략 적합도'로 표시한다", () => {
    expect(readSource("src/components/strategy/StrategyCard.tsx")).toContain("전략 적합도");
    expect(readSource("src/components/strategy/StrategyComparisonTable.tsx")).toContain("전략 적합도 {row.totalScore}점");
  });
});

describe("분석·전략 화면 — PRIMARY 순서", () => {
  it("분석 page에서 DNA가 strategy보다 앞서고 strategy가 Anchor·사전검증보다 앞선다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source.indexOf('>관광 DNA 5축<')).toBeGreaterThan(-1);
    expect(source.indexOf('id="strategies"')).toBeGreaterThan(-1);
    expect(source.indexOf("<FestivalAnchorPanel")).toBeGreaterThan(-1);
    expect(source.indexOf('>관광 DNA 5축<')).toBeLessThan(source.indexOf('id="strategies"'));
    expect(source.indexOf('id="strategies"')).toBeLessThan(source.indexOf("<FestivalAnchorPanel"));
    expect(source.indexOf("<PreLaunchValidationSection")).toBeGreaterThan(source.indexOf('id="strategies"'));
  });
});

describe("전략 비교 화면 — CURATED·roleFit 등 내부 식별자 미노출", () => {
  const STRATEGY_COMPARISON_TABLE = "src/components/strategy/StrategyComparisonTable.tsx";
  const BUSINESS_OPPORTUNITY = "src/lib/domain/businessOpportunity.ts";
  const REGION_SIMILARITY = "src/lib/domain/regionSimilarity.ts";

  it("전략 비교표 각주에 'roleFit 공식과 동일' 같은 내부 공식 설명이 더 이상 없다", () => {
    const source = readSource(STRATEGY_COMPARISON_TABLE);
    expect(source).not.toContain("roleFit 공식과 동일");
    expect(source).toContain("업무 목적과의 적합성");
  });

  it("관광사업 기회·유사지역 비교 사용자 문구에 'CURATED' 원문이 더 이상 없다", () => {
    expect(readSource(BUSINESS_OPPORTUNITY)).not.toContain("CURATED 규칙");
    expect(readSource(BUSINESS_OPPORTUNITY)).not.toContain("(CURATED)");
    expect(readSource(REGION_SIMILARITY)).not.toContain("CURATED 규칙");
  });
});

/** 사용자 화면 내부 기술정보 노출 마감(2026-08-07) — LIVE/HYBRID/SNAPSHOT 같은 데이터 상태 enum,
 * 데이터·모델 버전, 해시, 내부 규칙 버전 문자열이 분석·홍보자료 화면에 그대로 출력되지 않는지 정적으로
 * 확인한다. 산식(dna.ts의 overallDataMode 판정 등)은 그대로 두고 표시 문구만 확인 대상이다. */
describe("사용자 화면 — 내부 기술정보(데이터 상태·버전·해시) 미노출", () => {
  const PRINT_PAGE = "src/app/projects/[id]/print/page.tsx";

  it("분석 화면이 overallDataMode(LIVE/HYBRID/SNAPSHOT) enum 원문을 그대로 보간해 출력하지 않는다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).not.toMatch(/\{analysisResult\.overallDataMode\}/);
    expect(source).toContain("describeOverallDataMode(analysisResult.overallDataMode");
  });

  it("분석 화면에 데이터 버전(해시)·모델 버전 원문이 더 이상 노출되지 않는다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).not.toMatch(/\{analysisResult\.dataVersion\}/);
    expect(source).not.toMatch(/\{analysisResult\.modelVersion\}/);
  });

  it("분석 화면에는 데이터 기준월 정보가 여전히 표시된다(투명성 유지)", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).toContain("분석 기준월");
  });

  it("홍보자료(인쇄) 화면에 'CURATED 규칙'·원문 규칙 버전·모델 버전·'정제 규칙 적용' 배지가 더 이상 노출되지 않는다(2026-08-08)", () => {
    const source = readSource(PRINT_PAGE);
    expect(source).not.toContain("CURATED 규칙");
    expect(source).not.toMatch(/RULE_VERSION\}/);
    expect(source).not.toMatch(/\{analysisResult\.modelVersion\}/);
    expect(source).not.toContain("정제 규칙 적용");
  });

  it("홍보자료(인쇄) 화면에도 분석 기준월 정보는 유지된다", () => {
    const source = readSource(PRINT_PAGE);
    expect(source).toContain("분석 기준월");
  });

  it("사업 사전검증 리포트 문구에 LIVE_API/CACHED_API/CURATED/ESTIMATED enum 원문이 더 이상 없다", () => {
    const source = readSource("src/lib/domain/preLaunchValidation.ts");
    expect(source).not.toMatch(/CACHED_API, 노후 데이터/);
    expect(source).not.toMatch(/실시간 또는 검증된\(LIVE_API/);
    expect(source).not.toMatch(/추정값\(ESTIMATED\)/);
    expect(source).not.toMatch(/결정론적 규칙\(CURATED\)/);
  });
});

/** 홍보자료 UX 및 실행안 화면 신뢰도 개선(2026-08-08) — "정제 규칙 적용" 배지, 사용자를 불안하게 만드는
 * "판정 기준·한계 보기" UI, 어색한 부족 안내 문구, 적합도 옆 절대점수 노출을 화면에서 제거했는지
 * 확인한다. */
describe("실행안·인쇄 화면 — 신뢰도를 낮추는 배지·UI·문구 제거(2026-08-08)", () => {
  const PLAN_EDITOR = "src/components/plan/PlanEditor.tsx";
  const POI_FIT_SERVICE = "src/lib/services/poiFitService.ts";
  const PRINT_PAGE = "src/app/projects/[id]/print/page.tsx";

  it("분석·인쇄·사전검증 화면 어디에도 '정제 규칙 적용' 배지가 더 이상 없다", () => {
    expect(readSource(ANALYSIS_PAGE)).not.toContain("정제 규칙 적용");
    expect(readSource(PRINT_PAGE)).not.toContain("정제 규칙 적용");
    expect(readSource(PRE_LAUNCH_SECTION)).not.toContain("정제 규칙 적용");
  });

  it("사전검증 리포트(실행안 화면)에 '판정 기준·한계 보기' 접힘 UI가 더 이상 없다", () => {
    const source = readSource(PRE_LAUNCH_SECTION);
    expect(source).not.toContain("판정 기준·한계 보기");
    expect(source).not.toContain("report.criteria");
  });

  it("장소 부족 안내에 '억지로 채우지 않았습니다' 같은 방어적 문구가 더 이상 없다", () => {
    const source = readSource(POI_FIT_SERVICE);
    expect(source).not.toContain("억지로 채우지 않았습니다");
    expect(source).toContain("선택한 전략과 잘 맞는 장소를 우선해 코스를 구성했습니다");
  });

  it("실행안 화면의 POI 적합도 배지에 절대점수(예: 100점)가 기본 노출되지 않는다", () => {
    const source = readSource(PLAN_EDITOR);
    expect(source).not.toMatch(/FIT_GRADE_LABEL\[fit\.grade\]\}\(\{fit\.totalScore\}점\)/);
  });
});
