/** CRON_SECRET이 비어있으면 어떤 요청도 인증되지 않는다(빈 문자열 우회 방지). */
export function isAuthorizedCronRequest(authorizationHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authorizationHeader === `Bearer ${secret}`;
}
