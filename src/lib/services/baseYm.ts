/** "202509" -> "202508" 처럼 기준월(YYYYMM) 문자열의 전월을 계산한다. */
export function previousBaseYm(baseYm: string): string {
  const year = Number(baseYm.slice(0, 4));
  const month = Number(baseYm.slice(4, 6));
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}${String(prevMonth).padStart(2, "0")}`;
}

/** "202509" -> "202409"처럼 기준월(YYYYMM) 문자열의 전년 동월을 계산한다(2026-07-29, 방문자수
 * 증감률 화면 표시용 전년 동월 비교에 사용 — previousBaseYm과 달리 월은 그대로 두고 연도만 1 줄인다). */
export function previousYearSameMonth(baseYm: string): string {
  const year = Number(baseYm.slice(0, 4));
  const month = baseYm.slice(4, 6);
  return `${year - 1}${month}`;
}

/** baseYm 문자열이 허용 가능한 연도 범위인지 판단할 때 쓰는 하한(2020년 이전 데이터는 이 서비스가
 * 다루는 범위 밖이라고 본다) — 2026-08-08, CLI 입력 검증 도입. */
export const MIN_VALID_BASE_YM_YEAR = 2020;

/**
 * baseYm 문자열(사용자 입력이든 환경변수든)이 형식·범위상 유효한지 검증한다(2026-08-08 도입) — 실제
 * 데이터 존재 여부(공공데이터 API에 그 달 데이터가 실제로 있는지)는 별도 문제이며 이 함수는 확인하지
 * 않는다. 정확히 6자리 숫자, 월 01~12, 연도가 `MIN_VALID_BASE_YM_YEAR`~(now 기준 내년)인지만 본다.
 * `now`를 주입할 수 있어 테스트가 "오늘"에 의존하지 않는다.
 */
export function validateBaseYmFormat(value: string, now: Date = new Date()): { ok: true; baseYm: string } | { ok: false; error: string } {
  if (!/^\d{6}$/.test(value)) {
    return { ok: false, error: `baseYm은 정확히 숫자 6자리(YYYYMM)여야 합니다: "${value}"` };
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  if (month < 1 || month > 12) {
    return { ok: false, error: `월 값이 01~12 범위를 벗어났습니다: "${value}"` };
  }
  const maxYear = now.getFullYear() + 1;
  if (year < MIN_VALID_BASE_YM_YEAR || year > maxYear) {
    return {
      ok: false,
      error: `연도 값이 허용 범위(${MIN_VALID_BASE_YM_YEAR}~${maxYear})를 벗어났습니다: "${value}"`,
    };
  }
  return { ok: true, baseYm: value };
}
