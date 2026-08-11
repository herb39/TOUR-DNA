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
import { checkDataSyncTarget, ALLOW_REMOTE_DATA_SYNC_ENV } from "./dataSyncTargetGuard";
import { fetchTourInfoLastFreshFetchByRegion } from "./tourInfoFreshnessLookup";

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

  // Phase 2-D(2026-08-12): TOUR_INFO는 baseYm 무관 정적 API라, 완전성 판정에 이번 baseYm 스냅샷뿐
  // 아니라 region별 최근 TTL freshness도 함께 넘긴다.
  const tourInfoFreshnessMap = await fetchTourInfoLastFreshFetchByRegion();
  const tourInfoFreshnessByRegion: Record<string, Date | null> = Object.fromEntries(
    regions.map((r) => [r.id, tourInfoFreshnessMap.get(r.id) ?? null]),
  );

  return { regions, snapshots, metrics, pois, tourInfoFreshnessByRegion, now: new Date() };
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
  const { regions, snapshots, metrics, pois, tourInfoFreshnessByRegion, now } = await fetchAuditInputs(baseYm);
  const report = auditTourismDataQuality({ baseYm, regions, snapshots, metrics, pois, tourInfoFreshnessByRegion, now });
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

export type DatasetStatusValue = "STAGING" | "ACTIVE" | "ARCHIVED";

export type EnsureStagingDatasetResult =
  | { outcome: "CREATED"; baseYm: string }
  | { outcome: "ALREADY_EXISTS"; baseYm: string; existingStatus: DatasetStatusValue }
  | { outcome: "BLOCKED_BY_OTHER_STAGING"; baseYm: string; blockingBaseYm: string }
  | { outcome: "BLOCKED_BY_SYNC_TARGET_GUARD"; baseYm: string; blockedReason: string };

/**
 * Phase 2-B(2026-08-11): discovery(`datasetDiscovery.ts`)가 찾은 새 baseYm을 STAGING dataset으로
 * 등록한다. 이 함수만으로는 ACTIVE가 절대 바뀌지 않는다 — `activateDataset()`을 별도로(그리고 사람이
 * 직접) 호출해야만 승격된다.
 *
 * 정책(운영 단순성 우선 — 여러 STAGING을 동시에 허용하면 제한된 일일 API 호출 한도가 여러 baseYm에
 * 분산돼 어느 쪽도 완료되지 않는 문제가 생긴다): 이미 다른 baseYm이 STAGING이면 새 STAGING을 만들지
 * 않는다 — 기존 STAGING을 ACTIVE로 승격하거나 명시적으로 정리한 뒤에만 다음 baseYm으로 넘어간다.
 * 같은 baseYm이 이미 어떤 상태(STAGING/ACTIVE/ARCHIVED)로든 존재하면 중복 생성하지 않고 기존 상태를
 * 그대로 보고한다. Dataset 테이블에 실제로 쓰기가 발생하므로, 다른 배치 진입점(syncService.ts)과
 * 동일하게 로컬 DB 전용 가드(`checkDataSyncTarget`)를 통과해야만 진행한다.
 */
export async function ensureStagingDataset(baseYm: string): Promise<EnsureStagingDatasetResult> {
  const targetCheck = checkDataSyncTarget(process.env.DATABASE_URL, process.env[ALLOW_REMOTE_DATA_SYNC_ENV]);
  if (!targetCheck.allowed) {
    return {
      outcome: "BLOCKED_BY_SYNC_TARGET_GUARD",
      baseYm,
      blockedReason: targetCheck.blockedReason ?? "알 수 없는 사유로 차단됨",
    };
  }

  const existing = await prisma.dataset.findUnique({ where: { baseYm } });
  if (existing) {
    return { outcome: "ALREADY_EXISTS", baseYm, existingStatus: existing.status as DatasetStatusValue };
  }

  const otherStaging = await prisma.dataset.findFirst({ where: { status: "STAGING" } });
  if (otherStaging) {
    return { outcome: "BLOCKED_BY_OTHER_STAGING", baseYm, blockingBaseYm: otherStaging.baseYm };
  }

  await prisma.dataset.create({ data: { baseYm, status: "STAGING" } });
  return { outcome: "CREATED", baseYm };
}

/** 현재 STAGING dataset의 baseYm(정책상 최대 1개 — `ensureStagingDataset` 참고). 여러 실행에 걸친
 * incremental sync가 어느 baseYm을 대상으로 해야 하는지 CLI(`--dataset=staging`)가 조회할 때 쓴다. */
export async function getStagingDatasetBaseYm(): Promise<string | null> {
  const staging = await prisma.dataset.findFirst({ where: { status: "STAGING" } });
  return staging?.baseYm ?? null;
}
