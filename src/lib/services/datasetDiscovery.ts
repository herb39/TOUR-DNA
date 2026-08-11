import { getActiveDatasetBaseYm } from "./activeDataset";
import { findLatestCommonBaseYm, type LatestCommonBaseYmDeps } from "./latestCommonBaseYm";
import { probeTarSvcDemLive, probeTouResDemLive } from "./baseYmProbeAdapters";

/**
 * Phase 2-B(2026-08-11): 공공 API에 현재 ACTIVE보다 최신인 공통월이 등장했는지 저비용으로 확인한다.
 * 전국 255개 지역을 조회하지 않고, 기존 `findLatestCommonBaseYm`(대표 지역 1곳·TAR_SVC_DEM/
 * TOU_RES_DEM 2개 소스·확인한 개월 수 x 2회 HTTP 요청)을 그대로 재사용한다.
 *
 * TOU_DIV_IX는 `latestCommonBaseYm.ts`가 이미 의도적으로 제외한 이유(일일 호출 한도 소진 이력이
 * 있고 회복 시점이 확인되지 않음)를 그대로 따라 이 탐색에도 포함하지 않는다. TOUR_INFO는 baseYm에
 * 종속되지 않는 정적 API라 이 탐색과 무관하다(Poi 모델에 baseYm 필드 자체가 없음). VISITOR_CNT는
 * 전용 탐색기(`visitorBaseYmFinder.ts`)가 이미 있어 여기서 중복 호출하지 않는다 — 이 함수가 결정하는
 * 것은 "새 월이 있는지"뿐이며, "필수 4개 소스 전부가 그 달에 존재하는지"까지 확인하는 완전성 판정은
 * STAGING dataset을 실제로 sync한 뒤 `checkDatasetCompleteness`가 담당한다.
 */

export type SourceProbeStatus = "AVAILABLE" | "NOT_AVAILABLE" | "RATE_LIMITED" | "NOT_PROBED";

export interface DatasetSourceAvailability {
  TAR_SVC_DEM: SourceProbeStatus;
  TOU_RES_DEM: SourceProbeStatus;
  /** 의도적으로 탐색하지 않음(latestCommonBaseYm.ts 주석 — 일일 호출 한도 소진 이력). */
  TOU_DIV_IX: SourceProbeStatus;
  /** baseYm에 종속되지 않는 정적 API라 이 탐색과 무관. */
  TOUR_INFO: SourceProbeStatus;
  /** 전용 탐색기(visitorBaseYmFinder.ts)가 따로 있어 이 저비용 탐색에는 포함하지 않음. */
  VISITOR_CNT: SourceProbeStatus;
}

export type DatasetDiscoveryOutcome = "NO_ACTIVE_DATASET" | "NO_NEW_DATA" | "NEW_DATASET_CANDIDATE" | "RATE_LIMITED";

export interface DatasetDiscoveryResult {
  activeBaseYm: string | null;
  /** outcome이 "NEW_DATASET_CANDIDATE"일 때만 채워진다. */
  discoveredBaseYm: string | null;
  sourceAvailability: DatasetSourceAvailability;
  /** 이번 탐색이 실제로 발생시킨 HTTP 요청 수(재시도 제외 — 확인한 개월 수 x 2개 소스). */
  httpRequestCount: number;
  outcome: DatasetDiscoveryOutcome;
  message: string;
}

export type DiscoverLatestDatasetDeps = Partial<LatestCommonBaseYmDeps>;

function buildSourceAvailability(coreStatus: SourceProbeStatus): DatasetSourceAvailability {
  return {
    TAR_SVC_DEM: coreStatus,
    TOU_RES_DEM: coreStatus,
    TOU_DIV_IX: "NOT_PROBED",
    TOUR_INFO: "NOT_PROBED",
    VISITOR_CNT: "NOT_PROBED",
  };
}

/**
 * ACTIVE dataset의 baseYm과 API에서 확인 가능한 최신 공통월을 비교해, 새 STAGING dataset 후보가
 * 있는지 판정한다. 이 함수는 어떤 DB 쓰기도 하지 않는다(Dataset 테이블 생성은 호출부가
 * `ensureStagingDataset`으로 별도 수행) — 순수하게 "발견"만 담당한다.
 */
export async function discoverLatestDataset(deps: DiscoverLatestDatasetDeps = {}): Promise<DatasetDiscoveryResult> {
  const activeBaseYm = await getActiveDatasetBaseYm();

  const probeDeps: LatestCommonBaseYmDeps = {
    probeTarSvcDem: deps.probeTarSvcDem ?? probeTarSvcDemLive,
    probeTouResDem: deps.probeTouResDem ?? probeTouResDemLive,
    now: deps.now,
    maxLookback: deps.maxLookback,
  };

  const result = await findLatestCommonBaseYm(probeDeps);
  // findLatestCommonBaseYm(latestCommonBaseYm.ts)은 429를 감지한 달을 `checked`에 push하기 전에
  // 즉시 반환하므로, RATE_LIMITED일 때는 실제로 발생한 마지막 1개월치 요청이 checked.length에
  // 반영되지 않는다 — 그 1개월(2회)을 더해야 실제 HTTP 요청 수와 일치한다.
  const httpRequestCount = result.state === "RATE_LIMITED" ? (result.checked.length + 1) * 2 : result.checked.length * 2;

  if (result.state === "RATE_LIMITED") {
    return {
      activeBaseYm,
      discoveredBaseYm: null,
      sourceAvailability: buildSourceAvailability("RATE_LIMITED"),
      httpRequestCount,
      outcome: "RATE_LIMITED",
      message: `API 호출 한도(429)로 탐색을 중단했다: ${result.message}`,
    };
  }

  if (result.state === "NONE_FOUND") {
    return {
      activeBaseYm,
      discoveredBaseYm: null,
      sourceAvailability: buildSourceAvailability("NOT_AVAILABLE"),
      httpRequestCount,
      outcome: activeBaseYm ? "NO_NEW_DATA" : "NO_ACTIVE_DATASET",
      message: `확인 범위(${result.checked.length}개월) 안에서 TAR_SVC_DEM·TOU_RES_DEM 공통월을 찾지 못했다.`,
    };
  }

  // result.state === "FOUND" — baseYm은 항상 YYYYMM 6자리 문자열이라 사전식 비교가 그대로 시간 순서와 같다.
  const isNewerThanActive = activeBaseYm === null || result.baseYm > activeBaseYm;
  if (!isNewerThanActive) {
    return {
      activeBaseYm,
      discoveredBaseYm: null,
      sourceAvailability: buildSourceAvailability("AVAILABLE"),
      httpRequestCount,
      outcome: "NO_NEW_DATA",
      message: `발견된 공통월(${result.baseYm})이 현재 ACTIVE(${activeBaseYm})보다 최신이 아니다.`,
    };
  }

  return {
    activeBaseYm,
    discoveredBaseYm: result.baseYm,
    sourceAvailability: buildSourceAvailability("AVAILABLE"),
    httpRequestCount,
    outcome: "NEW_DATASET_CANDIDATE",
    message: `ACTIVE(${activeBaseYm ?? "없음"})보다 최신인 공통월 ${result.baseYm}을 발견했다.`,
  };
}
