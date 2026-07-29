/**
 * DataSource 테이블만 DATA_SOURCE_SEED(src/lib/fixtures/dataSources.ts) 기준으로 동기화하는 전용
 * CLI(2026-07-29 도입). `npm run db:seed`는 DataSource 외에 Region/Poi/PoiRelation/NormalizedMetric/
 * Project까지 함께 반영해 범위가 넓다 — baseUrl 하나만 fixture와 어긋나 있을 때(예: VISITOR_CNT가
 * 실제 API 구조 변경 이후 재시드되지 않아 구 URL을 물고 있던 사례) 굳이 전체 seed를 돌리지 않고 이
 * 명령만으로 안전하게 바로잡을 수 있다.
 *
 * 실제 upsert 로직은 src/lib/services/dataSourceSync.ts에 있다(prisma/seed.ts와 공유, 중복 구현 없음).
 * 이 스크립트는 code 기준으로만 생성·갱신하며, fixture에 없는 기존 DataSource 행을 삭제하지 않고,
 * DataSource 외 다른 테이블은 조회조차 하지 않는다.
 *
 * 사용법:
 *   npm run db:sync-data-sources
 *   npm run db:sync-data-sources -- --dry-run   (DB를 바꾸지 않고 CREATED/UPDATED/UNCHANGED만 미리 본다)
 */
import { prisma } from "../src/lib/db";
import { syncDataSources } from "../src/lib/services/dataSourceSync";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[sync-data-sources] 시작${dryRun ? "(dry-run — DB 변경 없음)" : ""}`);

  const { results, counts } = await syncDataSources({ dryRun });

  for (const r of results) {
    const urlPart = r.baseUrlOrigin ? `${r.baseUrlOrigin}${r.baseUrlPathname ?? ""}` : "(URL 아님)";
    console.log(`  ${r.status.padEnd(9)} ${r.code} — ${urlPart}`);
  }

  console.log(
    `[sync-data-sources] 완료: CREATED=${counts.CREATED} UPDATED=${counts.UPDATED} UNCHANGED=${counts.UNCHANGED}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
