// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-07-28: syncVisitorCnt(enforceCombinedDateCompleteness)가 기초(locgo)·광역(metco) 둘 다 날짜
// 커버리지를 검사하므로, "완전한 월"로 취급되려면 두 응답 모두 byCode의 rawItems가 baseYm 전체 일자를
// 커버해야 한다(하나라도 비워두면 그 응답만이 아니라 반대쪽까지 함께 불완전으로 취급되어 저장 자체가
// 통째로 건너뛰어진다 — 2026-07-29 원자적 게이트). codeField만 다르고 나머지 구조는 같으므로 하나의
// 공통 헬퍼로 정리했다(signguCode=기초, areaCode=광역).
function fullMonthRawItems(
  baseYm: string,
  codeField: "signguCode" | "areaCode",
  code: string,
): Array<Record<string, unknown>> {
  const year = Number(baseYm.slice(0, 4));
  const month = Number(baseYm.slice(4, 6));
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, i) => ({
    [codeField]: code,
    touDivCd: "2",
    touNum: 1,
    baseYmd: `${baseYm}${String(i + 1).padStart(2, "0")}`,
  }));
}

/** 광역(metco)이 baseYm 전체를 커버하는 SUCCESS mock 값을 만든다. 이 테스트 스위트의 region.findMany
 * mock은 SIDO 조회에 빈 배열을 주므로, 아래 코드값은 실제 어느 Region에도 매핑되지 않는다 — 원자적
 * 게이트가 "광역도 완전하다"고 판단하게 만드는 용도로만 쓴다. */
function metcoFullMonthSuccess(baseYm: string, code = "30") {
  return {
    status: "SUCCESS" as const,
    byCode: new Map([
      [code, { code, name: null, localNum: 0, otherDomesticNum: 0, foreignNum: 0, visitorCnt: 0, rawItems: fullMonthRawItems(baseYm, "areaCode", code) }],
    ]),
    resultCode: "0000",
    resultMsg: "OK",
    rawPages: [{ dummy: true }],
  };
}

// vi.mock 팩토리는 파일 상단으로 hoist되므로, 그 안에서 참조하는 값은 vi.hoisted로 함께 hoist해야 한다.
const {
  dataSnapshotStore,
  dataSnapshotUpsert,
  dataSnapshotFindUnique,
  dataSnapshotFindMany,
  dataSnapshotGroupBy,
  normalizedMetricStore,
  normalizedMetricUpsert,
  normalizedMetricUpdateMany,
  poiUpsert,
  poiFindMany,
  syncLogCreate,
  DATA_SOURCES,
  REGION,
  SIDO_REGION,
  regionFindMany,
  regionFindUnique,
  dataSourceFindUnique,
} = vi.hoisted(() => {
  // 실제 DataSnapshot 테이블의 upsert/조회 동작을 흉내 내는 최소 인메모리 fake.
  // Phase 1-B 보완(2026-07-23)의 "기존 SUCCESS/EMPTY 보존" 정책은 upsertSnapshot()이 쓰기 전에
  // 먼저 findUnique로 기존 status를 읽으므로, mock도 상태를 가져야 그 분기를 검증할 수 있다.
  const store = new Map<string, { status: string; resultCode: unknown; resultMsg: unknown; itemCount: number; rawPayload: unknown }>();
  function keyOf(w: { dataSourceId: string; regionId: string; baseYm: string }) {
    return `${w.dataSourceId}|${w.regionId}|${w.baseYm}`;
  }
  // NormalizedMetric도 같은 이유로 상태를 가진 fake가 필요하다 — markMetricsAsCached()가
  // provenance==="LIVE_API"인 행만 골라 CACHED_API로 바꾸는 것을 검증하려면 실제로 저장된 provenance를
  // 읽고 걸러낼 수 있어야 한다.
  const metricStore = new Map<string, Record<string, unknown>>();
  function metricKeyOf(w: { regionId: string; baseYm: string; metricCode: string }) {
    return `${w.regionId}|${w.baseYm}|${w.metricCode}`;
  }
  return {
    dataSnapshotStore: store,
    dataSnapshotUpsert: vi.fn(async ({ where, update, create }: { where: { dataSourceId_regionId_baseYm: { dataSourceId: string; regionId: string; baseYm: string } }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
      const k = keyOf(where.dataSourceId_regionId_baseYm);
      const existing = store.get(k);
      const next = existing ? { ...existing, ...update } : { ...create };
      store.set(k, next as never);
      return next;
    }),
    dataSnapshotFindUnique: vi.fn(async ({ where }: { where: { dataSourceId_regionId_baseYm: { dataSourceId: string; regionId: string; baseYm: string } } }) => {
      const k = keyOf(where.dataSourceId_regionId_baseYm);
      return store.get(k) ?? null;
    }),
    // VISITOR_CNT 완료 여부를 한 번에 확인하는 isVisitorCntComplete()가 쓰는 findMany — 실제 Prisma의
    // where 절(dataSourceId/baseYm/regionId in [...]/status in [...])을 그대로 흉내 낸다. store의 키
    // (`dataSourceId|regionId|baseYm`)에서 regionId를 역으로 파싱해 select:{regionId:true} 모양을 맞춘다.
    dataSnapshotFindMany: vi.fn(
      async ({
        where,
      }: {
        where: { dataSourceId: string; baseYm: string; regionId: { in: string[] }; status: { in: string[] } };
      }) => {
        const matches: Array<{ regionId: string }> = [];
        for (const [key, value] of store) {
          const [dataSourceId, regionId, baseYm] = key.split("|");
          if (
            dataSourceId === where.dataSourceId &&
            baseYm === where.baseYm &&
            where.regionId.in.includes(regionId) &&
            where.status.in.includes(value.status)
          ) {
            matches.push({ regionId });
          }
        }
        return matches;
      },
    ),
    // Phase 2-D(2026-08-12) TOUR_INFO freshness 조회(fetchTourInfoLastFreshFetchByRegion)가 쓰는
    // groupBy — 기본값은 빈 배열(이력 없음 = NEVER_FETCHED)이라 기존 테스트들의 "TOUR_INFO가 항상
    // 실제로 호출된다"는 기대가 그대로 유지된다. TTL 재사용을 검증하는 테스트만 개별적으로
    // mockResolvedValueOnce로 값을 채운다.
    dataSnapshotGroupBy: vi.fn().mockResolvedValue([]),
    normalizedMetricStore: metricStore,
    normalizedMetricUpsert: vi.fn(async ({ where, update, create }: { where: { regionId_baseYm_metricCode: { regionId: string; baseYm: string; metricCode: string } }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
      const k = metricKeyOf(where.regionId_baseYm_metricCode);
      const existing = metricStore.get(k);
      const next = existing ? { ...existing, ...update } : { ...create };
      metricStore.set(k, next);
      return next;
    }),
    normalizedMetricUpdateMany: vi.fn(async ({ where, data }: { where: { regionId: string; baseYm: string; metricCode: { in: string[] }; provenance: string }; data: Record<string, unknown> }) => {
      let count = 0;
      for (const [k, row] of metricStore.entries()) {
        if (
          row.regionId === where.regionId &&
          row.baseYm === where.baseYm &&
          where.metricCode.in.includes(row.metricCode as string) &&
          row.provenance === where.provenance
        ) {
          metricStore.set(k, { ...row, ...data });
          count++;
        }
      }
      return { count };
    }),
    poiUpsert: vi.fn().mockResolvedValue(undefined),
    poiFindMany: vi.fn().mockResolvedValue([]),
    syncLogCreate: vi.fn().mockResolvedValue(undefined),
    regionFindMany: vi.fn(),
    regionFindUnique: vi.fn(),
    dataSourceFindUnique: vi.fn(),
    DATA_SOURCES: [
      { id: "src-tar-svc-dem", code: "TAR_SVC_DEM", baseUrl: "https://example.test/tar-svc-dem" },
      { id: "src-tou-div-ix", code: "TOU_DIV_IX", baseUrl: "https://example.test/tou-div-ix" },
      { id: "src-tou-res-dem", code: "TOU_RES_DEM", baseUrl: "https://example.test/tou-res-dem" },
      { id: "src-visitor-cnt", code: "VISITOR_CNT", baseUrl: "https://example.test/visitor-cnt" },
      { id: "src-tour-info", code: "TOUR_INFO", baseUrl: "https://example.test/tour-info" },
    ],
    REGION: {
      id: "region-1",
      code: "TEST_REGION",
      name: "테스트지역",
      level: "SIGUNGU",
      apiAreaCode: "30",
      apiSigunguCode: "30200",
      tourApiAreaCode: "3",
      tourApiLdongRegnCd: "30",
      tourApiLdongSignguCd: "30200",
    },
    SIDO_REGION: {
      id: "region-sido-1",
      code: "TEST_SIDO",
      name: "테스트시도",
      level: "SIDO",
      apiAreaCode: "30",
      apiSigunguCode: null,
      tourApiAreaCode: "3",
      tourApiLdongRegnCd: "30",
      tourApiLdongSignguCd: null,
    },
  };
});

// VISITOR_CNT(DataLabService)는 지역 필터가 없는 전국 API라 syncService.ts가 SIGUNGU 루프와 별도로
// SIDO 목록도 조회한다(region.findMany({ where: { level: "SIDO" } })) — REGION(SIGUNGU)이 SIDO 조회
// 에서도 잘못 반환되지 않도록 where.level을 실제로 구분한다.
regionFindMany.mockImplementation(async (args?: { where?: { level?: string } }) => {
  if (args?.where?.level === "SIDO") return [];
  return [REGION];
});

// --region-code 필터(2026-08-08)가 API 호출 전에 조회하는 findUnique — 기본값은 REGION/SIDO_REGION
// 코드만 인식하고 그 외는 존재하지 않는 지역으로 처리한다.
regionFindUnique.mockImplementation(async (args?: { where?: { code?: string } }) => {
  if (args?.where?.code === REGION.code) return REGION;
  if (args?.where?.code === SIDO_REGION.code) return SIDO_REGION;
  return null;
});

// fetchTourInfoLastFreshFetchByRegion()이 조회하는 dataSource.findUnique({where:{code:"TOUR_INFO"}}).
dataSourceFindUnique.mockImplementation(async (args?: { where?: { code?: string } }) => {
  return DATA_SOURCES.find((d) => d.code === args?.where?.code) ?? null;
});

// 실제 외부 API를 호출하지 않는다 — 5개 어댑터를 전부 mock으로 대체한다.
vi.mock("@/lib/public-data/adapters/tarSvcDem", () => ({ fetchTarSvcDem: vi.fn() }));
vi.mock("@/lib/public-data/adapters/touDivIx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-data/adapters/touDivIx")>();
  return { ...actual, fetchTouDivIx: vi.fn() };
});
vi.mock("@/lib/public-data/adapters/touResDem", () => ({ fetchTouResDem: vi.fn() }));
// importOriginal로 partial mock — fetchLocgoRegnVisitr/fetchMetcoRegnVisitr만 vi.fn()으로 바꾸고,
// monthToYmdRange 등 나머지 실제 export는 그대로 둔다. 이 모듈을 통째로 stub하면
// visitorMonthCompleteness.ts가 같은 모듈에서 import하는 monthToYmdRange까지 undefined가 되어
// syncService.ts 내부에서 날짜 완전성 계산이 깨진다(2026-07-29 실패 원인). 앞으로 이 모듈에 새 export가
// 추가돼도 이 패턴이면 자동으로 실제 값을 유지하므로 같은 문제가 반복되지 않는다.
vi.mock("@/lib/public-data/adapters/visitorCnt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-data/adapters/visitorCnt")>();
  return { ...actual, fetchLocgoRegnVisitr: vi.fn(), fetchMetcoRegnVisitr: vi.fn() };
});
vi.mock("@/lib/public-data/adapters/tourInfo", () => ({
  fetchTourInfo: vi.fn(),
  mapContentTypeToPoiCategory: vi.fn(() => "ATTRACTION"),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    dataSource: { findMany: vi.fn().mockResolvedValue(DATA_SOURCES), findUnique: dataSourceFindUnique },
    region: { findMany: regionFindMany, findUnique: regionFindUnique },
    poi: { findMany: poiFindMany, upsert: poiUpsert },
    normalizedMetric: { upsert: normalizedMetricUpsert, updateMany: normalizedMetricUpdateMany },
    dataSnapshot: {
      upsert: dataSnapshotUpsert,
      findUnique: dataSnapshotFindUnique,
      findMany: dataSnapshotFindMany,
      groupBy: dataSnapshotGroupBy,
    },
    syncLog: { create: syncLogCreate },
  },
}));

import { runTourismDataSync, runResumableLocalBatchSync } from "@/lib/services/syncService";
import { fetchTarSvcDem } from "@/lib/public-data/adapters/tarSvcDem";
import {
  EXP_DIV_CODES,
  INTL_DIV_CODE_NATIONALITY,
  TOU_DIV_CODES,
  fetchTouDivIx,
  isTouDivIxRawComplete,
} from "@/lib/public-data/adapters/touDivIx";
import { fetchTouResDem } from "@/lib/public-data/adapters/touResDem";
import { fetchLocgoRegnVisitr, fetchMetcoRegnVisitr } from "@/lib/public-data/adapters/visitorCnt";
import { fetchTourInfo } from "@/lib/public-data/adapters/tourInfo";

// 어댑터 mock 기본값 — "네트워크 실패로 실제 본문이 전혀 없다"에 해당하는 raw를 반환해, 이 테스트에서
// 직접 다루지 않는 소스는 snapshot이 쓰이지 않는 것을 자연스럽게 보장한다(각 테스트가 관심 소스만 override).
function resetAdapterMocksToNoRealBody() {
  vi.mocked(fetchTarSvcDem).mockResolvedValue({
    status: "ERROR",
    items: [],
    resultCode: "NETWORK_ERROR",
    resultMsg: "mock: no body",
    raw: { stay: null, spend: null },
  });
  vi.mocked(fetchTouDivIx).mockResolvedValue({
    status: "ERROR",
    composite: null,
    breakdown: null,
    resultMsg: "mock: no body",
    itemCount: 0,
    raw: { tou: [], exp: [], intl: { code: "3303", data: null } },
    quotaSignal: null,
  });
  vi.mocked(fetchTouResDem).mockResolvedValue({
    status: "ERROR",
    items: [],
    resultCode: "NETWORK_ERROR",
    resultMsg: "mock: no body",
    raw: null,
  });
  vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
    status: "ERROR",
    byCode: null,
    resultCode: "NETWORK_ERROR",
    resultMsg: "mock: no body",
    rawPages: [],
  });
  vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue({
    status: "ERROR",
    byCode: null,
    resultCode: "NETWORK_ERROR",
    resultMsg: "mock: no body",
    rawPages: [],
  });
  vi.mocked(fetchTourInfo).mockResolvedValue({
    status: "ERROR",
    items: [],
    resultCode: "NETWORK_ERROR",
    resultMsg: "mock: no body",
    raw: { pages: [] },
  });
}

function touDivRawWithAllCodes(options: { missing?: string[] } = {}) {
  const missing = new Set(options.missing ?? []);
  return {
    tou: TOU_DIV_CODES.map((code) => ({ code, data: missing.has(code) ? null : { value: 1 } })),
    exp: EXP_DIV_CODES.map((code) => ({ code, data: missing.has(code) ? null : { value: 1 } })),
    intl: {
      code: INTL_DIV_CODE_NATIONALITY,
      data: missing.has(INTL_DIV_CODE_NATIONALITY) ? null : { value: 1 },
    },
  };
}

beforeEach(() => {
  process.env.TOUR_API_SERVICE_KEY = "test-key";
  process.env.DATA_MODE = "live";
  // 원격 DB 안전장치(2026-08-08)가 기본적으로 DATABASE_URL을 확인하므로, 이 테스트 스위트의 기존
  // 동작을 그대로 검증하려면 로컬 대상으로 설정해 둔다 — 안전장치 자체의 동작은 별도 describe에서
  // process.env.DATABASE_URL을 개별적으로 바꿔가며 확인한다.
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test_db";
  delete process.env.ALLOW_REMOTE_DATA_SYNC;
  vi.clearAllMocks();
  poiFindMany.mockResolvedValue([]);
  dataSnapshotStore.clear();
  normalizedMetricStore.clear();
  resetAdapterMocksToNoRealBody();
});

afterEach(() => {
  delete process.env.TOUR_API_SERVICE_KEY;
  delete process.env.DATA_MODE;
  delete process.env.DATABASE_URL;
  delete process.env.ALLOW_REMOTE_DATA_SYNC;
});

describe("runTourismDataSync — Phase 1-B DataSnapshot 저장", () => {
  it("지표 API 성공 응답의 실제 rawPayload와 메타데이터를 DataSnapshot에 저장한다", async () => {
    const realStayBody = {
      response: {
        header: { resultCode: "0000", resultMsg: "OK" },
        body: {
          items: { item: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: "88.29" }] },
          numOfRows: 10,
          pageNo: 1,
          totalCount: 1,
        },
      },
    };
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 88.29 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: realStayBody, spend: null },
    });

    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    const call = dataSnapshotUpsert.mock.calls.find(
      (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-tar-svc-dem",
    );
    if (!call) throw new Error("TAR_SVC_DEM dataSnapshot.upsert 호출을 찾지 못함");
    expect(call[0].create.status).toBe("SUCCESS");
    expect(call[0].create.resultCode).toBe("0000");
    expect(call[0].create.resultMsg).toBe("OK");
    expect(call[0].create.itemCount).toBe(1);
    // 실제로 받은 본문 그대로 — 재조립하거나 지어낸 값이 아니다.
    expect(call[0].create.rawPayload).toEqual({ stay: realStayBody, spend: null });
  });

  it("POI(TOUR_INFO) API 성공 응답의 페이지 원본을 DataSnapshot에 저장한다", async () => {
    const realPageBody = {
      response: {
        header: { resultCode: "0000", resultMsg: "OK" },
        body: {
          items: { item: [{ title: "갑천", addr1: "대전 유성구", contenttypeid: "12", mapx: "127.3", mapy: "36.3" }] },
          numOfRows: 1000,
          pageNo: 1,
          totalCount: 1,
        },
      },
    };
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "갑천", addr1: "대전 유성구", contenttypeid: "12", mapx: 127.3, mapy: 36.3 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [realPageBody] },
    });

    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    const call = dataSnapshotUpsert.mock.calls.find(
      (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-tour-info",
    );
    if (!call) throw new Error("TOUR_INFO dataSnapshot.upsert 호출을 찾지 못함");
    expect(call[0].create.status).toBe("SUCCESS");
    expect(call[0].create.rawPayload).toEqual({ pages: [realPageBody] });
  });

  it("POI upsert 시 신 분류체계(lclsSystm1~3) 필드가 rawPayload에 그대로 보존된다", () => {
    poiFindMany.mockResolvedValue([]);
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [
        {
          title: "테스트지역맛집",
          addr1: "테스트지역 어딘가",
          contenttypeid: "39",
          mapx: 127.3,
          mapy: 36.3,
          lclsSystm1: "FD",
          lclsSystm2: "FD03",
          lclsSystm3: "FD030100",
        },
      ],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [] },
    });

    return runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" }).then(() => {
      const call = poiUpsert.mock.calls.find((c) => c[0].create?.name === "테스트지역맛집");
      if (!call) throw new Error("테스트지역맛집 poi.upsert 호출을 찾지 못함");
      expect(call[0].create.rawPayload.lclsSystm3).toBe("FD030100");
      expect(call[0].create.rawPayload.cat3).toBeUndefined();
    });
  });

  /** 2026-08-07 지원지역 확대 — "대구 중구"라는 표시명은 실제 주소("대구광역시 중구 ...")에 부분
   * 문자열로 나타나지 않아, POI 주소 필터를 region.name 그대로 쓰면 정상 POI까지 전부 걸러진다.
   * TOUR_INFO_ADDRESS_FILTER_OVERRIDE가 이 지역을 "중구"로 override하는지 회귀 검증한다. */
  it("SGG_DAEGU_JUNG은 주소 필터 override(\"중구\")를 사용해, region.name(\"대구 중구\")과 정확히 일치하지 않는 실제 주소도 POI로 채택한다", () => {
    poiFindMany.mockResolvedValue([]);
    regionFindMany.mockImplementationOnce(async (args?: { where?: { level?: string } }) => {
      if (args?.where?.level === "SIDO") return [];
      return [{ ...REGION, code: "SGG_DAEGU_JUNG", name: "대구 중구" }];
    });
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "중구맛집", addr1: "대구광역시 중구 동성로", contenttypeid: "39", mapx: 128.6, mapy: 35.87 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [] },
    });

    return runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" }).then(() => {
      const call = poiUpsert.mock.calls.find((c) => c[0].create?.name === "중구맛집");
      if (!call) throw new Error("중구맛집 poi.upsert 호출을 찾지 못함(주소 필터에 걸러졌을 가능성)");
    });
  });

  it("API가 실제 오류 응답 본문을 반환하면 그 본문 그대로 ERROR 상태로 snapshot을 저장한다", async () => {
    // data.go.kr의 실제 에러 구조(response 래퍼 없는 플랫 구조, docs/public-api-status.md 참고).
    const realErrorBody = { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" };
    vi.mocked(fetchTouResDem).mockResolvedValue({
      status: "ERROR",
      items: [],
      resultCode: "10",
      resultMsg: "INVALID_REQUEST_PARAMETER_ERROR",
      raw: realErrorBody,
    });

    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    const call = dataSnapshotUpsert.mock.calls.find(
      (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-tou-res-dem",
    );
    if (!call) throw new Error("TOU_RES_DEM dataSnapshot.upsert 호출을 찾지 못함");
    expect(call[0].create.status).toBe("ERROR");
    expect(call[0].create.resultCode).toBe("10");
    expect(call[0].create.resultMsg).toBe("INVALID_REQUEST_PARAMETER_ERROR");
    // 가짜 "0000"/"NORMAL SERVICE."가 아니라 실제로 받은 에러 본문 그대로다.
    expect(call[0].create.rawPayload).toEqual(realErrorBody);
  });

  it("네트워크 실패 등으로 실제 응답 본문이 전혀 없으면 해당 소스의 snapshot을 쓰지 않는다", async () => {
    // beforeEach의 기본 mock이 이미 전부 raw:null/빈 상태 — 아무 소스도 override하지 않는다.
    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(dataSnapshotUpsert).not.toHaveBeenCalled();
  });

  it("동일 입력으로 재실행해도 같은 unique key로 upsert하며 무한히 새 row를 만들지 않는다", async () => {
    vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
      status: "SUCCESS",
      byCode: new Map([
        [
          "30200",
          {
            code: "30200",
            name: "유성구",
            localNum: 1000,
            otherDomesticNum: 12000,
            foreignNum: 345,
            visitorCnt: 12345,
            rawItems: fullMonthRawItems("202606", "signguCode", "30200"),
          },
        ],
      ]),
      resultCode: "0000",
      resultMsg: "OK",
      rawPages: [{ response: { header: { resultCode: "0000", resultMsg: "OK" } } }],
    });
    // 광역도 완전해야 원자적 게이트를 통과해 저장된다 — 없으면(기본 mock은 ERROR) 이 테스트가 검증하려는
    // "재실행 시 중복 row 방지" 자체를 확인할 수 없다.
    vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue(metcoFullMonthSuccess("202606"));

    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    const calls = dataSnapshotUpsert.mock.calls.filter(
      (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
    );
    expect(calls).toHaveLength(2);
    // 두 번 다 정확히 같은 where(unique key) 조건으로 upsert를 호출한다 — create 전용 호출이 아니다.
    expect(calls[0][0].where).toEqual(calls[1][0].where);
  });

  describe("SUCCESS/ERROR 전이에 따른 snapshot 보존·갱신 정책(2026-07-23 보완)", () => {
    const KEY = "src-tou-res-dem|region-1|202606";

    it("기존 SUCCESS 이후 같은 key에 ERROR가 와도 기존 SUCCESS rawPayload/메타데이터가 보존된다", async () => {
      const realSuccessBody = { response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: { item: [] } } } };
      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "SUCCESS",
        items: [{ baseYm: "202606", tarSvcDemIxCd: "1101", tarSvcDemIxVal: 72.88 }],
        resultCode: "0000",
        resultMsg: "OK",
        raw: realSuccessBody,
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
      const afterSuccess = dataSnapshotStore.get(KEY);
      expect(afterSuccess?.status).toBe("SUCCESS");
      expect(afterSuccess?.rawPayload).toEqual(realSuccessBody);
      // 이번 실행에서 실제 성공 응답으로 갱신됐으므로 metric provenance는 LIVE_API다.
      expect(normalizedMetricStore.get("region-1|202606|tarSvcDemIxVal")?.provenance).toBe("LIVE_API");

      const realErrorBody = { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" };
      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "ERROR",
        items: [],
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR",
        raw: realErrorBody,
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      const afterError = dataSnapshotStore.get(KEY);
      // 마지막 정상 스냅샷이 그대로 보존된다 — 이번 오류로 덮어쓰이지 않았다.
      expect(afterError?.status).toBe("SUCCESS");
      expect(afterError?.resultCode).toBe("0000");
      expect(afterError?.resultMsg).toBe("OK");
      expect(afterError?.rawPayload).toEqual(realSuccessBody);
      // upsert 자체가 두 번째 실행에서는 이 key에 대해 호출되지 않았어야 한다(쓰기 자체를 건너뜀).
      const callsForKey = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-tou-res-dem",
      );
      expect(callsForKey).toHaveLength(1);
      // CACHED_API 판정: "최신 호출이 실패해 이전 성공값을 재사용한다"는 사실을 이 실행 컨텍스트가
      // 알고 있는 유일한 순간에, 기존 LIVE_API metric을 CACHED_API로 낮춘다.
      expect(normalizedMetricStore.get("region-1|202606|tarSvcDemIxVal")?.provenance).toBe("CACHED_API");
    });

    it("기존 snapshot이 없는 최초 호출에서 실제 ERROR 응답 본문을 ERROR snapshot으로 저장한다", async () => {
      expect(dataSnapshotStore.get(KEY)).toBeUndefined();
      const realErrorBody = { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" };
      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "ERROR",
        items: [],
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR",
        raw: realErrorBody,
      });

      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      const stored = dataSnapshotStore.get(KEY);
      expect(stored?.status).toBe("ERROR");
      expect(stored?.resultCode).toBe("10");
      expect(stored?.rawPayload).toEqual(realErrorBody);
    });

    it("기존 ERROR 이후 정상 응답을 받으면 SUCCESS snapshot으로 갱신된다", async () => {
      const realErrorBody = { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" };
      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "ERROR",
        items: [],
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR",
        raw: realErrorBody,
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
      expect(dataSnapshotStore.get(KEY)?.status).toBe("ERROR");

      const realSuccessBody = { response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: { item: [] } } } };
      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "SUCCESS",
        items: [{ baseYm: "202606", tarSvcDemIxCd: "1101", tarSvcDemIxVal: 72.88 }],
        resultCode: "0000",
        resultMsg: "OK",
        raw: realSuccessBody,
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      const stored = dataSnapshotStore.get(KEY);
      expect(stored?.status).toBe("SUCCESS");
      expect(stored?.rawPayload).toEqual(realSuccessBody);
      const callsForKey = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-tou-res-dem",
      );
      expect(callsForKey).toHaveLength(2); // ERROR 생성 + SUCCESS로 갱신, 둘 다 실제로 upsert를 호출했다.
    });

    it("두 번째 실행이 ERROR면 기존 정상 metric이 다시 upsert되지 않는다", async () => {
      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "SUCCESS",
        items: [{ baseYm: "202606", tarSvcDemIxCd: "1101", tarSvcDemIxVal: 72.88 }],
        resultCode: "0000",
        resultMsg: "OK",
        raw: { response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: { item: [] } } } },
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
      const metricCallsAfterSuccess = normalizedMetricUpsert.mock.calls.length;
      expect(metricCallsAfterSuccess).toBeGreaterThan(0);

      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "ERROR",
        items: [],
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR",
        raw: { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" },
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      // ERROR 응답에서는 upsertMetric 분기 자체가 실행되지 않으므로 호출 수가 늘지 않아야 한다.
      expect(normalizedMetricUpsert.mock.calls.length).toBe(metricCallsAfterSuccess);
    });

    it("provenance가 NULL(과거 미분류 레코드)인 metric은 ERROR가 나도 CACHED_API로 격상되지 않는다", async () => {
      // seed.ts가 만든 legacy 레코드를 흉내 낸다 — provenance가 아예 없다(LIVE_API였다는 근거가 없음).
      normalizedMetricStore.set("region-1|202606|tarSvcDemIxVal", {
        regionId: "region-1",
        baseYm: "202606",
        metricCode: "tarSvcDemIxVal",
        rawValue: 70,
        unit: "지수",
        adminLevel: "SIGUNGU",
        sourceId: "src-tou-res-dem",
        provenance: null,
      });
      // 같은 key에 SUCCESS/EMPTY 스냅샷이 이미 있어야 다음 ERROR가 "보존" 분기를 타서 markMetricsAsCached가
      // 호출된다. 여기서는 EMPTY로 채워 둔다(상태값 자체가 SUCCESS/EMPTY 중 하나면 충분).
      dataSnapshotStore.set(KEY, {
        status: "EMPTY",
        resultCode: "0000",
        resultMsg: "OK",
        itemCount: 0,
        rawPayload: { response: { header: { resultCode: "0000", resultMsg: "OK" }, body: { items: { item: "" } } } },
      });

      vi.mocked(fetchTouResDem).mockResolvedValue({
        status: "ERROR",
        items: [],
        resultCode: "10",
        resultMsg: "INVALID_REQUEST_PARAMETER_ERROR",
        raw: { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" },
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      // "이전에 LIVE_API였다"는 근거가 없으므로 NULL 그대로 남는다 — CACHED_API로 임의 승격하지 않는다.
      expect(normalizedMetricStore.get("region-1|202606|tarSvcDemIxVal")?.provenance).toBeNull();
    });

    it("VISITOR_CNT는 신규 API 성공 응답이면 LIVE_API로 기록되고, 현지인 합계는 VISITOR_CNT_LOCAL로 별도 기록된다", async () => {
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          [
            "30200",
            {
              code: "30200",
              name: "유성구",
              localNum: 500,
              otherDomesticNum: 700,
              foreignNum: 299,
              visitorCnt: 999,
              rawItems: fullMonthRawItems("202606", "signguCode", "30200"),
            },
          ],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ response: { header: { resultCode: "0000", resultMsg: "OK" } } }],
      });
      vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue(metcoFullMonthSuccess("202606"));

      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.provenance).toBe("LIVE_API");
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.rawValue).toBe(999);
      expect(normalizedMetricStore.get("region-1|202606|visitorCntLocal")?.provenance).toBe("LIVE_API");
      expect(normalizedMetricStore.get("region-1|202606|visitorCntLocal")?.rawValue).toBe(500);
      // 완전성 검증 마커 — checkVisitorCntCacheViaDataSnapshot이 이 마커가 있는 스냅샷만 캐시로 인정한다.
      const snapshot = dataSnapshotStore.get("src-visitor-cnt|region-1|202606");
      expect((snapshot?.rawPayload as { completeMonthVerified?: unknown })?.completeMonthVerified).toBe(true);
    });

    it("VISITOR_CNT 기존 SUCCESS 스냅샷은 이후 ERROR가 와도 보존되고 metric은 CACHED_API로 낮아진다", async () => {
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          [
            "30200",
            {
              code: "30200",
              name: "유성구",
              localNum: 500,
              otherDomesticNum: 700,
              foreignNum: 299,
              visitorCnt: 999,
              rawItems: fullMonthRawItems("202606", "signguCode", "30200"),
            },
          ],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ response: { header: { resultCode: "0000", resultMsg: "OK" } } }],
      });
      vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue(metcoFullMonthSuccess("202606"));
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.provenance).toBe("LIVE_API");

      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "ERROR",
        byCode: null,
        resultCode: "99",
        resultMsg: "SERVICE ERROR",
        rawPages: [{ resultCode: "99", resultMsg: "SERVICE ERROR" }],
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      const key = "src-visitor-cnt|region-1|202606";
      expect(dataSnapshotStore.get(key)?.status).toBe("SUCCESS");
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.provenance).toBe("CACHED_API");
      expect(normalizedMetricStore.get("region-1|202606|visitorCntLocal")?.provenance).toBe("CACHED_API");
      const callsForKey = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      );
      expect(callsForKey).toHaveLength(1); // 두 번째 실행에서는 쓰기 자체를 건너뛴다(보존).
    });

    it("VISITOR_CNT 응답의 baseYmd가 월 일부만 커버하면(날짜 누락) 불완전 합계를 저장하지 않고 기존 SUCCESS를 그대로 둔다", async () => {
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          [
            "30200",
            {
              code: "30200",
              name: "유성구",
              localNum: 500,
              otherDomesticNum: 700,
              foreignNum: 299,
              visitorCnt: 999,
              rawItems: fullMonthRawItems("202606", "signguCode", "30200"),
            },
          ],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ response: { header: { resultCode: "0000", resultMsg: "OK" } } }],
      });
      // 광역은 첫 실행·두 번째 실행 모두 완전한 채로 둔다 — 이 테스트가 확인하려는 건 "기초만 불완전해도
      // 원자적 게이트가 전체를 막는다"이므로, 두 번째 실행에서 재설정하지 않고 그대로 재사용한다.
      vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue(metcoFullMonthSuccess("202606"));
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
      const key = "src-visitor-cnt|region-1|202606";
      expect(dataSnapshotStore.get(key)?.status).toBe("SUCCESS");
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.provenance).toBe("LIVE_API");
      const snapshotCallsAfterFirstRun = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      ).length;

      // 두 번째 실행: 30일 중 10일치만 있는(=날짜 누락) SUCCESS 응답 — 페이지 일부 실패나 API 쪽 결손을
      // 흉내낸다.
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          [
            "30200",
            {
              code: "30200",
              name: "유성구",
              localNum: 100,
              otherDomesticNum: 50,
              foreignNum: 10,
              visitorCnt: 60,
              rawItems: fullMonthRawItems("202606", "signguCode", "30200").slice(0, 10),
            },
          ],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ response: { header: { resultCode: "0000", resultMsg: "OK" } } }],
      });
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      // 불완전 합계(rawValue=60)가 정상값(999)을 덮어쓰지 않았어야 한다 — 기존 SUCCESS 스냅샷 그대로.
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.rawValue).toBe(999);
      expect(dataSnapshotStore.get(key)?.status).toBe("SUCCESS");
      // 날짜 커버리지 불완전도 실제 응답을 받고도 못 쓴 것이므로(네트워크 실패와는 다름) 다른 소스의
      // ERROR-preserve 정책과 동일하게 처리한다 — 기존 LIVE_API metric은 "최신 시도가 실패해 이전 값을
      // 재사용 중"이라는 사실을 반영해 CACHED_API로 낮아진다(2026-07-29, 이전에는 손대지 않았다).
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")?.provenance).toBe("CACHED_API");
      expect(normalizedMetricStore.get("region-1|202606|visitorCntLocal")?.provenance).toBe("CACHED_API");
      const snapshotCallsAfterSecondRun = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      ).length;
      // preserve 분기는 findUnique로 기존 SUCCESS를 확인하고 upsert 자체는 호출하지 않는다(새 row를
      // 쓰지 않음) — 그래서 upsert 호출 수는 첫 실행 이후로 늘지 않는다.
      expect(snapshotCallsAfterSecondRun).toBe(snapshotCallsAfterFirstRun);
    });

    it("VISITOR_CNT는 기초(locgo)만 완전하고 광역(metco)이 불완전하면 양쪽 모두 저장하지 않는다(원자적 게이트)", async () => {
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          ["30200", { code: "30200", name: "유성구", localNum: 500, otherDomesticNum: 700, foreignNum: 299, visitorCnt: 999, rawItems: fullMonthRawItems("202606", "signguCode", "30200") }],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ dummy: true }],
      });
      // 광역은 EMPTY(불완전) — 기초는 완전해도 전체가 저장되면 안 된다.
      vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue({
        status: "EMPTY",
        byCode: new Map(),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ dummy: true }],
      });

      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      // metric은 절대 만들어지지 않는다(불완전 합계를 지어내지 않음). 기존 스냅샷이 없던 첫 실행이므로
      // 신규 DataSnapshot도 전혀 만들어지지 않는다 — 완전성 검증 실패는 "본문을 못 받은 경우"와 동일하게
      // 다루어 합성 원문으로 ERROR 행을 새로 쓰지 않는다(2026-07-29 2차 수정).
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")).toBeUndefined();
      expect(dataSnapshotStore.get("src-visitor-cnt|region-1|202606")).toBeUndefined();
      const callsForKey = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      );
      expect(callsForKey).toHaveLength(0);
    });

    it("VISITOR_CNT는 광역(metco)만 완전하고 기초(locgo)가 불완전하면 양쪽 모두 저장하지 않는다(원자적 게이트)", async () => {
      // 기초는 EMPTY(불완전).
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "EMPTY",
        byCode: new Map(),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ dummy: true }],
      });
      vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          ["30", { code: "30", name: "대전광역시", localNum: 100, otherDomesticNum: 200, foreignNum: 30, visitorCnt: 230, rawItems: fullMonthRawItems("202606", "areaCode", "30") }],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ dummy: true }],
      });

      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      // mock region.findMany은 SIDO 조회에 빈 배열을 주므로(이 테스트 스위트의 기본 설정) 광역 데이터가
      // 실제로 적용될 지역이 없다 — 시군구(region-1, locgo 기준)에도 원자적 게이트로 저장되지 않는지만
      // 확인한다. metric은 절대 만들어지지 않고, 신규 DataSnapshot도 전혀 만들어지지 않는다.
      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")).toBeUndefined();
      expect(dataSnapshotStore.get("src-visitor-cnt|region-1|202606")).toBeUndefined();
      const callsForKey = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      );
      expect(callsForKey).toHaveLength(0);
    });

    it("양쪽 모두 네트워크 실패(rawPages=[])면 신규 DataSnapshot을 저장하지 않는다(원자적 게이트)", async () => {
      // beforeEach의 기본 mock이 이미 fetchLocgoRegnVisitr/fetchMetcoRegnVisitr 둘 다 ERROR(rawPages:[])다
      // — 별도로 override하지 않는다.
      await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

      expect(normalizedMetricStore.get("region-1|202606|visitorCnt")).toBeUndefined();
      expect(dataSnapshotStore.get("src-visitor-cnt|region-1|202606")).toBeUndefined();
      const callsForKey = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      );
      expect(callsForKey).toHaveLength(0);
    });
  });
});

describe("runTourismDataSync — --region-code 지역 필터(2026-08-08 도입)", () => {
  it("regionCode를 생략하면 기존과 동일하게 전체 SIGUNGU를 동기화한다", async () => {
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(regionFindUnique).not.toHaveBeenCalled();
    expect(regionFindMany).toHaveBeenCalledWith({ where: { level: "SIGUNGU" } });
    expect(result.skipped).toBe(false);
    expect(result.results.some((r) => r.sourceCode === `TAR_SVC_DEM:${REGION.code}`)).toBe(true);
  });

  it("존재하지 않는 지역 코드는 API 호출 전에 즉시 실패한다", async () => {
    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI", regionCode: "NOT_A_REAL_CODE" });

    expect(result.overallStatus).toBe("FAILED");
    expect(result.skipped).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].sourceCode).toBe("REGION_FILTER");
    expect(result.results[0].errorMessage).toContain("NOT_A_REAL_CODE");
    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(fetchTouDivIx).not.toHaveBeenCalled();
    expect(fetchTouResDem).not.toHaveBeenCalled();
    expect(fetchTourInfo).not.toHaveBeenCalled();
    expect(syncLogCreate).not.toHaveBeenCalled();
  });

  it("SIDO 코드를 지정하면 SIGUNGU 코드가 아니라는 오류로 API 호출 전에 즉시 실패한다", async () => {
    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI", regionCode: SIDO_REGION.code });

    expect(result.overallStatus).toBe("FAILED");
    expect(result.results[0].errorMessage).toContain("SIDO");
    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(regionFindMany).not.toHaveBeenCalled();
  });

  it("정상 SIGUNGU 코드를 지정하면 그 지역 1곳만 대상으로 동기화한다(전체 목록 조회 없음)", async () => {
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI", regionCode: REGION.code });

    expect(regionFindUnique).toHaveBeenCalledWith({ where: { code: REGION.code } });
    // 전체 SIGUNGU 목록 조회(findMany)는 전혀 일어나지 않는다 — 지정한 지역 하나만 대상이라는 뜻이다.
    expect(regionFindMany).not.toHaveBeenCalledWith({ where: { level: "SIGUNGU" } });
    expect(result.overallStatus).not.toBe("FAILED");
    expect(result.results.every((r) => !r.sourceCode.includes(SIDO_REGION.code))).toBe(true);
    expect(fetchTarSvcDem).toHaveBeenCalledTimes(1);
    expect(fetchTarSvcDem).toHaveBeenCalledWith(
      expect.objectContaining({ areaCd: REGION.apiAreaCode, signguCd: REGION.apiSigunguCode }),
    );
  });

  it("정상 SIGUNGU 코드를 지정하면 VISITOR_CNT도 그 지역만 반영하고 SIDO 집계는 건드리지 않는다", async () => {
    vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
      status: "SUCCESS",
      byCode: new Map([
        [REGION.apiSigunguCode!, { code: REGION.apiSigunguCode!, name: REGION.name, localNum: 10, otherDomesticNum: 20, foreignNum: 5, visitorCnt: 25, rawItems: fullMonthRawItems("202606", "signguCode", REGION.apiSigunguCode!) }],
      ]),
      resultCode: "0000",
      resultMsg: "OK",
      rawPages: [{ dummy: true }],
    });
    vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue(metcoFullMonthSuccess("202606"));

    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI", regionCode: REGION.code });

    expect(normalizedMetricStore.get(`${REGION.id}|202606|visitorCnt`)).toBeDefined();
    // SIDO 조회 자체가 일어나지 않으므로 SIDO 지역에 대한 VISITOR_CNT 반영도 없다.
    expect(regionFindMany).not.toHaveBeenCalledWith({ where: { level: "SIDO" } });
  });
});

describe("runTourismDataSync — 통계청 코드(apiAreaCode/apiSigunguCode) 미설정 지역(2026-08-09, 전남광주통합 사례)", () => {
  // 전남광주통합특별시 27곳처럼 TourAPI 법정동 코드(tourApiLdongRegnCd)는 있지만 통계청 코드가 아직
  // 검증되지 않아 null인 지역을 흉내낸다.
  const NO_STAT_CODE_REGION = {
    ...REGION,
    code: "SGG_NO_STAT_CODE",
    name: "통계청코드없음지역",
    apiAreaCode: null,
    apiSigunguCode: null,
    tourApiLdongRegnCd: "12",
    tourApiLdongSignguCd: "110",
  };

  it("apiAreaCode/apiSigunguCode가 없어도 TOUR_INFO는 시도한다(통계청 코드를 쓰지 않는 소스이므로)", async () => {
    regionFindMany.mockImplementationOnce(async (args?: { where?: { level?: string } }) => {
      if (args?.where?.level === "SIDO") return [];
      return [NO_STAT_CODE_REGION];
    });
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "테스트장소", addr1: "통계청코드없음지역 어딘가", contenttypeid: "12", mapx: 127, mapy: 36 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [{ dummy: true }] },
    });

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(fetchTourInfo).toHaveBeenCalledTimes(1);
    const tourInfoResult = result.results.find((r) => r.sourceCode === `TOUR_INFO:${NO_STAT_CODE_REGION.code}`);
    expect(tourInfoResult?.status).toBe("SUCCESS");
  });

  it("apiAreaCode/apiSigunguCode가 없으면 TAR_SVC_DEM/TOU_DIV_IX/TOU_RES_DEM은 각각 SKIPPED로 개별 기록되고 실제 호출은 하지 않는다", async () => {
    regionFindMany.mockImplementationOnce(async (args?: { where?: { level?: string } }) => {
      if (args?.where?.level === "SIDO") return [];
      return [NO_STAT_CODE_REGION];
    });

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(fetchTouDivIx).not.toHaveBeenCalled();
    expect(fetchTouResDem).not.toHaveBeenCalled();
    for (const code of ["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM"]) {
      const r = result.results.find((r) => r.sourceCode === `${code}:${NO_STAT_CODE_REGION.code}`);
      expect(r?.status).toBe("SKIPPED");
      expect(r?.errorMessage).toContain("apiAreaCode/apiSigunguCode");
    }
  });
});

describe("runTourismDataSync — 원격 DB 안전장치 통합(2026-08-08)", () => {
  it("DATABASE_URL이 원격 호스트면 어떤 DB 조회·API 호출도 하지 않고 즉시 실패한다", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@ep-dawn-sea.aws.neon.tech/neondb";

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(result.overallStatus).toBe("FAILED");
    expect(result.skipped).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].sourceCode).toBe("DATA_SYNC_TARGET_GUARD");
    expect(regionFindMany).not.toHaveBeenCalled();
    expect(regionFindUnique).not.toHaveBeenCalled();
    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(syncLogCreate).not.toHaveBeenCalled();
  });

  it("ALLOW_REMOTE_DATA_SYNC=true면 원격 DATABASE_URL이어도 정상 진행한다", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@ep-dawn-sea.aws.neon.tech/neondb";
    process.env.ALLOW_REMOTE_DATA_SYNC = "true";
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(result.overallStatus).not.toBe("FAILED");
    expect(regionFindMany).toHaveBeenCalledWith({ where: { level: "SIGUNGU" } });
  });

  it("127.0.0.1 대상은 원격 차단 없이 정상 진행한다", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/tour_dna_local";
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    const result = await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    expect(result.overallStatus).not.toBe("FAILED");
    expect(regionFindMany).toHaveBeenCalledWith({ where: { level: "SIGUNGU" } });
  });
});

describe("runResumableLocalBatchSync — 전국 재개형 로컬 배치(2026-08-09 도입)", () => {
  const REGION_B = {
    ...REGION,
    id: "region-2",
    code: "TEST_REGION_B",
    name: "테스트지역B",
    apiAreaCode: "31",
    apiSigunguCode: "31200",
    tourApiLdongRegnCd: "31",
    tourApiLdongSignguCd: "31200",
  };

  function mockRegions(regions: Array<Omit<typeof REGION, "apiAreaCode" | "apiSigunguCode"> & { apiAreaCode: string | null; apiSigunguCode: string | null }>) {
    regionFindMany.mockImplementation(async (args?: { where?: { level?: string } }) => {
      if (args?.where?.level === "SIDO") return [];
      return regions;
    });
  }

  it("totalRegions는 실제 조회된 지역 수를 그대로 사용한다(하드코딩 없음)", async () => {
    mockRegions([REGION, REGION_B]);
    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
    expect(result.totalRegions).toBe(2);
  });

  it("이미 SUCCESS로 완료된 지역×데이터소스는 API를 재호출하지 않고 건너뛴다", async () => {
    mockRegions([REGION]);
    dataSnapshotStore.set(`src-tar-svc-dem|${REGION.id}|202606`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 1,
      rawPayload: {},
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    const tarResult = result.results.find((r) => r.sourceCode === `TAR_SVC_DEM:${REGION.code}`);
    expect(tarResult?.status).toBe("SKIPPED");
    const logs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).toContain(`${REGION.name} - TAR_SVC_DEM 건너뜀(이미 완료)`);
    logSpy.mockRestore();
  });

  it("TOU_DIV_IX의 13/13 SUCCESS snapshot은 API를 재호출하지 않고 건너뛴다", async () => {
    mockRegions([REGION]);
    dataSnapshotStore.set(`src-tou-div-ix|${REGION.id}|202606`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 13,
      rawPayload: touDivRawWithAllCodes(),
    });

    await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTouDivIx).not.toHaveBeenCalled();
  });

  it("TOU_DIV_IX의 12/13 SUCCESS snapshot은 재시도하고, 완전 응답에서 metric을 upsert한다", async () => {
    mockRegions([REGION]);
    dataSnapshotStore.set(`src-tou-div-ix|${REGION.id}|202606`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 12,
      rawPayload: touDivRawWithAllCodes({ missing: ["3103"] }),
    });
    vi.mocked(fetchTouDivIx).mockResolvedValue({
      status: "SUCCESS",
      composite: 72.5,
      breakdown: { visitorAgeEvenness: 70, spendAgeEvenness: 75, nationalityDiversity: 72.5, composite: 72.5 },
      itemCount: 13,
      raw: touDivRawWithAllCodes(),
      quotaSignal: null,
    });

    await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTouDivIx).toHaveBeenCalledTimes(1);
    expect(normalizedMetricStore.get(`${REGION.id}|202606|touDivIxVal`)).toEqual(
      expect.objectContaining({ rawValue: 72.5, provenance: "LIVE_API" }),
    );
    expect(isTouDivIxRawComplete(dataSnapshotStore.get(`src-tou-div-ix|${REGION.id}|202606`)?.rawPayload)).toBe(true);
  });

  it("기존 12/13 snapshot은 새 1/13 + 429 응답으로 덮어쓰지 않는다", async () => {
    mockRegions([REGION]);
    const previousRaw = touDivRawWithAllCodes({ missing: ["3103"] });
    dataSnapshotStore.set(`src-tou-div-ix|${REGION.id}|202606`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 12,
      rawPayload: previousRaw,
    });
    const previousMetric = {
      regionId: REGION.id,
      baseYm: "202606",
      metricCode: "touDivIxVal",
      rawValue: 90.46,
      provenance: "LIVE_API",
    };
    normalizedMetricStore.set(`${REGION.id}|202606|touDivIxVal`, previousMetric);
    vi.mocked(fetchTouDivIx).mockResolvedValue({
      status: "SUCCESS",
      composite: 25,
      breakdown: { visitorAgeEvenness: 25, spendAgeEvenness: null, nationalityDiversity: null, composite: 25 },
      itemCount: 1,
      raw: touDivRawWithAllCodes({ missing: [
        ...TOU_DIV_CODES.slice(1),
        ...EXP_DIV_CODES,
        INTL_DIV_CODE_NATIONALITY,
      ] }),
      quotaSignal: "HTTP 429",
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(result.stoppedDueToQuota).toBe(true);
    expect(result.results.find((r) => r.sourceCode === `TOU_DIV_IX:${REGION.code}`)?.status).toBe("FAILED");
    expect(dataSnapshotStore.get(`src-tou-div-ix|${REGION.id}|202606`)?.rawPayload).toEqual(previousRaw);
    expect(normalizedMetricStore.get(`${REGION.id}|202606|touDivIxVal`)).toEqual(previousMetric);
  });

  it("기존 5/13 snapshot은 새 3/13 partial 응답으로 덮어쓰지 않는다", async () => {
    mockRegions([REGION]);
    const previousRaw = touDivRawWithAllCodes({
      missing: ["3104", "3105", "3106", "3201", "3202", "3203", "3204", "3205"],
    });
    dataSnapshotStore.set(`src-tou-div-ix|${REGION.id}|202606`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 5,
      rawPayload: previousRaw,
    });
    vi.mocked(fetchTouDivIx).mockResolvedValue({
      status: "SUCCESS",
      composite: 35,
      breakdown: { visitorAgeEvenness: 35, spendAgeEvenness: null, nationalityDiversity: null, composite: 35 },
      itemCount: 3,
      raw: touDivRawWithAllCodes({
        missing: ["3104", "3105", "3106", "3201", "3202", "3203", "3204", "3205", "3206", "3303"],
      }),
      quotaSignal: null,
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(result.results.find((r) => r.sourceCode === `TOU_DIV_IX:${REGION.code}`)?.status).toBe("PARTIAL");
    expect(dataSnapshotStore.get(`src-tou-div-ix|${REGION.id}|202606`)?.rawPayload).toEqual(previousRaw);
  });

  it("기존 5/13 snapshot은 새 8/13 partial 응답으로도 교체하지 않는다(atomic repair 정책)", async () => {
    mockRegions([REGION]);
    const previousRaw = touDivRawWithAllCodes({
      missing: ["3104", "3105", "3106", "3201", "3202", "3203", "3204", "3205"],
    });
    dataSnapshotStore.set(`src-tou-div-ix|${REGION.id}|202606`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 5,
      rawPayload: previousRaw,
    });
    vi.mocked(fetchTouDivIx).mockResolvedValue({
      status: "SUCCESS",
      composite: 58,
      breakdown: { visitorAgeEvenness: 58, spendAgeEvenness: null, nationalityDiversity: null, composite: 58 },
      itemCount: 8,
      raw: touDivRawWithAllCodes({ missing: ["3202", "3203", "3204", "3205", "3206"] }),
      quotaSignal: null,
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(result.results.find((r) => r.sourceCode === `TOU_DIV_IX:${REGION.code}`)?.status).toBe("PARTIAL");
    expect(dataSnapshotStore.get(`src-tou-div-ix|${REGION.id}|202606`)?.rawPayload).toEqual(previousRaw);
  });

  it("이미 EMPTY로 완료된 지역×데이터소스도 SUCCESS와 동일하게 건너뛴다(과거 확정월은 재조회해도 바뀌지 않음)", async () => {
    mockRegions([REGION]);
    dataSnapshotStore.set(`src-tar-svc-dem|${REGION.id}|202606`, {
      status: "EMPTY",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 0,
      rawPayload: {},
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(result.results.find((r) => r.sourceCode === `TAR_SVC_DEM:${REGION.code}`)?.status).toBe("SKIPPED");
  });

  it("스냅샷이 아예 없는 지역×데이터소스는 이번 실행의 대상에 포함되어 실제로 호출된다", async () => {
    mockRegions([REGION]);
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTarSvcDem).toHaveBeenCalledTimes(1);
    expect(result.completed).toBeGreaterThan(0);
    const logs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).toContain(`${REGION.name} - TAR_SVC_DEM 수집 완료`);
    logSpy.mockRestore();
  });

  it("ERROR로 남아 있던 지역×데이터소스는 재시도 대상에 포함된다", async () => {
    mockRegions([REGION]);
    dataSnapshotStore.set(`src-tar-svc-dem|${REGION.id}|202606`, {
      status: "ERROR",
      resultCode: "NETWORK_ERROR",
      resultMsg: "이전 실행 실패",
      itemCount: 0,
      rawPayload: {},
    });
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTarSvcDem).toHaveBeenCalledTimes(1);
  });

  it("--max-regions로 지정한 예산을 넘어서면 이후 지역은 이번 실행에서 아예 호출하지 않는다", async () => {
    mockRegions([REGION, REGION_B]);
    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 1 });

    expect(result.processedRegions).toBe(1);
    // VISITOR_CNT는 지역 필터 없는 전국 1회 호출이라 REGION_B의 VISITOR_CNT 항목도 결과에 남는다(설계상
    // 정상) — 여기서는 지역별로 실제 예산·quota 제어 대상인 4개 재개형 소스만 확인한다.
    expect(
      result.results.some(
        (r) => r.sourceCode.includes(REGION_B.code) && !r.sourceCode.startsWith("VISITOR_CNT:"),
      ),
    ).toBe(false);
  });

  it("이미 전부 완료된(무료로 건너뛰는) 지역은 --max-regions 예산을 소비하지 않는다", async () => {
    mockRegions([REGION, REGION_B]);
    for (const code of ["src-tar-svc-dem", "src-tou-div-ix", "src-tou-res-dem", "src-tour-info"]) {
      dataSnapshotStore.set(`${code}|${REGION.id}|202606`, {
        status: "SUCCESS",
        resultCode: "0000",
        resultMsg: "OK",
        itemCount: 1,
        rawPayload: {},
      });
    }
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 1 });

    // REGION은 전부 SUCCESS라 예산을 쓰지 않고 무료로 통과하고, 남은 예산 1로 REGION_B가 처리된다.
    expect(result.processedRegions).toBe(1);
    expect(result.results.some((r) => r.sourceCode.includes(REGION_B.code))).toBe(true);
  });

  it("quota/429 신호를 감지하면 그 지역의 남은 소스와 이후 지역을 전혀 호출하지 않고 안전 종료한다", async () => {
    mockRegions([REGION, REGION_B]);
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "ERROR",
      items: [],
      resultCode: "429",
      resultMsg: "HTTP 429",
      raw: { stay: { dummy: true }, spend: null },
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(result.stoppedDueToQuota).toBe(true);
    // TAR_SVC_DEM에서 멈췄으므로 같은 지역의 나머지 소스(TOU_DIV_IX 등)조차 호출되지 않는다.
    expect(fetchTouDivIx).not.toHaveBeenCalled();
    expect(fetchTouResDem).not.toHaveBeenCalled();
    // 이후 지역(REGION_B)은 전혀 손대지 않는다 — 이미 성공한 데이터도 그대로 보존된다(롤백 없음).
    // VISITOR_CNT는 지역 필터 없는 전국 1회 호출이라 REGION_B의 VISITOR_CNT 항목도 결과에 남는다(설계상
    // 정상) — 여기서는 지역별로 실제 예산·quota 제어 대상인 4개 재개형 소스만 확인한다.
    expect(
      result.results.some(
        (r) => r.sourceCode.includes(REGION_B.code) && !r.sourceCode.startsWith("VISITOR_CNT:"),
      ),
    ).toBe(false);
    expect(normalizedMetricStore.has(`${REGION.id}|202606|touDivIxVal`)).toBe(false);
    expect(isTouDivIxRawComplete(dataSnapshotStore.get(`src-tou-div-ix|${REGION.id}|202606`)?.rawPayload)).toBe(false);
  });

  it("TOU_DIV_IX가 부분 429(quotaSignal)만 있어도 status와 무관하게 quota 중단으로 처리한다", async () => {
    // 2026-08-10 발견 — 13개 코드 중 일부만 429를 맞고 나머지가 정상이면 fetchTouDivIx의 status는
    // SUCCESS/EMPTY로 정상 계산되지만(부분 실패 흡수는 의도된 동작), quotaSignal 필드로 quota 초과
    // 사실이 별도로 드러난다. syncTouDivIxForRegion이 이 신호를 놓치지 않고 FAILED로 강제해 배치를
    // 안전 종료해야 한다 — 그렇지 않으면 대량 429가 발생해도 배치가 끝까지 API를 낭비하며 진행된다.
    mockRegions([REGION, REGION_B]);
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });
    vi.mocked(fetchTouDivIx).mockResolvedValue({
      status: "SUCCESS",
      composite: 40,
      breakdown: { visitorAgeEvenness: 40, spendAgeEvenness: null, nationalityDiversity: null, composite: 40 },
      itemCount: 1,
      raw: { tou: [{ code: "3101", data: { dummy: true } }], exp: [], intl: { code: "3303", data: null } },
      quotaSignal: "HTTP 429",
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(result.stoppedDueToQuota).toBe(true);
    // TOU_DIV_IX에서 멈췄으므로 같은 지역의 나머지 소스(TOU_RES_DEM 등)조차 호출되지 않는다.
    expect(fetchTouResDem).not.toHaveBeenCalled();
    expect(
      result.results.some(
        (r) => r.sourceCode.includes(REGION_B.code) && !r.sourceCode.startsWith("VISITOR_CNT:"),
      ),
    ).toBe(false);
  });

  it("중단 후 같은 옵션으로 재실행하면 이미 성공한 지역×소스는 건너뛰고 이어서 진행한다(재개 시나리오)", async () => {
    mockRegions([REGION]);
    vi.mocked(fetchTarSvcDem).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { stay: { dummy: true }, spend: null },
    });

    await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
    expect(fetchTarSvcDem).toHaveBeenCalledTimes(1);

    vi.mocked(fetchTarSvcDem).mockClear();
    const secondRun = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(secondRun.results.find((r) => r.sourceCode === `TAR_SVC_DEM:${REGION.code}`)?.status).toBe("SKIPPED");
  });

  it("원격 DATABASE_URL이면 지역 조회·API 호출 없이 즉시 차단한다", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@ep-dawn-sea.aws.neon.tech/neondb";

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(result.results[0].sourceCode).toBe("DATA_SYNC_TARGET_GUARD");
    expect(regionFindMany).not.toHaveBeenCalled();
    expect(fetchTarSvcDem).not.toHaveBeenCalled();
  });

  it("차단 로그·결과 어디에도 DATABASE_URL 비밀번호가 노출되지 않는다", async () => {
    process.env.DATABASE_URL = "postgresql://myuser:super-secret-password@some-remote-host.example.com/proddb";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    const logs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).not.toContain("super-secret-password");
    expect(JSON.stringify(result)).not.toContain("super-secret-password");
    logSpy.mockRestore();
  });

  // 전남광주통합특별시 27곳처럼 apiAreaCode/apiSigunguCode가 null인 지역도 이 배치 대상에 포함되어야
  // 한다(2026-08-09 검증) — TOUR_INFO는 그 코드를 쓰지 않으므로 정상 시도되고, 통계청 3개 소스만
  // 개별적으로 건너뛴다.
  const NO_STAT_CODE_REGION = {
    ...REGION,
    id: "region-no-stat",
    code: "SGG_NO_STAT_CODE",
    name: "통계청코드없음지역",
    apiAreaCode: null,
    apiSigunguCode: null,
    tourApiLdongRegnCd: "12",
    tourApiLdongSignguCd: "110",
  };

  it("apiAreaCode/apiSigunguCode가 없는 지역도 배치 대상에 포함되고, TOUR_INFO는 정상 시도된다", async () => {
    mockRegions([NO_STAT_CODE_REGION]);
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "테스트장소", addr1: "통계청코드없음지역 어딘가", contenttypeid: "12", mapx: 127, mapy: 36 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [{ dummy: true }] },
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTourInfo).toHaveBeenCalledTimes(1);
    const tourInfoResult = result.results.find((r) => r.sourceCode === `TOUR_INFO:${NO_STAT_CODE_REGION.code}`);
    expect(tourInfoResult?.status).toBe("SUCCESS");
    expect(result.completed).toBeGreaterThan(0);
  });

  it("apiAreaCode/apiSigunguCode가 없는 지역은 통계청 계열 3개 소스만 개별 SKIPPED로 기록되고 실제 호출은 하지 않는다", async () => {
    mockRegions([NO_STAT_CODE_REGION]);

    const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTarSvcDem).not.toHaveBeenCalled();
    expect(fetchTouDivIx).not.toHaveBeenCalled();
    expect(fetchTouResDem).not.toHaveBeenCalled();
    for (const code of ["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM"]) {
      const r = result.results.find((r) => r.sourceCode === `${code}:${NO_STAT_CODE_REGION.code}`);
      expect(r?.status).toBe("SKIPPED");
      expect(r?.errorMessage).toContain("apiAreaCode/apiSigunguCode");
    }
  });

  // 2026-08-10 VISITOR_CNT 반복 호출 최소화 — 실전 배치에서 지역 수와 무관하게 매번 전국 API가
  // 27회씩 다시 호출되는 문제를 확인했다(원인: syncVisitorCnt가 대상 지역의 기존 완료 여부를 전혀
  // 확인하지 않고 매번 무조건 호출). isVisitorCntComplete()가 대상 지역 전체의 VISITOR_CNT
  // SUCCESS/EMPTY 여부를 한 번의 쿼리로 확인해, 전부 완료된 경우에만 전국 API 호출 자체를 건너뛴다.
  describe("VISITOR_CNT — 대상 지역이 이미 전국 완료 상태면 재호출하지 않는다(2026-08-10)", () => {
    function mockCompleteVisitorResponses() {
      vi.mocked(fetchLocgoRegnVisitr).mockResolvedValue({
        status: "SUCCESS",
        byCode: new Map([
          [
            "30200",
            {
              code: "30200",
              name: "유성구",
              localNum: 1000,
              otherDomesticNum: 12000,
              foreignNum: 345,
              visitorCnt: 12345,
              rawItems: fullMonthRawItems("202606", "signguCode", "30200"),
            },
          ],
        ]),
        resultCode: "0000",
        resultMsg: "OK",
        rawPages: [{ dummy: true }],
      });
      vi.mocked(fetchMetcoRegnVisitr).mockResolvedValue(metcoFullMonthSuccess("202606"));
    }

    it("첫 실행 후 같은 baseYm으로 재실행하면 전국 API를 다시 호출하지 않는다(0회)", async () => {
      mockRegions([REGION]);
      mockCompleteVisitorResponses();

      await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
      expect(fetchLocgoRegnVisitr).toHaveBeenCalledTimes(1);
      expect(fetchMetcoRegnVisitr).toHaveBeenCalledTimes(1);

      vi.mocked(fetchLocgoRegnVisitr).mockClear();
      vi.mocked(fetchMetcoRegnVisitr).mockClear();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const second = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

      expect(fetchLocgoRegnVisitr).not.toHaveBeenCalled();
      expect(fetchMetcoRegnVisitr).not.toHaveBeenCalled();
      expect(second.requestCounts.byDataSource.VISITOR_CNT ?? 0).toBe(0);
      const visitorResult = second.results.find((r) => r.sourceCode === `VISITOR_CNT:${REGION.code}`);
      expect(visitorResult?.status).toBe("SKIPPED");
      expect(visitorResult?.errorMessage).toContain("이미 완료된 baseYm");
      const logs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logs).toContain("전국 API 재호출 생략");
      logSpy.mockRestore();
    });

    it("재호출 생략 시 다른 데이터소스(TAR_SVC_DEM 등)의 실행은 영향받지 않는다", async () => {
      mockRegions([REGION]);
      mockCompleteVisitorResponses();
      vi.mocked(fetchTarSvcDem).mockResolvedValue({
        status: "SUCCESS",
        items: [{ baseYm: "202606", tarSjrnDsIxCd: "2103", tarSjrnDsIxVal: 50 }],
        resultCode: "0000",
        resultMsg: "OK",
        raw: { stay: { dummy: true }, spend: null },
      });

      await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
      vi.mocked(fetchTarSvcDem).mockClear();

      const second = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

      // TAR_SVC_DEM은 이미 SUCCESS라 재개형 스킵 로직으로 건너뛴다(VISITOR_CNT 변경과 무관하게 그대로).
      expect(fetchTarSvcDem).not.toHaveBeenCalled();
      const tarResult = second.results.find((r) => r.sourceCode === `TAR_SVC_DEM:${REGION.code}`);
      expect(tarResult?.status).toBe("SKIPPED");
    });

    it("일부 지역만 VISITOR_CNT가 완료돼 있으면 전국 API를 다시 호출한다(부분 완료는 완료로 치지 않음)", async () => {
      const REGION_C = {
        ...REGION,
        id: "region-visitor-incomplete",
        code: "TEST_REGION_C",
        name: "테스트지역C",
        apiAreaCode: "32",
        apiSigunguCode: "32100",
        tourApiLdongRegnCd: "32",
        tourApiLdongSignguCd: "32100",
      };
      mockRegions([REGION, REGION_C]);
      mockCompleteVisitorResponses();

      // REGION만 먼저 완료시켜 둔다(REGION_C는 아직 스냅샷이 없는 상태로 남겨둠).
      dataSnapshotStore.set(`src-visitor-cnt|${REGION.id}|202606`, {
        status: "SUCCESS",
        resultCode: "0000",
        resultMsg: "OK",
        itemCount: 1,
        rawPayload: {},
      });

      await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

      // REGION_C가 아직 완료되지 않았으므로 "전부 완료"가 아니라 전국 API를 그대로 호출해야 한다.
      expect(fetchLocgoRegnVisitr).toHaveBeenCalledTimes(1);
      expect(fetchMetcoRegnVisitr).toHaveBeenCalledTimes(1);
    });

    it("재호출을 생략해도 기존 SUCCESS DataSnapshot을 다시 쓰지 않는다(회귀 없음)", async () => {
      mockRegions([REGION]);
      mockCompleteVisitorResponses();

      await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
      dataSnapshotUpsert.mockClear();

      await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });

      const visitorUpsertCalls = dataSnapshotUpsert.mock.calls.filter(
        (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
      );
      expect(visitorUpsertCalls).toHaveLength(0);
    });
  });

  // 2026-08-10 API 호출량 계측 도입 — 실제 fetch() 기준 집계 자체는 tests/unit/requestCounter.test.ts가
  // client.ts와 직접 연동해 엄밀히 검증한다(단일/다중 소스, pagination, retry, quota, 컨텍스트 격리).
  // 여기서는 이 스위트가 어댑터 자체를 mock하므로(client.ts를 거치지 않음) requestCounts가 항상 0으로
  // 나올 수밖에 없지만, 그 구조가 모든 반환 경로에 정상적으로 붙는지(누락·크래시 없음)만 확인한다.
  describe("requestCounts — 배치 결과에 API 요청 집계가 항상 붙는다", () => {
    it("정상 실행 결과에 requestCounts 구조가 포함된다", async () => {
      mockRegions([REGION]);
      const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
      expect(result.requestCounts).toEqual({ byDataSource: expect.any(Object), total: expect.any(Number) });
    });

    it("원격 DB 차단으로 조기 종료해도 requestCounts가 0으로 채워진 채 반환된다", async () => {
      process.env.DATABASE_URL = "postgresql://user:pass@ep-dawn-sea.aws.neon.tech/neondb";
      const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
      expect(result.requestCounts).toEqual({ byDataSource: {}, total: 0 });
    });

    it("quota 감지로 지역 순회 중 중단돼도 requestCounts가 누락 없이 반환된다", async () => {
      mockRegions([REGION]);
      vi.mocked(fetchTarSvcDem).mockResolvedValue({
        status: "ERROR",
        items: [],
        resultCode: "429",
        resultMsg: "HTTP 429",
        raw: { stay: { dummy: true }, spend: null },
      });
      const result = await runResumableLocalBatchSync({ baseYm: "202606", triggeredBy: "CLI", maxRegions: 10 });
      expect(result.stoppedDueToQuota).toBe(true);
      expect(result.requestCounts).toBeDefined();
      expect(typeof result.requestCounts.total).toBe("number");
    });
  });
});

describe("runResumableLocalBatchSync — TOUR_INFO TTL 재사용(Phase 2-D, 2026-08-12)", () => {
  const REGION_B = {
    ...REGION,
    id: "region-2",
    code: "TEST_REGION_B",
    name: "테스트지역B",
    apiAreaCode: "31",
    apiSigunguCode: "31200",
    tourApiLdongRegnCd: "31",
    tourApiLdongSignguCd: "31200",
  };

  function mockRegions(regions: typeof REGION[]) {
    regionFindMany.mockImplementation(async (args?: { where?: { level?: string } }) => {
      if (args?.where?.level === "SIDO") return [];
      return regions;
    });
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  it("최근 TOUR_INFO SUCCESS가 TTL(60일) 이내면 API를 호출하지 않고 SKIPPED로 처리한다(가짜 스냅샷 생성 없음)", async () => {
    mockRegions([REGION]);
    dataSnapshotGroupBy.mockResolvedValueOnce([
      { regionId: REGION.id, _max: { fetchedAt: new Date(Date.now() - 10 * DAY_MS) } },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runResumableLocalBatchSync({ baseYm: "202607", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTourInfo).not.toHaveBeenCalled();
    const tourInfoResult = result.results.find((r) => r.sourceCode === `TOUR_INFO:${REGION.code}`);
    expect(tourInfoResult?.status).toBe("SKIPPED");
    expect(tourInfoResult?.errorMessage).toContain("TTL 재사용");
    // 이번 baseYm(202607)에 대한 DataSnapshot row 자체가 생성되지 않아야 한다 — 가짜 SUCCESS 금지.
    expect(dataSnapshotStore.has(`src-tour-info|${REGION.id}|202607`)).toBe(false);
    const logs = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logs).toContain("TOUR_INFO 건너뜀(TTL 이내 재사용 가능)");
    logSpy.mockRestore();
  });

  it("최근 TOUR_INFO SUCCESS가 TTL을 초과(stale)하면 실제로 API를 호출한다", async () => {
    mockRegions([REGION]);
    dataSnapshotGroupBy.mockResolvedValueOnce([
      { regionId: REGION.id, _max: { fetchedAt: new Date(Date.now() - 90 * DAY_MS) } },
    ]);
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "테스트 명소", addr1: "테스트지역 어딘가", contenttypeid: "12", mapx: 127.0, mapy: 37.0 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [{ dummy: true }] },
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202607", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTourInfo).toHaveBeenCalledTimes(1);
    const tourInfoResult = result.results.find((r) => r.sourceCode === `TOUR_INFO:${REGION.code}`);
    expect(tourInfoResult?.status).toBe("SUCCESS");
  });

  it("TOUR_INFO 이력이 전혀 없으면(never fetched) 실제로 API를 호출한다", async () => {
    mockRegions([REGION]);
    dataSnapshotGroupBy.mockResolvedValueOnce([]);
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "테스트 명소", addr1: "테스트지역 어딘가", contenttypeid: "12", mapx: 127.0, mapy: 37.0 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [{ dummy: true }] },
    });

    await runResumableLocalBatchSync({ baseYm: "202607", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTourInfo).toHaveBeenCalledTimes(1);
  });

  it("일부 지역만 fresh하면 fresh 지역은 skip, stale/미이력 지역만 실제로 호출한다", async () => {
    mockRegions([REGION, REGION_B]);
    dataSnapshotGroupBy.mockResolvedValueOnce([
      { regionId: REGION.id, _max: { fetchedAt: new Date(Date.now() - 5 * DAY_MS) } },
      // REGION_B는 groupBy 결과에 없음 — never fetched로 처리되어 실제 호출 대상이 된다.
    ]);
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "테스트 명소B", addr1: "테스트지역B 어딘가", contenttypeid: "12", mapx: 127.0, mapy: 37.0 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [{ dummy: true }] },
    });

    const result = await runResumableLocalBatchSync({ baseYm: "202607", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTourInfo).toHaveBeenCalledTimes(1);
    expect(result.results.find((r) => r.sourceCode === `TOUR_INFO:${REGION.code}`)?.status).toBe("SKIPPED");
    expect(result.results.find((r) => r.sourceCode === `TOUR_INFO:${REGION_B.code}`)?.status).toBe("SUCCESS");
  });

  it("같은 baseYm에 이미 TOUR_INFO SUCCESS 스냅샷이 있으면(기존 스킵 로직) freshness 조회와 무관하게 건너뛴다", async () => {
    mockRegions([REGION]);
    dataSnapshotStore.set(`src-tour-info|${REGION.id}|202607`, {
      status: "SUCCESS",
      resultCode: "0000",
      resultMsg: "OK",
      itemCount: 3,
      rawPayload: {},
    });
    // groupBy는 stale로 설정해도(즉 이번 baseYm에 이미 있으면 freshness를 볼 필요조차 없음) 결과는 같다.
    dataSnapshotGroupBy.mockResolvedValueOnce([
      { regionId: REGION.id, _max: { fetchedAt: new Date(Date.now() - 200 * DAY_MS) } },
    ]);

    const result = await runResumableLocalBatchSync({ baseYm: "202607", triggeredBy: "CLI", maxRegions: 10 });

    expect(fetchTourInfo).not.toHaveBeenCalled();
    expect(result.results.find((r) => r.sourceCode === `TOUR_INFO:${REGION.code}`)?.errorMessage).toContain("이미 완료");
  });

  it("--force-tour-info(forceTourInfoRefresh)를 켜면 fresh해도 재사용을 끄고 항상 실제로 호출한다", async () => {
    mockRegions([REGION]);
    dataSnapshotGroupBy.mockResolvedValueOnce([
      { regionId: REGION.id, _max: { fetchedAt: new Date(Date.now() - 5 * DAY_MS) } },
    ]);
    vi.mocked(fetchTourInfo).mockResolvedValue({
      status: "SUCCESS",
      items: [{ title: "테스트 명소", addr1: "테스트지역 어딘가", contenttypeid: "12", mapx: 127.0, mapy: 37.0 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { pages: [{ dummy: true }] },
    });

    const result = await runResumableLocalBatchSync({
      baseYm: "202607",
      triggeredBy: "CLI",
      maxRegions: 10,
      forceTourInfoRefresh: true,
    });

    // forceTourInfoRefresh가 true면 freshness 조회(groupBy) 자체를 호출하지 않는다.
    expect(dataSnapshotGroupBy).not.toHaveBeenCalled();
    expect(fetchTourInfo).toHaveBeenCalledTimes(1);
    expect(result.results.find((r) => r.sourceCode === `TOUR_INFO:${REGION.code}`)?.status).toBe("SUCCESS");
  });
});
