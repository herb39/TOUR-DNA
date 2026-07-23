export type AdminLevel = "SIDO" | "SIGUNGU";
export type AxisStatus = "LIVE" | "SNAPSHOT" | "MISSING";
export type DataMode = "LIVE" | "HYBRID" | "SNAPSHOT";

/**
 * 값의 실제 출처 상태(Phase 1-A schema.prisma의 DataProvenance와 값 집합이 동일한 도메인 리터럴 유니온 —
 * domain 계층은 Prisma를 몰라야 하므로 여기서 별도로 정의한다. Phase 1-C에서 실제로 연결).
 * - LIVE_API: 이번 동기화(이 실행)에서 실제 API 성공 응답으로 생성/갱신됨.
 * - CACHED_API: 과거 실제 API 성공 응답을 최신 실패 시도 대신 재사용함.
 * - CURATED: 사람이 검수해 만든 POI/관계 데이터.
 * - ESTIMATED: 실제 추정 로직으로 계산되었거나, API 응답은 받았지만 필드 의미가 아직 검증되지 않은 값.
 * - MISSING: 사용할 값 자체가 없음(보통 엔트리/Evidence가 아예 존재하지 않는 경우와 대응).
 */
export type DataProvenance = "LIVE_API" | "CACHED_API" | "CURATED" | "ESTIMATED" | "MISSING";

export const DNA_AXES = ["demand", "stay", "spend", "diversity", "network"] as const;
export type DnaAxisKey = (typeof DNA_AXES)[number];

export interface EvidenceItem {
  axis: DnaAxisKey | null;
  metricCode: string;
  rawValue: number;
  normalizedValue: number | null;
  unit: string;
  adminLevel: AdminLevel;
  regionCode: string;
  baseYm: string;
  sourceCode: string;
  collectedAt: string; // ISO datetime
  /** 분석 당시 이 근거의 provenance(Phase 1-C). 판정 근거가 없으면 null — 임의로 채우지 않는다. */
  provenance: DataProvenance | null;
  appliedRule: string;
}

/** 하나의 지표가 특정 기준월에 대해, 특정 행정단위 코호트(비교 대상 지역들) 안에서 갖는 원값. */
export interface RegionMetricValue {
  regionCode: string;
  baseYm: string;
  metricCode: string;
  rawValue: number;
  unit: string;
  adminLevel: AdminLevel;
  sourceCode: string;
  collectedAt: string;
  /** NormalizedMetric.provenance를 그대로 옮긴 값(Phase 1-C). NULL이면 판정 근거가 없다는 뜻이다. */
  provenance: DataProvenance | null;
  /** provenance !== "LIVE_API"일 때 true(NULL 포함) — "LIVE_API로 확인된 값만 LIVE" 원칙. */
  isSnapshotFallback: boolean;
}

/**
 * Network 축 원본 입력(Phase 1-E, 2026-07-23: POI 근거와 관계 근거를 독립적인 provenance로 분리했다 —
 * 이전에는 "non-API POI 존재 || 관계 존재"를 OR로 합쳐 하나의 provenance로 뭉갰는데, 그 결과 실제 API로
 * 수집한 POI 근거까지 사람이 만든 관계 데이터 때문에 CURATED로 격하되는 문제가 있었다.
 */
export interface NetworkRawInputs {
  attractionCount: number;
  relatedPoiCount: number;
  foodCount: number;
  lodgingCount: number;
  experienceCount: number;
  collectedAt: string;
  /** 관광지/음식/숙박/체험 POI 구성 근거. API/FIXTURE가 섞이면 보수적으로 CURATED(단순 "하나라도 API면
   * LIVE_API"가 아니다 — apiCount/fixtureCount를 함께 노출해 혼합 상태를 투명하게 드러낸다). */
  poi: {
    apiCount: number;
    fixtureCount: number;
    provenance: DataProvenance;
    isSnapshotFallback: boolean;
  };
  /** 연관 POI 관계(PoiRelation) 근거. 관계가 하나도 없으면 "확인된 0건"인지 "애초에 근거가 없는지"
   * 현재 스키마로 구분할 수 없으므로 null로 두고 Evidence 자체를 만들지 않는다(임의로 CURATED 0건을
   * 지어내지 않음). */
  relation: {
    count: number;
    provenance: DataProvenance;
    isSnapshotFallback: boolean;
  } | null;
}

export interface VisitorCountPoint {
  value: number;
  baseYm: string;
  sourceCode: string;
  collectedAt: string;
  provenance: DataProvenance | null;
  isSnapshotFallback: boolean;
}

export interface DnaEngineInput {
  regionCode: string;
  baseYm: string;
  adminLevel: AdminLevel;
  /** metricCode -> 동일 행정단위·기준월·지표의 코호트(비교 대상 지역 전체, 대상 지역 포함) */
  metricCohorts: Partial<Record<string, RegionMetricValue[]>>;
  /** 직전 기준월의 방문자수(있으면 데맨드 축 증감률 보조지표로 사용) */
  previousVisitorCount?: VisitorCountPoint | null;
  currentVisitorCount?: VisitorCountPoint | null;
  networkInputs: NetworkRawInputs | null;
}

export interface DnaAxisResult {
  score: number | null; // 0~100, 반올림 정수. 데이터 부족 시 null.
  status: AxisStatus;
  evidence: EvidenceItem[];
}

export interface DnaResult {
  demand: DnaAxisResult;
  stay: DnaAxisResult;
  spend: DnaAxisResult;
  diversity: DnaAxisResult;
  network: DnaAxisResult;
  overallDataMode: DataMode;
  liveAxisCount: number; // 0~5
  strengths: string[]; // 2개
  opportunities: string[]; // 2개
  cautions: string[]; // 1개
}

export const METRIC_CODES = {
  DEMAND_SERVICE: "tarSvcDemIxVal",
  DEMAND_RESOURCE: "touResDemIxVal",
  DEMAND_VISITOR_GROWTH: "visitorGrowthRateVal",
  VISITOR_CNT: "visitorCnt",
  STAY: "tarSjrnDsIxVal",
  SPEND: "tarExpDsIxVal",
  DIVERSITY: "touDivIxVal",
} as const;

export const AXIS_LABEL_KO: Record<DnaAxisKey, string> = {
  demand: "수요(Demand)",
  stay: "체류(Stay)",
  spend: "소비(Spend)",
  diversity: "다양성(Diversity)",
  network: "연계(Network)",
};
