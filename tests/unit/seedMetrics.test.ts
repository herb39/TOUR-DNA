// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { normalizedMetricStore, normalizedMetricUpsert, dataSourceFindUniqueOrThrow, regionFindUniqueOrThrow } =
  vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    function keyOf(w: { regionId: string; baseYm: string; metricCode: string }) {
      return `${w.regionId}|${w.baseYm}|${w.metricCode}`;
    }
    return {
      normalizedMetricStore: store,
      normalizedMetricUpsert: vi.fn(async ({ where, update, create }: { where: { regionId_baseYm_metricCode: { regionId: string; baseYm: string; metricCode: string } }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        const k = keyOf(where.regionId_baseYm_metricCode);
        const existing = store.get(k);
        const next = existing ? { ...existing, ...update } : { ...create };
        store.set(k, next);
        return next;
      }),
      dataSourceFindUniqueOrThrow: vi.fn(async ({ where }: { where: { code: string } }) => ({
        id: `src-${where.code}`,
        code: where.code,
        baseUrl: "https://example.test",
      })),
      regionFindUniqueOrThrow: vi.fn(async ({ where }: { where: { code: string } }) => ({
        id: `region-${where.code}`,
        code: where.code,
        level: "SIGUNGU",
      })),
    };
  });

// 실제 DB에 접속하지 않는다 — @/lib/db를 전부 mock으로 대체한다(공유 Neon DB 미사용).
vi.mock("@/lib/db", () => ({
  prisma: {
    normalizedMetric: { upsert: normalizedMetricUpsert },
    dataSource: { findUniqueOrThrow: dataSourceFindUniqueOrThrow },
    region: { findUniqueOrThrow: regionFindUniqueOrThrow },
  },
}));

import { classifyVerifiedMetricProvenance, upsertSeedMetric } from "@/lib/services/seedMetrics";

beforeEach(() => {
  vi.clearAllMocks();
  normalizedMetricStore.clear();
});

describe("classifyVerifiedMetricProvenance — seed 기준월 CURATED/ESTIMATED 판정(Phase 1-D)", () => {
  it("실키로 사람이 확인한 202605/202606은 CURATED다", () => {
    expect(classifyVerifiedMetricProvenance("202605")).toBe("CURATED");
    expect(classifyVerifiedMetricProvenance("202606")).toBe("CURATED");
  });

  it("실키 발급 전 추정치인 202508/202509은 ESTIMATED다", () => {
    expect(classifyVerifiedMetricProvenance("202508")).toBe("ESTIMATED");
    expect(classifyVerifiedMetricProvenance("202509")).toBe("ESTIMATED");
  });
});

describe("upsertSeedMetric — DataSnapshot 미생성, provenance 명시 저장(Phase 1-D)", () => {
  it("CURATED로 호출하면 NormalizedMetric.provenance가 정확히 CURATED로 저장된다", async () => {
    await upsertSeedMetric({
      sourceCode: "TAR_SVC_DEM",
      regionCode: "SGG_DAEJEON",
      baseYm: "202606",
      metricCode: "tarSvcDemIxVal",
      rawValue: 72.88,
      unit: "지수",
      provenance: "CURATED",
    });
    expect(normalizedMetricStore.get("region-SGG_DAEJEON|202606|tarSvcDemIxVal")?.provenance).toBe("CURATED");
  });

  it("ESTIMATED로 호출하면 NormalizedMetric.provenance가 정확히 ESTIMATED로 저장된다", async () => {
    await upsertSeedMetric({
      sourceCode: "VISITOR_CNT",
      regionCode: "SGG_DAEJEON",
      baseYm: "202606",
      metricCode: "visitorCnt",
      rawValue: 1_980_000,
      unit: "명",
      provenance: "ESTIMATED",
    });
    expect(normalizedMetricStore.get("region-SGG_DAEJEON|202606|visitorCnt")?.provenance).toBe("ESTIMATED");
  });

  it("upsertSeedMetric은 DataSnapshot을 전혀 건드리지 않는다(mock prisma에 dataSnapshot 자체가 없음)", async () => {
    // mock prisma 객체에 dataSnapshot 키를 아예 만들지 않았다 — 코드가 이를 참조하면 즉시 TypeError로
    // 실패하므로, 통과한다는 것 자체가 "DataSnapshot을 호출하지 않는다"는 증거다.
    await expect(
      upsertSeedMetric({
        sourceCode: "TOU_RES_DEM",
        regionCode: "SGG_JECHEON",
        baseYm: "202508",
        metricCode: "touResDemIxVal",
        rawValue: 50,
        unit: "지수",
        provenance: "ESTIMATED",
      }),
    ).resolves.not.toThrow();
  });

  it("같은 key로 재호출해도 같은 unique key로 upsert하며 새 row를 만들지 않는다(재실행 시 중복 방지)", async () => {
    await upsertSeedMetric({
      sourceCode: "TAR_SVC_DEM",
      regionCode: "SGG_JECHEON",
      baseYm: "202606",
      metricCode: "tarSjrnDsIxVal",
      rawValue: 72.86,
      unit: "지수",
      provenance: "CURATED",
    });
    await upsertSeedMetric({
      sourceCode: "TAR_SVC_DEM",
      regionCode: "SGG_JECHEON",
      baseYm: "202606",
      metricCode: "tarSjrnDsIxVal",
      rawValue: 72.86,
      unit: "지수",
      provenance: "CURATED",
    });

    expect(normalizedMetricUpsert).toHaveBeenCalledTimes(2);
    expect(normalizedMetricUpsert.mock.calls[0][0].where).toEqual(normalizedMetricUpsert.mock.calls[1][0].where);
    expect(normalizedMetricStore.size).toBe(1);
  });
});

describe("prisma/seed.ts 소스 — 가짜 API 응답 envelope가 남아있지 않은지(정적 검사, Phase 1-D)", () => {
  const seedSource = readFileSync(path.join(__dirname, "../../prisma/seed.ts"), "utf-8");

  it("가짜 성공 메시지 'NORMAL SERVICE.'를 만들지 않는다", () => {
    expect(seedSource).not.toContain("NORMAL SERVICE.");
  });

  it("dataSnapshot.upsert를 호출하지 않는다(실제 API 호출 없이 SUCCESS snapshot을 만들지 않음)", () => {
    expect(seedSource).not.toMatch(/dataSnapshot\.upsert/);
  });

  it("resultCode/resultMsg를 지어내는 envelope() 헬퍼가 남아있지 않다", () => {
    expect(seedSource).not.toMatch(/function envelope\(/);
  });

  it("VISITOR_CNT 지표는 seed.ts에서 명시적으로 ESTIMATED로 기록된다", () => {
    const visitorBlockMatch = seedSource.match(/sourceCode:\s*"VISITOR_CNT"[\s\S]{0,200}/);
    expect(visitorBlockMatch).not.toBeNull();
    expect(visitorBlockMatch?.[0]).toContain('provenance: "ESTIMATED"');
  });

  it("값이 없는 경우(isEmptyCase)는 가짜 metric을 만들지 않고 건너뛴다", () => {
    expect(seedSource).toMatch(/if \(!isEmptyCase\) \{/);
  });

  it("seed POI는 항상 sourceType: \"FIXTURE\"로 생성된다(Network 축 CURATED 판정과 일치)", () => {
    expect(seedSource).toMatch(/sourceType:\s*"FIXTURE"/);
    expect(seedSource).not.toMatch(/sourceType:\s*"API"/);
  });
});

describe("prisma/seed.ts 소스 — DEMAND_SERVICE sourceCode 정정(2026-07-23 보완)", () => {
  const seedSource = readFileSync(path.join(__dirname, "../../prisma/seed.ts"), "utf-8");

  it("DEMAND_SERVICE(tarSvcDemIxVal)는 실제 출처인 TOU_RES_DEM을 sourceCode로 쓴다", () => {
    const block = seedSource.match(/sourceCode:\s*"([^"]+)"[\s\S]{0,120}?metricCode:\s*METRIC_CODES\.DEMAND_SERVICE/);
    expect(block).not.toBeNull();
    expect(block?.[1]).toBe("TOU_RES_DEM");
  });

  it("STAY/SPEND는 여전히 TAR_SVC_DEM을 sourceCode로 쓴다(실제로 이 서비스가 맞는 지표들 — 변경 금지)", () => {
    const stayBlock = seedSource.match(/sourceCode:\s*"([^"]+)"[\s\S]{0,120}?metricCode:\s*METRIC_CODES\.STAY\b/);
    const spendBlock = seedSource.match(/sourceCode:\s*"([^"]+)"[\s\S]{0,120}?metricCode:\s*METRIC_CODES\.SPEND\b/);
    expect(stayBlock?.[1]).toBe("TAR_SVC_DEM");
    expect(spendBlock?.[1]).toBe("TAR_SVC_DEM");
  });

  it("DIVERSITY는 여전히 TOU_DIV_IX를 sourceCode로 쓴다(변경 금지)", () => {
    const block = seedSource.match(/sourceCode:\s*"([^"]+)"[\s\S]{0,120}?metricCode:\s*METRIC_CODES\.DIVERSITY\b/);
    expect(block?.[1]).toBe("TOU_DIV_IX");
  });

  it("TOU_RES_DEM DataSource가 DATA_SOURCE_SEED에 이미 존재하고 upsertDataSources()가 seedMetrics()보다 먼저 실행된다", () => {
    const dataSourceFixture = readFileSync(path.join(__dirname, "../../src/lib/fixtures/dataSources.ts"), "utf-8");
    expect(dataSourceFixture).toMatch(/code:\s*"TOU_RES_DEM"/);
    const upsertDataSourcesIdx = seedSource.indexOf("await upsertDataSources()");
    const seedMetricsIdx = seedSource.indexOf("await seedMetrics()");
    expect(upsertDataSourcesIdx).toBeGreaterThan(-1);
    expect(seedMetricsIdx).toBeGreaterThan(-1);
    expect(upsertDataSourcesIdx).toBeLessThan(seedMetricsIdx);
  });
});
