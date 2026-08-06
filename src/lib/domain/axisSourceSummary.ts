import type { DataProvenance, DnaAxisKey } from "./types";

/**
 * DNA 축 카드의 "출처 배지" 문구를 만든다(2026-08-06). 기존에는 `AxisStatus`(LIVE/SNAPSHOT/MISSING)
 * enum 원문을 화면에 그대로 노출했는데, SNAPSHOT은 "LIVE_API가 아닌 근거가 하나라도 있다"는 뜻일 뿐
 * CACHED_API(과거 API 캐시)·CURATED(사람이 만든 정제 데이터)·ESTIMATED(추정값)를 전혀 구분하지 못해
 * "저장된 과거 스냅샷"처럼 오해하기 쉬웠다(실제 원인 조사 결과, 조사 결과는 별도 보고 참고). 점수·상태
 * 산식(dna.ts)은 전혀 건드리지 않고, 이미 저장된 Evidence의 provenance/normalizedValue만 다시 읽어
 * 순수하게 표시용 문구를 만든다 — 이미 DB에 저장된 과거 분석 결과에도 그대로 적용 가능하다(재분석 불필요).
 */

export type AxisSourceTier = "ALL_LIVE" | "MIXED" | "MISSING";

export interface AxisSourceSummary {
  tier: AxisSourceTier;
  /** 축 카드에 표시하는 짧은 배지 문구. enum 원문(LIVE/SNAPSHOT/MISSING)을 절대 그대로 노출하지 않는다. */
  label: string;
}

const PROVENANCE_SHORT_LABEL: Record<DataProvenance, string> = {
  LIVE_API: "실시간",
  CACHED_API: "캐시",
  CURATED: "정제",
  ESTIMATED: "추정",
  MISSING: "근거없음",
};
const PROVENANCE_UNKNOWN_SHORT = "판정없음";

function shortProvenanceLabel(provenance: DataProvenance | null): string {
  return provenance === null ? PROVENANCE_UNKNOWN_SHORT : PROVENANCE_SHORT_LABEL[provenance];
}

/**
 * demand/stay/spend/diversity처럼 "여러 지표의 정규화값 평균"으로 점수를 만드는 축의 배지 문구.
 * `normalizedValue !== null`인 항목만 점수 계산에 실제로 쓰인 근거다(dna.ts의 buildAxis/computeDemandAxis
 * 참고 — 화면 표시용 참고 지표는 항상 normalizedValue: null로 저장돼 있어 이 필터로 정확히 걸러진다).
 */
export function summarizeGenericAxisSource(
  rows: { normalizedValue: number | null; provenance: DataProvenance | null }[],
): AxisSourceSummary {
  const contributing = rows.filter((r) => r.normalizedValue !== null);
  if (contributing.length === 0) return { tier: "MISSING", label: "데이터 부족" };

  const counts = new Map<string, number>();
  for (const r of contributing) {
    const key = shortProvenanceLabel(r.provenance);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const liveKey = PROVENANCE_SHORT_LABEL.LIVE_API;
  if (counts.size === 1 && counts.has(liveKey)) {
    return { tier: "ALL_LIVE", label: "모두 실시간 API" };
  }

  const label = [...counts.entries()].map(([k, v]) => `${k} ${v}`).join(" · ");
  return { tier: "MIXED", label };
}

interface NetworkEvidenceRow {
  metricCode: string;
  rawValue: number;
  provenance: DataProvenance | null;
  appliedRule: string;
}

const NETWORK_POI_SPLIT_PATTERN = /API 수집 (\d+)건, 큐레이션\(FIXTURE\) (\d+)건/;

/**
 * network 축은 "여러 지표 평균"이 아니라 POI 근거·관계 근거를 합성한 별도 산식(computeNetworkAxis)이라
 * 위 함수와 다르게 다룬다. API/큐레이션(FIXTURE) POI 건수 분리는 별도 DB 컬럼이 없어(스키마 변경 없이
 * 처리하기 위해) dna.ts가 이미 생성해 저장해 둔 appliedRule 문구(우리 코드가 직접 생성하는 고정 형식)에서
 * 그대로 읽어온다 — 문구가 바뀌어 매칭에 실패해도 provenance 기준 안전한 문구로 대체될 뿐 깨지지 않는다.
 */
export function summarizeNetworkAxisSource(rows: NetworkEvidenceRow[]): AxisSourceSummary {
  const poiRow = rows.find((r) => r.metricCode === "networkPoiCount");
  if (!poiRow) return { tier: "MISSING", label: "데이터 부족" };
  const relationRow = rows.find((r) => r.metricCode === "networkRelationCount");

  const match = poiRow.appliedRule.match(NETWORK_POI_SPLIT_PATTERN);
  const apiCount = match ? Number(match[1]) : null;
  const fixtureCount = match ? Number(match[2]) : null;

  const parts: string[] = [];
  if (apiCount !== null && fixtureCount !== null) {
    parts.push(`API ${apiCount}`);
    if (fixtureCount > 0) parts.push(`정제 ${fixtureCount}`);
  } else {
    parts.push(`${shortProvenanceLabel(poiRow.provenance)} ${poiRow.rawValue}`);
  }
  if (relationRow) {
    parts.push(`관계 정제 ${relationRow.rawValue}`);
  }

  const allLive = fixtureCount === 0 && !relationRow;
  if (allLive) return { tier: "ALL_LIVE", label: "모두 실시간 API" };
  return { tier: "MIXED", label: parts.join(" · ") };
}

export function summarizeAxisSource(
  axisKey: DnaAxisKey,
  rows: { metricCode: string; rawValue: number; normalizedValue: number | null; provenance: DataProvenance | null; appliedRule: string }[],
): AxisSourceSummary {
  if (axisKey === "network") return summarizeNetworkAxisSource(rows);
  return summarizeGenericAxisSource(rows);
}
