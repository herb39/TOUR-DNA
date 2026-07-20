export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "조건 입력 완료",
  ANALYZED: "분석 완료",
  PLANNED: "실행안 완료",
};

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatBaseYm(baseYm: string | null | undefined): string {
  if (!baseYm || baseYm.length !== 6) return "-";
  return `${baseYm.slice(0, 4)}년 ${Number(baseYm.slice(4, 6))}월`;
}
