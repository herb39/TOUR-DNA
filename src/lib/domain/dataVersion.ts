import { createHash } from "node:crypto";
import type { DnaEngineInput } from "./types";

/** 특정 지역의 분석에 실제로 쓰인 원값 조합을 식별하는 버전 문자열. 데이터가 바뀌면 값이 바뀐다. */
export function computeDataVersion(input: DnaEngineInput): string {
  const ownMetrics: Record<string, number | null> = {};
  for (const [code, cohort] of Object.entries(input.metricCohorts)) {
    ownMetrics[code] = cohort?.find((c) => c.regionCode === input.regionCode)?.rawValue ?? null;
  }
  const payload = {
    baseYm: input.baseYm,
    metrics: ownMetrics,
    visitorPrev: input.previousVisitorCount?.value ?? null,
    visitorCurrent: input.currentVisitorCount?.value ?? null,
    network: input.networkInputs,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}
