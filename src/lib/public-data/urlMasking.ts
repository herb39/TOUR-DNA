/**
 * 로그·CLI 출력에 요청 URL을 남길 때 serviceKey 값을 절대 노출하지 않기 위한 순수 함수(2026-07-28).
 * verify:visitor-api 등 사람이 읽는 진단 출력에서 사용한다 — serviceKey 원문은 이 함수를 거치지 않고는
 * 어떤 로그에도 찍지 않는다.
 */
export function maskServiceKeyInUrl(url: string): string {
  return url.replace(/([?&]serviceKey=)[^&]+/gi, "$1***MASKED***");
}
