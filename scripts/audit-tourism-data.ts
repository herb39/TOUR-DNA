/**
 * 전국 관광 데이터 품질 검증(읽기 전용, 2026-08-10 도입) — baseYm 기준으로 Region/DataSnapshot/
 * NormalizedMetric/Poi를 조회해 DNA 분석에 쓸 수 있는 상태인지 요약·판정한다. 판정 로직 자체는
 * src/lib/services/tourismDataQualityAudit.ts의 순수 함수 auditTourismDataQuality()이고, 이
 * 스크립트는 그 입력을 실제로 조회해 넘기고 결과를 콘솔에 출력하는 역할만 한다.
 *
 * DB에 어떤 쓰기도 하지 않는다(findMany만 사용) — sync/seed/migration과 완전히 분리된 별도 도구다.
 *
 * 사용법:
 *   npm run audit:tourism-data -- --base-ym=202606
 */
import { prisma } from "../src/lib/db";
import {
  auditTourismDataQuality,
  RESUMABLE_SOURCE_CODES,
  DNA_AXIS_METRIC_CODES,
  type RegionForAudit,
  type SnapshotForAudit,
  type MetricForAudit,
  type PoiForAudit,
} from "../src/lib/services/tourismDataQualityAudit";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function formatCounts(c: { SUCCESS: number; EMPTY: number; ERROR: number; NONE: number }): string {
  return `SUCCESS ${c.SUCCESS} / EMPTY ${c.EMPTY} / ERROR ${c.ERROR} / 없음 ${c.NONE}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseYm = args["base-ym"];
  if (!baseYm) {
    console.error("사용법: npm run audit:tourism-data -- --base-ym=202606");
    process.exitCode = 1;
    return;
  }

  const regionRows = await prisma.region.findMany({
    select: { id: true, code: true, name: true, level: true, apiAreaCode: true, apiSigunguCode: true },
  });
  const regions: RegionForAudit[] = regionRows as RegionForAudit[];

  const dataSources = await prisma.dataSource.findMany({
    where: { code: { in: [...RESUMABLE_SOURCE_CODES, "VISITOR_CNT"] } },
    select: { id: true, code: true },
  });
  const sourceCodeById = new Map(dataSources.map((d) => [d.id, d.code]));

  const snapshotRows = await prisma.dataSnapshot.findMany({
    where: { baseYm, dataSourceId: { in: dataSources.map((d) => d.id) } },
    select: { regionId: true, dataSourceId: true, status: true },
  });
  const snapshots: SnapshotForAudit[] = snapshotRows.map((s) => ({
    regionId: s.regionId,
    dataSourceCode: sourceCodeById.get(s.dataSourceId) ?? "UNKNOWN",
    status: s.status as SnapshotForAudit["status"],
  }));

  const metricRows = await prisma.normalizedMetric.findMany({
    where: { metricCode: { in: [...DNA_AXIS_METRIC_CODES] } },
    select: { regionId: true, metricCode: true, baseYm: true, rawValue: true, provenance: true },
  });
  const metrics: MetricForAudit[] = metricRows as MetricForAudit[];

  const poiRows = await prisma.poi.findMany({ select: { regionId: true, category: true, sourceType: true } });
  const pois: PoiForAudit[] = poiRows as PoiForAudit[];

  const report = auditTourismDataQuality({ baseYm, regions, snapshots, metrics, pois });

  console.log(`[전국 관광 데이터 검증]`);
  console.log(`baseYm: ${report.baseYm}\n`);

  console.log(`지역`);
  console.log(`- SIGUNGU: ${report.region.totalSigungu}`);
  console.log(`- API 코드 있는 분석 대상: ${report.region.analyzable}`);
  console.log(`- API 코드 누락: ${report.region.missingApiCode}`);
  console.log(`- apiSigunguCode 중복: ${report.region.duplicateApiSigunguCodes.length}건${report.region.duplicateApiSigunguCodes.length > 0 ? ` (${report.region.duplicateApiSigunguCodes.join(", ")})` : ""}`);

  console.log(`\nSnapshot(baseYm=${baseYm})`);
  for (const code of RESUMABLE_SOURCE_CODES) console.log(`- ${code}: ${formatCounts(report.snapshot.bySource[code])}`);
  console.log(`- VISITOR_CNT: ${formatCounts(report.snapshot.visitorCnt)}`);
  console.log(`- 4개 소스 전부 완료: ${report.snapshot.fullyCompleteRegions}`);
  console.log(`- 미완료: ${report.snapshot.incompleteRegions}`);
  console.log(`- ERROR 잔존: ${report.snapshot.errorRegions}`);
  if (report.snapshot.unknownSourceCodes.length > 0) {
    console.log(`- 알 수 없는 DataSource 코드: ${report.snapshot.unknownSourceCodes.join(", ")}`);
  }

  console.log(`\nNormalizedMetric`);
  for (const m of report.metric.byMetricCode) {
    console.log(
      `- ${m.metricCode}: 존재 ${m.present} / EMPTY라 정상 결측 ${m.missingButEmptyOk} / SUCCESS인데 누락(이상) ${m.missingUnexpected} / provenance 이상 ${m.provenanceIssueCount} / rawValue 이상 ${m.rawValueIssueCount}`,
    );
  }
  console.log(`- baseYm 불일치: ${report.metric.baseYmMismatchCount}건`);
  console.log(`- 중복 조합: ${report.metric.duplicateCount}건`);

  console.log(`\nDNA`);
  for (const a of report.dna.axisCohorts) {
    console.log(`- ${a.metricCode} 코호트 크기: ${a.validCount}곳${a.warning ? ` — 경고: ${a.warning}` : ""}`);
  }
  console.log(`- network 축 가능(POI 1건 이상) 지역: ${report.dna.networkEligibleRegions}`);
  console.log(`- 분석 가능 지역(5축 중 최소 1개 데이터 존재): ${report.dna.analyzableRegions}`);
  console.log(`- 제외 지역: ${report.dna.excludedRegions}`);
  for (const [reason, count] of Object.entries(report.dna.exclusionReasons)) {
    if (count > 0) console.log(`  - ${reason}: ${count}곳`);
  }

  console.log(`\n데이터 분포`);
  for (const d of report.distribution) {
    if (Number.isNaN(d.min)) {
      console.log(`- ${d.metricCode}: 값 없음`);
      continue;
    }
    console.log(
      `- ${d.metricCode}: 최소 ${d.min} / 최대 ${d.max} / 중앙값 ${d.median} / 0값 비율 ${(d.zeroOrNullRatio * 100).toFixed(1)}%${d.warning ? ` — 경고: ${d.warning}` : ""}`,
    );
  }

  console.log(`\nPOI`);
  console.log(`- TOUR_INFO 완료 지역: ${report.poi.tourInfoCompleteRegions}`);
  console.log(`- TOUR_INFO 미수집 지역: ${report.poi.uncollectedRegions}`);
  console.log(`- POI 0건(TOUR_INFO는 SUCCESS) 지역: ${report.poi.zeroPoiRegions}`);
  if (report.poi.maxPoiRegion) {
    console.log(`- 최대: ${report.poi.maxPoiRegion.name}(${report.poi.maxPoiRegion.code}) ${report.poi.maxPoiRegion.count}건`);
  }
  if (report.poi.suspiciouslyHighRegions.length > 0) {
    console.log(`- 비정상적으로 많은 지역: ${report.poi.suspiciouslyHighRegions.map((r) => `${r.name}(${r.count}건)`).join(", ")}`);
  }

  console.log(`\n대표 지역(강릉·경주·제천)`);
  for (const h of report.highlights) {
    if (!h.found) {
      console.log(`- ${h.code}: 지역을 찾지 못함`);
      continue;
    }
    const statusText = RESUMABLE_SOURCE_CODES.map((c) => `${c}=${h.snapshotStatuses[c]}`).join(", ");
    console.log(`- ${h.name}(${h.code}): ${statusText}, DNA 축 metric 전부 존재=${h.hasAllAxisMetrics}`);
  }

  if (report.warnings.length > 0) {
    console.log(`\n경고(${report.warnings.length}건)`);
    report.warnings.forEach((w) => console.log(`- ${w}`));
  }

  console.log(`\n최종 판정: ${report.verdict}`);
  if (report.verdictReasons.length > 0) {
    report.verdictReasons.forEach((r) => console.log(`- ${r}`));
  }

  if (report.verdict === "FAIL") process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
