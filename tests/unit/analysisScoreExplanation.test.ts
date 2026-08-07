// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DNA 점수 0/100 절대값 오해 방지 UX 개선(2026-08-07) — 실제 화면 소스 코드에서 다음을 정적으로
 * 확인한다: (1) 잘못된 "상대 순위" 표현이 남아있지 않은지, (2) 내부 규칙 버전 문자열
 * (`pre-launch-validation-rules-v1` 등)이 사용자 화면에 그대로 노출되지 않는지. 화면 텍스트를 실제로
 * 렌더링하지 않고도(서버 컴포넌트 렌더링은 무거운 의존성이 많아 여기서는 소스 검사로 대체) 회귀를
 * 잡을 수 있다.
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

  it("'절대평가가 아닌 상대 수준'이라는 정확한 의미의 문구가 존재한다", () => {
    const source = readSource(ANALYSIS_PAGE);
    expect(source).toContain("절대평가가 아니라 현재 비교지역 안에서의 상대 수준");
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
