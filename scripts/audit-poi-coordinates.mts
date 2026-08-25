/**
 * local PostgreSQL에 저장된 POI 좌표를 읽기 전용으로 감사한다.
 *
 * - Production Neon 접근을 막기 위해 loopback 호스트와 tour_dna_local DB만 허용한다.
 * - Poi.lat/lng와 rawPayload.mapx/mapy를 수정·삭제하지 않는다.
 * - 국내 범위 판정은 제품 공통 sanity 함수 하나만 재사용한다.
 *
 * 사용법:
 *   npm run audit:poi-coordinates
 */
import { prisma } from "../src/lib/db";
import { isReasonableKoreanCoordinate } from "../src/lib/domain/geo";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

type CoordinateStatus = "VALID" | "MISSING" | "NON_FINITE" | "SUSPICIOUS_ZERO" | "OUT_OF_KOREA_RANGE";

type PoiAuditRow = {
  id: string;
  externalId: string | null;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  sourceType: string;
  sourceId: string | null;
  address: string;
  region: { code: string; name: string };
  rawPayload: unknown;
};

function assertLocalDatabase(): void {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.has(url.hostname) || databaseName !== "tour_dna_local") {
    throw new Error("이 감사는 localhost의 tour_dna_local 데이터베이스에서만 실행할 수 있습니다.");
  }
}

function classifyCoordinate(row: Pick<PoiAuditRow, "lat" | "lng">): CoordinateStatus {
  if (row.lat === null || row.lat === undefined || row.lng === null || row.lng === undefined) return "MISSING";
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return "NON_FINITE";
  if (row.lat === 0 || row.lng === 0) return "SUSPICIOUS_ZERO";
  return isReasonableKoreanCoordinate({ lat: row.lat, lng: row.lng }) ? "VALID" : "OUT_OF_KOREA_RANGE";
}

function rawCoordinate(rawPayload: unknown, key: "mapx" | "mapy"): number | string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const value = (rawPayload as Record<string, unknown>)[key];
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function printMap(title: string, map: Map<string, number>): void {
  console.log(`\n${title}`);
  for (const [key, count] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "ko"))) {
    console.log(`  - ${key}: ${count}`);
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const rows = (await prisma.poi.findMany({
    select: {
      id: true,
      externalId: true,
      name: true,
      category: true,
      lat: true,
      lng: true,
      sourceType: true,
      sourceId: true,
      address: true,
      rawPayload: true,
      region: { select: { code: true, name: true } },
    },
  })) as PoiAuditRow[];

  const statusCounts = new Map<string, number>();
  const invalidByCategory = new Map<string, number>();
  const invalidByRegion = new Map<string, number>();
  const invalidByCoordinate = new Map<string, number>();
  const invalidRows: Array<{
    id: string;
    externalId: string | null;
    name: string;
    category: string;
    region: string;
    lat: number | null;
    lng: number | null;
    rawMapx: number | string | null;
    rawMapy: number | string | null;
    status: CoordinateStatus;
    sourceType: string;
    sourceId: string | null;
    address: string;
  }> = [];

  for (const row of rows) {
    const status = classifyCoordinate(row);
    increment(statusCounts, status);
    if (status === "VALID") continue;
    increment(invalidByCategory, `${row.category}/${status}`);
    increment(invalidByRegion, `${row.region.code}(${row.region.name})/${status}`);
    increment(invalidByCoordinate, `${row.lat},${row.lng}/${status}`);
    invalidRows.push({
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      category: row.category,
      region: `${row.region.code}(${row.region.name})`,
      lat: row.lat,
      lng: row.lng,
      rawMapx: rawCoordinate(row.rawPayload, "mapx"),
      rawMapy: rawCoordinate(row.rawPayload, "mapy"),
      status,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      address: row.address,
    });
  }

  console.log("=== local POI 좌표 전수 감사 ===");
  console.log("대상 DB: localhost/tour_dna_local (읽기 전용)");
  console.log(`전체 POI: ${rows.length}`);
  for (const status of ["VALID", "MISSING", "NON_FINITE", "SUSPICIOUS_ZERO", "OUT_OF_KOREA_RANGE"] as const) {
    console.log(`${status}: ${statusCounts.get(status) ?? 0}`);
  }
  printMap("이상 좌표 category/status 분포", invalidByCategory);
  printMap("이상 좌표 region/status 분포", invalidByRegion);
  printMap("이상 좌표값/status 분포", invalidByCoordinate);
  console.log(`\n이상 좌표 목록: ${invalidRows.length}건`);
  for (const row of invalidRows.sort((a, b) => a.region.localeCompare(b.region, "ko") || a.name.localeCompare(b.name, "ko"))) {
    console.log(JSON.stringify(row));
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
