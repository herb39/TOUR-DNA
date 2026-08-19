/**
 * 반려동물 공식 목록과 현재 사용자 노출 대상의 coverage ceiling 감사.
 *
 * 이 스크립트는 6개 대표 프로젝트의 현재 후보 풀·실행안·Anchor 연계 후보를
 * 공식 petTour 목록과 대조하기만 하며, DB 쓰기나 상세 API 호출은 하지 않는다.
 * 상세 수집은 이 감사 결과에서 실제 LISTED_NOT_ENRICHED 대상이 확인될 때만
 * 별도 작업으로 결정한다.
 */
import { prisma } from "../src/lib/db";
import { isFestivalAnchorItem, type CourseDay } from "../src/lib/domain/planBuilder";
import { resolvePetTourRegionCodes } from "../src/lib/domain/petTourRegion";
import { fetchPetTourListPage, type PetTourListItem } from "../src/lib/public-data/adapters/petTour";
import { withRequestCounter } from "../src/lib/public-data/requestCounter";
import { preferredThemeLabels } from "../src/lib/validation/project-preferences";
import { buildRecommendedPoiCandidates, type CandidatePoi } from "../src/lib/services/candidatePoolService";
import { buildAnchorCandidateSuggestions, type AnchorCandidate } from "../src/lib/services/anchorCandidateService";
import { enrichPetTourEvidence } from "../src/lib/services/petTourEnrichment";
import type { FestivalAnchorCourseSource } from "../src/lib/domain/festivalAnchorCourse";
import type { DurationCode } from "../src/lib/domain/strategy";

const REPRESENTATIVE_PROJECT_IDS = [
  "cmsyyjt82000050ilm31nygzn", // 경주
  "cmsnyrj7v00004gilcu1nxkpo", // 강릉
  "cmsyq2jbt0000z0ilxsh2qfcs", // 제천
  "cmsyiqaas001e3kil85zh88i4", // 청주 흥덕구
  "cmsyiqf9n002h3kilbkudr1dc", // 대전 유성구
  "cmsypv8ht0001y4ilj699ehra", // 세종
] as const;

const CORE_CATEGORIES = ["ATTRACTION", "FOOD", "LODGING", "EXPERIENCE"] as const;
const ALL_CATEGORIES = [...CORE_CATEGORIES, "SHOPPING"] as const;
type CoverageState = "EVIDENCE_AVAILABLE" | "LISTED_NOT_ENRICHED" | "NOT_IN_OFFICIAL_LIST";
const SHOULD_ENRICH_LISTED = process.argv.includes("--enrich-listed");

type Row = {
  id: string;
  name: string;
  category: string;
  externalId: string | null;
  projectId: string;
  regionCode: string;
  collection: "CANDIDATE" | "COURSE" | "ANCHOR_CANDIDATE";
  anchorRole?: string;
};

type OfficialRegion = {
  regionCode: string;
  regionName: string;
  lDongRegnCd: string | null;
  lDongSignguCd: string | null;
  officialItems: PetTourListItem[];
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function asCourseDays(value: unknown): CourseDay[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const days = (value as { days?: unknown }).days;
  return Array.isArray(days) ? (days as CourseDay[]) : [];
}

function courseRows(project: {
  id: string;
  region: { code: string };
  selectedPlan: { course: unknown } | null;
}): Row[] {
  const days = asCourseDays(project.selectedPlan?.course);
  const rows: Row[] = [];
  for (const day of days) {
    for (const item of day.items ?? []) {
      if (isFestivalAnchorItem(item)) continue;
      rows.push({
        id: item.poiId,
        name: item.poiName,
        category: item.category,
        externalId: null,
        projectId: project.id,
        regionCode: project.region.code,
        collection: "COURSE",
      });
    }
    const lodging = day.lodging;
    if (lodging) {
      rows.push({
        id: lodging.poiId,
        name: lodging.poiName,
        category: lodging.category,
        externalId: null,
        projectId: project.id,
        regionCode: project.region.code,
        collection: "COURSE",
      });
    }
  }
  return dedupeRows(rows);
}

function dedupeRows(rows: Row[]): Row[] {
  const byId = new Map<string, Row>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function anchorCourseSource(anchor: {
  id: string;
  updatedAt: Date;
  source: string;
  sourceId: string;
  contentTypeId: string;
  name: string;
  eventStartDate: string;
  eventEndDate: string;
  plannedDate: string;
  plannedDayIndex: number;
  timeStatus: "UNCONFIRMED" | "USER_CONFIRMED";
  timeSlot: "MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM" | null;
  timeStart: string | null;
  timeEnd: string | null;
  regionCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}): FestivalAnchorCourseSource {
  return {
    ...anchor,
    updatedAt: anchor.updatedAt.toISOString(),
  };
}

function rowState(row: Row, officialByRegion: Map<string, Set<string>>, evidenceByPoiId: Map<string, { status: string; availability: string }>): CoverageState {
  const official = row.externalId !== null && (officialByRegion.get(row.regionCode)?.has(row.externalId) ?? false);
  if (!official) return "NOT_IN_OFFICIAL_LIST";
  return evidenceByPoiId.get(row.id)?.status === "SUCCESS" ? "EVIDENCE_AVAILABLE" : "LISTED_NOT_ENRICHED";
}

function stateCounts(rows: Row[], officialByRegion: Map<string, Set<string>>, evidenceByPoiId: Map<string, { status: string; availability: string }>) {
  const counts: Record<CoverageState, number> = {
    EVIDENCE_AVAILABLE: 0,
    LISTED_NOT_ENRICHED: 0,
    NOT_IN_OFFICIAL_LIST: 0,
  };
  const availability: Record<string, number> = {};
  for (const row of rows) {
    const state = rowState(row, officialByRegion, evidenceByPoiId);
    counts[state]++;
    if (state === "EVIDENCE_AVAILABLE") {
      const value = evidenceByPoiId.get(row.id)?.availability ?? "UNKNOWN";
      availability[value] = (availability[value] ?? 0) + 1;
    }
  }
  const denominator = rows.length;
  return {
    total: denominator,
    ...counts,
    currentCoverage: denominator === 0 ? null : counts.EVIDENCE_AVAILABLE / denominator,
    ceilingAfterListedEnrichment: denominator === 0 ? null : (counts.EVIDENCE_AVAILABLE + counts.LISTED_NOT_ENRICHED) / denominator,
    availability,
  };
}

function categoryCeilings(rows: Row[], officialByRegion: Map<string, Set<string>>, evidenceByPoiId: Map<string, { status: string; availability: string }>) {
  return Object.fromEntries(
    ALL_CATEGORIES.map((category) => {
      const categoryRows = rows.filter((row) => row.category === category);
      return [category, stateCounts(categoryRows, officialByRegion, evidenceByPoiId)];
    }),
  );
}

function categoriesForRows(rows: Row[]) {
  return Object.fromEntries(
    unique(rows.map((row) => row.category)).sort().map((category) => [category, rows.filter((row) => row.category === category).length]),
  );
}

async function fetchOfficialRegion(region: {
  code: string;
  name: string;
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
  tourApiLdongRegnCd: string | null;
  tourApiLdongSignguCd: string | null;
}): Promise<OfficialRegion> {
  const codes = resolvePetTourRegionCodes(region);
  if (!codes.lDongRegnCd || !codes.lDongSignguCd) {
    throw new Error(`${region.code}에 공식 API용 lDongRegnCd/lDongSignguCd가 없습니다.`);
  }
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) throw new Error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다.");
  const page = await fetchPetTourListPage({
    serviceKey,
    endpoint: "areaBasedList2",
    pageNo: 1,
    pageSize: 1000,
    lDongRegnCd: codes.lDongRegnCd,
    lDongSignguCd: codes.lDongSignguCd,
  });
  if (page.status === "ERROR") throw new Error(`${region.code} 공식 목록 오류: ${page.resultCode} ${page.resultMsg}`);
  return {
    regionCode: region.code,
    regionName: region.name,
    ...codes,
    officialItems: page.items,
  };
}

async function main(): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { id: { in: [...REPRESENTATIVE_PROJECT_IDS] } },
    include: {
      region: true,
      input: true,
      selectedPlan: true,
      anchor: true,
      analysisResult: { include: { strategyResults: true } },
    },
  });
  if (projects.length !== REPRESENTATIVE_PROJECT_IDS.length) {
    const found = new Set(projects.map((project) => project.id));
    throw new Error(`대표 프로젝트 ${REPRESENTATIVE_PROJECT_IDS.filter((id) => !found.has(id)).join(", ")}를 찾지 못했습니다.`);
  }

  const regions = unique(projects.map((project) => project.region)).sort((a, b) => a.code.localeCompare(b.code));
  const { result: officialRegions, requestCounts } = await withRequestCounter(async () => {
    const result: OfficialRegion[] = [];
    for (const region of regions) result.push(await fetchOfficialRegion(region));
    return result;
  });
  const officialByRegion = new Map(officialRegions.map((region) => [region.regionCode, new Set(region.officialItems.map((item) => item.contentid))]));

  const projectRows: Array<{
    projectId: string;
    regionCode: string;
    regionName: string;
    candidates: Row[];
    course: Row[];
    anchorCandidates: Row[];
    anchorStatus: string;
    anchorCandidateGroups: Record<string, number>;
  }> = [];

  for (const project of projects) {
    const course = courseRows(project);
    const strategy = project.analysisResult?.strategyResults.find((item) => item.id === project.selectedStrategyResultId);
    const preferredThemes = preferredThemeLabels(project.input?.preferredThemes);
    const candidates: CandidatePoi[] = strategy && project.input
      ? await buildRecommendedPoiCandidates({
          templateId: strategy.templateId,
          regionCode: project.region.code,
          travelMonth: project.travelMonth,
          preferredThemes,
          existingPoiIds: course.map((row) => row.id),
        })
      : [];
    const candidateRows = candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      externalId: null,
      projectId: project.id,
      regionCode: project.region.code,
      collection: "CANDIDATE" as const,
    }));

    let anchorStatus = "NOT_READY";
    let anchorCandidates: AnchorCandidate[] = [];
    if (project.anchor && strategy && project.input) {
      const anchorResult = await buildAnchorCandidateSuggestions({
        anchor: anchorCourseSource(project.anchor),
        days: asCourseDays(project.selectedPlan?.course),
        templateId: strategy.templateId,
        regionCode: project.region.code,
        travelMonth: project.travelMonth,
        preferredThemes,
        duration: project.input.duration as DurationCode,
        existingPoiIds: course.map((row) => row.id),
      });
      anchorStatus = anchorResult.status;
      if (anchorResult.status === "AVAILABLE") anchorCandidates = Object.values(anchorResult.groups).flat();
    }
    projectRows.push({
      projectId: project.id,
      regionCode: project.region.code,
      regionName: project.region.name,
      candidates: candidateRows,
      course,
      anchorCandidates: anchorCandidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        externalId: null,
        projectId: project.id,
        regionCode: project.region.code,
        collection: "ANCHOR_CANDIDATE" as const,
        anchorRole: candidate.role,
      })),
      anchorStatus,
      anchorCandidateGroups: anchorCandidates.reduce<Record<string, number>>((counts, candidate) => {
        counts[candidate.role] = (counts[candidate.role] ?? 0) + 1;
        return counts;
      }, {}),
    });
  }

  const allRows = dedupeRows(projectRows.flatMap((row) => [...row.candidates, ...row.course, ...row.anchorCandidates]));
  const poiIds = unique(allRows.map((row) => row.id));
  const pois = await prisma.poi.findMany({ where: { id: { in: poiIds } }, select: { id: true, externalId: true } });
  const externalByPoiId = new Map(pois.map((poi) => [poi.id, poi.externalId]));
  for (const row of allRows) row.externalId = externalByPoiId.get(row.id) ?? null;
  for (const row of projectRows) {
    for (const item of [...row.candidates, ...row.course, ...row.anchorCandidates]) item.externalId = externalByPoiId.get(item.id) ?? null;
  }
  let evidenceRows = await prisma.poiConditionEvidence.findMany({
    where: { conditionType: "PET", poiId: { in: poiIds } },
    select: { poiId: true, status: true, availability: true },
  });
  let evidenceByPoiId = new Map(evidenceRows.map((row) => [row.poiId, { status: row.status, availability: row.availability }]));

  const candidateRows = projectRows.flatMap((row) => row.candidates);
  const courseRowsAll = projectRows.flatMap((row) => row.course);
  const anchorRows = projectRows.flatMap((row) => row.anchorCandidates);
  const targetRows = dedupeRows(
    projectRows.flatMap((project) => [
      ...project.candidates,
      ...project.course,
    ]),
  ).filter((row) => rowState(row, officialByRegion, evidenceByPoiId) === "LISTED_NOT_ENRICHED");
  const targetOrder = (row: Row) => {
    const categoryRank = CORE_CATEGORIES.indexOf(row.category as (typeof CORE_CATEGORIES)[number]);
    return `${row.collection === "CANDIDATE" ? "0" : "1"}-${categoryRank < 0 ? "9" : String(categoryRank)}-${row.regionCode}-${row.id}`;
  };
  targetRows.sort((a, b) => targetOrder(a).localeCompare(targetOrder(b)));

  const beforeCollections = {
    candidates: stateCounts(candidateRows, officialByRegion, evidenceByPoiId),
    course: stateCounts(courseRowsAll, officialByRegion, evidenceByPoiId),
    anchorCandidates: stateCounts(anchorRows, officialByRegion, evidenceByPoiId),
    candidateAndCourse: stateCounts([...candidateRows, ...courseRowsAll], officialByRegion, evidenceByPoiId),
  };
  const beforeCategories = {
    candidates: categoryCeilings(candidateRows, officialByRegion, evidenceByPoiId),
    course: categoryCeilings(courseRowsAll, officialByRegion, evidenceByPoiId),
    candidateAndCourse: categoryCeilings([...candidateRows, ...courseRowsAll], officialByRegion, evidenceByPoiId),
  };

  const beforeCoreCategories = {
    definition: CORE_CATEGORIES,
    candidates: stateCounts(candidateRows.filter((row) => CORE_CATEGORIES.includes(row.category as (typeof CORE_CATEGORIES)[number])), officialByRegion, evidenceByPoiId),
    course: stateCounts(courseRowsAll.filter((row) => CORE_CATEGORIES.includes(row.category as (typeof CORE_CATEGORIES)[number])), officialByRegion, evidenceByPoiId),
    candidateAndCourse: stateCounts([...candidateRows, ...courseRowsAll].filter((row) => CORE_CATEGORIES.includes(row.category as (typeof CORE_CATEGORIES)[number])), officialByRegion, evidenceByPoiId),
  };

  const enrichmentResults: Array<{ regionCode: string; result: unknown; requestCounts: unknown }> = [];
  if (SHOULD_ENRICH_LISTED && targetRows.length > 0) {
    const targetsByRegion = new Map<string, Row[]>();
    for (const row of targetRows) {
      const list = targetsByRegion.get(row.regionCode) ?? [];
      list.push(row);
      targetsByRegion.set(row.regionCode, list);
    }
    for (const [regionCode, rows] of targetsByRegion) {
      const priorityContentIds = rows
        .map((row) => row.externalId)
        .filter((contentId): contentId is string => contentId !== null);
      const { result, requestCounts: enrichmentRequestCounts } = await withRequestCounter(() =>
        enrichPetTourEvidence({
          regionCode,
          allRegions: false,
          mode: "area",
          maxItems: priorityContentIds.length,
          maxListPages: 20,
          delayMs: 100,
          dryRun: false,
          priorityContentIds,
        }),
      );
      enrichmentResults.push({ regionCode, result, requestCounts: enrichmentRequestCounts });
    }
    evidenceRows = await prisma.poiConditionEvidence.findMany({
      where: { conditionType: "PET", poiId: { in: poiIds } },
      select: { poiId: true, status: true, availability: true },
    });
    evidenceByPoiId = new Map(evidenceRows.map((row) => [row.poiId, { status: row.status, availability: row.availability }]));
  }

  const afterCollections = {
    candidates: stateCounts(candidateRows, officialByRegion, evidenceByPoiId),
    course: stateCounts(courseRowsAll, officialByRegion, evidenceByPoiId),
    anchorCandidates: stateCounts(anchorRows, officialByRegion, evidenceByPoiId),
    candidateAndCourse: stateCounts([...candidateRows, ...courseRowsAll], officialByRegion, evidenceByPoiId),
  };
  const afterCategories = {
    candidates: categoryCeilings(candidateRows, officialByRegion, evidenceByPoiId),
    course: categoryCeilings(courseRowsAll, officialByRegion, evidenceByPoiId),
    candidateAndCourse: categoryCeilings([...candidateRows, ...courseRowsAll], officialByRegion, evidenceByPoiId),
  };
  const afterCoreCategories = {
    definition: CORE_CATEGORIES,
    candidates: stateCounts(candidateRows.filter((row) => CORE_CATEGORIES.includes(row.category as (typeof CORE_CATEGORIES)[number])), officialByRegion, evidenceByPoiId),
    course: stateCounts(courseRowsAll.filter((row) => CORE_CATEGORIES.includes(row.category as (typeof CORE_CATEGORIES)[number])), officialByRegion, evidenceByPoiId),
    candidateAndCourse: stateCounts([...candidateRows, ...courseRowsAll].filter((row) => CORE_CATEGORIES.includes(row.category as (typeof CORE_CATEGORIES)[number])), officialByRegion, evidenceByPoiId),
  };

  console.log(JSON.stringify({
    audit: {
      scope: "6개 대표 프로젝트의 현재 추천 후보·코스·Anchor 연계 후보",
      enrichFlag: SHOULD_ENRICH_LISTED,
      detailApiCalls: enrichmentResults.reduce((sum, item) => {
        const counts = item.requestCounts as { byDataSource?: Record<string, number> };
        return sum + (counts.byDataSource?.TOUR_PET_DETAIL ?? 0);
      }, 0),
      dbWrites: enrichmentResults.reduce((sum, item) => {
        const result = item.result as { savedSuccess?: number; savedEmpty?: number; savedError?: number };
        return sum + (result.savedSuccess ?? 0) + (result.savedEmpty ?? 0) + (result.savedError ?? 0);
      }, 0),
      officialListApiCalls: requestCounts.total + enrichmentResults.reduce((sum, item) => {
        const counts = item.requestCounts as { byDataSource?: Record<string, number> };
        return sum + (counts.byDataSource?.TOUR_PET_LIST ?? 0);
      }, 0),
      totalPublicApiCalls: requestCounts.total + enrichmentResults.reduce((sum, item) => {
        const counts = item.requestCounts as { total?: number };
        return sum + (counts.total ?? 0);
      }, 0),
      officialListRequestCounts: requestCounts,
    },
    officialRegions: officialRegions.map((region) => ({
      regionCode: region.regionCode,
      regionName: region.regionName,
      lDongRegnCd: region.lDongRegnCd,
      lDongSignguCd: region.lDongSignguCd,
      officialListCount: region.officialItems.length,
      officialUniqueContentIdCount: unique(region.officialItems.map((item) => item.contentid)).length,
    })),
    projects: projectRows.map((project) => ({
      projectId: project.projectId,
      regionCode: project.regionCode,
      regionName: project.regionName,
      candidateCount: project.candidates.length,
      courseCount: project.course.length,
      anchorStatus: project.anchorStatus,
      anchorCandidateCount: project.anchorCandidates.length,
      anchorCandidateGroups: project.anchorCandidateGroups,
      candidateStates: stateCounts(project.candidates, officialByRegion, evidenceByPoiId),
      courseStates: stateCounts(project.course, officialByRegion, evidenceByPoiId),
      anchorCandidateStates: stateCounts(project.anchorCandidates, officialByRegion, evidenceByPoiId),
    })),
    before: {
      collections: beforeCollections,
      categories: beforeCategories,
      coreCategories: beforeCoreCategories,
    },
    enrichment: enrichmentResults,
    after: {
      collections: afterCollections,
      categories: afterCategories,
      coreCategories: afterCoreCategories,
    },
    categoryDistribution: {
      candidates: categoriesForRows(candidateRows),
      course: categoriesForRows(courseRowsAll),
      anchorCandidates: categoriesForRows(anchorRows),
    },
    enrichmentDecision: {
      runTargetedEnrichment: targetRows.length > 0,
      targetCount: targetRows.length,
      targets: targetRows.map((row) => ({
        collection: row.collection,
        projectId: row.projectId,
        regionCode: row.regionCode,
        poiId: row.id,
        name: row.name,
        category: row.category,
        externalId: row.externalId,
      })),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
