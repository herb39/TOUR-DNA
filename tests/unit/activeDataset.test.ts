// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 2-A(2026-08-11) — "DB에 있는 가장 최신 baseYm"이 아니라 명시적으로 검증·승격된 ACTIVE
 * dataset만 분석에 쓰도록 하는 기반. 핵심 불변조건을 여기서 고정한다:
 * (1) getActiveDatasetBaseYm은 STAGING/ARCHIVED를 절대 대신 반환하지 않는다.
 * (2) activateDataset은 incomplete dataset을 거부한다.
 * (3) activateDataset은 항상 ACTIVE를 최대 1개로 유지한다(기존 ACTIVE는 ARCHIVED로 내려감).
 */

const regionFindMany = vi.fn();
const dataSourceFindMany = vi.fn();
const dataSourceFindUnique = vi.fn();
const dataSnapshotFindMany = vi.fn();
const dataSnapshotGroupBy = vi.fn();
const normalizedMetricFindMany = vi.fn();
const poiFindMany = vi.fn();
const datasetFindFirst = vi.fn();
const datasetFindUnique = vi.fn();
const datasetUpdateMany = vi.fn();
const datasetUpsert = vi.fn();
const datasetCreate = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    region: { findMany: (...args: unknown[]) => regionFindMany(...args) },
    dataSource: {
      findMany: (...args: unknown[]) => dataSourceFindMany(...args),
      findUnique: (...args: unknown[]) => dataSourceFindUnique(...args),
    },
    dataSnapshot: {
      findMany: (...args: unknown[]) => dataSnapshotFindMany(...args),
      groupBy: (...args: unknown[]) => dataSnapshotGroupBy(...args),
    },
    normalizedMetric: { findMany: (...args: unknown[]) => normalizedMetricFindMany(...args) },
    poi: { findMany: (...args: unknown[]) => poiFindMany(...args) },
    dataset: {
      findFirst: (...args: unknown[]) => datasetFindFirst(...args),
      findUnique: (...args: unknown[]) => datasetFindUnique(...args),
      updateMany: (...args: unknown[]) => datasetUpdateMany(...args),
      upsert: (...args: unknown[]) => datasetUpsert(...args),
      create: (...args: unknown[]) => datasetCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import {
  activateDataset,
  checkDatasetCompleteness,
  getActiveDatasetBaseYm,
  ensureStagingDataset,
  getStagingDatasetBaseYm,
} from "@/lib/services/activeDataset";

const DATA_SOURCES = [
  { id: "src-tar-svc", code: "TAR_SVC_DEM" },
  { id: "src-tou-div", code: "TOU_DIV_IX" },
  { id: "src-tou-res", code: "TOU_RES_DEM" },
  { id: "src-tour-info", code: "TOUR_INFO" },
  { id: "src-visitor", code: "VISITOR_CNT" },
];

const REGIONS = [
  { id: "r1", code: "SGG_A", name: "A시", level: "SIGUNGU", apiAreaCode: "1", apiSigunguCode: "1000" },
  { id: "r2", code: "SGG_B", name: "B시", level: "SIGUNGU", apiAreaCode: "1", apiSigunguCode: "2000" },
];

/** 필수 4개 소스 전부 SUCCESS인 "완전한" snapshot 세트. */
function completeSnapshots() {
  const sourceIds = ["src-tar-svc", "src-tou-div", "src-tou-res", "src-tour-info"];
  return REGIONS.flatMap((r) => sourceIds.map((dataSourceId) => ({ regionId: r.id, dataSourceId, status: "SUCCESS" })));
}

/** SUCCESS로 표시한 4개 소스 각각이 실제로 내놓아야 하는 metricCode 전부를 채운 "완전한"
 * NormalizedMetric 세트다 — touResDemIxVal은 auditTourismDataQuality가 의도적으로 "항상 결측이
 * 정상"으로 취급하는 값이라(tourismDataQualityAudit.ts 주석 참고) 여기 포함하지 않는다. 하나라도
 * 빠지면 "SUCCESS인데 metric 누락"으로 판정돼 completeSnapshots()만으로는 complete=true가 되지
 * 않는다(실제로 이 테스트를 작성하며 처음 발견함). */
function completeMetrics() {
  const metricCodes = ["tarSvcDemIxVal", "tarSjrnDsIxVal", "tarExpDsIxVal", "touDivIxVal"];
  return REGIONS.flatMap((r) =>
    metricCodes.map((metricCode) => ({ regionId: r.id, metricCode, baseYm: "202606", rawValue: 70, provenance: "LIVE_API" })),
  );
}

function baseMocks() {
  regionFindMany.mockResolvedValue(REGIONS);
  dataSourceFindMany.mockResolvedValue(DATA_SOURCES);
  normalizedMetricFindMany.mockResolvedValue([]);
  poiFindMany.mockResolvedValue([]);
}

beforeEach(() => {
  regionFindMany.mockReset();
  dataSourceFindMany.mockReset();
  dataSourceFindUnique.mockReset();
  dataSnapshotFindMany.mockReset();
  dataSnapshotGroupBy.mockReset();
  normalizedMetricFindMany.mockReset();
  poiFindMany.mockReset();
  datasetFindFirst.mockReset();
  datasetFindUnique.mockReset();
  datasetUpdateMany.mockReset();
  datasetUpsert.mockReset();
  datasetCreate.mockReset();
  transaction.mockReset();
  transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  datasetUpdateMany.mockResolvedValue({ count: 0 });
  datasetUpsert.mockResolvedValue({ id: "ds-1", baseYm: "202606", status: "ACTIVE", activatedAt: new Date() });
  datasetCreate.mockResolvedValue({ id: "ds-2", baseYm: "202607", status: "STAGING", activatedAt: null });
  // Phase 2-D(2026-08-12): checkDatasetCompleteness가 이제 fetchTourInfoLastFreshFetchByRegion()도
  // 호출한다 — 기본값은 "TOUR_INFO DataSource를 찾지 못함"으로 두어 freshness가 항상 NEVER_FETCHED가
  // 되게 한다(기존 테스트들의 completeSnapshots()가 이미 TOUR_INFO를 이번 baseYm에 SUCCESS로 채워
  // 두므로 이 기본값과 무관하게 그대로 통과한다).
  dataSourceFindUnique.mockResolvedValue(null);
  dataSnapshotGroupBy.mockResolvedValue([]);
  // ensureStagingDataset/getStagingDatasetBaseYm은 dataSyncTargetGuard를 거친다 — 다른 스위트
  // (syncService.test.ts)와 동일한 관례로 기본은 로컬 호스트로 설정하고, 원격 차단 테스트에서만 덮어쓴다.
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/tour_dna_local";
  delete process.env.ALLOW_REMOTE_DATA_SYNC;
});

describe("getActiveDatasetBaseYm", () => {
  it("ACTIVE dataset이 있으면 그 baseYm을 반환한다", async () => {
    datasetFindFirst.mockResolvedValue({ baseYm: "202606", status: "ACTIVE" });
    expect(await getActiveDatasetBaseYm()).toBe("202606");
    expect(datasetFindFirst).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
  });

  it("ACTIVE dataset이 없으면 null을 반환한다 — STAGING/ARCHIVED를 대신 반환하지 않는다", async () => {
    datasetFindFirst.mockResolvedValue(null);
    expect(await getActiveDatasetBaseYm()).toBeNull();
  });
});

describe("checkDatasetCompleteness", () => {
  it("필수 4개 소스가 전 지역 SUCCESS이고 ERROR가 없으면 complete=true다", async () => {
    baseMocks();
    dataSnapshotFindMany.mockResolvedValue(completeSnapshots());
    normalizedMetricFindMany.mockResolvedValue(completeMetrics());

    const result = await checkDatasetCompleteness("202606");

    expect(result.complete).toBe(true);
    expect(result.report.snapshot.incompleteRegions).toBe(0);
    expect(result.report.snapshot.errorRegions).toBe(0);
  });

  it("일부 지역이 미완료면(SGG_B가 TOUR_INFO 없음) complete=false다", async () => {
    baseMocks();
    const snapshots = completeSnapshots().filter(
      (s) => !(s.regionId === "r2" && s.dataSourceId === "src-tour-info"),
    );
    dataSnapshotFindMany.mockResolvedValue(snapshots);

    const result = await checkDatasetCompleteness("202606");

    expect(result.complete).toBe(false);
    expect(result.report.snapshot.incompleteRegions).toBeGreaterThan(0);
  });

  it("ERROR가 하나라도 남아있으면 complete=false다", async () => {
    baseMocks();
    const snapshots = completeSnapshots().map((s) =>
      s.regionId === "r1" && s.dataSourceId === "src-tar-svc" ? { ...s, status: "ERROR" } : s,
    );
    dataSnapshotFindMany.mockResolvedValue(snapshots);

    const result = await checkDatasetCompleteness("202606");

    expect(result.complete).toBe(false);
    expect(result.report.snapshot.errorRegions).toBeGreaterThan(0);
  });
});

describe("activateDataset", () => {
  it("incomplete dataset은 거부하고 DB에 어떤 쓰기도 하지 않는다", async () => {
    baseMocks();
    dataSnapshotFindMany.mockResolvedValue([]); // 아무 snapshot도 없음 = 완전 미완료

    const result = await activateDataset("202607");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INCOMPLETE");
    expect(transaction).not.toHaveBeenCalled();
    expect(datasetUpdateMany).not.toHaveBeenCalled();
    expect(datasetUpsert).not.toHaveBeenCalled();
  });

  it("complete dataset은 승격에 성공하고, 기존 ACTIVE가 있었다면 그 baseYm을 previousActiveBaseYm으로 알려준다", async () => {
    baseMocks();
    dataSnapshotFindMany.mockResolvedValue(completeSnapshots());
    normalizedMetricFindMany.mockResolvedValue(completeMetrics());
    datasetFindFirst.mockResolvedValue({ baseYm: "202605", status: "ACTIVE" });

    const result = await activateDataset("202606");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.baseYm).toBe("202606");
      expect(result.previousActiveBaseYm).toBe("202605");
    }
  });

  it("승격 시 기존 ACTIVE 전체를 ARCHIVED로 내리는 updateMany와 새 ACTIVE를 만드는 upsert를 트랜잭션으로 함께 실행한다", async () => {
    baseMocks();
    dataSnapshotFindMany.mockResolvedValue(completeSnapshots());
    normalizedMetricFindMany.mockResolvedValue(completeMetrics());
    datasetFindFirst.mockResolvedValue(null);

    await activateDataset("202606");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(datasetUpdateMany).toHaveBeenCalledWith({ where: { status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    expect(datasetUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { baseYm: "202606" },
        update: expect.objectContaining({ status: "ACTIVE" }),
        create: expect.objectContaining({ baseYm: "202606", status: "ACTIVE" }),
      }),
    );
  });

  it("ACTIVE가 처음부터 없었다면 previousActiveBaseYm은 null이다", async () => {
    baseMocks();
    dataSnapshotFindMany.mockResolvedValue(completeSnapshots());
    normalizedMetricFindMany.mockResolvedValue(completeMetrics());
    datasetFindFirst.mockResolvedValue(null);

    const result = await activateDataset("202606");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.previousActiveBaseYm).toBeNull();
  });
});

/**
 * Phase 2-B(2026-08-11) — discovery가 찾은 새 baseYm을 STAGING dataset으로 등록하는 부분.
 * 핵심 불변조건: (1) 이 함수만으로는 ACTIVE가 절대 바뀌지 않는다(updateMany/upsert/$transaction을
 * 전혀 호출하지 않는다). (2) 같은 baseYm이 이미 있으면(어떤 상태든) 중복 생성하지 않는다.
 * (3) 이미 다른 baseYm이 STAGING이면 새 STAGING을 만들지 않는다(quota 분산 방지 정책).
 * (4) 원격 DB 대상이면 즉시 차단하고 DB 쓰기를 시도하지 않는다.
 */
describe("ensureStagingDataset", () => {
  it("동일 baseYm이 전혀 없으면 STAGING으로 새로 생성한다", async () => {
    datasetFindUnique.mockResolvedValue(null);
    datasetFindFirst.mockResolvedValue(null);

    const result = await ensureStagingDataset("202607");

    expect(result.outcome).toBe("CREATED");
    if (result.outcome === "CREATED") expect(result.baseYm).toBe("202607");
    expect(datasetCreate).toHaveBeenCalledWith({ data: { baseYm: "202607", status: "STAGING" } });
    expect(datasetUpdateMany).not.toHaveBeenCalled();
    expect(datasetUpsert).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("같은 baseYm이 이미 존재하면(어떤 상태든) 중복 생성하지 않고 기존 상태를 그대로 알려준다", async () => {
    datasetFindUnique.mockResolvedValue({ baseYm: "202607", status: "ACTIVE" });

    const result = await ensureStagingDataset("202607");

    expect(result.outcome).toBe("ALREADY_EXISTS");
    if (result.outcome === "ALREADY_EXISTS") expect(result.existingStatus).toBe("ACTIVE");
    expect(datasetCreate).not.toHaveBeenCalled();
    expect(datasetFindFirst).not.toHaveBeenCalled();
  });

  it("이미 다른 baseYm이 STAGING이면 새 STAGING을 만들지 않는다(quota 분산 방지)", async () => {
    datasetFindUnique.mockResolvedValue(null);
    datasetFindFirst.mockResolvedValue({ baseYm: "202607", status: "STAGING" });

    const result = await ensureStagingDataset("202608");

    expect(result.outcome).toBe("BLOCKED_BY_OTHER_STAGING");
    if (result.outcome === "BLOCKED_BY_OTHER_STAGING") expect(result.blockingBaseYm).toBe("202607");
    expect(datasetCreate).not.toHaveBeenCalled();
  });

  it("원격 DATABASE_URL이면 DB 조회 없이 즉시 차단한다", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@ep-dawn-sea.aws.neon.tech/neondb";

    const result = await ensureStagingDataset("202607");

    expect(result.outcome).toBe("BLOCKED_BY_SYNC_TARGET_GUARD");
    expect(datasetFindUnique).not.toHaveBeenCalled();
    expect(datasetFindFirst).not.toHaveBeenCalled();
    expect(datasetCreate).not.toHaveBeenCalled();
  });
});

describe("getStagingDatasetBaseYm", () => {
  it("STAGING dataset이 있으면 그 baseYm을 반환한다", async () => {
    datasetFindFirst.mockResolvedValue({ baseYm: "202607", status: "STAGING" });
    expect(await getStagingDatasetBaseYm()).toBe("202607");
    expect(datasetFindFirst).toHaveBeenCalledWith({ where: { status: "STAGING" } });
  });

  it("STAGING dataset이 없으면 null을 반환한다", async () => {
    datasetFindFirst.mockResolvedValue(null);
    expect(await getStagingDatasetBaseYm()).toBeNull();
  });
});
