import type { PoiCurationStatusCode, PoiRepresentationCode } from "@/lib/domain/poiRecommendation";

export type OptionalPoiCurationRecord = {
  status: PoiCurationStatusCode;
  representation: PoiRepresentationCode;
};

/**
 * POI 대표성 검수는 기존 DB에서도 서비스가 계속 동작해야 하는 보조 레이어다.
 * 배포 순서상 애플리케이션 코드가 먼저 올라가거나, 아직 이 migration이 적용되지 않은
 * 데이터베이스가 있을 수 있으므로 PoiCuration 테이블 부재만 무시하고 기본 POI 조회로
 * 안전하게 폴백한다. 다른 DB 오류는 절대 숨기지 않는다.
 */

let poiCurationTableUnavailable = false;

function isPoiCurationTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "P2021") return true;
  return (
    typeof candidate.message === "string" &&
    candidate.message.includes("PoiCuration") &&
    /does not exist|not exist|missing/i.test(candidate.message)
  );
}

export async function withOptionalPoiCuration<T>(
  queryWithCuration: () => Promise<T>,
  queryWithoutCuration: () => Promise<T>,
): Promise<T> {
  if (poiCurationTableUnavailable) return queryWithoutCuration();

  try {
    const result = await queryWithCuration();
    return result;
  } catch (error) {
    if (!isPoiCurationTableMissing(error)) throw error;
    poiCurationTableUnavailable = true;
    return queryWithoutCuration();
  }
}

export function readOptionalPoiCuration(row: unknown): OptionalPoiCurationRecord | null {
  if (!row || typeof row !== "object" || !("curation" in row)) return null;
  const curation = (row as { curation?: unknown }).curation;
  if (!curation || typeof curation !== "object") return null;
  const value = curation as { status?: unknown; representation?: unknown };
  if (typeof value.status !== "string" || typeof value.representation !== "string") return null;
  return {
    status: value.status as PoiCurationStatusCode,
    representation: value.representation as PoiRepresentationCode,
  };
}
