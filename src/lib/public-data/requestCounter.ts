import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 실행 컨텍스트(sync 1회 실행) 단위로 실제 외부 API 요청 횟수를 집계한다(2026-08-10 도입).
 * 전역 mutable singleton을 쓰지 않고 `AsyncLocalStorage`로 컨텍스트를 격리한다 — 동시에 여러
 * sync가 실행되거나(예: cron과 수동 실행이 겹침) 테스트가 병렬로 도는 상황에서도 카운터가 서로
 * 섞이지 않는다. `withRequestCounter`로 감싼 비동기 콜백 내부에서 실행되는 모든
 * `fetchPublicDataJson` 호출만 집계되고, 그 밖(예: `verify-region-codes.ts` 같은 1회성 검증
 * 스크립트)에서의 호출은 컨텍스트가 없어 조용히 무시된다(카운터 유무를 강제하지 않음 — 관측용
 * 기능이 있고 없고가 API 호출 자체의 동작에 영향을 주면 안 되기 때문).
 *
 * 데이터소스 구분은 `fetchPublicDataJson`에 이미 전달되는 `sourceCode`(예: "TAR_SVC_DEM:STAY",
 * "TOU_DIV_IX:tou", "VISITOR_CNT:locgo", "TOUR_INFO")의 콜론 앞부분을 그대로 쓴다 — 새 분류 체계를
 * 만들지 않고 기존 sourceCode 명명 규칙과 그대로 일치시킨다.
 */

class RequestCounterStore {
  private readonly counts = new Map<string, number>();

  record(sourceCode: string): void {
    const key = sourceCode.split(":")[0];
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  snapshot(): RequestCountSnapshot {
    const byDataSource: Record<string, number> = {};
    let total = 0;
    for (const [key, count] of this.counts) {
      byDataSource[key] = count;
      total += count;
    }
    return { byDataSource, total };
  }
}

export interface RequestCountSnapshot {
  /** 데이터소스 코드(sourceCode의 ":" 앞부분) -> 실제 fetch() 시도 횟수(재시도 포함). */
  byDataSource: Record<string, number>;
  /** 모든 데이터소스를 합친 총 요청 수. */
  total: number;
}

const storage = new AsyncLocalStorage<RequestCounterStore>();

/**
 * `fetchPublicDataJson`이 실제로 `fetch()`를 시도할 때마다 호출한다(성공/실패/재시도 전부 포함 —
 * 네트워크로 나간 시도 자체가 기준이다). 현재 실행 컨텍스트에 카운터가 없으면(= `withRequestCounter`
 * 밖에서 호출된 경우) 아무 것도 하지 않는다.
 */
export function recordApiRequest(sourceCode: string): void {
  storage.getStore()?.record(sourceCode);
}

/**
 * 콜백 실행 동안 발생한 실제 API 요청 수를 격리된 컨텍스트에서 집계해 함께 반환한다. 콜백이 도중에
 * 조기 반환(가드 실패, quota 중단 등)하더라도 그 시점까지 기록된 값을 그대로 스냅샷으로 돌려준다.
 */
export async function withRequestCounter<T>(fn: () => Promise<T>): Promise<{ result: T; requestCounts: RequestCountSnapshot }> {
  const store = new RequestCounterStore();
  const result = await storage.run(store, fn);
  return { result, requestCounts: store.snapshot() };
}
