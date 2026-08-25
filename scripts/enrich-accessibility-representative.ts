import { prisma } from "../src/lib/db";
import { isFestivalAnchorItem, type CourseDay } from "../src/lib/domain/planBuilder";
import {
  countTargetedAccessibilityCategories,
  countTargetedAccessibilityStates,
  orderTargetedAccessibilityRows,
  type TargetedAccessibilityRow,
  type TargetedEvidenceSnapshot,
  type TargetedOfficialByRegion,
} from "../src/lib/domain/accessibilityTargeting";
import { MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN, MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN } from "../src/lib/domain/accessibilityLimits";
import { resolvePetTourRegionCodes } from "../src/lib/domain/petTourRegion";
import { fetchAccessibilityOfficialList, enrichAccessibilityEvidence } from "../src/lib/services/accessibilityEnrichment";
import { buildRecommendedPoiCandidates, type CandidatePoi } from "../src/lib/services/candidatePoolService";
import { buildAnchorCandidateSuggestions, type AnchorCandidate } from "../src/lib/services/anchorCandidateService";
import { preferredThemeLabels } from "../src/lib/validation/project-preferences";
import { withRequestCounter } from "../src/lib/public-data/requestCounter";
import type { DurationCode } from "../src/lib/domain/strategy";

const REPRESENTATIVE_REGION_CODES = ["SGG_GYEONGJU", "SGG_GANGNEUNG", "SGG_DAEJEON"] as const;
const DEFAULT_MAX_ITEMS = 12;

type AnchorRecord = {
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
};

type ProjectRecord = {
  id: string;
  name: string;
  status: string;
  updatedAt: Date;
  travelMonth: number;
  selectedStrategyResultId: string | null;
  region: {
    id: string;
    code: string;
    name: string;
    level: string;
    apiAreaCode: string | null;
    apiSigunguCode: string | null;
    tourApiLdongRegnCd: string | null;
    tourApiLdongSignguCd: string | null;
  };
  input: { duration: string; preferredThemes: unknown } | null;
  selectedPlan: { course: unknown } | null;
  analysisResult: { strategyResults: Array<{ id: string; rank: number; templateId: string }> } | null;
  anchor: AnchorRecord | null;
};

type EvidenceRow = TargetedEvidenceSnapshot;

function parseArgs(argv: string[]): { execute: boolean; maxItems: number } {
  let execute = false;
  let maxItems = DEFAULT_MAX_ITEMS;
  for (const token of argv) {
    if (token === "--execute") {
      if (execute) throw new Error("--execute를 두 번 지정할 수 없습니다.");
      execute = true;
      continue;
    }
    if (token.startsWith("--max-items=")) {
      const value = token.slice("--max-items=".length);
      if (!/^\d+$/.test(value)) throw new Error("--max-items는 정수여야 합니다.");
      maxItems = Number(value);
      if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN) {
        throw new Error(`--max-items는 1~${MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN} 범위여야 합니다.`);
      }
      continue;
    }
    throw new Error(`알 수 없는 옵션입니다: ${token}`);
  }
  return { execute, maxItems };
}

function asCourseDays(value: unknown): CourseDay[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const days = (value as { days?: unknown }).days;
  return Array.isArray(days) ? days as CourseDay[] : [];
}

function courseRows(project: ProjectRecord): TargetedAccessibilityRow[] {
  const rows: TargetedAccessibilityRow[] = [];
  for (const day of asCourseDays(project.selectedPlan?.course)) {
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
    if (day.lodging) {
      rows.push({
        id: day.lodging.poiId,
        name: day.lodging.poiName,
        category: day.lodging.category,
        externalId: null,
        projectId: project.id,
        regionCode: project.region.code,
        collection: "COURSE",
      });
    }
  }
  return dedupeRows(rows);
}

function dedupeRows(rows: TargetedAccessibilityRow[]): TargetedAccessibilityRow[] {
  const byId = new Map<string, TargetedAccessibilityRow>();
  for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()];
}

function anchorCourseSource(anchor: AnchorRecord) {
  return { ...anchor, updatedAt: anchor.updatedAt.toISOString() };
}

function chooseStrategy(project: ProjectRecord) {
  const strategies = project.analysisResult?.strategyResults ?? [];
  return strategies.find((strategy) => strategy.id === project.selectedStrategyResultId)
    ?? [...strategies].sort((left, right) => left.rank - right.rank)[0]
    ?? null;
}

function projectCompleteness(project: ProjectRecord): number {
  return (project.analysisResult ? 4 : 0)
    + (project.selectedPlan ? 4 : 0)
    + (project.anchor ? 2 : 0)
    + (project.status === "PLANNED" ? 1 : 0);
}

function selectRepresentativeProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return REPRESENTATIVE_REGION_CODES.map((regionCode) => {
    const selected = projects
      .filter((project) => project.region.code === regionCode)
      .sort((left, right) => projectCompleteness(right) - projectCompleteness(left) || right.updatedAt.getTime() - left.updatedAt.getTime())[0];
    if (!selected) throw new Error(`대표 프로젝트를 찾을 수 없습니다: ${regionCode}`);
    return selected;
  });
}

async function loadProjects(): Promise<ProjectRecord[]> {
  const projects = await prisma.project.findMany({
    where: { region: { code: { in: [...REPRESENTATIVE_REGION_CODES] } } },
    orderBy: { updatedAt: "desc" },
    include: {
      region: true,
      input: true,
      selectedPlan: true,
      anchor: true,
      analysisResult: { include: { strategyResults: true } },
    },
  });
  return projects as unknown as ProjectRecord[];
}

async function buildProjectRows(projects: ProjectRecord[]): Promise<TargetedAccessibilityRow[]> {
  const rows: TargetedAccessibilityRow[] = [];
  for (const project of projects) {
    const course = courseRows(project);
    rows.push(...course);
    const strategy = chooseStrategy(project);
    if (!strategy || !project.input) continue;
    const preferredThemes = preferredThemeLabels(project.input.preferredThemes);
    const candidates: CandidatePoi[] = await buildRecommendedPoiCandidates({
      templateId: strategy.templateId,
      regionCode: project.region.code,
      travelMonth: project.travelMonth,
      preferredThemes,
      existingPoiIds: course.map((row) => row.id),
    });
    rows.push(...candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      externalId: null,
      projectId: project.id,
      regionCode: project.region.code,
      collection: "CANDIDATE" as const,
    })));

    if (!project.anchor) continue;
    const anchorCandidates = await buildAnchorCandidateSuggestions({
      anchor: anchorCourseSource(project.anchor),
      days: asCourseDays(project.selectedPlan?.course),
      templateId: strategy.templateId,
      regionCode: project.region.code,
      travelMonth: project.travelMonth,
      preferredThemes,
      duration: project.input.duration as DurationCode,
      existingPoiIds: course.map((row) => row.id),
    });
    if (anchorCandidates.status !== "AVAILABLE") continue;
    rows.push(...Object.values(anchorCandidates.groups).flat().map((candidate: AnchorCandidate) => ({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      externalId: null,
      projectId: project.id,
      regionCode: project.region.code,
      collection: "ANCHOR_CANDIDATE" as const,
      anchorRole: candidate.role,
    })));
  }
  const poiIds = [...new Set(rows.map((row) => row.id))];
  const pois = await prisma.poi.findMany({ where: { id: { in: poiIds } }, select: { id: true, externalId: true } });
  const externalByPoiId = new Map(pois.map((poi) => [poi.id, poi.externalId]));
  return rows.map((row) => ({ ...row, externalId: externalByPoiId.get(row.id) ?? null }));
}

async function loadOfficialByRegion(projects: ProjectRecord[]): Promise<{ officialByRegion: TargetedOfficialByRegion; requestCounts: Record<string, number>; total: number }> {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) throw new Error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다.");
  const { result, requestCounts } = await withRequestCounter(async () => {
    const officialByRegion: TargetedOfficialByRegion = new Map();
    for (const project of projects) {
      const codes = resolvePetTourRegionCodes(project.region);
      const list = await fetchAccessibilityOfficialList({
        serviceKey,
        region: { ...project.region, ...codes },
        maxListPages: MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN,
      });
      if (!list.ok) throw new Error(`${project.region.code} 공식 무장애 목록 오류: ${list.message ?? "unknown"}`);
      officialByRegion.set(project.region.code, new Map(
        list.items
          .filter((item) => (item.showflag ?? "1") !== "0")
          .map((item) => [item.contentid, { sourceModifiedTime: item.modifiedtime ?? null, sourceShowFlag: item.showflag ?? "1" }]),
      ));
    }
    return officialByRegion;
  });
  return { officialByRegion: result, requestCounts: requestCounts.byDataSource, total: requestCounts.total };
}

async function loadEvidence(poiIds: string[]): Promise<Map<string, EvidenceRow>> {
  const rows = await prisma.poiConditionEvidence.findMany({
    where: { conditionType: "ACCESSIBILITY", poiId: { in: poiIds } },
    select: { poiId: true, contentId: true, status: true, sourceModifiedTime: true, sourceShowFlag: true },
  });
  return new Map(rows.map((row) => [row.poiId, row]));
}

function groupPriorityContentIds(rows: TargetedAccessibilityRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of orderTargetedAccessibilityRows(rows)) {
    if (!row.externalId) continue;
    const list = grouped.get(row.regionCode) ?? [];
    if (!list.includes(row.externalId)) list.push(row.externalId);
    grouped.set(row.regionCode, list);
  }
  return grouped;
}

function plannedRows(rows: TargetedAccessibilityRow[], officialByRegion: TargetedOfficialByRegion, evidenceByPoiId: Map<string, EvidenceRow>, maxItems: number): TargetedAccessibilityRow[] {
  const ordered = orderTargetedAccessibilityRows(rows);
  return ordered.filter((row) => {
    if (!row.externalId) return false;
    const official = officialByRegion.get(row.regionCode)?.get(row.externalId);
    if (!official) return false;
    const evidence = evidenceByPoiId.get(row.id);
    return !evidence
      || evidence.status === "ERROR"
      || evidence.sourceModifiedTime !== official.sourceModifiedTime
      || evidence.sourceShowFlag !== official.sourceShowFlag;
  }).slice(0, maxItems);
}

async function runEnrichment(params: {
  projects: ProjectRecord[];
  rows: TargetedAccessibilityRow[];
  officialByRegion: TargetedOfficialByRegion;
  evidenceByPoiId: Map<string, EvidenceRow>;
  maxItems: number;
  execute: boolean;
}) {
  const targets = plannedRows(params.rows, params.officialByRegion, params.evidenceByPoiId, params.maxItems);
  const priorityByRegion = groupPriorityContentIds(params.rows);
  const targetCountByRegion = new Map<string, number>();
  for (const target of targets) targetCountByRegion.set(target.regionCode, (targetCountByRegion.get(target.regionCode) ?? 0) + 1);
  const results: Array<{ regionCode: string; result: Awaited<ReturnType<typeof enrichAccessibilityEvidence>>; requestCounts: { byDataSource: Record<string, number>; total: number } }> = [];
  for (const project of params.projects) {
    const priorityContentIds = priorityByRegion.get(project.region.code) ?? [];
    const maxItems = targetCountByRegion.get(project.region.code) ?? 0;
    if (priorityContentIds.length === 0 || maxItems === 0) continue;
    const { result, requestCounts } = await withRequestCounter(() => enrichAccessibilityEvidence({
      regionCode: project.region.code,
      maxItems,
      maxListPages: MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN,
      delayMs: 100,
      dryRun: !params.execute,
      priorityContentIds,
      restrictToPriorityContentIds: true,
    }));
    results.push({ regionCode: project.region.code, result, requestCounts });
  }
  return { targets, results };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const projects = selectRepresentativeProjects(await loadProjects());
  const rows = await buildProjectRows(projects);
  const { officialByRegion, requestCounts: officialListRequestCounts, total: officialListCalls } = await loadOfficialByRegion(projects);
  const evidenceBefore = await loadEvidence([...new Set(rows.map((row) => row.id))]);
  const before = {
    all: countTargetedAccessibilityStates({ rows, officialByRegion, evidenceByPoiId: evidenceBefore }),
    candidates: countTargetedAccessibilityStates({ rows: rows.filter((row) => row.collection === "CANDIDATE"), officialByRegion, evidenceByPoiId: evidenceBefore }),
    course: countTargetedAccessibilityStates({ rows: rows.filter((row) => row.collection === "COURSE"), officialByRegion, evidenceByPoiId: evidenceBefore }),
    anchorCandidates: countTargetedAccessibilityStates({ rows: rows.filter((row) => row.collection === "ANCHOR_CANDIDATE"), officialByRegion, evidenceByPoiId: evidenceBefore }),
    categories: countTargetedAccessibilityCategories({ rows, officialByRegion, evidenceByPoiId: evidenceBefore }),
  };
  const enrichment = await runEnrichment({ projects, rows, officialByRegion, evidenceByPoiId: evidenceBefore, maxItems: args.maxItems, execute: args.execute });
  const evidenceAfter = args.execute ? await loadEvidence([...new Set(rows.map((row) => row.id))]) : evidenceBefore;
  const after = {
    all: countTargetedAccessibilityStates({ rows, officialByRegion, evidenceByPoiId: evidenceAfter }),
    candidates: countTargetedAccessibilityStates({ rows: rows.filter((row) => row.collection === "CANDIDATE"), officialByRegion, evidenceByPoiId: evidenceAfter }),
    course: countTargetedAccessibilityStates({ rows: rows.filter((row) => row.collection === "COURSE"), officialByRegion, evidenceByPoiId: evidenceAfter }),
    anchorCandidates: countTargetedAccessibilityStates({ rows: rows.filter((row) => row.collection === "ANCHOR_CANDIDATE"), officialByRegion, evidenceByPoiId: evidenceAfter }),
    categories: countTargetedAccessibilityCategories({ rows, officialByRegion, evidenceByPoiId: evidenceAfter }),
  };
  const detailContentIds = enrichment.results.flatMap((item) => item.result.detailContentIds);
  const storedRows = detailContentIds.length === 0 ? [] : await prisma.poiConditionEvidence.findMany({
    where: { conditionType: "ACCESSIBILITY", contentId: { in: [...new Set(detailContentIds)] } },
    select: { contentId: true, status: true, availability: true, sourceModifiedTime: true, sourceShowFlag: true, rawPayload: true, dimensionDetails: true },
  });
  const apiRequestCounts = {
    officialListPreflight: officialListRequestCounts,
    enrichment: enrichment.results.map((item) => ({ regionCode: item.regionCode, requestCounts: item.requestCounts })),
    officialListCalls,
    detailCalls: enrichment.results.reduce((sum, item) => sum + (item.requestCounts.byDataSource.TOUR_ACCESSIBILITY_DETAIL ?? 0), 0),
    total: officialListCalls + enrichment.results.reduce((sum, item) => sum + item.requestCounts.total, 0),
  };
  console.log(JSON.stringify({
    mode: args.execute ? "EXECUTE" : "DRY_RUN",
    maxItems: args.maxItems,
    projects: projects.map((project) => ({ projectId: project.id, projectName: project.name, regionCode: project.region.code, regionName: project.region.name, selectedPlan: Boolean(project.selectedPlan), anchor: project.anchor?.name ?? null })),
    exposureCounts: {
      totalRows: rows.length,
      uniquePoiIds: new Set(rows.map((row) => row.id)).size,
      byRegion: Object.fromEntries(projects.map((project) => [project.region.code, {
        total: rows.filter((row) => row.regionCode === project.region.code).length,
        candidates: rows.filter((row) => row.regionCode === project.region.code && row.collection === "CANDIDATE").length,
        course: rows.filter((row) => row.regionCode === project.region.code && row.collection === "COURSE").length,
        anchorCandidates: rows.filter((row) => row.regionCode === project.region.code && row.collection === "ANCHOR_CANDIDATE").length,
      }])),
      categories: Object.fromEntries([...new Set(rows.map((row) => row.category))].sort().map((category) => [category, rows.filter((row) => row.category === category).length])),
    },
    before,
    planned: {
      total: enrichment.targets.length,
      targets: enrichment.targets.map((row) => ({ collection: row.collection, regionCode: row.regionCode, projectId: row.projectId, poiId: row.id, name: row.name, category: row.category, externalId: row.externalId })),
    },
    enrichment: enrichment.results.map((item) => item.result),
    after,
    storedVerification: {
      rows: storedRows.length,
      uniqueContentIds: new Set(storedRows.map((row) => row.contentId)).size,
      status: Object.fromEntries(["SUCCESS", "EMPTY", "ERROR"].map((status) => [status, storedRows.filter((row) => row.status === status).length])),
      rawPayloadPresent: storedRows.filter((row) => row.rawPayload !== null).length,
      dimensionDetailsPresent: storedRows.filter((row) => row.dimensionDetails !== null).length,
      availabilityUnknown: storedRows.filter((row) => row.availability === "UNKNOWN").length,
      sourceModifiedTimePresent: storedRows.filter((row) => row.sourceModifiedTime !== null).length,
      sourceShowFlagPresent: storedRows.filter((row) => row.sourceShowFlag !== null).length,
    },
    apiRequestCounts,
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
