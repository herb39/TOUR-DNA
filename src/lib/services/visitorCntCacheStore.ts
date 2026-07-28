import { prisma } from "@/lib/db";

/**
 * VISITOR_CNT "완전한 월" 캐시를 DataSnapshot으로 재사용하는 DB 전용 모듈(2026-07-29, DB 결합 제거로
 * visitorBaseYmFinder.ts에서 분리). 이 파일을 import하면 `@/lib/db`가 로드되어 DATABASE_URL이 필요하다
 * — 순수 탐색 로직(visitorBaseYmFinder.ts)과 절대 합치지 않는다. DB 접근이 필요 없는 스크립트
 * (verify:visitor-api)는 이 모듈을 import하지 않는다.
 *
 * 완전성 검증 마커: `syncVisitorCnt`(syncService.ts)가 기초/광역이 모두 완전할 때만
 * `DataSnapshot.rawPayload.completeMonthVerified = true`를 남긴다(스키마 추가 없이 rawPayload에 기록).
 * 이 마커가 도입되기 전에 저장된 SUCCESS/EMPTY 스냅샷은 "완전성 검사를 통과했다는 근거"가 없으므로
 * 캐시로 신뢰하지 않고 라이브로 재검증한다 — 마커가 있는 지역 전부에 대해서만 캐시로 인정한다.
 */
export async function checkVisitorCntCacheViaDataSnapshot(baseYm: string): Promise<boolean> {
  const visitorSource = await prisma.dataSource.findUnique({ where: { code: "VISITOR_CNT" } });
  if (!visitorSource) return false;

  const regions = await prisma.region.findMany({
    where: {
      OR: [
        { level: "SIGUNGU", apiSigunguCode: { not: null } },
        { level: "SIDO", apiAreaCode: { not: null } },
      ],
    },
    select: { id: true },
  });
  if (regions.length === 0) return false;

  const snapshots = await prisma.dataSnapshot.findMany({
    where: {
      dataSourceId: visitorSource.id,
      baseYm,
      regionId: { in: regions.map((r) => r.id) },
      status: { in: ["SUCCESS", "EMPTY"] },
    },
    select: { regionId: true, rawPayload: true },
  });
  if (snapshots.length !== regions.length) return false;

  return snapshots.every((s) => {
    const payload = s.rawPayload as { completeMonthVerified?: unknown } | null;
    return payload != null && payload.completeMonthVerified === true;
  });
}
