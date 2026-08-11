import { prisma } from "@/lib/db";

/**
 * Phase 2-D(2026-08-12): region별 TOUR_INFO의 "가장 최근 SUCCESS/EMPTY였던 시점"을 baseYm과
 * 무관하게 조회한다. 새 schema/컬럼을 추가하지 않고 기존 `DataSnapshot.fetchedAt`만 그대로
 * 재사용한다(중복 상태 저장 금지 원칙) — `runResumableLocalBatchSync`(sync 스킵 판정)와
 * `checkDatasetCompleteness`/`auditTourismDataQuality`(completeness 판정)가 이 함수를 공유해서 쓴다.
 */
export async function fetchTourInfoLastFreshFetchByRegion(): Promise<Map<string, Date>> {
  const source = await prisma.dataSource.findUnique({ where: { code: "TOUR_INFO" } });
  if (!source) return new Map();

  const rows = await prisma.dataSnapshot.groupBy({
    by: ["regionId"],
    where: { dataSourceId: source.id, status: { in: ["SUCCESS", "EMPTY"] } },
    _max: { fetchedAt: true },
  });

  const map = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.fetchedAt) map.set(row.regionId, row._max.fetchedAt);
  }
  return map;
}
