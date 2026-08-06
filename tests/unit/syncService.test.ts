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
  normalizedMetricStore,
  normalizedMetricUpsert,
  normalizedMetricUpdateMany,
  poiUpsert,
  poiFindMany,
  syncLogCreate,
  DATA_SOURCES,
  REGION,
  regionFindMany,
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
  };
});

// VISITOR_CNT(DataLabService)는 지역 필터가 없는 전국 API라 syncService.ts가 SIGUNGU 루프와 별도로
// SIDO 목록도 조회한다(region.findMany({ where: { level: "SIDO" } })) — REGION(SIGUNGU)이 SIDO 조회
// 에서도 잘못 반환되지 않도록 where.level을 실제로 구분한다.
regionFindMany.mockImplementation(async (args?: { where?: { level?: string } }) => {
  if (args?.where?.level === "SIDO") return [];
  return [REGION];
});

// 실제 외부 API를 호출하지 않는다 — 5개 어댑터를 전부 mock으로 대체한다.
vi.mock("@/lib/public-data/adapters/tarSvcDem", () => ({ fetchTarSvcDem: vi.fn() }));
vi.mock("@/lib/public-data/adapters/touDivIx", () => ({ fetchTouDivIx: vi.fn() }));
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
    dataSource: { findMany: vi.fn().mockResolvedValue(DATA_SOURCES) },
    region: { findMany: regionFindMany },
    poi: { findMany: poiFindMany, upsert: poiUpsert },
    normalizedMetric: { upsert: normalizedMetricUpsert, updateMany: normalizedMetricUpdateMany },
    dataSnapshot: { upsert: dataSnapshotUpsert, findUnique: dataSnapshotFindUnique },
    syncLog: { create: syncLogCreate },
  },
}));

import { runTourismDataSync } from "@/lib/services/syncService";
import { fetchTarSvcDem } from "@/lib/public-data/adapters/tarSvcDem";
import { fetchTouDivIx } from "@/lib/public-data/adapters/touDivIx";
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

beforeEach(() => {
  process.env.TOUR_API_SERVICE_KEY = "test-key";
  process.env.DATA_MODE = "live";
  vi.clearAllMocks();
  poiFindMany.mockResolvedValue([]);
  dataSnapshotStore.clear();
  normalizedMetricStore.clear();
  resetAdapterMocksToNoRealBody();
});

afterEach(() => {
  delete process.env.TOUR_API_SERVICE_KEY;
  delete process.env.DATA_MODE;
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
