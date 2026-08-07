import { describe, expect, it } from "vitest";
import { toDisplayDnaScore, DISPLAY_SCORE_MIN, DISPLAY_SCORE_MAX } from "@/lib/domain/dnaDisplayScore";

describe("toDisplayDnaScore — 내부 분석점수를 사용자 표시지수로 변환", () => {
  it("0과 100은 각각 표시 최솟값(10)·최댓값(90)으로 변환된다(절대 0/100이 그대로 노출되지 않음)", () => {
    expect(toDisplayDnaScore(0)).toBe(DISPLAY_SCORE_MIN);
    expect(toDisplayDnaScore(100)).toBe(DISPLAY_SCORE_MAX);
  });

  it("50은 정확히 50으로 유지된다(중앙 고정점)", () => {
    expect(toDisplayDnaScore(50)).toBe(50);
  });

  it("null 입력은 null을 그대로 반환한다(데이터 부족 축)", () => {
    expect(toDisplayDnaScore(null)).toBeNull();
  });

  it("단조 증가한다 — 내부점수가 클수록 표시지수도 크거나 같다(순위 역전 없음)", () => {
    const samples = [0, 1, 4, 10, 20, 25, 40, 50, 60, 75, 80, 90, 96, 99, 100];
    const displayed = samples.map((s) => toDisplayDnaScore(s)!);
    for (let i = 1; i < displayed.length; i++) {
      expect(displayed[i]).toBeGreaterThanOrEqual(displayed[i - 1]);
    }
  });

  it("동일 입력은 항상 동일 출력이다(결정론적)", () => {
    expect(toDisplayDnaScore(37)).toBe(toDisplayDnaScore(37));
  });

  it("모든 출력은 표시 범위(10~90) 안에 있다", () => {
    for (const s of [0, 25, 50, 75, 100]) {
      const d = toDisplayDnaScore(s)!;
      expect(d).toBeGreaterThanOrEqual(DISPLAY_SCORE_MIN);
      expect(d).toBeLessThanOrEqual(DISPLAY_SCORE_MAX);
    }
  });

  it("화천군 실제 사례 — 수요 0/소비 0/체류 4/다양성 100이 절대 0·100이 아닌 값으로 표시된다", () => {
    expect(toDisplayDnaScore(0)).toBe(10); // 수요·소비
    expect(toDisplayDnaScore(4)).toBe(13); // 체류
    expect(toDisplayDnaScore(100)).toBe(90); // 다양성
  });

  it("비율 관계가 그대로 보존된다(선형 압축이므로 왜곡이 없음) — 40과 60의 간격은 60과 80의 간격과 같다", () => {
    const d40 = toDisplayDnaScore(40)!;
    const d60 = toDisplayDnaScore(60)!;
    const d80 = toDisplayDnaScore(80)!;
    expect(d60 - d40).toBe(d80 - d60);
  });
});
