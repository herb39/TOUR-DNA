import { describe, expect, it } from "vitest";
import { minMaxNormalize, normalizeByTransform } from "@/lib/domain/normalize";

describe("normalizeByTransform", () => {
  it("LINEAR_MIN_MAX는 기존 minMaxNormalize와 완전히 동일한 값을 낸다", () => {
    const cohort = [60, 70, 90, 120];
    for (const raw of cohort) {
      expect(normalizeByTransform("LINEAR_MIN_MAX", raw, cohort)).toBe(minMaxNormalize(raw, cohort));
    }
  });

  it("LOG1P_MIN_MAX는 raw=0을 0으로, cohort 최댓값을 100으로 정규화한다", () => {
    const cohort = [0, 10, 100];
    expect(normalizeByTransform("LOG1P_MIN_MAX", 0, cohort)).toBe(0);
    expect(normalizeByTransform("LOG1P_MIN_MAX", 100, cohort)).toBe(100);
  });

  it("LOG1P_MIN_MAX는 작은 양수 구간의 상대 간격을 min-max보다 넓게(변별력 있게) 만든다", () => {
    // 60~75 사이 다수 지역 + 극단값 500 하나가 섞인 전형적인 우편향 코호트
    const cohort = [60, 62, 65, 68, 70, 72, 75, 500];
    const linear65 = normalizeByTransform("LINEAR_MIN_MAX", 65, cohort);
    const log1p65 = normalizeByTransform("LOG1P_MIN_MAX", 65, cohort);
    // 극단값 500 때문에 선형 min-max에서는 65가 거의 0에 가깝게 뭉개진다.
    expect(linear65).toBeLessThan(5);
    // log1p는 같은 65를 훨씬 더 넓은 구간으로 펼쳐 보여준다(변별력 개선).
    expect(log1p65).toBeGreaterThan(linear65 * 3);
  });

  it("LOG1P_MIN_MAX는 순서를 뒤집지 않는다(단조 변환)", () => {
    const cohort = [55, 61, 63, 70, 80, 95, 130, 201];
    const scores = cohort.map((raw) => normalizeByTransform("LOG1P_MIN_MAX", raw, cohort));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("코호트 전체가 같은 값이면(min=max) LOG1P_MIN_MAX도 중립값 50을 반환한다", () => {
    const cohort = [80, 80, 80];
    expect(normalizeByTransform("LOG1P_MIN_MAX", 80, cohort)).toBe(50);
  });

  it("빈 코호트면 LOG1P_MIN_MAX도 중립값 50을 반환한다", () => {
    expect(normalizeByTransform("LOG1P_MIN_MAX", 80, [])).toBe(50);
  });

  it("LOG1P_MIN_MAX 결과는 NaN/Infinity가 아니며 항상 0~100 사이다", () => {
    const cohort = [60.22, 62.16, 91.83, 132.26, 201.56];
    for (const raw of cohort) {
      const result = normalizeByTransform("LOG1P_MIN_MAX", raw, cohort);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    }
  });
});
