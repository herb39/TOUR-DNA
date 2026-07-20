export type AdminLevel = "SIDO" | "SIGUNGU";
export type AxisStatus = "LIVE" | "SNAPSHOT" | "MISSING";
export type DataMode = "LIVE" | "HYBRID" | "SNAPSHOT";

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
  isSnapshotFallback: boolean;
}

export interface NetworkRawInputs {
  attractionCount: number;
  relatedPoiCount: number;
  foodCount: number;
  lodgingCount: number;
  experienceCount: number;
  sourceCode: string;
  collectedAt: string;
  isSnapshotFallback: boolean;
}

export interface DnaEngineInput {
  regionCode: string;
  baseYm: string;
  adminLevel: AdminLevel;
  /** metricCode -> 동일 행정단위·기준월·지표의 코호트(비교 대상 지역 전체, 대상 지역 포함) */
  metricCohorts: Partial<Record<string, RegionMetricValue[]>>;
  /** 직전 기준월의 방문자수(있으면 데맨드 축 증감률 보조지표로 사용) */
  previousVisitorCount?: { value: number; baseYm: string; sourceCode: string; collectedAt: string } | null;
  currentVisitorCount?: { value: number; baseYm: string; sourceCode: string; collectedAt: string } | null;
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
