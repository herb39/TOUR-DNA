import { createHash } from "node:crypto";
import { sortDeep } from "./analysisKey";
import type { DnaEngineInput, RegionMetricValue } from "./types";

/** metricCohort 원소 중 재현성에 필요한 값만 남긴다 — collectedAt(수집 시각)은 매번 동기화할 때마다
 * 바뀌는 휘발성 메타데이터라 제외한다(2026-07-27 P0-5: 이 필드가 포함돼 있어 동일한 실제 데이터로
 * 재분석해도 매번 dataVersion이 달라지는 결함이 있었다). provenance/isSnapshotFallback은 "같은
 * 숫자라도 신뢰 수준이 다르면 다른 데이터 버전"이라는 의미상 재현성에 필요해 포함한다. */
function canonicalMetricEntry(entry: RegionMetricValue) {
  return {
    regionCode: entry.regionCode,
    rawValue: entry.rawValue,
    provenance: entry.provenance,
    isSnapshotFallback: entry.isSnapshotFallback,
  };
}

/** 특정 지역의 분석에 실제로 쓰인 원값 조합을 식별하는 버전 문자열. 데이터가 바뀌면 값이 바뀐다.
 * 2026-07-27(P0-5)에 canonical payload로 재작성했다 — 이전에는 (1) networkInputs.collectedAt(휘발성
 * 타임스탬프)이 그대로 해시에 들어가 동일 데이터로 재분석해도 매번 값이 달라졌고, (2) 코호트 중 대상
 * 지역 자신의 값만 뽑아 해시해 다른 지역 값이 바뀌어 정규화 결과가 달라져도 버전이 그대로였다. 이제는
 * 코호트 전체(정렬됨)를 포함하고, 시각·DB ID 등 비본질적 메타데이터는 전부 제외한다.
 *
 * 주의: 이 재작성으로 페이로드 구조 자체가 바뀌어, 기존에 저장된 AnalysisResult.dataVersion 값은 같은
 * 데이터라도 새로 계산한 값과 달라진다(이미 저장된 값을 일괄 재계산하지 않는다 — 아래 결과 참고). */
export function computeDataVersion(input: DnaEngineInput): string {
  const metrics: Record<string, ReturnType<typeof canonicalMetricEntry>[]> = {};
  for (const [code, cohort] of Object.entries(input.metricCohorts)) {
    metrics[code] = (cohort ?? [])
      .filter((c) => c.baseYm === input.baseYm)
      .map(canonicalMetricEntry)
      .sort((a, b) => a.regionCode.localeCompare(b.regionCode));
  }

  const network = input.networkInputs
    ? {
        attractionCount: input.networkInputs.attractionCount,
        relatedPoiCount: input.networkInputs.relatedPoiCount,
        foodCount: input.networkInputs.foodCount,
        lodgingCount: input.networkInputs.lodgingCount,
        experienceCount: input.networkInputs.experienceCount,
        poi: {
          apiCount: input.networkInputs.poi.apiCount,
          fixtureCount: input.networkInputs.poi.fixtureCount,
          provenance: input.networkInputs.poi.provenance,
        },
        relation: input.networkInputs.relation
          ? {
              count: input.networkInputs.relation.count,
              provenance: input.networkInputs.relation.provenance,
            }
          : null,
      }
    : null;

  const payload = {
    regionCode: input.regionCode,
    baseYm: input.baseYm,
    metrics,
    visitorPrev: input.previousVisitorCount
      ? {
          value: input.previousVisitorCount.value,
          baseYm: input.previousVisitorCount.baseYm,
          provenance: input.previousVisitorCount.provenance,
        }
      : null,
    visitorCurrent: input.currentVisitorCount
      ? {
          value: input.currentVisitorCount.value,
          baseYm: input.currentVisitorCount.baseYm,
          provenance: input.currentVisitorCount.provenance,
        }
      : null,
    network,
  };

  return createHash("sha256").update(JSON.stringify(sortDeep(payload))).digest("hex").slice(0, 16);
}
