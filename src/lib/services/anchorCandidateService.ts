import {
  canApplyFestivalAnchor,
  findFestivalAnchorItems,
  validateFestivalAnchorCourseDays,
  type FestivalAnchorCourseSource,
} from "@/lib/domain/festivalAnchorCourse";
import { haversineDistanceKm } from "@/lib/domain/geo";
import {
  classifyPoiCategoryTier,
  computePoiFit,
  isExcludedFromRecommendation,
  type PoiFitContext,
  type PoiFitResult,
} from "@/lib/domain/poiFit";
import { classifyThemes, templateCoreThemeCategories } from "@/lib/domain/audienceContext";
import { dedupeBySameCoordinates, dedupeBySameSite } from "@/lib/domain/poiDedup";
import {
  decidePoiRecommendation,
  isVisibleRecommendationCandidate,
  type PoiRepresentationCode,
  type PoiRecommendationStatus,
} from "@/lib/domain/poiRecommendation";
import { themeRelevanceTier, type DurationCode, type PoiLike } from "@/lib/domain/strategy";
import { getTemplateById, type PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import type { CourseDay } from "@/lib/domain/planBuilder";
import { fetchPoisByCategory } from "./fetchPoisByCategory";

export type AnchorCandidateRole = "PRE_EVENT" | "MEAL" | "POST_EVENT" | "STAY";
export type AnchorCandidatePosition = "BEFORE_ANCHOR" | "AFTER_ANCHOR" | "DAY_END";

export interface AnchorCandidate {
  id: string;
  name: string;
  category: PoiCategoryCode;
  lat: number;
  lng: number;
  operatingHours?: string | null;
  closedDays?: string | null;
  mealEligible?: boolean;
  foodSubcategory?: PoiLike["foodSubcategory"];
  lclsSystm1?: string | null;
  lclsSystm2?: string | null;
  role: AnchorCandidateRole;
  roleLabel: string;
  suggestedPosition: AnchorCandidatePosition;
  dayIndex: number;
  distanceKm: number;
  distanceLabel: string;
  distanceMethod: "HAVERSINE";
  reason: string;
  recommendationStatus: PoiRecommendationStatus | null;
  recommendationReason?: string;
  representation: PoiRepresentationCode;
  fit: PoiFitResult;
}

export type AnchorCandidateResult =
  | { status: "AVAILABLE"; groups: Record<AnchorCandidateRole, AnchorCandidate[]>; total: number }
  | { status: "EMPTY"; groups: Record<AnchorCandidateRole, AnchorCandidate[]>; total: 0; message: string }
  | { status: "NOT_READY" | "STALE"; groups: Record<AnchorCandidateRole, AnchorCandidate[]>; total: 0; message: string };

export interface AnchorCandidateParams {
  anchor: FestivalAnchorCourseSource | null;
  days: CourseDay[];
  templateId: string;
  regionCode: string;
  travelMonth: number;
  preferredThemes: string[];
  duration: DurationCode;
  existingPoiIds: string[];
}

const ROLE_ORDER: AnchorCandidateRole[] = ["PRE_EVENT", "MEAL", "POST_EVENT", "STAY"];
const MAX_PER_ROLE = 3;
const MAX_TOTAL = 12;
const EMPTY_GROUPS = (): Record<AnchorCandidateRole, AnchorCandidate[]> => ({
  PRE_EVENT: [],
  MEAL: [],
  POST_EVENT: [],
  STAY: [],
});

function hasCoords<T extends { lat?: number | null; lng?: number | null }>(value: T): value is T & { lat: number; lng: number } {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng);
}

function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.max(0.1, distanceKm).toFixed(1)}km` : `${distanceKm.toFixed(1)}km`;
}

function roleLabel(role: AnchorCandidateRole): string {
  return role === "PRE_EVENT" ? "행사 전" : role === "MEAL" ? "식사" : role === "POST_EVENT" ? "행사 후" : "숙박";
}

function roleRank(role: AnchorCandidateRole, category: PoiCategoryCode): number {
  if (role === "MEAL" || role === "STAY") return 0;
  if (role === "PRE_EVENT") return category === "ATTRACTION" ? 0 : 1;
  return category === "SHOPPING" ? 0 : category === "ATTRACTION" ? 1 : 2;
}

function categoriesForRole(role: AnchorCandidateRole): PoiCategoryCode[] {
  if (role === "PRE_EVENT") return ["ATTRACTION", "EXPERIENCE"];
  if (role === "MEAL") return ["FOOD"];
  if (role === "POST_EVENT") return ["ATTRACTION", "EXPERIENCE", "SHOPPING"];
  return ["LODGING"];
}

function recommendationFor(poi: PoiLike, themeCategories: ReturnType<typeof classifyThemes>) {
  return decidePoiRecommendation(poi, themeCategories);
}

function reasonFor(
  role: AnchorCandidateRole,
  poi: PoiLike,
  distanceLabel: string,
  fit: PoiFitResult,
): string {
  const themeReason = fit.positiveReasons.find((reason) => reason.includes("전략") || reason.includes("테마"));
  if (role === "PRE_EVENT") {
    return `Anchor 시작 전 연결 후보입니다. ${themeReason ?? "관광·체험 카테고리와의 전략 적합도를 반영했습니다."} Anchor까지 직선거리 약 ${distanceLabel}입니다.`;
  }
  if (role === "MEAL") {
    return `Anchor 전후 식사 연결 후보입니다. 식사 가능 데이터와 Anchor까지 직선거리 약 ${distanceLabel}를 반영했습니다.`;
  }
  if (role === "POST_EVENT") {
    const hoursNote = fit.dataSource.operatingHoursConfirmed
      ? "운영시간 데이터가 있어 행사 종료 후 이용 가능 여부를 확인할 수 있습니다."
      : "운영시간이 확인되지 않아 야간 운영을 가정하지 않았습니다.";
    return `Anchor 종료 후 연결 후보입니다. ${hoursNote} Anchor까지 직선거리 약 ${distanceLabel}입니다.`;
  }
  return `숙박 일정일 때 Anchor 이후 체류를 이어갈 후보입니다. Anchor까지 직선거리 약 ${distanceLabel}이며, 실제 체크인 가능 여부를 확인해야 합니다.`;
}

/**
 * 확정 시각이 있고 현재 코스에 같은 snapshot의 Anchor가 반영된 경우에만 Anchor 주변 후보를 만든다.
 * DB는 지역별 POI를 한 번에 읽고, 후보별 외부 API/N+1 조회는 하지 않는다. 거리 기준은 기존 geo의
 * haversine 직선거리만 사용하며, 이 단계에서 임의의 반경으로 후보를 잘라내지 않고 가까운 순으로 정렬한다.
 */
export async function buildAnchorCandidateSuggestions(
  params: AnchorCandidateParams,
): Promise<AnchorCandidateResult> {
  const groups = EMPTY_GROUPS();
  const anchor = params.anchor;
  if (!anchor || !canApplyFestivalAnchor(anchor)) {
    return {
      status: "NOT_READY",
      groups,
      total: 0,
      message: "정확한 시작·종료 시각이 확정된 Anchor를 코스에 먼저 반영하면 전후 후보를 확인할 수 있습니다.",
    };
  }
  if ((anchor.regionCode && anchor.regionCode !== params.regionCode) || !hasCoords(anchor)) {
    return { status: "NOT_READY", groups, total: 0, message: "Anchor의 지역 또는 좌표 정보가 없어 연계 후보를 계산할 수 없습니다." };
  }

  const courseAnchors = findFestivalAnchorItems(params.days);
  const current = courseAnchors.find(({ item }) => item.anchorId === anchor.id);
  if (!current) {
    return { status: "NOT_READY", groups, total: 0, message: "Anchor를 현재 코스에 반영하면 행사 전후 후보가 표시됩니다." };
  }
  const validation = validateFestivalAnchorCourseDays(params.days, anchor);
  if (!validation.ok || !hasCoords(current.item)) {
    return {
      status: "STALE",
      groups,
      total: 0,
      message: validation.message ?? "현재 코스의 Anchor 좌표 또는 snapshot이 변경되었습니다. Anchor를 다시 반영해주세요.",
    };
  }

  const template = getTemplateById(params.templateId);
  const context: PoiFitContext = { template, travelMonth: params.travelMonth, preferredThemes: params.preferredThemes };
  const preferredThemeCategories = classifyThemes(params.preferredThemes);
  const rankingThemeCategories = [
    ...new Set([...preferredThemeCategories, ...templateCoreThemeCategories(params.templateId)]),
  ];
  const existingIds = new Set(params.existingPoiIds);
  const poisByCategory = await fetchPoisByCategory(params.regionCode);
  const allNonLodging = dedupeBySameSite(
    Object.entries(poisByCategory)
      .filter(([category]) => category !== "LODGING")
      .flatMap(([, pool]) => pool ?? []),
    (items) =>
      [...items].sort((a, b) => {
        const rank = (category: PoiCategoryCode) =>
          category === "ATTRACTION" ? 0 : category === "EXPERIENCE" ? 1 : category === "FOOD" ? 2 : 3;
        return rank(a.category) - rank(b.category) || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
      })[0],
  );
  const dedupedById = new Set(allNonLodging.map((poi) => poi.id));
  const usedAcrossRoles = new Set<string>();

  for (const role of ROLE_ORDER) {
    if (role === "STAY" && params.duration === "DAY_TRIP") continue;
    const categorySet = new Set(categoriesForRole(role));
    let pool = Object.entries(poisByCategory)
      .filter(([category]) => categorySet.has(category as PoiCategoryCode))
      .flatMap(([, candidates]) => candidates ?? [])
      .filter((poi) => !existingIds.has(poi.id) && !usedAcrossRoles.has(poi.id) && hasCoords(poi));
    if (role !== "STAY") {
      pool = pool.filter((poi) => dedupedById.has(poi.id));
      if (role === "MEAL") pool = pool.filter((poi) => poi.mealEligible !== false);
      if (role === "POST_EVENT") pool = dedupeBySameCoordinates(pool, (items) =>
        [...items].sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id))[0],
      );
    }

    const evaluated = pool
      .map((poi) => {
        if (!hasCoords(poi)) return null;
        const fit = computePoiFit(
          {
            id: poi.id,
            name: poi.name,
            category: poi.category,
            sourceType: poi.sourceType ?? "FIXTURE",
            operatingHours: poi.operatingHours ?? null,
            closedDays: poi.closedDays ?? null,
            lclsSystm1: poi.lclsSystm1,
            lclsSystm2: poi.lclsSystm2,
          },
          context,
        );
        const recommendation =
          role === "STAY" ? null : recommendationFor(poi, rankingThemeCategories);
        if (recommendation && !isVisibleRecommendationCandidate(poi, rankingThemeCategories)) return null;
        if (recommendation && isExcludedFromRecommendation(fit)) return null;
        const distanceKm = haversineDistanceKm(anchor, poi);
        return { poi, fit, recommendation, distanceKm };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => {
        const roleFitDiff = roleRank(role, a.poi.category) - roleRank(role, b.poi.category);
        if (roleFitDiff !== 0) return roleFitDiff;
        const themeDiff = themeRelevanceTier(a.poi, rankingThemeCategories) - themeRelevanceTier(b.poi, rankingThemeCategories);
        if (themeDiff !== 0) return themeDiff;
        const distanceDiff = a.distanceKm - b.distanceKm;
        if (Math.abs(distanceDiff) > 0.0001) return distanceDiff;
        const categoryTierDiff =
          classifyPoiCategoryTier(template, a.poi.category) === classifyPoiCategoryTier(template, b.poi.category)
            ? 0
            : classifyPoiCategoryTier(template, a.poi.category) === "CORE"
              ? -1
              : classifyPoiCategoryTier(template, b.poi.category) === "CORE"
                ? 1
                : classifyPoiCategoryTier(template, a.poi.category) === "SUPPLEMENT"
                  ? -1
                  : 1;
        return categoryTierDiff || a.poi.name.localeCompare(b.poi.name, "ko") || a.poi.id.localeCompare(b.poi.id);
      });

    for (const item of evaluated.slice(0, MAX_PER_ROLE)) {
      usedAcrossRoles.add(item.poi.id);
      const distanceLabel = formatDistance(item.distanceKm);
      groups[role].push({
        id: item.poi.id,
        name: item.poi.name,
        category: item.poi.category,
        lat: item.poi.lat,
        lng: item.poi.lng,
        ...(item.poi.operatingHours !== undefined ? { operatingHours: item.poi.operatingHours } : {}),
        ...(item.poi.closedDays !== undefined ? { closedDays: item.poi.closedDays } : {}),
        ...(item.poi.mealEligible !== undefined ? { mealEligible: item.poi.mealEligible } : {}),
        ...(item.poi.foodSubcategory !== undefined ? { foodSubcategory: item.poi.foodSubcategory } : {}),
        ...(item.poi.lclsSystm1 !== undefined ? { lclsSystm1: item.poi.lclsSystm1 } : {}),
        ...(item.poi.lclsSystm2 !== undefined ? { lclsSystm2: item.poi.lclsSystm2 } : {}),
        role,
        roleLabel: roleLabel(role),
        suggestedPosition: role === "PRE_EVENT" ? "BEFORE_ANCHOR" : role === "STAY" ? "DAY_END" : "AFTER_ANCHOR",
        dayIndex: anchor.plannedDayIndex,
        distanceKm: item.distanceKm,
        distanceLabel,
        distanceMethod: "HAVERSINE",
        reason: reasonFor(role, item.poi, distanceLabel, item.fit),
        recommendationStatus: item.recommendation?.status ?? null,
        recommendationReason: item.recommendation?.reason,
        representation: item.recommendation?.representation ?? "LODGING",
        fit: item.fit,
      });
    }
  }

  const total = ROLE_ORDER.reduce((sum, role) => sum + groups[role].length, 0);
  if (total === 0) {
    return {
      status: "EMPTY",
      groups,
      total: 0,
      message: "현재 지역 데이터와 Anchor 위치를 기준으로 연결 가능한 후보가 없습니다. 기존 추천 후보 풀은 그대로 사용할 수 있습니다.",
    };
  }
  return { status: "AVAILABLE", groups, total: Math.min(total, MAX_TOTAL) };
}
