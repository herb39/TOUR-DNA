import { classifyTourInfoFreshness } from "@/lib/domain/tourInfoFreshness";

/**
 * 전국 관광 데이터 품질 검증(2026-08-10 도입) — baseYm 기준으로 DataSnapshot/NormalizedMetric/Poi가
 * DNA 분석에 쓸 수 있는 상태인지 읽기 전용으로 점검하는 순수 함수다. DB/API 접근은 호출부
 * (scripts/audit-tourism-data.ts)가 담당하고, 이 함수는 이미 조회된 값만으로 판정한다
 * (regionCodeAudit.ts와 동일한 원칙 — 실제 접근 없이 단위 테스트 가능).
 *
 * "EMPTY 때문에 NormalizedMetric이 없는 것"은 정상이다(syncService.ts의 upsertMetric은 SUCCESS이고
 * 실제 값이 있을 때만 호출되고, EMPTY/ERROR에서는 호출되지 않는다) — 이 함수는 그 구분을 그대로
 * 반영해, 대응하는 DataSnapshot이 EMPTY인 metric 결측은 문제로 잡지 않는다.
 *
 * TOUR_INFO 완전성 판정(2026-08-12, Phase 2-D): TOUR_INFO는 baseYm에 종속되지 않는 정적 API라
 * "이번 baseYm에 성공했는가"뿐 아니라 "재사용 가능한 최신 POI 데이터가 있는가"(TTL freshness)도
 * 완전성으로 인정한다 — `classifyTourInfoFreshness` 참고.
 */

export type SnapshotStatusLike = "SUCCESS" | "EMPTY" | "ERROR";

export const RESUMABLE_SOURCE_CODES = ["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM", "TOUR_INFO"] as const;
export type ResumableSourceCode = (typeof RESUMABLE_SOURCE_CODES)[number];

/** DNA 5축 중 POI(network) 이외의 4축이 직접 참조하는 metricCode(buildDnaEngineInput.ts의
 * AXIS_METRIC_CODES와 동일 — DNA 산식 자체는 건드리지 않고 어떤 지표가 필요한지만 재사용한다). */
export const DNA_AXIS_METRIC_CODES = [
  "tarSvcDemIxVal", // METRIC_CODES.DEMAND_SERVICE
  "touResDemIxVal", // METRIC_CODES.DEMAND_RESOURCE
  "tarSjrnDsIxVal", // METRIC_CODES.STAY
  "tarExpDsIxVal", // METRIC_CODES.SPEND
  "touDivIxVal", // METRIC_CODES.DIVERSITY
] as const;

/** metricCode -> 그 값이 나오는 재개형 소스. EMPTY 정상 결측 판정에 쓴다.
 * touResDemIxVal(METRIC_CODES.DEMAND_RESOURCE)은 의도적으로 뺐다 — touResDem.ts 주석에 따르면
 * `/areaCulResDemList`의 유효 코드값을 아직 확인하지 못해 이 어댑터가 그 오퍼레이션을 아예 호출하지
 * 않는다(2026-07-21 결정, 추측성 호출 금지 원칙). 즉 TOU_RES_DEM이 SUCCESS여도 이 metricCode는
 * 현재 시스템 구조상 항상 결측이 정상이다 — 특정 소스에 대응시키면 "SUCCESS인데 누락"으로 대량
 * 오탐(FAIL)이 발생한다(2026-08-10 실제 발견). computeDemandAxis(dna.ts)도 이 값이 없으면
 * DEMAND_SERVICE만으로 계산하도록 이미 설계돼 있어 분석 자체에는 영향이 없다. */
const METRIC_TO_SOURCE: Record<string, ResumableSourceCode> = {
  tarSvcDemIxVal: "TOU_RES_DEM", // buildDnaEngineInput.ts 주석 기준 실제 출처(tarSvcDem.ts 아님)
  tarSjrnDsIxVal: "TAR_SVC_DEM",
  tarExpDsIxVal: "TAR_SVC_DEM",
  touDivIxVal: "TOU_DIV_IX",
};

export interface RegionForAudit {
  id: string;
  code: string;
  name: string;
  level: "SIDO" | "SIGUNGU";
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
}

export interface SnapshotForAudit {
  regionId: string;
  /** DataSource.code — 알 수 없는 코드가 섞여 있으면 source 매핑 오류로 판정한다. */
  dataSourceCode: string;
  status: SnapshotStatusLike;
}

export interface MetricForAudit {
  regionId: string;
  metricCode: string;
  baseYm: string;
  rawValue: number;
  provenance: string | null;
}

export interface PoiForAudit {
  regionId: string;
  category: string;
  sourceType: "API" | "FIXTURE";
}

export interface AuditTourismDataQualityParams {
  baseYm: string;
  /** SIGUNGU만 넘겨도 되고 전체를 넘겨도 된다 — 내부에서 level==="SIGUNGU"만 대상으로 삼는다. */
  regions: RegionForAudit[];
  /** 4개 재개형 소스 + VISITOR_CNT 스냅샷 전체(이 baseYm 기준). */
  snapshots: SnapshotForAudit[];
  /** DNA_AXIS_METRIC_CODES에 해당하는 NormalizedMetric 전체(baseYm 필터는 호출부가 걸어도 되고,
   * 이 함수가 다시 한번 baseYm 불일치를 검사한다). */
  metrics: MetricForAudit[];
  /** 전체 Poi(카테고리·출처만 있으면 됨). */
  pois: PoiForAudit[];
  /** Phase 2-D(2026-08-12): region별 TOUR_INFO가 SUCCESS/EMPTY였던 가장 최근 시점(baseYm 무관,
   * `fetchTourInfoLastFreshFetchByRegion()` 결과). TOUR_INFO는 baseYm에 종속되지 않는 정적 API라
   * "이번 baseYm에 새로 호출했는가"가 아니라 "재사용 가능한 최신 POI 데이터가 있는가"로 완전성을
   * 판정한다. 생략하면(기존 호출부 호환) 모든 지역이 NEVER_FETCHED로 취급돼 이 필드가 없던 이전
   * 동작(이번 baseYm의 TOUR_INFO SUCCESS/EMPTY만 인정)과 정확히 동일하게 동작한다. */
  tourInfoFreshnessByRegion?: Record<string, Date | null>;
  /** freshness 판정 기준 시각. `tourInfoFreshnessByRegion`을 생략하면 이 값은 결과에 영향을 주지
   * 않는다(모든 지역이 NEVER_FETCHED이므로). 생략 시 함수 자체의 순수성을 지키기 위해 임의로
   * `new Date()`를 넣지 않는다 — 호출부가 freshness를 실제로 쓰려면 반드시 명시해야 한다. */
  now?: Date;
}

export interface SourceStatusCount {
  SUCCESS: number;
  EMPTY: number;
  ERROR: number;
  NONE: number;
}

export interface MetricCodeReport {
  metricCode: string;
  /** NormalizedMetric이 실제로 존재하는 지역 수. */
  present: number;
  /** 대응 소스가 EMPTY라 metric이 없는 게 정상인 지역 수. */
  missingButEmptyOk: number;
  /** 대응 소스가 SUCCESS인데도 metric이 없는(비정상) 지역 수 — 진짜 누락. */
  missingUnexpected: number;
  /** provenance가 null이거나 알려진 DataProvenance 값이 아닌 지역 수. */
  provenanceIssueCount: number;
  /** rawValue가 NaN/Infinity거나 음수 등 비정상인 지역 수. */
  rawValueIssueCount: number;
}

export interface AxisCohortReport {
  metricCode: string;
  /** 이 baseYm에서 실제로 값을 가진 지역 수(min-max 코호트 크기). */
  validCount: number;
  /** 코호트 값이 전부 동일해 min-max가 항상 중립값(50)만 내는지. */
  allSame: boolean;
  warning: string | null;
}

export interface DistributionReport {
  metricCode: string;
  min: number;
  max: number;
  median: number;
  zeroOrNullRatio: number;
  warning: string | null;
}

export interface HighlightRegionReport {
  code: string;
  name: string | null;
  found: boolean;
  snapshotStatuses: Partial<Record<ResumableSourceCode, SnapshotStatusLike | "NONE">>;
  hasAllAxisMetrics: boolean;
}

export interface TourismDataQualityReport {
  baseYm: string;
  region: {
    totalSigungu: number;
    duplicateApiSigunguCodes: string[];
    missingApiCode: number;
    analyzable: number;
  };
  snapshot: {
    bySource: Record<ResumableSourceCode, SourceStatusCount>;
    fullyCompleteRegions: number;
    incompleteRegions: number;
    errorRegions: number;
    unknownSourceCodes: string[];
    visitorCnt: SourceStatusCount;
  };
  metric: {
    byMetricCode: MetricCodeReport[];
    baseYmMismatchCount: number;
    duplicateCount: number;
  };
  dna: {
    axisCohorts: AxisCohortReport[];
    networkEligibleRegions: number;
    analyzableRegions: number;
    excludedRegions: number;
    exclusionReasons: Record<string, number>;
  };
  distribution: DistributionReport[];
  poi: {
    tourInfoCompleteRegions: number;
    /** 이번 baseYm에 새로 SUCCESS/EMPTY하지 않았지만 TTL 이내 재사용으로 완료 처리된 지역 수(Phase
     * 2-D, 2026-08-12) — tourInfoCompleteRegions의 부분집합. */
    tourInfoFreshReuseRegions: number;
    zeroPoiRegions: number;
    uncollectedRegions: number;
    maxPoiRegion: { code: string; name: string; count: number } | null;
    suspiciouslyHighRegions: { code: string; name: string; count: number }[];
  };
  highlights: HighlightRegionReport[];
  warnings: string[];
  verdict: "PASS" | "INCOMPLETE" | "FAIL";
  verdictReasons: string[];
}

const KNOWN_PROVENANCE = new Set(["LIVE_API", "CACHED_API", "CURATED", "ESTIMATED", "MISSING"]);

/** 강릉·경주·제천의 REGION_SEED 코드(regionCodeAudit.ts의 HIGHLIGHT_REGION_CODES와 동일 목록). */
export const HIGHLIGHT_REGION_CODES = ["SGG_GANGNEUNG", "SGG_GYEONGJU", "SGG_JECHEON"];

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function auditTourismDataQuality(params: AuditTourismDataQualityParams): TourismDataQualityReport {
  const { baseYm, snapshots, metrics, pois } = params;
  const regions = params.regions.filter((r) => r.level === "SIGUNGU");
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const warnings: string[] = [];

  // TOUR_INFO freshness(Phase 2-D) — 두 곳(완전성 집계, POI 절)에서 같은 판정을 반복 계산하지 않도록
  // region별로 한 번만 계산해 둔다. now를 생략한 호출부는 tourInfoFreshnessByRegion도 비워 두는 게
  // 정상이라(둘 다 optional, 함께 생략) 항상 NEVER_FETCHED가 되어 이전 동작과 동일하게 유지된다.
  const tourInfoFreshnessNow = params.now ?? new Date(0);
  const tourInfoFreshnessById = new Map(
    regions.map((r) => [
      r.id,
      classifyTourInfoFreshness(
        { lastSuccessOrEmptyFetchedAt: params.tourInfoFreshnessByRegion?.[r.id] ?? null },
        tourInfoFreshnessNow,
      ),
    ]),
  );

  // --- 1) Region 범위 ---
  const codeCounts = new Map<string, number>();
  for (const r of regions) {
    if (!r.apiSigunguCode) continue;
    codeCounts.set(r.apiSigunguCode, (codeCounts.get(r.apiSigunguCode) ?? 0) + 1);
  }
  const duplicateApiSigunguCodes = [...codeCounts.entries()].filter(([, c]) => c > 1).map(([code]) => code);
  const missingApiCode = regions.filter((r) => !r.apiSigunguCode).length;
  const analyzable = regions.length - missingApiCode;

  // --- 2) DataSnapshot ---
  const bySource: Record<ResumableSourceCode, SourceStatusCount> = {
    TAR_SVC_DEM: { SUCCESS: 0, EMPTY: 0, ERROR: 0, NONE: 0 },
    TOU_DIV_IX: { SUCCESS: 0, EMPTY: 0, ERROR: 0, NONE: 0 },
    TOU_RES_DEM: { SUCCESS: 0, EMPTY: 0, ERROR: 0, NONE: 0 },
    TOUR_INFO: { SUCCESS: 0, EMPTY: 0, ERROR: 0, NONE: 0 },
  };
  const visitorCnt: SourceStatusCount = { SUCCESS: 0, EMPTY: 0, ERROR: 0, NONE: 0 };
  const unknownSourceCodes = new Set<string>();
  const statusByRegionSource = new Map<string, Partial<Record<ResumableSourceCode, SnapshotStatusLike>>>();

  for (const s of snapshots) {
    if (s.dataSourceCode === "VISITOR_CNT") {
      visitorCnt[s.status]++;
      continue;
    }
    if (!(RESUMABLE_SOURCE_CODES as readonly string[]).includes(s.dataSourceCode)) {
      unknownSourceCodes.add(s.dataSourceCode);
      continue;
    }
    const code = s.dataSourceCode as ResumableSourceCode;
    bySource[code][s.status]++;
    if (!regionById.has(s.regionId)) continue; // SIDO 등 이번 감사 범위 밖 지역은 상태 맵에 넣지 않는다.
    const entry = statusByRegionSource.get(s.regionId) ?? {};
    entry[code] = s.status;
    statusByRegionSource.set(s.regionId, entry);
  }
  for (const code of RESUMABLE_SOURCE_CODES) {
    const seen = bySource[code].SUCCESS + bySource[code].EMPTY + bySource[code].ERROR;
    bySource[code].NONE = regions.length - seen;
  }
  const visitorSeen = visitorCnt.SUCCESS + visitorCnt.EMPTY + visitorCnt.ERROR;
  // VISITOR_CNT는 SIDO+SIGUNGU 전국 1회 호출이라 이 함수의 SIGUNGU count와 분모가 다르다 — NONE은
  // 참고용으로만 채우고 별도 경고 대상으로 삼지 않는다(호출부가 필요하면 원본 건수를 그대로 보여준다).
  visitorCnt.NONE = Math.max(0, regions.length - visitorSeen);

  let fullyCompleteRegions = 0;
  let incompleteRegions = 0;
  let errorRegions = 0;
  const STAT_SOURCE_CODES_ONLY = RESUMABLE_SOURCE_CODES.filter((c) => c !== "TOUR_INFO");
  for (const r of regions) {
    const statuses = statusByRegionSource.get(r.id) ?? {};
    const statSourcesDone = STAT_SOURCE_CODES_ONLY.every((c) => statuses[c] === "SUCCESS" || statuses[c] === "EMPTY");
    // TOUR_INFO는 이번 baseYm에 SUCCESS/EMPTY였거나(실제로 재호출됨), 재사용 가능한 최신 POI가
    // 있으면(TTL freshness) 완전한 것으로 본다 — "이번 baseYm에 새로 호출했는가"가 아니라 "지금 쓸 수
    // 있는 POI 데이터가 있는가"가 기준이다(Phase 2-D).
    const tourInfoDone =
      statuses.TOUR_INFO === "SUCCESS" || statuses.TOUR_INFO === "EMPTY" || tourInfoFreshnessById.get(r.id) === "FRESH";
    const allDone = statSourcesDone && tourInfoDone;
    if (allDone) fullyCompleteRegions++;
    else incompleteRegions++;
    if (RESUMABLE_SOURCE_CODES.some((c) => statuses[c] === "ERROR")) errorRegions++;
  }

  // --- 3) NormalizedMetric ---
  const metricsByCode = new Map<string, MetricForAudit[]>();
  for (const m of metrics) {
    const arr = metricsByCode.get(m.metricCode) ?? [];
    arr.push(m);
    metricsByCode.set(m.metricCode, arr);
  }
  let baseYmMismatchCount = 0;
  const dupKeySeen = new Set<string>();
  let duplicateCount = 0;
  for (const m of metrics) {
    if (m.baseYm !== baseYm) baseYmMismatchCount++;
    const key = `${m.regionId}::${m.metricCode}::${m.baseYm}`;
    if (dupKeySeen.has(key)) duplicateCount++;
    dupKeySeen.add(key);
  }

  const byMetricCode: MetricCodeReport[] = DNA_AXIS_METRIC_CODES.map((metricCode) => {
    const entries = (metricsByCode.get(metricCode) ?? []).filter((m) => m.baseYm === baseYm);
    const presentRegionIds = new Set(entries.map((m) => m.regionId));
    const sourceCode = METRIC_TO_SOURCE[metricCode];
    let missingButEmptyOk = 0;
    let missingUnexpected = 0;
    for (const r of regions) {
      if (presentRegionIds.has(r.id)) continue;
      if (!sourceCode) {
        // 어떤 재개형 소스도 이 metricCode를 채우지 않는 미구현 지표(touResDemIxVal 등) — 판정
        // 근거 자체가 없으므로 항상 정상 결측으로 본다(오탐 방지).
        missingButEmptyOk++;
        continue;
      }
      const status = statusByRegionSource.get(r.id)?.[sourceCode];
      if (status === "EMPTY" || status === undefined) {
        // 스냅샷 자체가 아직 없는(미수집) 지역도 "정상 결측"으로 본다 — 아직 수집 안 됐을 뿐 오류가
        // 아니다. SUCCESS인데 metric이 없는 경우만 진짜 이상으로 잡는다.
        missingButEmptyOk++;
      } else {
        missingUnexpected++;
      }
    }
    const provenanceIssueCount = entries.filter((m) => m.provenance === null || !KNOWN_PROVENANCE.has(m.provenance)).length;
    const rawValueIssueCount = entries.filter((m) => !Number.isFinite(m.rawValue) || m.rawValue < 0).length;
    return { metricCode, present: presentRegionIds.size, missingButEmptyOk, missingUnexpected, provenanceIssueCount, rawValueIssueCount };
  });

  // --- 4) DNA cohort 분석 가능 여부 ---
  const axisCohorts: AxisCohortReport[] = DNA_AXIS_METRIC_CODES.map((metricCode) => {
    const values = (metricsByCode.get(metricCode) ?? []).filter((m) => m.baseYm === baseYm).map((m) => m.rawValue);
    const validCount = values.length;
    const allSame = validCount > 0 && new Set(values).size === 1;
    let warning: string | null = null;
    if (validCount === 0) warning = "이 baseYm에 유효값이 전혀 없음 — 이 축은 전 지역 MISSING";
    else if (validCount < 3) warning = `유효 지역이 ${validCount}곳뿐 — min-max 비교가 사실상 무의미`;
    else if (allSame) warning = "코호트 값이 전부 동일 — min-max가 항상 중립값(50)만 반환";
    return { metricCode, validCount, allSame, warning };
  });

  const networkEligibleRegions = new Set(pois.map((p) => p.regionId)).size;
  let analyzableRegions = 0;
  const exclusionReasons: Record<string, number> = { "5축 전부 데이터 없음": 0 };
  const regionsWithAnyMetric = new Set(metrics.filter((m) => m.baseYm === baseYm).map((m) => m.regionId));
  for (const r of regions) {
    const hasAnyAxis = regionsWithAnyMetric.has(r.id) || pois.some((p) => p.regionId === r.id);
    if (hasAnyAxis) analyzableRegions++;
    else exclusionReasons["5축 전부 데이터 없음"]++;
  }
  const excludedRegions = regions.length - analyzableRegions;

  // --- 5) 데이터 분포 이상치 ---
  const distribution: DistributionReport[] = DNA_AXIS_METRIC_CODES.map((metricCode) => {
    const values = (metricsByCode.get(metricCode) ?? []).filter((m) => m.baseYm === baseYm).map((m) => m.rawValue);
    if (values.length === 0) {
      return { metricCode, min: NaN, max: NaN, median: NaN, zeroOrNullRatio: 1, warning: "값 없음" };
    }
    const zeroCount = values.filter((v) => v === 0).length;
    const zeroOrNullRatio = Math.round((zeroCount / values.length) * 10000) / 10000;
    let warning: string | null = null;
    if (zeroOrNullRatio >= 0.8) warning = `0값 비율 ${(zeroOrNullRatio * 100).toFixed(0)}% — 파싱 오류 의심`;
    return { metricCode, min: Math.min(...values), max: Math.max(...values), median: median(values), zeroOrNullRatio, warning };
  });

  // --- 6) POI ---
  const poiCountByRegion = new Map<string, number>();
  for (const p of pois) poiCountByRegion.set(p.regionId, (poiCountByRegion.get(p.regionId) ?? 0) + 1);
  let tourInfoCompleteRegions = 0;
  let tourInfoFreshReuseRegions = 0;
  let zeroPoiRegions = 0;
  let uncollectedRegions = 0;
  let maxPoiRegion: { code: string; name: string; count: number } | null = null;
  const suspiciouslyHighRegions: { code: string; name: string; count: number }[] = [];
  const poiCountsAll = regions.map((r) => poiCountByRegion.get(r.id) ?? 0);
  const meanPoiCount = poiCountsAll.length > 0 ? poiCountsAll.reduce((a, b) => a + b, 0) / poiCountsAll.length : 0;
  for (const r of regions) {
    const tourInfoStatus = statusByRegionSource.get(r.id)?.TOUR_INFO;
    const count = poiCountByRegion.get(r.id) ?? 0;
    if (tourInfoStatus === "SUCCESS" || tourInfoStatus === "EMPTY") {
      tourInfoCompleteRegions++;
      if (tourInfoStatus === "SUCCESS" && count === 0) zeroPoiRegions++;
    } else if (tourInfoFreshnessById.get(r.id) === "FRESH") {
      // 이번 baseYm에는 호출하지 않았지만(TTL 재사용), 기존 POI 데이터가 여전히 유효하다(Phase 2-D).
      tourInfoCompleteRegions++;
      tourInfoFreshReuseRegions++;
    } else {
      uncollectedRegions++;
    }
    if (!maxPoiRegion || count > maxPoiRegion.count) maxPoiRegion = { code: r.code, name: r.name, count };
    if (meanPoiCount > 0 && count > meanPoiCount * 10 && count > 50) {
      suspiciouslyHighRegions.push({ code: r.code, name: r.name, count });
    }
  }

  // --- 7) 대표 지역 ---
  const highlights: HighlightRegionReport[] = HIGHLIGHT_REGION_CODES.map((code) => {
    const region = regions.find((r) => r.code === code);
    if (!region) return { code, name: null, found: false, snapshotStatuses: {}, hasAllAxisMetrics: false };
    const statuses = statusByRegionSource.get(region.id) ?? {};
    const snapshotStatuses: Partial<Record<ResumableSourceCode, SnapshotStatusLike | "NONE">> = {};
    for (const sc of RESUMABLE_SOURCE_CODES) snapshotStatuses[sc] = statuses[sc] ?? "NONE";
    const hasAllAxisMetrics = DNA_AXIS_METRIC_CODES.every((mc) =>
      metrics.some((m) => m.regionId === region.id && m.metricCode === mc && m.baseYm === baseYm),
    );
    return { code, name: region.name, found: true, snapshotStatuses, hasAllAxisMetrics };
  });

  // --- 판정 ---
  const verdictReasons: string[] = [];
  let verdict: "PASS" | "INCOMPLETE" | "FAIL" = "PASS";

  if (errorRegions > 0) {
    verdict = "FAIL";
    verdictReasons.push(`ERROR가 남아있는 지역 ${errorRegions}곳`);
  }
  if (unknownSourceCodes.size > 0) {
    verdict = "FAIL";
    verdictReasons.push(`알 수 없는 DataSource 코드 발견: ${[...unknownSourceCodes].join(", ")}`);
  }
  if (duplicateCount > 0) {
    verdict = "FAIL";
    verdictReasons.push(`NormalizedMetric 중복 조합 ${duplicateCount}건`);
  }
  const analyzableTarget = Math.max(1, analyzable);
  for (const m of byMetricCode) {
    if (m.missingUnexpected > 0) {
      const ratio = m.missingUnexpected / analyzableTarget;
      if (ratio > 0.3) {
        verdict = "FAIL";
        verdictReasons.push(`${m.metricCode}: SUCCESS인데 metric 누락 ${m.missingUnexpected}곳(전체의 ${(ratio * 100).toFixed(0)}%)`);
      } else {
        warnings.push(`${m.metricCode}: SUCCESS인데 metric이 없는 지역 ${m.missingUnexpected}곳 — 재확인 필요`);
      }
    }
    if (m.provenanceIssueCount > 0) warnings.push(`${m.metricCode}: provenance 이상 ${m.provenanceIssueCount}건`);
    if (m.rawValueIssueCount > 0) {
      verdict = "FAIL";
      verdictReasons.push(`${m.metricCode}: rawValue 비정상(NaN/음수 등) ${m.rawValueIssueCount}건`);
    }
  }
  if (analyzableRegions === 0) {
    verdict = "FAIL";
    verdictReasons.push("DNA cohort 계산 가능 지역이 0곳 — 전 지역 5축 데이터 없음");
  }
  for (const a of axisCohorts) {
    if (a.warning) warnings.push(`[${a.metricCode}] ${a.warning}`);
  }
  for (const d of distribution) {
    if (d.warning) warnings.push(`[분포:${d.metricCode}] ${d.warning}`);
  }
  if (suspiciouslyHighRegions.length > 0) {
    warnings.push(`POI 수가 비정상적으로 많은 지역 ${suspiciouslyHighRegions.length}곳: ${suspiciouslyHighRegions.map((r) => `${r.name}(${r.count}건)`).join(", ")}`);
  }

  if (verdict !== "FAIL") {
    if (incompleteRegions > 0) {
      verdict = "INCOMPLETE";
      verdictReasons.push(`아직 미완료된 지역 ${incompleteRegions}곳(4개 소스 전부 완료 아님)`);
    } else if (warnings.length > 0) {
      // 경고는 있지만 치명적이지 않으면 PASS를 막지 않는다(사용자 요구사항 — FAIL은 "실제 문제일 때만").
      verdict = "PASS";
    }
  }

  return {
    baseYm,
    region: { totalSigungu: regions.length, duplicateApiSigunguCodes, missingApiCode, analyzable },
    snapshot: { bySource, fullyCompleteRegions, incompleteRegions, errorRegions, unknownSourceCodes: [...unknownSourceCodes], visitorCnt },
    metric: { byMetricCode, baseYmMismatchCount, duplicateCount },
    dna: { axisCohorts, networkEligibleRegions, analyzableRegions, excludedRegions, exclusionReasons },
    distribution,
    poi: {
      tourInfoCompleteRegions,
      tourInfoFreshReuseRegions,
      zeroPoiRegions,
      uncollectedRegions,
      maxPoiRegion,
      suspiciouslyHighRegions,
    },
    highlights,
    warnings,
    verdict,
    verdictReasons,
  };
}
