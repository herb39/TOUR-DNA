import type { RegionMetricValue } from "./types";

export interface CommonMetricCohort {
  active: RegionMetricValue[];
  candidate: RegionMetricValue[];
  commonRegionCodes: string[];
  activeRegionCount: number;
  candidateRegionCount: number;
  asymmetricRegionCount: number;
}

export interface CommonPresenceCohort {
  activeRegionCodes: string[];
  candidateRegionCodes: string[];
  commonRegionCodes: string[];
  asymmetricRegionCount: number;
}

function uniqueByRegion(entries: RegionMetricValue[]): Map<string, RegionMetricValue> {
  return new Map(entries.map((entry) => [entry.regionCode, entry]));
}

/** 두 월에 모두 존재하는 동일 region의 metric만 남긴다. EMPTY/누락은 값을 만들지 않고 제외한다. */
export function buildCommonMetricCohort(
  activeEntries: RegionMetricValue[],
  candidateEntries: RegionMetricValue[],
): CommonMetricCohort {
  const activeByRegion = uniqueByRegion(activeEntries);
  const candidateByRegion = uniqueByRegion(candidateEntries);
  const commonRegionCodes = [...activeByRegion.keys()].filter((code) => candidateByRegion.has(code)).sort();
  const activeRegionCodes = [...activeByRegion.keys()].sort();
  const candidateRegionCodes = [...candidateByRegion.keys()].sort();

  return {
    active: commonRegionCodes.map((code) => activeByRegion.get(code)!),
    candidate: commonRegionCodes.map((code) => candidateByRegion.get(code)!),
    commonRegionCodes,
    activeRegionCount: activeRegionCodes.length,
    candidateRegionCount: candidateRegionCodes.length,
    asymmetricRegionCount: activeRegionCodes.filter((code) => !candidateByRegion.has(code)).length +
      candidateRegionCodes.filter((code) => !activeByRegion.has(code)).length,
  };
}

/** 방문자 증가처럼 두 시점의 entry가 모두 있어야 evidence가 성립하는 자료의 교집합을 계산한다. */
export function buildCommonPresenceCohort(
  activeRegionCodes: Iterable<string>,
  candidateRegionCodes: Iterable<string>,
): CommonPresenceCohort {
  const active = [...new Set(activeRegionCodes)].sort();
  const candidate = [...new Set(candidateRegionCodes)].sort();
  const candidateSet = new Set(candidate);
  const activeSet = new Set(active);
  const commonRegionCodes = active.filter((code) => candidateSet.has(code));

  return {
    activeRegionCodes: active,
    candidateRegionCodes: candidate,
    commonRegionCodes,
    asymmetricRegionCount: active.filter((code) => !candidateSet.has(code)).length +
      candidate.filter((code) => !activeSet.has(code)).length,
  };
}

/** 모든 DNA 축을 같은 지역 집합에서 비교하기 위한 5축 공통 cohort를 계산한다. */
export function intersectRegionCodeSets(regionCodeSets: Iterable<Iterable<string>>): string[] {
  const sets = [...regionCodeSets].map((codes) => new Set(codes));
  if (sets.length === 0) return [];
  return [...sets[0]].filter((code) => sets.every((set) => set.has(code))).sort();
}
