import { previousBaseYm } from "./baseYm";

/**
 * TAR_SVC_DEM(체류·소비)·TOU_RES_DEM(관광 서비스 수요) 두 API가 공통으로 제공하는 최신 완전월을
 * 찾는다(2026-08-08 도입, Batch 3~5 대비). `AreaTarDivService`(TOU_DIV_IX, 관광 다양성)는 최근
 * 세션에서 일일 호출 한도가 소진된 채 정확한 회복 시점이 확인되지 않아 **의도적으로 제외한다** —
 * 한도가 회복됐는지 별도로 확인한 뒤에만 이 목록에 추가한다. VISITOR_CNT는 이미 전용 탐색기
 * (`visitorBaseYmFinder.ts`)가 있어 여기서 중복 구현하지 않는다. TOUR_INFO(POI)는 날짜 개념 없이
 * 전체 목록을 반환하는 API라 이 탐색과 무관하다.
 *
 * `visitorBaseYmFinder.ts`와 같은 설계 원칙을 따른다: 이번 달은 절대 확인하지 않고 직전 달부터
 * 최대 `maxLookback`개월만 최신순으로 역탐색하며, 실제 API 호출·DB 접근은 전부 주입받아 이 파일은
 * `@/lib/db`를 import하지 않는다(DATABASE_URL 없이도 단위테스트 가능).
 */

export interface CoreSourceProbeResult {
  ok: boolean;
  /** 실제로 지표 값을 받았는지(EMPTY가 아닌지) — ok:true인데 hasData:false면 그 달에 데이터가 없다는 뜻. */
  hasData: boolean;
  /** ok:false일 때만 채워진다. */
  errorMessage?: string;
  /** HTTP 429(요청 한도 초과)로 실패했는지 — 이 경우 더 과거 달을 계속 시도해도 의미가 없으므로
   * 탐색을 즉시 중단해야 한다. */
  isRateLimited: boolean;
}

export interface LatestCommonBaseYmDeps {
  now?: Date;
  maxLookback?: number;
  probeTarSvcDem: (baseYm: string) => Promise<CoreSourceProbeResult>;
  probeTouResDem: (baseYm: string) => Promise<CoreSourceProbeResult>;
}

export interface CheckedMonth {
  baseYm: string;
  tarSvcDem: CoreSourceProbeResult;
  touResDem: CoreSourceProbeResult;
  bothHaveData: boolean;
}

export type LatestCommonBaseYmResult =
  | { state: "FOUND"; baseYm: string; checked: CheckedMonth[] }
  | { state: "RATE_LIMITED"; checked: CheckedMonth[]; message: string }
  | { state: "NONE_FOUND"; checked: CheckedMonth[] };

/**
 * 직전 달부터 최대 `maxLookback`개월(기본 4개월)을 역순으로 확인해, 두 API 모두 실제 데이터를 가진
 * 첫 달을 반환한다. 한 소스에서라도 429가 확인되면(isRateLimited) 그 즉시 탐색을 멈추고
 * RATE_LIMITED를 반환한다 — 더 호출해도 같은 결과일 가능성이 높고 한도만 더 소모하기 때문이다.
 * 공통월을 하나도 찾지 못하면 임의의 값을 대신 반환하지 않고 NONE_FOUND로 그 사실을 그대로 알린다
 * (호출부가 명시적으로 처리해야 한다 — 조용히 하드코딩 값으로 진행하지 않는다).
 */
export async function findLatestCommonBaseYm(deps: LatestCommonBaseYmDeps): Promise<LatestCommonBaseYmResult> {
  const { now, maxLookback = 4, probeTarSvcDem, probeTouResDem } = deps;
  const checked: CheckedMonth[] = [];

  let cursor = `${(now ?? new Date()).getFullYear()}${String((now ?? new Date()).getMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < maxLookback; i++) {
    cursor = previousBaseYm(cursor);
    const [tarSvcDem, touResDem] = await Promise.all([probeTarSvcDem(cursor), probeTouResDem(cursor)]);

    if (tarSvcDem.isRateLimited || touResDem.isRateLimited) {
      const message = tarSvcDem.isRateLimited ? tarSvcDem.errorMessage ?? "HTTP 429" : touResDem.errorMessage ?? "HTTP 429";
      return { state: "RATE_LIMITED", checked, message };
    }

    const bothHaveData = tarSvcDem.ok && tarSvcDem.hasData && touResDem.ok && touResDem.hasData;
    checked.push({ baseYm: cursor, tarSvcDem, touResDem, bothHaveData });
    if (bothHaveData) {
      return { state: "FOUND", baseYm: cursor, checked };
    }
  }

  return { state: "NONE_FOUND", checked };
}
