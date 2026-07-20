import { prisma } from "@/lib/db";
import type { AdminLevel, RegionMetricValue } from "@/lib/domain/types";

/** 동일 행정단위·기준월·지표 코드의 전체 코호트(대상 지역 포함)를 DB에서 읽어온다. */
export async function fetchMetricCohort(
  metricCode: string,
  baseYm: string,
  adminLevel: AdminLevel,
): Promise<RegionMetricValue[]> {
  const rows = await prisma.normalizedMetric.findMany({
    where: { metricCode, baseYm, adminLevel },
    include: { region: true, source: true },
  });
  return rows.map((r) => ({
    regionCode: r.region.code,
    baseYm: r.baseYm,
    metricCode: r.metricCode,
    rawValue: r.rawValue,
    unit: r.unit,
    adminLevel: r.adminLevel,
    sourceCode: r.source.code,
    collectedAt: r.collectedAt.toISOString(),
    isSnapshotFallback: false,
  }));
}
