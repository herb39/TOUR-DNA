import { prisma } from "@/lib/db";
import {
  auditTourismDataQuality,
  RESUMABLE_SOURCE_CODES,
  DNA_AXIS_METRIC_CODES,
  type RegionForAudit,
  type SnapshotForAudit,
  type MetricForAudit,
  type PoiForAudit,
  type TourismDataQualityReport,
} from "./tourismDataQualityAudit";

/**
 * Phase 2-A(2026-08-11): "DB에 있는 가장 최신 baseYm"과 "서비스 분석이 실제로 쓰는 baseYm"을
 * 분리하는 최소 기반. 기존에는 `computeProjectAnalysis`가 `process.env.TOUR_DATA_BASE_YM ??
 * DEFAULT_BASE_YM`이라는 정적값을 그대로 썼다 — sync로 새 baseYm이 일부만 채워져도(STAGING) 이
 * env/상수를 사람이 수동으로 바꾸기 전까지는 영향이 없었지만, 반대로 말하면 "검증되지 않은 값"을
 * 실수로 넣어도 막을 방법이 없었다. 이 파일은 `Dataset` 테이블(baseYm+status) 하나로 "지금 분석에
 * 써도 되는 baseYm이 정확히 무엇인가"를 단일하게 결정한다.
 *
 * 완전성 판정은 새로 만들지 않고 기존 `auditTourismDataQuality`(scripts/audit-tourism-data.ts가 쓰는
 * 것과 동일한 순수 함수)를 그대로 재사용한다 — 같은 기준으로 두 번 판정하는 코드를 만들지 않는다.
 */

async function fetchAuditInputs(baseYm: string) {
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

  return { regions, snapshots, metrics, pois };
}

export interface DatasetCompletenessResult {
  baseYm: string;
  /** true면 activateDataset()이 이 baseYm을 ACTIVE로 승격할 수 있다. */
  complete: boolean;
  /** 판정에 사용한 상세 근거 — 그대로 로그/UI에 노출 가능. */
  report: TourismDataQualityReport;
}

/**
 * baseYm 하나가 "전국 분석 dataset 후보"로 충분한지 read-only로 판정한다(Phase 2-A 최소 foundation).
 * 완전성 기준: 필수 4개 소스(TAR_SVC_DEM/TOU_DIV_IX/TOU_RES_DEM/TOUR_INFO)가 SIGUNGU 전 지역에서
 * SUCCESS 또는 EMPTY이고(미완료 지역 0), ERROR가 하나도 없어야 한다. VISITOR_CNT는 이 게이트에
 * 포함하지 않는다 — 기초/광역 원자적 게이트로 별도 관리되고(syncService.ts) SIGUNGU 단위 완전성
 * 기준과 집계 단위가 달라, 여기 억지로 섞으면 잘못된 완전성 판정을 만들 위험이 있다(2026-08-11 결정,
 * 필요해지면 별도 검토). DNA drift 검사는 아직 하지 않는다 — Phase 2-C에서 이 결과에 이어붙인다.
 */
export async function checkDatasetCompleteness(baseYm: string): Promise<DatasetCompletenessResult> {
  const { regions, snapshots, metrics, pois } = await fetchAuditInputs(baseYm);
  const report = auditTourismDataQuality({ baseYm, regions, snapshots, metrics, pois });
  const complete =
    report.verdict !== "FAIL" && report.snapshot.incompleteRegions === 0 && report.snapshot.errorRegions === 0;
  return { baseYm, complete, report };
}

/** 지금 서비스 분석이 써야 하는 baseYm. ACTIVE가 없으면 null — 호출부가 "조용히 최신값 사용" 같은
 * 폴백을 만들지 못하도록, 이 함수는 STAGING/ARCHIVED를 절대 대신 반환하지 않는다. */
export async function getActiveDatasetBaseYm(): Promise<string | null> {
  const active = await prisma.dataset.findFirst({ where: { status: "ACTIVE" } });
  return active?.baseYm ?? null;
}

export type ActivateDatasetResult =
  | { ok: true; baseYm: string; previousActiveBaseYm: string | null }
  | { ok: false; reason: "INCOMPLETE"; report: TourismDataQualityReport };

/**
 * baseYm을 ACTIVE로 승격한다 — 자동 승격(스케줄링)은 Phase 2-C에서 다룬다. 여기서는 다음만 보장한다:
 * (1) incomplete dataset은 거부, (2) ACTIVE는 항상 최대 1개, (3) 이전 ACTIVE는 ARCHIVED로 내려간다.
 * DNA drift gate는 아직 없다(Phase 2-C에서 이 함수 앞에 검사를 추가할 수 있도록 반환 타입을
 * 판별 가능한 형태로 열어 둔다).
 */
export async function activateDataset(baseYm: string): Promise<ActivateDatasetResult> {
  const completeness = await checkDatasetCompleteness(baseYm);
  if (!completeness.complete) {
    return { ok: false, reason: "INCOMPLETE", report: completeness.report };
  }

  const previousActive = await prisma.dataset.findFirst({ where: { status: "ACTIVE" } });

  await prisma.$transaction([
    prisma.dataset.updateMany({ where: { status: "ACTIVE" }, data: { status: "ARCHIVED" } }),
    prisma.dataset.upsert({
      where: { baseYm },
      update: { status: "ACTIVE", activatedAt: new Date() },
      create: { baseYm, status: "ACTIVE", activatedAt: new Date() },
    }),
  ]);

  return { ok: true, baseYm, previousActiveBaseYm: previousActive?.baseYm ?? null };
}
