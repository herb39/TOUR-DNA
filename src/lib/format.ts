import { METRIC_CODES, type DataProvenance } from "@/lib/domain/types";
import { DATA_SOURCE_SEED } from "@/lib/fixtures/dataSources";

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "조건 입력 완료",
  ANALYZED: "분석 완료",
  PLANNED: "실행안 완료",
};

/** POI 카테고리 코드 → 한글 라벨(2026-07-30, POI 적합도 화면 표시용). 지역·프로젝트와 무관한 공통
 * 카테고리 코드 매핑이다. */
export const POI_CATEGORY_LABEL_KO: Record<string, string> = {
  ATTRACTION: "관광지",
  FOOD: "음식",
  LODGING: "숙박",
  EXPERIENCE: "체험",
  FESTIVAL: "축제/행사",
  SHOPPING: "쇼핑",
};

export function poiCategoryLabel(category: string): string {
  return POI_CATEGORY_LABEL_KO[category] ?? category;
}

/** DataProvenance → 사용자용 한글 근거 수준 라벨. 내부 enum 이름을 화면에 그대로 노출하지 않는다.
 * `MISSING`(근거를 확인했으나 사용할 근거가 없음)과 `null`/`undefined`(레거시 데이터이거나 아직 출처
 * 판정 정보 자체가 없음)는 의미가 다르므로 서로 다른 라벨을 쓴다 — 둘 다 "근거 없음"으로 뭉뚱그리면
 * "확인했지만 없다"와 "확인 자체를 안 했다"를 구분할 수 없다(2026-08-01 보완). */
export const DATA_PROVENANCE_LABEL_KO: Record<DataProvenance, string> = {
  LIVE_API: "실시간 API",
  CACHED_API: "저장된 API",
  CURATED: "정제 데이터",
  ESTIMATED: "추정값",
  MISSING: "근거 없음",
};

/** provenance 판정 정보 자체가 없을 때(null/undefined)만 쓰는 라벨 — MISSING과 절대 같은 문구를
 * 쓰지 않는다. */
export const PROVENANCE_UNKNOWN_LABEL_KO = "판정 정보 없음";

export function provenanceLabel(provenance: DataProvenance | null | undefined): string {
  if (provenance === null || provenance === undefined) return PROVENANCE_UNKNOWN_LABEL_KO;
  return DATA_PROVENANCE_LABEL_KO[provenance] ?? provenance;
}

/** 사용자에게 보여주는 모든 날짜·시간 표시가 공유하는 시간대(2026-08-04) — DB에는 항상 UTC로
 * 저장하고(Prisma DateTime 컬럼, 값 변경 없음), 화면 표시에만 이 시간대를 명시해 서버 실행 환경(Vercel은
 * 기본 UTC)이나 브라우저의 로컬 시간대에 좌우되지 않게 한다. */
export const DISPLAY_TIME_ZONE = "Asia/Seoul";

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** 이동 결과 출처(Phase 12, 2026-08-05) → 사용자용 한글 라벨. 실제 도로 경로와 추정치를 같은 문구로
 * 보여주지 않기 위해 쓴다(routeService.ts의 RouteResultSource와 1:1 대응). 이 필드가 아예 없는
 * CourseItem(레거시 실행안, 또는 PRIVATE_VEHICLE이 아니라 애초에 실제 경로를 시도하지 않은 이동수단)은
 * 항상 haversine 추정치였다는 뜻이므로 "직선거리 기반 추정"으로 안전하게 기본 처리한다. */
export const TRAVEL_SOURCE_LABEL_KO: Record<"LIVE_API" | "CACHED_API" | "ESTIMATED", string> = {
  LIVE_API: "실제 도로 기준",
  CACHED_API: "실제 도로 기준 · 캐시",
  ESTIMATED: "직선거리 기반 추정",
};

export function travelSourceLabel(source: "LIVE_API" | "CACHED_API" | "ESTIMATED" | null | undefined): string {
  return TRAVEL_SOURCE_LABEL_KO[source ?? "ESTIMATED"];
}

/** AdminLevel(SIDO/SIGUNGU) → 사용자용 한글 라벨. 근거 테이블의 "행정단위" 열이 enum 원문을 그대로
 * 보여주던 것을 바로잡는다(2026-08-08). */
export const ADMIN_LEVEL_LABEL_KO: Record<"SIDO" | "SIGUNGU", string> = {
  SIDO: "시도",
  SIGUNGU: "시군구",
};

export function adminLevelLabel(adminLevel: string): string {
  return ADMIN_LEVEL_LABEL_KO[adminLevel as "SIDO" | "SIGUNGU"] ?? adminLevel;
}

export function formatBaseYm(baseYm: string | null | undefined): string {
  if (!baseYm || baseYm.length !== 6) return "-";
  return `${baseYm.slice(0, 4)}년 ${Number(baseYm.slice(4, 6))}월`;
}

/**
 * 내부 지표 코드 → 한글 라벨(2026-07-29, 원래 promoContent.ts에만 있던 것을 공용화). 사용자 화면(분석
 * 근거 테이블, 인쇄물)과 홍보자료 생성 로직이 이 매핑 하나를 공유해, "tarSjrnDsIxVal" 같은 내부 코드가
 * 화면에 그대로 노출되지 않게 한다. 알 수 없는 코드(향후 추가되는 지표 등)는 코드 자체를 그대로 보여줘
 * 안전하게 degrade한다(빈 문자열이나 크래시보다 낫다).
 */
export const METRIC_LABEL_KO: Record<string, string> = {
  [METRIC_CODES.DEMAND_SERVICE]: "관광 서비스 수요",
  [METRIC_CODES.DEMAND_RESOURCE]: "관광자원 수요",
  [METRIC_CODES.DEMAND_VISITOR_GROWTH]: "방문자수 증감률(전월 대비, 수요 점수 반영)",
  [METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY]: "방문자수 증감률(전년 동월 우선 비교)",
  [METRIC_CODES.VISITOR_CNT]: "방문자수",
  [METRIC_CODES.VISITOR_CNT_LOCAL]: "현지인 방문자수",
  [METRIC_CODES.STAY]: "체류 강도",
  [METRIC_CODES.SPEND]: "소비 강도",
  [METRIC_CODES.DIVERSITY]: "관광 다양성",
  networkPoiCount: "중심 관광지 수",
  networkFoodCount: "음식 POI 수",
  networkLodgingCount: "숙박 POI 수",
  networkExperienceCount: "체험 POI 수",
};

export function metricLabel(metricCode: string): string {
  return METRIC_LABEL_KO[metricCode] ?? metricCode;
}

/** 방문자수(raw, 단위 "명")를 화면용으로 포맷한다(2026-07-29). 원본 단위가 "명"임을 실제 데이터
 * (prisma/seed.ts VISITOR_CNT unit)로 확인한 뒤에만 이 포맷을 쓴다 — 임의로 시간/원 단위를 추정하지 않는다. */
export function formatVisitorCount(rawValue: number): string {
  if (!Number.isFinite(rawValue)) return "-";
  return `${Math.round(rawValue).toLocaleString("ko-KR")}명`;
}

/** 증감률(%)을 방향이 드러나게 포맷한다. 정확히 0이면 "데이터 없음"과 구분되게 "변화 없음(0%)"으로
 * 명시한다(2026-07-29) — 비교 데이터 자체가 없는 경우는 이 함수를 호출하지 않고 카드 자체를 생략한다. */
export function formatSignedPercent(percent: number): string {
  if (!Number.isFinite(percent)) return "-";
  const rounded = Math.round(percent * 10) / 10;
  if (rounded > 0) return `${rounded}% 증가`;
  if (rounded < 0) return `${Math.abs(rounded)}% 감소`;
  return "변화 없음(0%)";
}

/** 체류/소비 강도 지표의 실제 저장 단위는 "지수"다(prisma/seed.ts unit: "지수" — 시간·원이 아니다).
 * 임의로 시간/원 단위로 환산하지 않고 원래 단위 그대로 소수 1자리까지 보여준다(2026-07-29). */
export function formatIndexValue(rawValue: number): string {
  if (!Number.isFinite(rawValue)) return "-";
  return `${Math.round(rawValue * 10) / 10}`;
}

/** DataSource.code → 한글 서비스명. 새 코드를 하드코딩하지 않고 기존 DATA_SOURCE_SEED(코드의 유일한
 * 출처)를 그대로 재사용한다 — 코드가 늘어도 이 파일을 손댈 필요가 없다. */
const SOURCE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  DATA_SOURCE_SEED.map((d) => [d.code, d.name]),
);

export function sourceLabel(sourceCode: string): string {
  return SOURCE_NAME_BY_CODE[sourceCode] ?? sourceCode;
}

/**
 * 여러 Evidence의 baseYm을 요약한다(2026-07-29) — 분석/인쇄 화면이 "분석 기준월"을 env 상수 대신 실제
 * 근거에 저장된 기준월로 표시하기 위해 쓴다. 모든 지표가 같은 월이라고 가정하지 않고, 서로 다른 달이
 * 섞여 있으면 그 사실 자체를 알려준다(값을 하나로 뭉개지 않음).
 */
export function summarizeEvidenceBaseYms(
  evidences: Array<{ baseYm: string }>,
): { primary: string | null; all: string[]; mixed: boolean } {
  const all = Array.from(new Set(evidences.map((e) => e.baseYm))).sort();
  return {
    primary: all.length > 0 ? all[all.length - 1] : null,
    all,
    mixed: all.length > 1,
  };
}
