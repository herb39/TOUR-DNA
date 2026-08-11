/**
 * Phase 2-D(2026-08-12): TOUR_INFO(관광정보 POI 목록 API)는 baseYm에 종속되지 않는 정적 API다
 * (`fetchTourInfo`는 baseYm 파라미터 자체를 받지 않는다 — `src/lib/public-data/adapters/tourInfo.ts`).
 * 그런데 `DataSnapshot`은 baseYm별로 기록되기 때문에, 기존 completeness 게이트는 "이번 baseYm에
 * TOUR_INFO를 다시 호출해서 성공했는가"만 확인했다 — POI 데이터 자체가 지난달과 똑같아도 새
 * STAGING baseYm마다 전국 255개 지역을 무조건 재호출하게 되는 구조였다(quota 낭비).
 *
 * 이 파일은 그 판정을 "이번 baseYm에 새로 호출했는가"가 아니라 "재사용 가능한 최신 POI 데이터가
 * 있는가"로 바꾸는 순수 함수만 담는다. 실제 DB 조회(region별 가장 최근 TOUR_INFO SUCCESS/EMPTY
 * DataSnapshot의 fetchedAt)는 `src/lib/services/tourInfoFreshnessLookup.ts`가 맡는다.
 */

/**
 * TTL=60일 근거: 관광 POI(등록 시설 목록)는 월별 통계 지표(수요/체류/소비/다양성)보다 훨씬 느리게
 * 변한다 — 개별 시설의 개업·폐업은 보통 몇 달 단위로 일어난다. 매 STAGING baseYm(대략 매월)마다
 * 전국을 재호출하는 30일 TTL은 사실상 매번 재호출하는 것과 다를 게 없어 절감 효과가 없고, 반대로
 * 90일 이상은 최대 3회 sync 주기 동안 폐업 정보가 반영되지 않을 위험이 있다. 60일은 "한 번 최신화하면
 * 최소 한 번의 월간 sync 주기는 재호출을 건너뛴다"는 절감 효과와 "두 달을 넘겨 정보가 뒤처지지
 * 않는다"는 신선도 사이의 중간값이다 — 실제 폐업률 데이터가 쌓이면 재조정 대상이다(Phase 2-D 이후
 * 후속 검토 항목).
 */
export const TOUR_INFO_FRESHNESS_TTL_DAYS = 60;

export type TourInfoFreshnessState = "FRESH" | "STALE" | "NEVER_FETCHED";

export interface TourInfoFreshnessInput {
  /** 이 지역에서 TOUR_INFO가 SUCCESS 또는 EMPTY였던 가장 최근 DataSnapshot의 fetchedAt(baseYm
   * 무관 — 여러 baseYm 중 가장 최신). 이력이 전혀 없으면 null. 중간에 ERROR가 있었더라도, 그보다
   * 이전의 SUCCESS/EMPTY가 여전히 이 값이라면 그 시점 기준으로 freshness를 판단한다 — ERROR 시도는
   * 기존 POI 데이터를 전혀 바꾸지 않으므로(upsert 실패 시 덮어쓰지 않음) 재사용 가능성에 영향이
   * 없다. */
  lastSuccessOrEmptyFetchedAt: Date | null;
}

/**
 * region의 TOUR_INFO freshness를 판정한다. `now`를 주입할 수 있어 "오늘"에 의존하지 않고 결정론적으로
 * 테스트할 수 있다.
 */
export function classifyTourInfoFreshness(input: TourInfoFreshnessInput, now: Date): TourInfoFreshnessState {
  if (input.lastSuccessOrEmptyFetchedAt === null) return "NEVER_FETCHED";
  const ttlMs = TOUR_INFO_FRESHNESS_TTL_DAYS * 24 * 60 * 60 * 1000;
  const ageMs = now.getTime() - input.lastSuccessOrEmptyFetchedAt.getTime();
  if (ageMs < 0) return "FRESH"; // 시계 오차로 미래 timestamp가 들어와도 안전하게 fresh로 처리.
  return ageMs <= ttlMs ? "FRESH" : "STALE";
}
