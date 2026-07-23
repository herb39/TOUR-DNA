// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 팩토리는 파일 상단으로 hoist되므로, 그 안에서 참조하는 값은 vi.hoisted로 함께 hoist해야 한다.
const {
  dataSnapshotUpsert,
  normalizedMetricUpsert,
  poiUpsert,
  poiFindMany,
  syncLogCreate,
  DATA_SOURCES,
  REGION,
} = vi.hoisted(() => {
  return {
    dataSnapshotUpsert: vi.fn().mockResolvedValue(undefined),
    normalizedMetricUpsert: vi.fn().mockResolvedValue(undefined),
    poiUpsert: vi.fn().mockResolvedValue(undefined),
    poiFindMany: vi.fn().mockResolvedValue([]),
    syncLogCreate: vi.fn().mockResolvedValue(undefined),
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
    },
  };
});

// 실제 외부 API를 호출하지 않는다 — 5개 어댑터를 전부 mock으로 대체한다.
vi.mock("@/lib/public-data/adapters/tarSvcDem", () => ({ fetchTarSvcDem: vi.fn() }));
vi.mock("@/lib/public-data/adapters/touDivIx", () => ({ fetchTouDivIx: vi.fn() }));
vi.mock("@/lib/public-data/adapters/touResDem", () => ({ fetchTouResDem: vi.fn() }));
vi.mock("@/lib/public-data/adapters/visitorCnt", () => ({ fetchVisitorCnt: vi.fn() }));
vi.mock("@/lib/public-data/adapters/tourInfo", () => ({
  fetchTourInfo: vi.fn(),
  mapContentTypeToPoiCategory: vi.fn(() => "ATTRACTION"),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    dataSource: { findMany: vi.fn().mockResolvedValue(DATA_SOURCES) },
    region: { findMany: vi.fn().mockResolvedValue([REGION]) },
    poi: { findMany: poiFindMany, upsert: poiUpsert },
    normalizedMetric: { upsert: normalizedMetricUpsert },
    dataSnapshot: { upsert: dataSnapshotUpsert },
    syncLog: { create: syncLogCreate },
  },
}));

import { runTourismDataSync } from "@/lib/services/syncService";
import { fetchTarSvcDem } from "@/lib/public-data/adapters/tarSvcDem";
import { fetchTouDivIx } from "@/lib/public-data/adapters/touDivIx";
import { fetchTouResDem } from "@/lib/public-data/adapters/touResDem";
import { fetchVisitorCnt } from "@/lib/public-data/adapters/visitorCnt";
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
  vi.mocked(fetchVisitorCnt).mockResolvedValue({
    status: "ERROR",
    items: [],
    resultCode: "NETWORK_ERROR",
    resultMsg: "mock: no body",
    raw: null,
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
    vi.mocked(fetchVisitorCnt).mockResolvedValue({
      status: "SUCCESS",
      items: [{ baseYm: "202606", visitorCnt: 12345 }],
      resultCode: "0000",
      resultMsg: "OK",
      raw: { response: { header: { resultCode: "0000", resultMsg: "OK" } } },
    });

    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });
    await runTourismDataSync({ baseYm: "202606", triggeredBy: "CLI" });

    const calls = dataSnapshotUpsert.mock.calls.filter(
      (c) => c[0].where.dataSourceId_regionId_baseYm.dataSourceId === "src-visitor-cnt",
    );
    expect(calls).toHaveLength(2);
    // 두 번 다 정확히 같은 where(unique key) 조건으로 upsert를 호출한다 — create 전용 호출이 아니다.
    expect(calls[0][0].where).toEqual(calls[1][0].where);
  });
});
