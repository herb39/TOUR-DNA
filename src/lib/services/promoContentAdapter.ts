import { Prisma } from "@/generated/prisma/client";
import type { CourseDay } from "@/lib/domain/planBuilder";
import {
  buildPromoDnaContext,
  EMPTY_PROMO_DNA_CONTEXT,
  type BuildPromoContentInput,
  type PromoContent,
  type PromoDnaContext,
  type PromoNationality,
  type PromoUserRole,
} from "@/lib/domain/promoContent";
import type { AdminLevel, DataProvenance, DnaAxisKey, EvidenceItem } from "@/lib/domain/types";
import { preferredThemeLabels } from "@/lib/validation/project-preferences";

/**
 * Prisma 조회 결과 → Phase 5-A 도메인 입력(BuildPromoContentInput) 변환 경계, 그리고 PromoContent →
 * Prisma JSON 저장값 변환 경계. Prisma 타입과 도메인 타입이 문자열 값 집합상 같아 보여도 우연한 구조적
 * 호환성에 기대지 않고 이 파일에서만 명시적으로 매핑한다 — 다른 파일은 이 경계를 우회하지 않는다.
 */

// ── Evidence 매핑 ──────────────────────────────────────────

export interface PromoEvidenceSourceRow {
  axis: string | null;
  metricCode: string;
  rawValue: number;
  normalizedValue: number | null;
  unit: string;
  adminLevel: "SIDO" | "SIGUNGU";
  regionCode: string;
  baseYm: string;
  sourceCode: string;
  collectedAt: Date;
  appliedRule: string;
  provenance: "LIVE_API" | "CACHED_API" | "CURATED" | "ESTIMATED" | "MISSING" | null;
}

const AXIS_MAP: Record<string, DnaAxisKey> = {
  demand: "demand",
  stay: "stay",
  spend: "spend",
  diversity: "diversity",
  network: "network",
};

const ADMIN_LEVEL_MAP: Record<"SIDO" | "SIGUNGU", AdminLevel> = { SIDO: "SIDO", SIGUNGU: "SIGUNGU" };

const PROVENANCE_MAP: Record<string, DataProvenance> = {
  LIVE_API: "LIVE_API",
  CACHED_API: "CACHED_API",
  CURATED: "CURATED",
  ESTIMATED: "ESTIMATED",
  MISSING: "MISSING",
};

function mapAxis(value: string | null): DnaAxisKey | null {
  if (value === null) return null;
  return AXIS_MAP[value] ?? null;
}

function mapProvenance(value: string | null): DataProvenance | null {
  if (value === null) return null;
  return PROVENANCE_MAP[value] ?? null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Prisma Evidence 행 하나를 Phase 5-A `EvidenceItem`으로 변환한다. `rawValue`가 유한하지 않거나
 * `metricCode`/`sourceCode`/`baseYm`이 비어 있으면(스키마상 필수지만 방어적으로) 이 Evidence 전체를
 * 신뢰할 수 없다고 보고 `null`을 반환한다 — 호출부는 null을 걸러내고 나머지만 사용한다. 숫자 0을
 * "값 없음"으로 강제 변환하지 않고, provenance/axis는 알려진 값만 통과시킨다(알 수 없는 값은 null).
 */
export function mapEvidenceToEvidenceItem(row: PromoEvidenceSourceRow): EvidenceItem | null {
  if (!Number.isFinite(row.rawValue)) return null;
  if (!isNonEmptyString(row.metricCode) || !isNonEmptyString(row.sourceCode) || !isNonEmptyString(row.baseYm)) {
    return null;
  }

  return {
    axis: mapAxis(row.axis),
    metricCode: row.metricCode,
    rawValue: row.rawValue,
    normalizedValue: row.normalizedValue !== null && Number.isFinite(row.normalizedValue) ? row.normalizedValue : null,
    unit: row.unit,
    adminLevel: ADMIN_LEVEL_MAP[row.adminLevel],
    regionCode: row.regionCode,
    baseYm: row.baseYm,
    sourceCode: row.sourceCode,
    collectedAt: row.collectedAt.toISOString(),
    provenance: mapProvenance(row.provenance),
    appliedRule: row.appliedRule,
  };
}

// ── BuildPromoContentInput 조립 ────────────────────────────

export interface PromoContentSourceProject {
  role: PromoUserRole;
  travelYear: number;
  travelMonth: number;
  regionName: string;
  nationality: PromoNationality | null;
  /** ProjectInput.preferredThemes — Json 컬럼 원본(string[] 형태로 저장돼 있다고 가정하되 신뢰하지 않고 검증한다). */
  preferredThemes: unknown;
}

export interface PromoContentSourcePlan {
  productName: string;
  conceptText: string;
  background: string;
  targetSummary: string;
  sellingPoints: unknown;
  course: unknown;
  kpis: unknown;
  operationChecklist: unknown;
  risks: unknown;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString);
}

function toCourseDays(value: unknown): CourseDay[] {
  if (typeof value !== "object" || value === null) return [];
  const days = (value as Record<string, unknown>).days;
  return Array.isArray(days) ? (days as CourseDay[]) : [];
}

function isKpiLike(value: unknown): value is { name: string; method: string } {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.name === "string" && typeof rec.method === "string";
}

function toKpiList(value: unknown): { name: string; method: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isKpiLike);
}

function isRiskLike(value: unknown): value is { risk: string; mitigation: string } {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.risk === "string" && typeof rec.mitigation === "string";
}

function toRiskList(value: unknown): { risk: string; mitigation: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRiskLike);
}

/** AnalysisResult의 5축 원점수만 담는다(2026-08-11) — 다른 필드(overallDataMode 등)는 홍보 생성에
 * 쓸 근거가 아니므로 가져오지 않는다. 값이 null인 축(MISSING)은 buildPromoDnaContext가 알아서
 * 제외한다. */
export interface PromoContentSourceAnalysis {
  demandScore: number | null;
  stayScore: number | null;
  spendScore: number | null;
  diversityScore: number | null;
  networkScore: number | null;
}

function toPromoDnaContext(analysis: PromoContentSourceAnalysis | null | undefined): PromoDnaContext {
  if (!analysis) return EMPTY_PROMO_DNA_CONTEXT;
  const axisScores: { axis: DnaAxisKey; score: number | null }[] = [
    { axis: "demand", score: analysis.demandScore },
    { axis: "stay", score: analysis.stayScore },
    { axis: "spend", score: analysis.spendScore },
    { axis: "diversity", score: analysis.diversityScore },
    { axis: "network", score: analysis.networkScore },
  ];
  return buildPromoDnaContext(axisScores);
}

export function buildPromoContentInputFromProjectData(data: {
  project: PromoContentSourceProject;
  plan: PromoContentSourcePlan;
  strategyName: string;
  evidenceRows: PromoEvidenceSourceRow[];
  /** 없으면(레거시 호출부·분석 결과 없음) 강점/약점 없이 생성한다. */
  analysis?: PromoContentSourceAnalysis | null;
}): BuildPromoContentInput {
  return {
    project: {
      role: data.project.role,
      regionName: data.project.regionName,
      nationality: data.project.nationality,
      travelYear: data.project.travelYear,
      travelMonth: data.project.travelMonth,
      preferredThemes: preferredThemeLabels(data.project.preferredThemes),
    },
    strategy: { name: data.strategyName },
    plan: {
      productName: data.plan.productName,
      conceptText: data.plan.conceptText,
      background: data.plan.background,
      targetSummary: data.plan.targetSummary,
      sellingPoints: toStringArray(data.plan.sellingPoints),
      course: toCourseDays(data.plan.course),
      kpis: toKpiList(data.plan.kpis),
      operationChecklist: toStringArray(data.plan.operationChecklist),
      risks: toRiskList(data.plan.risks),
    },
    evidences: data.evidenceRows.map(mapEvidenceToEvidenceItem).filter((e): e is EvidenceItem => e !== null),
    dna: toPromoDnaContext(data.analysis),
  };
}

// ── PromoContent → Prisma JSON 직렬화 경계 ──────────────────

export type PromoJsonScalar = string | number | boolean | null;
export type PromoJsonValue = PromoJsonScalar | PromoJsonValue[] | { [key: string]: PromoJsonValue };

export class PromoContentSerializationError extends Error {}

/** `unknown`을 받아 string/number(유한)/boolean/null/배열/순수 객체만 재귀적으로 허용한다. Date/Map/Set/
 * 클래스 인스턴스/함수/undefined/bigint/symbol/non-finite 숫자는 모두 거부한다(조용히 변형하지 않고
 * 예외를 던진다). 입력을 mutate하지 않고 항상 새 배열/객체를 만든다. */
function toPromoJsonValue(value: unknown): PromoJsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PromoContentSerializationError("유한하지 않은 숫자는 저장할 수 없습니다.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPromoJsonValue(item));
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new PromoContentSerializationError("일반 객체가 아닌 값은 저장할 수 없습니다(Date/Map/Set/클래스 인스턴스 등).");
    }
    const result: Record<string, PromoJsonValue> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (entryValue === undefined) continue; // undefined 필드는 생략(값을 지어내지 않음).
      result[key] = toPromoJsonValue(entryValue);
    }
    return result;
  }
  throw new PromoContentSerializationError(`저장할 수 없는 값 타입입니다: ${typeof value}`);
}

/** PromoContent를 실제로 재귀 검증한 뒤에만 Prisma의 InputJsonValue로 넘긴다 — 검증을 건너뛰는
 * `as unknown as Prisma.InputJsonValue` 이중 단언을 쓰지 않는다. */
export function toPromoContentJson(content: PromoContent): Prisma.InputJsonValue {
  return toPromoJsonValue(content) as Prisma.InputJsonValue;
}
