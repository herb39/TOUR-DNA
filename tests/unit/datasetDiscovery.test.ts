// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2-B(2026-08-11) — 공공 API에 ACTIVE보다 최신인 공통월이 있는지 저비용으로 확인하는
 * `discoverLatestDataset`의 핵심 불변조건:
 * (1) 새 월이 없으면(ACTIVE와 같거나 더 과거) discoveredBaseYm은 null이다 — 호출부가 이걸로 dataset을
 *     만들지 않는다.
 * (2) ACTIVE보다 최신인 공통월을 찾으면 NEW_DATASET_CANDIDATE로 discoveredBaseYm을 채운다.
 * (3) HTTP 요청 수는 실제로 확인한 개월 수 x 2(TAR_SVC_DEM+TOU_RES_DEM)와 정확히 같다 — 전국 지역을
 *     조회하지 않는다는 것을 이 숫자로 검증한다.
 * (4) 429(RATE_LIMITED)면 즉시 멈추고 discoveredBaseYm은 null이다.
 * (5) 이 함수는 어떤 Dataset 쓰기도 하지 않는다(순수 discovery) — ensureStagingDataset은 별도 함수다.
 */

const getActiveDatasetBaseYm = vi.fn();
vi.mock("@/lib/services/activeDataset", () => ({
  getActiveDatasetBaseYm: (...args: unknown[]) => getActiveDatasetBaseYm(...args),
}));

// datasetDiscovery.ts는 기본 probe로 baseYmProbeAdapters.ts를 import하는데, 이 파일이 최상위에서
// `@/lib/db`를 읽는다 — 테스트에서는 항상 deps로 probe 함수를 주입해 실제로 호출되지는 않지만,
// import 시점에 DATABASE_URL 미설정으로 던지는 걸 막기 위해 db 모듈을 mock한다(다른 스위트와 동일 관례).
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { discoverLatestDataset } from "@/lib/services/datasetDiscovery";
import type { CoreSourceProbeResult } from "@/lib/services/latestCommonBaseYm";

function ok(hasData: boolean): CoreSourceProbeResult {
  return { ok: true, hasData, isRateLimited: false };
}
function rateLimited(): CoreSourceProbeResult {
  return { ok: false, hasData: false, isRateLimited: true, errorMessage: "HTTP 429" };
}

beforeEach(() => {
  getActiveDatasetBaseYm.mockReset();
});

describe("discoverLatestDataset", () => {
  it("발견된 공통월이 ACTIVE와 같으면 새 데이터 없음으로 판정하고 discoveredBaseYm은 null이다", async () => {
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    const probeTarSvcDem = vi.fn(async (baseYm: string) => ok(baseYm === "202606"));
    const probeTouResDem = vi.fn(async (baseYm: string) => ok(baseYm === "202606"));

    const result = await discoverLatestDataset({
      now: new Date("2026-08-11T00:00:00Z"),
      maxLookback: 4,
      probeTarSvcDem,
      probeTouResDem,
    });

    expect(result.outcome).toBe("NO_NEW_DATA");
    expect(result.discoveredBaseYm).toBeNull();
    expect(result.activeBaseYm).toBe("202606");
    // 직전월(202607)은 데이터 없음, 202606에서 FOUND — 2개월 x 2소스 = 4회.
    expect(result.httpRequestCount).toBe(4);
  });

  it("ACTIVE보다 최신인 공통월을 찾으면 NEW_DATASET_CANDIDATE로 discoveredBaseYm을 채운다", async () => {
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    const probeTarSvcDem = vi.fn(async (baseYm: string) => ok(baseYm === "202607"));
    const probeTouResDem = vi.fn(async (baseYm: string) => ok(baseYm === "202607"));

    const result = await discoverLatestDataset({
      now: new Date("2026-08-11T00:00:00Z"),
      maxLookback: 4,
      probeTarSvcDem,
      probeTouResDem,
    });

    expect(result.outcome).toBe("NEW_DATASET_CANDIDATE");
    expect(result.discoveredBaseYm).toBe("202607");
    expect(result.sourceAvailability.TAR_SVC_DEM).toBe("AVAILABLE");
    expect(result.sourceAvailability.TOU_RES_DEM).toBe("AVAILABLE");
    // 이 저비용 탐색은 TOU_DIV_IX/TOUR_INFO/VISITOR_CNT를 절대 확인하지 않는다.
    expect(result.sourceAvailability.TOU_DIV_IX).toBe("NOT_PROBED");
    expect(result.sourceAvailability.TOUR_INFO).toBe("NOT_PROBED");
    expect(result.sourceAvailability.VISITOR_CNT).toBe("NOT_PROBED");
    expect(result.httpRequestCount).toBe(2);
  });

  it("ACTIVE가 없는 상태에서 공통월을 못 찾으면 NO_ACTIVE_DATASET으로 구분한다", async () => {
    getActiveDatasetBaseYm.mockResolvedValue(null);
    const probeTarSvcDem = vi.fn(async () => ok(false));
    const probeTouResDem = vi.fn(async () => ok(false));

    const result = await discoverLatestDataset({
      now: new Date("2026-08-11T00:00:00Z"),
      maxLookback: 2,
      probeTarSvcDem,
      probeTouResDem,
    });

    expect(result.outcome).toBe("NO_ACTIVE_DATASET");
    expect(result.discoveredBaseYm).toBeNull();
    expect(result.httpRequestCount).toBe(4); // maxLookback=2 x 2소스
  });

  it("429가 감지되면 즉시 RATE_LIMITED로 멈추고 discoveredBaseYm은 null이다", async () => {
    getActiveDatasetBaseYm.mockResolvedValue("202606");
    const probeTarSvcDem = vi.fn(async () => rateLimited());
    const probeTouResDem = vi.fn(async () => ok(false));

    const result = await discoverLatestDataset({
      now: new Date("2026-08-11T00:00:00Z"),
      maxLookback: 4,
      probeTarSvcDem,
      probeTouResDem,
    });

    expect(result.outcome).toBe("RATE_LIMITED");
    expect(result.discoveredBaseYm).toBeNull();
    expect(result.sourceAvailability.TAR_SVC_DEM).toBe("RATE_LIMITED");
    // 429 확인 직후 멈추므로 그 이후 달은 확인하지 않는다 — 1개월치(2회)만 발생.
    expect(result.httpRequestCount).toBe(2);
    expect(probeTarSvcDem).toHaveBeenCalledTimes(1);
  });

  it("발견된 공통월이 ACTIVE보다 과거면(비정상 상황이지만) 새 데이터 없음으로 처리한다", async () => {
    getActiveDatasetBaseYm.mockResolvedValue("202608");
    const probeTarSvcDem = vi.fn(async (baseYm: string) => ok(baseYm === "202607"));
    const probeTouResDem = vi.fn(async (baseYm: string) => ok(baseYm === "202607"));

    const result = await discoverLatestDataset({
      now: new Date("2026-08-11T00:00:00Z"),
      maxLookback: 2,
      probeTarSvcDem,
      probeTouResDem,
    });

    expect(result.outcome).toBe("NO_NEW_DATA");
    expect(result.discoveredBaseYm).toBeNull();
  });
});
