/**
 * 분석 요청의 로컬 성능 계측을 위한 최소 도우미.
 *
 * `ANALYSIS_TIMING=1`인 로컬 실행에서만 로그를 남긴다. 기본값은 완전히 비활성화되어
 * 사용자 응답과 Production 로그에 영향을 주지 않는다. 프로젝트 식별자·서비스키·원문
 * 응답은 기록하지 않고, 단계명과 집계 가능한 수치만 남긴다.
 */

export type AnalysisTimingDetails = Record<string, boolean | number | string | null | undefined>;

const DETAIL_STAGES = new Set([
  "db.metric-cohort",
  "dna-input.region-load",
  "dna-input.axis-cohorts",
  "dna-input.visitor-cohorts",
  "dna-input.poi-load",
  "poi-categories.region-load",
  "poi-categories.poi-load",
  "region-comparison.region-list",
]);

export function isAnalysisTimingEnabled(): boolean {
  return process.env.ANALYSIS_TIMING === "1";
}

export function getAnalysisTimingNow(): number {
  return performance.now();
}

export function logAnalysisTiming(stage: string, ms: number, details: AnalysisTimingDetails = {}): void {
  if (!isAnalysisTimingEnabled()) return;
  if (DETAIL_STAGES.has(stage) && process.env.ANALYSIS_TIMING_DETAIL !== "1") return;
  console.log(
    JSON.stringify({
      level: "info",
      scope: "analysis-timing",
      stage,
      ms: Math.round(ms),
      ...details,
    }),
  );
}

export async function measureAnalysisStage<T>(
  stage: string,
  operation: () => Promise<T>,
  details: AnalysisTimingDetails = {},
): Promise<T> {
  if (!isAnalysisTimingEnabled()) return operation();

  const startedAt = performance.now();
  try {
    const result = await operation();
    logAnalysisTiming(stage, performance.now() - startedAt, details);
    return result;
  } catch (error) {
    logAnalysisTiming(stage, performance.now() - startedAt, { ...details, outcome: "ERROR" });
    throw error;
  }
}

export function measureAnalysisComputation<T>(
  stage: string,
  operation: () => T,
  details: AnalysisTimingDetails = {},
): T {
  if (!isAnalysisTimingEnabled()) return operation();

  const startedAt = performance.now();
  try {
    const result = operation();
    logAnalysisTiming(stage, performance.now() - startedAt, details);
    return result;
  } catch (error) {
    logAnalysisTiming(stage, performance.now() - startedAt, { ...details, outcome: "ERROR" });
    throw error;
  }
}
