import { describe, expect, it } from "vitest";
import {
  auditTourismDataQuality,
  DNA_AXIS_METRIC_CODES,
  RESUMABLE_SOURCE_CODES,
  type MetricForAudit,
  type PoiForAudit,
  type RegionForAudit,
  type SnapshotForAudit,
} from "@/lib/services/tourismDataQualityAudit";

const BASE_YM = "202606";

function region(code: string, name: string, overrides: Partial<RegionForAudit> = {}): RegionForAudit {
  return {
    id: `id-${code}`,
    code,
    name,
    level: "SIGUNGU",
    apiAreaCode: "51",
    apiSigunguCode: code.replace(/\D/g, "").padStart(5, "0") || "51110",
    ...overrides,
  };
}

/** 4개 재개형 소스 전부 SUCCESS로 만든 스냅샷. */
function fullSnapshots(regionId: string): SnapshotForAudit[] {
  return RESUMABLE_SOURCE_CODES.map((code) => ({ regionId, dataSourceCode: code, status: "SUCCESS" as const }));
}

/** DNA 5축 metric 전부 정상값으로 채운 항목. */
function fullMetrics(regionId: string, value = 50): MetricForAudit[] {
  return DNA_AXIS_METRIC_CODES.map((metricCode) => ({
    regionId,
    metricCode,
    baseYm: BASE_YM,
    rawValue: value,
    provenance: "LIVE_API",
  }));
}

describe("auditTourismDataQuality — 전체 완료 시나리오", () => {
  it("모든 지역이 완료되고 데이터가 정상이면 PASS를 반환한다", () => {
    const regions = [region("SGG_A", "가군", { apiSigunguCode: "11110" }), region("SGG_B", "나군", { apiSigunguCode: "11120" })];
    const snapshots = regions.flatMap((r) => fullSnapshots(r.id));
    const metrics = regions.flatMap((r, i) => fullMetrics(r.id, 30 + i * 40));
    const pois: PoiForAudit[] = regions.map((r) => ({ regionId: r.id, category: "ATTRACTION", sourceType: "API" }));

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions, snapshots, metrics, pois });

    expect(report.verdict).toBe("PASS");
    expect(report.snapshot.fullyCompleteRegions).toBe(2);
    expect(report.snapshot.incompleteRegions).toBe(0);
  });
});

describe("auditTourismDataQuality — 일부 미수집", () => {
  it("일부 지역이 미완료면 INCOMPLETE를 반환하고 ERROR로 취급하지 않는다", () => {
    const done = region("SGG_A", "가군", { apiSigunguCode: "11110" });
    const notDone = region("SGG_B", "나군", { apiSigunguCode: "11120" });
    const snapshots = fullSnapshots(done.id); // notDone은 스냅샷 자체가 없음(미수집)
    const metrics = fullMetrics(done.id);

    const report = auditTourismDataQuality({
      baseYm: BASE_YM,
      regions: [done, notDone],
      snapshots,
      metrics,
      pois: [],
    });

    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.snapshot.fullyCompleteRegions).toBe(1);
    expect(report.snapshot.incompleteRegions).toBe(1);
    expect(report.snapshot.errorRegions).toBe(0);
  });
});

describe("auditTourismDataQuality — ERROR 존재", () => {
  it("ERROR 스냅샷이 남아있으면 FAIL을 반환한다", () => {
    const r = region("SGG_A", "가군");
    const snapshots: SnapshotForAudit[] = [
      { regionId: r.id, dataSourceCode: "TAR_SVC_DEM", status: "SUCCESS" },
      { regionId: r.id, dataSourceCode: "TOU_DIV_IX", status: "ERROR" },
      { regionId: r.id, dataSourceCode: "TOU_RES_DEM", status: "SUCCESS" },
      { regionId: r.id, dataSourceCode: "TOUR_INFO", status: "SUCCESS" },
    ];

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [r], snapshots, metrics: [], pois: [] });

    expect(report.verdict).toBe("FAIL");
    expect(report.snapshot.errorRegions).toBe(1);
    expect(report.verdictReasons.some((msg) => msg.includes("ERROR"))).toBe(true);
  });
});

describe("auditTourismDataQuality — 필수 metric 대량 누락", () => {
  it("소스는 SUCCESS인데 metric이 대량으로 없으면 FAIL이다(진짜 이상)", () => {
    const regions = Array.from({ length: 10 }, (_, i) => region(`SGG_${i}`, `지역${i}`, { apiSigunguCode: String(11000 + i) }));
    const snapshots = regions.flatMap((r) => fullSnapshots(r.id));
    // 10곳 중 처음 1곳만 metric을 정상 채우고, 나머지 9곳은 SUCCESS인데도 metric이 없다(비정상).
    const metrics = fullMetrics(regions[0].id);

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions, snapshots, metrics, pois: [] });

    expect(report.verdict).toBe("FAIL");
    const demandReport = report.metric.byMetricCode.find((m) => m.metricCode === "tarSvcDemIxVal");
    expect(demandReport?.missingUnexpected).toBe(9);
  });

  it("소스가 EMPTY라 metric이 없는 것은 정상 결측으로 처리해 FAIL을 유발하지 않는다", () => {
    const r = region("SGG_A", "가군");
    const snapshots: SnapshotForAudit[] = RESUMABLE_SOURCE_CODES.map((code) => ({
      regionId: r.id,
      dataSourceCode: code,
      status: "EMPTY" as const,
    }));

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [r], snapshots, metrics: [], pois: [] });

    for (const m of report.metric.byMetricCode) {
      expect(m.missingUnexpected).toBe(0);
      expect(m.missingButEmptyOk).toBe(1);
    }
    expect(report.verdictReasons.every((msg) => !msg.includes("metric 누락"))).toBe(true);
  });
});

describe("auditTourismDataQuality — 미구현 지표(touResDemIxVal)는 항상 정상 결측", () => {
  it("touResDemIxVal은 대응 소스가 SUCCESS여도 값이 없는 것을 이상으로 판정하지 않는다", () => {
    const regions = Array.from({ length: 5 }, (_, i) => region(`SGG_${i}`, `지역${i}`, { apiSigunguCode: String(11000 + i) }));
    const snapshots = regions.flatMap((r) => fullSnapshots(r.id)); // TOU_RES_DEM 전부 SUCCESS
    // touResDemIxVal 없이 나머지 4개 축만 채운다 — 실제 시스템과 동일한 상태.
    const metrics = regions.flatMap((r) =>
      fullMetrics(r.id).filter((m) => m.metricCode !== "touResDemIxVal"),
    );

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions, snapshots, metrics, pois: [] });

    const resource = report.metric.byMetricCode.find((m) => m.metricCode === "touResDemIxVal");
    expect(resource?.missingUnexpected).toBe(0);
    expect(resource?.missingButEmptyOk).toBe(5);
    expect(report.verdict).not.toBe("FAIL");
  });
});

describe("auditTourismDataQuality — POI 미수집과 실제 0건 구분", () => {
  it("TOUR_INFO가 SUCCESS인데 POI가 0건이면 zeroPoiRegions로 잡고, 미수집 지역은 uncollectedRegions로 별도 집계한다", () => {
    const zero = region("SGG_A", "가군");
    const uncollected = region("SGG_B", "나군");
    const snapshots: SnapshotForAudit[] = [{ regionId: zero.id, dataSourceCode: "TOUR_INFO", status: "SUCCESS" }];

    const report = auditTourismDataQuality({
      baseYm: BASE_YM,
      regions: [zero, uncollected],
      snapshots,
      metrics: [],
      pois: [],
    });

    expect(report.poi.zeroPoiRegions).toBe(1);
    expect(report.poi.uncollectedRegions).toBe(1);
    expect(report.poi.tourInfoCompleteRegions).toBe(1);
  });
});

describe("auditTourismDataQuality — provenance 이상 감지", () => {
  it("provenance가 null이거나 알 수 없는 값이면 provenanceIssueCount로 잡고 경고를 남긴다(FAIL은 아님)", () => {
    const r = region("SGG_A", "가군");
    const metrics: MetricForAudit[] = [
      { regionId: r.id, metricCode: "tarSvcDemIxVal", baseYm: BASE_YM, rawValue: 40, provenance: null },
      { regionId: r.id, metricCode: "touResDemIxVal", baseYm: BASE_YM, rawValue: 40, provenance: "UNKNOWN_VALUE" },
    ];

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [r], snapshots: [], metrics, pois: [] });

    const demand = report.metric.byMetricCode.find((m) => m.metricCode === "tarSvcDemIxVal");
    const resource = report.metric.byMetricCode.find((m) => m.metricCode === "touResDemIxVal");
    expect(demand?.provenanceIssueCount).toBe(1);
    expect(resource?.provenanceIssueCount).toBe(1);
    expect(report.warnings.some((w) => w.includes("provenance"))).toBe(true);
    expect(report.verdict).not.toBe("FAIL");
  });
});

describe("auditTourismDataQuality — DNA cohort 불가능 상황 감지", () => {
  it("특정 축의 유효값이 전혀 없으면 경고를 남긴다", () => {
    const r = region("SGG_A", "가군");
    const metrics: MetricForAudit[] = [{ regionId: r.id, metricCode: "tarSvcDemIxVal", baseYm: BASE_YM, rawValue: 50, provenance: "LIVE_API" }];

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [r], snapshots: [], metrics, pois: [] });

    const emptyAxis = report.dna.axisCohorts.find((a) => a.metricCode === "touDivIxVal");
    expect(emptyAxis?.validCount).toBe(0);
    expect(emptyAxis?.warning).toContain("유효값이 전혀 없음");
  });

  it("코호트 값이 전부 동일하면 min-max가 항상 중립값만 낸다는 경고를 남긴다", () => {
    const regions = [region("SGG_A", "가군"), region("SGG_B", "나군"), region("SGG_C", "다군")];
    const metrics = regions.flatMap((r) => [
      { regionId: r.id, metricCode: "tarSvcDemIxVal", baseYm: BASE_YM, rawValue: 77, provenance: "LIVE_API" as const },
    ]);

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions, snapshots: [], metrics, pois: [] });

    const axis = report.dna.axisCohorts.find((a) => a.metricCode === "tarSvcDemIxVal");
    expect(axis?.allSame).toBe(true);
    expect(axis?.warning).toContain("중립값");
  });

  it("모든 지역에 5축 데이터가 전혀 없으면 analyzableRegions가 0이라 FAIL이다", () => {
    const regions = [region("SGG_A", "가군"), region("SGG_B", "나군")];

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions, snapshots: [], metrics: [], pois: [] });

    expect(report.dna.analyzableRegions).toBe(0);
    expect(report.verdict).toBe("FAIL");
  });
});

describe("auditTourismDataQuality — source 매핑 오류", () => {
  it("알 수 없는 DataSource 코드가 섞여 있으면 FAIL이다", () => {
    const r = region("SGG_A", "가군");
    const snapshots: SnapshotForAudit[] = [{ regionId: r.id, dataSourceCode: "UNKNOWN_SOURCE", status: "SUCCESS" }];

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [r], snapshots, metrics: [], pois: [] });

    expect(report.verdict).toBe("FAIL");
    expect(report.snapshot.unknownSourceCodes).toContain("UNKNOWN_SOURCE");
  });
});

describe("auditTourismDataQuality — 대표 지역", () => {
  it("강릉·경주·제천이 Region 목록에 없으면 found=false로 표시한다", () => {
    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [], snapshots: [], metrics: [], pois: [] });

    expect(report.highlights).toHaveLength(3);
    expect(report.highlights.every((h) => h.found === false)).toBe(true);
  });

  it("강릉이 있고 4개 소스 SUCCESS + 5축 metric 전부 있으면 hasAllAxisMetrics=true다", () => {
    const gangneung = region("SGG_GANGNEUNG", "강릉시");
    const snapshots = fullSnapshots(gangneung.id);
    const metrics = fullMetrics(gangneung.id);

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [gangneung], snapshots, metrics, pois: [] });

    const highlight = report.highlights.find((h) => h.code === "SGG_GANGNEUNG");
    expect(highlight?.found).toBe(true);
    expect(highlight?.hasAllAxisMetrics).toBe(true);
  });
});

describe("auditTourismDataQuality — Region 범위", () => {
  it("apiSigunguCode 중복과 누락을 감지한다", () => {
    const a = region("SGG_A", "가군", { apiSigunguCode: "11110" });
    const b = region("SGG_B", "나군", { apiSigunguCode: "11110" });
    const c = region("SGG_C", "다군", { apiSigunguCode: null });

    const report = auditTourismDataQuality({ baseYm: BASE_YM, regions: [a, b, c], snapshots: [], metrics: [], pois: [] });

    expect(report.region.duplicateApiSigunguCodes).toEqual(["11110"]);
    expect(report.region.missingApiCode).toBe(1);
    expect(report.region.analyzable).toBe(2);
  });
});
