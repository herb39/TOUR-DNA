import {
  computePoiFit,
  isExcludedFromRecommendation,
  type PoiCategoryTier,
  type PoiFitContext,
  type PoiFitResult,
} from "@/lib/domain/poiFit";
import { getTemplateById, type PoiCategoryCode } from "@/lib/domain/strategyTemplates";
import { classifyThemes, templateCoreThemeCategories } from "@/lib/domain/audienceContext";
import { themeRelevanceTier, type PoiLike } from "@/lib/domain/strategy";
import { dedupeBySameCoordinates } from "@/lib/domain/poiDedup";
import { fetchPoisByCategory } from "./fetchPoisByCategory";

/**
 * 실행안 화면의 "추천 후보 풀"(Phase B 첫 단계, 2026-08-16) — 자동 생성된 코스 외에 사용자가 직접
 * 검토·추가할 수 있는 대체 POI 목록. 새 추천 알고리즘을 만들지 않고 이미 검증된 신호만 재사용한다:
 * `themeRelevanceTier`(structural > keyword > 없음, strategy.ts의 selectPois와 동일 함수),
 * `computePoiFit`/`isExcludedFromRecommendation`(BELOW_MINIMUM_FIT 제외, poiFit.ts),
 * `dedupeBySameCoordinates`(SHOPPING 동일 시설 중복 억제, poiDedup.ts). 외부 API 호출·N+1 쿼리 없이
 * `fetchPoisByCategory` 한 번의 조회 결과만 사용한다.
 */
export interface CandidatePoi {
  id: string;
  name: string;
  category: PoiCategoryCode;
  lat: number;
  lng: number;
  fit: PoiFitResult;
}

export interface CandidatePoolParams {
  templateId: string;
  regionCode: string;
  travelMonth: number;
  preferredThemes: string[];
  /** 현재 SelectedPlan.course에 이미 포함된 POI id — 후보 풀에서 제외한다. */
  existingPoiIds: string[];
}

/** 후보 풀 전체 개수 상한 — "수십~수백 개를 한 번에 보여주지 않는다"는 요구에 따라 소수 정예로 제한한다. */
const MAX_CANDIDATES = 12;
/** 카테고리 하나가 후보 풀을 독점하지 않도록 카테고리별 상한을 둔다(다양성 유지). */
const MAX_PER_CATEGORY = 4;

const CATEGORY_TIER_ORDER: Record<PoiCategoryTier, number> = { CORE: 0, SUPPLEMENT: 1, FALLBACK: 2 };

export async function buildRecommendedPoiCandidates(params: CandidatePoolParams): Promise<CandidatePoi[]> {
  const template = getTemplateById(params.templateId);
  const context: PoiFitContext = { template, travelMonth: params.travelMonth, preferredThemes: params.preferredThemes };

  // rankingThemeCategories: 사용자 선호 테마와 전략 자체의 핵심 테마(templateCoreThemeCategories)를
  // 합집합한다 — strategy.ts의 selectPois가 이미 쓰는 것과 정확히 같은 계산이라, preferredThemes가
  // 비어 있어도(청주 운영 사례) 전략 핵심 테마 기반 추천이 그대로 동작한다.
  const preferredThemeCategories = classifyThemes(params.preferredThemes);
  const rankingThemeCategories = [
    ...new Set([...preferredThemeCategories, ...templateCoreThemeCategories(params.templateId)]),
  ];

  const poisByCategory = await fetchPoisByCategory(params.regionCode);
  const existingIds = new Set(params.existingPoiIds);

  const evaluated: Array<{ poi: PoiLike; fit: PoiFitResult; tier: 0 | 1 | 2 }> = [];
  for (const category of Object.keys(poisByCategory) as PoiCategoryCode[]) {
    const pool = poisByCategory[category] ?? [];
    // SHOPPING만 동일 시설(동일 좌표) 중복을 대표 1건으로 좁힌다(4f093ec와 동일 근거) — 다른 카테고리는
    // 동일 좌표라도 서로 다른 콘텐츠인 사례가 많아 건드리지 않는다.
    const deduped = category === "SHOPPING" ? dedupeBySameCoordinates(pool, (group) => group[0]) : pool;
    for (const poi of deduped) {
      if (existingIds.has(poi.id)) continue;
      if (!Number.isFinite(poi.lat) || !Number.isFinite(poi.lng)) continue;
      const fit = computePoiFit(
        {
          id: poi.id,
          name: poi.name,
          category,
          sourceType: "FIXTURE",
          operatingHours: null,
          closedDays: null,
          lclsSystm1: poi.lclsSystm1,
          lclsSystm2: poi.lclsSystm2,
        },
        context,
      );
      if (isExcludedFromRecommendation(fit)) continue;
      evaluated.push({ poi, fit, tier: themeRelevanceTier(poi, rankingThemeCategories) });
    }
  }

  evaluated.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const categoryTierDiff =
      CATEGORY_TIER_ORDER[a.fit.breakdown.categoryFit.tier] - CATEGORY_TIER_ORDER[b.fit.breakdown.categoryFit.tier];
    if (categoryTierDiff !== 0) return categoryTierDiff;
    return a.poi.name.localeCompare(b.poi.name, "ko");
  });

  const perCategoryCount = new Map<string, number>();
  const result: CandidatePoi[] = [];
  for (const item of evaluated) {
    if (result.length >= MAX_CANDIDATES) break;
    const count = perCategoryCount.get(item.poi.category) ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;
    perCategoryCount.set(item.poi.category, count + 1);
    result.push({
      id: item.poi.id,
      name: item.poi.name,
      category: item.poi.category,
      lat: item.poi.lat as number,
      lng: item.poi.lng as number,
      fit: item.fit,
    });
  }
  return result;
}
