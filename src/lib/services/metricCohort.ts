import { prisma } from "@/lib/db";
import type { AdminLevel, DataProvenance, RegionMetricValue } from "@/lib/domain/types";

/**
 * 동일 행정단위·기준월·지표 코드의 전체 코호트(대상 지역 포함)를 DB에서 읽어온다.
 *
 * provenance/isSnapshotFallback 판정 규칙(Phase 1-C, 2026-07-23):
 * `NormalizedMetric.provenance`가 정확히 `"LIVE_API"`로 확인된 값만 LIVE(비-fallback)로 취급한다.
 * `NULL`(아직 provenance 추적이 없던 과거 레코드 — seed fixture인지 실 API 결과인지 현재 저장 상태만으로
 * 구분할 방법이 없다)과 그 외 모든 값(`CACHED_API`/`CURATED`/`ESTIMATED`/`MISSING`)은 전부 fallback으로
 * 취급한다 — NULL을 "값이 있으니 LIVE겠지"로 승격시키지 않는다(마스터 문서 1-2절 원칙).
 */
export async function fetchMetricCohort(
  metricCode: string,
  baseYm: string,
  adminLevel: AdminLevel,
): Promise<RegionMetricValue[]> {
  const rows = await prisma.normalizedMetric.findMany({
    where: { metricCode, baseYm, adminLevel },
    include: { region: true, source: true },
  });
  return rows.map((r) => {
    const provenance = r.provenance as DataProvenance | null;
    return {
      regionCode: r.region.code,
      baseYm: r.baseYm,
      metricCode: r.metricCode,
      rawValue: r.rawValue,
      unit: r.unit,
      adminLevel: r.adminLevel,
      sourceCode: r.source.code,
      collectedAt: r.collectedAt.toISOString(),
      provenance,
      isSnapshotFallback: provenance !== "LIVE_API",
    };
  });
}
