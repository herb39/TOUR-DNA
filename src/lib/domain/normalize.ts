/**
 * 동일 행정단위·동일 기준월·동일 지표 코호트 안에서의 min-max 정규화.
 * 코호트가 1개뿐이거나 모든 값이 동일하면 비교 불가 상태이므로 중립값 50을 반환한다.
 */
export function minMaxNormalize(rawValue: number, cohortValues: number[]): number {
  if (cohortValues.length === 0) return 50;
  const min = Math.min(...cohortValues);
  const max = Math.max(...cohortValues);
  if (max === min) return 50;
  const ratio = (rawValue - min) / (max - min);
  return round2(clamp(ratio * 100, 0, 100));
}

/**
 * 2026-08-11: 전국 255개 지역 감사에서, 소수의 극단값(예: 서울 중구급 초고소비 상권)이 코호트에
 * 편입/이탈할 때마다 min-max 정규화가 나머지 지역 점수를 크게 흔드는 문제가 확인됐다(수요·소비 축,
 * Top1~3 제외 시 최대 24~59점 변동). log1p로 우편향된 규모형 raw 값을 압축한 뒤 min-max를 적용하면
 * 순위는 그대로 유지하면서 극단값의 지배력만 줄어든다(같은 조건에서 변동폭 약 25~35% 감소, QA 검증됨).
 * raw 값이 항상 음수가 아닌 규모/지수형 metric에만 적용 가능하다 — 증감률처럼 부호가 있는 값에는 절대
 * 쓰지 않는다(음수 입력 시 Math.log1p가 NaN을 낼 수 있음).
 */
export type NormalizationTransform = "LINEAR_MIN_MAX" | "LOG1P_MIN_MAX";

/**
 * transform에 따라 min-max 정규화를 적용한다 — LOG1P_MIN_MAX는 rawValue와 코호트 값 전체에
 * Math.log1p를 먼저 적용한 뒤 그 결과로 min-max를 계산한다(min-max 자체의 수식·clamp 정책은 그대로
 * 재사용, 별도 구현을 두지 않는다). 호출부(dna.ts)가 metric별로 어떤 transform을 쓸지 결정한다 — 이
 * 함수는 순수 수학 변환만 담당하고 "어떤 metric에 어떤 transform을 쓸지"는 알지 못한다.
 */
export function normalizeByTransform(
  transform: NormalizationTransform,
  rawValue: number,
  cohortValues: number[],
): number {
  if (transform === "LOG1P_MIN_MAX") {
    return minMaxNormalize(Math.log1p(rawValue), cohortValues.map((v) => Math.log1p(v)));
  }
  return minMaxNormalize(rawValue, cohortValues);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 내부 정밀도: 소수점 둘째 자리까지 고정. UI 표시는 이 값을 정수로 반올림한다. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** UI 표시용 반올림 규칙: 정수로 반올림. */
export function roundForDisplay(value: number): number {
  return Math.round(value);
}
