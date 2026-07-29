import { prisma } from "@/lib/db";
import { DATA_SOURCE_SEED, type DataSourceSeed } from "@/lib/fixtures/dataSources";

/**
 * DATA_SOURCE_SEED를 유일한 출처로 삼아 DataSource 테이블만 code 기준으로 upsert한다(2026-07-29 도입).
 * `prisma/seed.ts`의 `upsertDataSources()`와 `scripts/sync-data-sources.ts`(DataSource만 반영하는
 * 전용 CLI)가 이 함수를 공유한다 — 같은 upsert 로직을 두 곳에 중복 구현하지 않는다.
 *
 * Region/Poi/PoiRelation/Project/NormalizedMetric/DataSnapshot/SyncLog 등 다른 테이블은 조회도 변경도
 * 하지 않는다. fixture에 없는 기존 DataSource 행은 절대 삭제하지 않는다(그 code에 대해 아무 것도 하지
 * 않을 뿐이다).
 */

export type DataSourceSyncStatus = "CREATED" | "UPDATED" | "UNCHANGED";

export interface DataSourceSyncResult {
  code: string;
  status: DataSourceSyncStatus;
  /** 공개 API 주소만 노출한다(민감정보 없음) — 값 자체가 URL이 아니면(예: "미확인") null. */
  baseUrlOrigin: string | null;
  baseUrlPathname: string | null;
}

export interface DataSourceSyncSummary {
  results: DataSourceSyncResult[];
  counts: Record<DataSourceSyncStatus, number>;
}

function splitBaseUrl(baseUrl: string): { origin: string | null; pathname: string | null } {
  try {
    const url = new URL(baseUrl);
    return { origin: url.origin, pathname: url.pathname };
  } catch {
    return { origin: null, pathname: null };
  }
}

/** name/baseUrl/description 중 하나라도 다르면 갱신이 필요하다고 본다. */
function needsUpdate(existing: { name: string; baseUrl: string; description: string | null }, seed: DataSourceSeed): boolean {
  return existing.name !== seed.name || existing.baseUrl !== seed.baseUrl || existing.description !== seed.description;
}

/**
 * DATA_SOURCE_SEED 기준으로 DataSource만 동기화한다. `dryRun`이면 DB를 전혀 변경하지 않고(읽기만 하고)
 * CREATED/UPDATED/UNCHANGED 판정만 계산한다.
 */
export async function syncDataSources(params: { dryRun?: boolean } = {}): Promise<DataSourceSyncSummary> {
  const dryRun = params.dryRun ?? false;
  const results: DataSourceSyncResult[] = [];

  for (const ds of DATA_SOURCE_SEED) {
    const { origin, pathname } = splitBaseUrl(ds.baseUrl);
    const existing = await prisma.dataSource.findUnique({ where: { code: ds.code } });

    if (!existing) {
      if (!dryRun) {
        await prisma.dataSource.create({ data: ds });
      }
      results.push({ code: ds.code, status: "CREATED", baseUrlOrigin: origin, baseUrlPathname: pathname });
      continue;
    }

    if (needsUpdate(existing, ds)) {
      if (!dryRun) {
        await prisma.dataSource.update({
          where: { code: ds.code },
          data: { name: ds.name, baseUrl: ds.baseUrl, description: ds.description },
        });
      }
      results.push({ code: ds.code, status: "UPDATED", baseUrlOrigin: origin, baseUrlPathname: pathname });
      continue;
    }

    results.push({ code: ds.code, status: "UNCHANGED", baseUrlOrigin: origin, baseUrlPathname: pathname });
  }

  const counts: Record<DataSourceSyncStatus, number> = { CREATED: 0, UPDATED: 0, UNCHANGED: 0 };
  for (const r of results) counts[r.status]++;

  return { results, counts };
}
