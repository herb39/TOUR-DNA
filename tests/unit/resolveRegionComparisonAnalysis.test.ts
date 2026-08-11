// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 유사지역 비교 스냅샷 우선 사용 로직(2026-08-10) — analysis/print/plan 세 화면이 공유하는
 * resolveRegionComparisonAnalysis()가 (1) 저장된 스냅샷이 있으면 그대로 반환하고 실시간 조회를
 * 전혀 하지 않는지, (2) 스냅샷이 없는 레거시 분석에서만 예외적으로 현재 DB를 다시 조회하는지를
 * 고정한다.
 */

const fetchRegionComparisonProfiles = vi.fn();
vi.mock("@/lib/services/fetchRegionComparisonProfiles", () => ({
  fetchRegionComparisonProfiles: (...args: unknown[]) => fetchRegionComparisonProfiles(...args),
}));

const getActiveDatasetBaseYm = vi.fn();
vi.mock("@/lib/services/activeDataset", () => ({
  getActiveDatasetBaseYm: (...args: unknown[]) => getActiveDatasetBaseYm(...args),
}));

import { resolveRegionComparisonAnalysis } from "@/lib/services/resolveRegionComparisonAnalysis";

beforeEach(() => {
  fetchRegionComparisonProfiles.mockReset();
  getActiveDatasetBaseYm.mockReset();
  getActiveDatasetBaseYm.mockResolvedValue("202606");
});

describe("resolveRegionComparisonAnalysis — 스냅샷 우선 사용", () => {
  it("스냅샷이 있으면 그대로 반환하고 fetchRegionComparisonProfiles를 전혀 호출하지 않는다", async () => {
    const snapshot = {
      targetRegionName: "테스트시",
      comparisonBaseYm: "202606",
      mixedBaseYm: false,
      baseYmNote: null,
      comparisons: [{ regionCode: "SGG_OTHER" }],
      uniqueStrengthNote: null,
      note: null,
      commonLimitationNote: null,
      candidatePoolSize: 1,
      isSmallCandidatePool: true,
      ruleVersion: "region-similarity-rules-v1",
    };

    const { analysis, usingLiveFallback } = await resolveRegionComparisonAnalysis({
      regionCode: "SGG_TESTCITY",
      regionName: "테스트시",
      snapshot,
      analysisOwnBaseYm: "202606",
    });

    expect(analysis).toBe(snapshot);
    expect(usingLiveFallback).toBe(false);
    expect(fetchRegionComparisonProfiles).not.toHaveBeenCalled();
  });

  it("스냅샷이 null(레거시 분석)이면 현재 DB를 다시 조회해 실시간 계산하고 usingLiveFallback을 true로 표시한다", async () => {
    fetchRegionComparisonProfiles.mockResolvedValue([]);

    const { analysis, usingLiveFallback } = await resolveRegionComparisonAnalysis({
      regionCode: "SGG_TESTCITY",
      regionName: "테스트시",
      snapshot: null,
      analysisOwnBaseYm: "202606",
    });

    expect(usingLiveFallback).toBe(true);
    expect(fetchRegionComparisonProfiles).toHaveBeenCalledWith("202606");
    expect(analysis.comparisons).toEqual([]);
    expect(analysis.note).not.toBeNull();
  });

  it("analysisOwnBaseYm이 없으면 ACTIVE dataset의 baseYm으로 실시간 재계산한다(Phase 2-A)", async () => {
    fetchRegionComparisonProfiles.mockResolvedValue([]);
    getActiveDatasetBaseYm.mockResolvedValue("202609");

    await resolveRegionComparisonAnalysis({
      regionCode: "SGG_TESTCITY",
      regionName: "테스트시",
      snapshot: undefined,
      analysisOwnBaseYm: null,
    });

    expect(fetchRegionComparisonProfiles).toHaveBeenCalledWith("202609");
  });

  it("analysisOwnBaseYm도 없고 ACTIVE dataset도 없으면 다른 baseYm을 조용히 대신 쓰지 않고 빈 결과+안내문구를 반환한다", async () => {
    getActiveDatasetBaseYm.mockResolvedValue(null);

    const { analysis, usingLiveFallback } = await resolveRegionComparisonAnalysis({
      regionCode: "SGG_TESTCITY",
      regionName: "테스트시",
      snapshot: undefined,
      analysisOwnBaseYm: null,
    });

    expect(usingLiveFallback).toBe(true);
    expect(fetchRegionComparisonProfiles).not.toHaveBeenCalled();
    expect(analysis.comparisons).toEqual([]);
    expect(analysis.note).toMatch(/ACTIVE/);
  });
});
