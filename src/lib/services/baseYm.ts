/** "202509" -> "202508" 처럼 기준월(YYYYMM) 문자열의 전월을 계산한다. */
export function previousBaseYm(baseYm: string): string {
  const year = Number(baseYm.slice(0, 4));
  const month = Number(baseYm.slice(4, 6));
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}${String(prevMonth).padStart(2, "0")}`;
}
