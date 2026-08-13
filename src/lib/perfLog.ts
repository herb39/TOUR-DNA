/** 2026-08-13(임시 진단, Production 최초 Document ~6초 병목 조사) — Server Component 렌더 함수
 * 안에서 `performance.now()`를 직접 호출하면 react-hooks/purity 린트 규칙(컴포넌트는 순수해야 함)에
 * 걸린다. 계측 자체를 이 순수하지 않은 헬퍼 모듈로 옮겨 컴포넌트 본문에서는 이 함수만 호출한다.
 * 값(데이터 내용)은 로그에 남기지 않고 단계별 소요시간(ms)만 기록한다. 원인 확인 후 제거 예정. */
export function perfNow(): number {
  return performance.now();
}

export function perfMark(sinceMs: number, label: string): void {
  console.log(`[perf] ${label} ${(performance.now() - sinceMs).toFixed(0)}ms`);
}
