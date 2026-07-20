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
