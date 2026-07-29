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
