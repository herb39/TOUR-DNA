import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  ACCESSIBILITY_API_VERSION,
  ACCESSIBILITY_BASE_URL,
  fetchAccessibilityDetail,
  fetchAccessibilityListPage,
  type AccessibilityListItem,
} from "@/lib/public-data/adapters/accessibility";
import {
  accessibilityDimensionStatusCounts,
  deduplicateAccessibilityTargets,
  normalizeAccessibilityDetail,
  selectAccessibilityTargets,
  type AccessibilityDimensionDetails,
  type AccessibilityDimensionKey,
  type AccessibilityDimensionStatus,
  type AccessibilityLocalPoi,
  type ExistingAccessibilityEvidence,
} from "@/lib/domain/accessibilityEvidence";
import { ACCESSIBILITY_LIST_PAGE_SIZE, MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN, MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN } from "@/lib/domain/accessibilityLimits";
import { ALLOW_REMOTE_DATA_SYNC_ENV, checkDataSyncTarget } from "@/lib/services/dataSyncTargetGuard";
import { resolvePetTourRegionCodes } from "@/lib/domain/petTourRegion";

export interface AccessibilityEnrichmentParams {
  regionCode: string;
  maxItems: number;
  maxListPages: number;
  delayMs: number;
  dryRun?: boolean;
}

export interface AccessibilityEnrichmentResult {
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  regionCode: string;
  regionName: string;
  listEndpoint: string;
  detailEndpoint: string;
  listPagesFetched: number;
  listTotalCount: number;
  officialListItemCount: number;
  officialUniqueContentIdCount: number;
  hiddenOfficialItemCount: number;
  localApiPoiCount: number;
  localMatchCount: number;
  localMismatchCount: number;
  bruteForceDetailCalls: number;
  plannedDetailCalls: number;
  detailCallsAttempted: number;
  detailCallsReduced: number;
  cacheHits: number;
  changedTargetCount: number;
  savedSuccess: number;
  savedEmpty: number;
  savedError: number;
  dryRun: boolean;
  categoryDistribution: Record<string, number>;
  dimensionStatusDistribution: Record<AccessibilityDimensionKey, Record<AccessibilityDimensionStatus, number>>;
  messages: string[];
}

type RegionScope = {
  id: string;
  code: string;
  name: string;
  level: string;
  lDongRegnCd: string | null;
  lDongSignguCd: string | null;
};

const DIMENSION_KEYS: AccessibilityDimensionKey[] = [
  "wheelchair",
  "entranceExit",
  "elevator",
  "restroom",
  "parking",
  "route",
  "visualGuide",
  "strollerFamily",
  "otherSupport",
];

function emptyDimensionDistribution(): Record<AccessibilityDimensionKey, Record<AccessibilityDimensionStatus, number>> {
  return Object.fromEntries(DIMENSION_KEYS.map((key) => [key, { AVAILABLE: 0, UNAVAILABLE: 0, CONDITIONAL: 0, UNKNOWN: 0 }])) as Record<AccessibilityDimensionKey, Record<AccessibilityDimensionStatus, number>>;
}

function addDimensionDistribution(
  distribution: Record<AccessibilityDimensionKey, Record<AccessibilityDimensionStatus, number>>,
  details: AccessibilityDimensionDetails,
): void {
  const counts = accessibilityDimensionStatusCounts([details]);
  for (const key of DIMENSION_KEYS) {
    for (const status of ["AVAILABLE", "UNAVAILABLE", "CONDITIONAL", "UNKNOWN"] as const) {
      distribution[key][status] += counts[key][status];
    }
  }
}

function addCategory(distribution: Record<string, number>, category: string): void {
  distribution[category] = (distribution[category] ?? 0) + 1;
}

function sleep(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

async function fetchAccessibilityList(params: {
  serviceKey: string;
  region: RegionScope;
  maxListPages: number;
}): Promise<{ ok: boolean; items: AccessibilityListItem[]; pagesFetched: number; totalCount: number; message?: string }> {
  if (!params.region.lDongRegnCd || !params.region.lDongSignguCd) {
    return { ok: false, items: [], pagesFetched: 0, totalCount: 0, message: "Region master의 법정동 코드가 없어 목록을 호출하지 않았습니다." };
  }
  const items: AccessibilityListItem[] = [];
  let pagesFetched = 0;
  let totalCount = 0;
  let expectedPages = 1;
  let effectivePageSize = ACCESSIBILITY_LIST_PAGE_SIZE;
  for (let pageNo = 1; pageNo <= params.maxListPages; pageNo++) {
    const page = await fetchAccessibilityListPage({
      serviceKey: params.serviceKey,
      pageNo,
      pageSize: ACCESSIBILITY_LIST_PAGE_SIZE,
      lDongRegnCd: params.region.lDongRegnCd,
      lDongSignguCd: params.region.lDongSignguCd,
    });
    pagesFetched++;
    totalCount = page.totalCount;
    if (page.status === "ERROR") return { ok: false, items, pagesFetched, totalCount, message: `${page.resultCode}: ${page.resultMsg}` };
    if (page.status === "EMPTY") {
      if (totalCount === 0) return { ok: true, items: [], pagesFetched, totalCount };
      return { ok: false, items, pagesFetched, totalCount, message: "totalCount가 있는데 목록이 비어 있어 부분 응답으로 중단했습니다." };
    }
    items.push(...page.items);
    effectivePageSize = page.pageSize > 0 ? page.pageSize : page.items.length || ACCESSIBILITY_LIST_PAGE_SIZE;
    expectedPages = totalCount > 0 ? Math.ceil(totalCount / effectivePageSize) : pageNo;
    if (pageNo >= expectedPages) break;
  }
  if (expectedPages > params.maxListPages) {
    return { ok: false, items, pagesFetched, totalCount, message: `공식 목록이 ${params.maxListPages}페이지 상한을 초과했습니다.` };
  }
  const uniqueCount = deduplicateAccessibilityTargets(items).length;
  if (items.length !== totalCount || uniqueCount !== totalCount) {
    return { ok: false, items, pagesFetched, totalCount, message: `공식 목록 전체성 검증 실패: received=${items.length}, unique=${uniqueCount}, total=${totalCount}` };
  }
  return { ok: true, items: deduplicateAccessibilityTargets(items), pagesFetched, totalCount };
}

async function findLocalPois(contentIds: string[], regionId: string) {
  const rows: Array<{ id: string; externalId: string | null; category: string; regionId: string }> = [];
  for (let index = 0; index < contentIds.length; index += 1000) {
    const pois = await prisma.poi.findMany({
      where: { regionId, sourceType: "API", externalId: { in: contentIds.slice(index, index + 1000) } },
      select: { id: true, externalId: true, category: true, regionId: true },
    });
    rows.push(...pois);
  }
  return rows;
}

async function findExistingEvidence(contentIds: string[]): Promise<ExistingAccessibilityEvidence[]> {
  const rows: ExistingAccessibilityEvidence[] = [];
  for (let index = 0; index < contentIds.length; index += 1000) {
    const evidences = await prisma.poiConditionEvidence.findMany({
      where: { conditionType: "ACCESSIBILITY", contentId: { in: contentIds.slice(index, index + 1000) } },
      select: { contentId: true, status: true, sourceModifiedTime: true, sourceShowFlag: true },
    });
    rows.push(...evidences.map((evidence) => ({
      contentId: evidence.contentId,
      status: evidence.status,
      sourceModifiedTime: evidence.sourceModifiedTime,
      sourceShowFlag: evidence.sourceShowFlag,
    })));
  }
  return rows;
}

async function saveEvidence(params: {
  poiId: string;
  contentId: string;
  sourceModifiedTime: string | null;
  sourceShowFlag: string;
  status: "SUCCESS" | "EMPTY" | "ERROR";
  dimensionDetails: AccessibilityDimensionDetails | null;
  rawPayload: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date();
  const rawPayload = params.rawPayload === null ? Prisma.JsonNull : (params.rawPayload as Prisma.InputJsonValue);
  const dimensionDetails = params.dimensionDetails === null ? Prisma.JsonNull : (params.dimensionDetails as unknown as Prisma.InputJsonValue);
  const data = {
    poiId: params.poiId,
    conditionType: "ACCESSIBILITY" as const,
    contentId: params.contentId,
    sourceCode: "TOUR_ACCESSIBILITY_DETAIL",
    endpoint: `${ACCESSIBILITY_BASE_URL}/detailWithTour2`,
    apiVersion: ACCESSIBILITY_API_VERSION,
    status: params.status,
    availability: "UNKNOWN" as const,
    scope: "UNKNOWN" as const,
    requirements: [] as Prisma.InputJsonValue,
    capacityNote: null,
    riskNote: null,
    facilityNote: null,
    sourceModifiedTime: params.sourceModifiedTime,
    sourceShowFlag: params.sourceShowFlag,
    rawPayload,
    dimensionDetails,
    fetchedAt: now,
    lastErrorCode: params.errorCode ?? null,
    lastErrorMessage: params.errorMessage?.slice(0, 1000) ?? null,
  };
  await prisma.poiConditionEvidence.upsert({
    where: { conditionType_contentId: { conditionType: "ACCESSIBILITY", contentId: params.contentId } },
    create: data,
    update: data,
  });
}

function hasRateLimitCode(resultCode: string): boolean {
  return new Set(["22", "23", "29", "LIMITED_TRAFFIC"]).has(resultCode);
}

function emptyResult(params: AccessibilityEnrichmentParams): AccessibilityEnrichmentResult {
  return {
    status: "FAILED",
    regionCode: params.regionCode,
    regionName: "",
    listEndpoint: `${ACCESSIBILITY_BASE_URL}/areaBasedSyncList2`,
    detailEndpoint: `${ACCESSIBILITY_BASE_URL}/detailWithTour2`,
    listPagesFetched: 0,
    listTotalCount: 0,
    officialListItemCount: 0,
    officialUniqueContentIdCount: 0,
    hiddenOfficialItemCount: 0,
    localApiPoiCount: 0,
    localMatchCount: 0,
    localMismatchCount: 0,
    bruteForceDetailCalls: 0,
    plannedDetailCalls: 0,
    detailCallsAttempted: 0,
    detailCallsReduced: 0,
    cacheHits: 0,
    changedTargetCount: 0,
    savedSuccess: 0,
    savedEmpty: 0,
    savedError: 0,
    dryRun: Boolean(params.dryRun),
    categoryDistribution: {},
    dimensionStatusDistribution: emptyDimensionDistribution(),
    messages: [],
  };
}

export async function enrichAccessibilityEvidence(params: AccessibilityEnrichmentParams): Promise<AccessibilityEnrichmentResult> {
  const empty = emptyResult(params);
  if (params.maxItems < 1 || params.maxItems > MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN) {
    return { ...empty, messages: [`maxItems는 1~${MAX_ACCESSIBILITY_DETAIL_ITEMS_PER_RUN} 범위여야 합니다.`] };
  }
  if (params.maxListPages < 1 || params.maxListPages > MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN) {
    return { ...empty, messages: [`maxListPages는 1~${MAX_ACCESSIBILITY_LIST_PAGES_PER_RUN} 범위여야 합니다.`] };
  }
  if (params.delayMs < 0 || params.delayMs > 5000) return { ...empty, messages: ["delayMs는 0~5000 범위여야 합니다."] };

  const targetCheck = checkDataSyncTarget(process.env.DATABASE_URL, process.env[ALLOW_REMOTE_DATA_SYNC_ENV]);
  if (!targetCheck.allowed) return { ...empty, status: "BLOCKED", messages: [targetCheck.blockedReason ?? "DB 대상이 허용되지 않았습니다."] };
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) return { ...empty, messages: ["TOUR_API_SERVICE_KEY가 설정되지 않았습니다."] };

  const region = await prisma.region.findUnique({
    where: { code: params.regionCode },
    select: { id: true, code: true, name: true, level: true, apiAreaCode: true, apiSigunguCode: true, tourApiLdongRegnCd: true, tourApiLdongSignguCd: true },
  });
  if (!region) return { ...empty, messages: [`지역 코드를 찾을 수 없습니다: ${params.regionCode}`] };
  if (region.level !== "SIGUNGU") return { ...empty, regionName: region.name, messages: ["무장애 증분 수집은 SIGUNGU 지역만 지원합니다."] };
  const codes = resolvePetTourRegionCodes(region);
  const scope: RegionScope = { ...region, ...codes };
  const list = await fetchAccessibilityList({ serviceKey, region: scope, maxListPages: params.maxListPages });
  if (!list.ok) return { ...empty, regionName: region.name, listPagesFetched: list.pagesFetched, listTotalCount: list.totalCount, messages: [list.message ?? "공식 무장애 목록을 가져오지 못했습니다."] };

  const officialTargets = deduplicateAccessibilityTargets(list.items);
  const visibleContentIds = officialTargets.filter((target) => target.sourceShowFlag !== "0").map((target) => target.contentid);
  const [localApiPoiCount, localPois, existingEvidence] = await Promise.all([
    prisma.poi.count({ where: { regionId: region.id, sourceType: "API" } }),
    findLocalPois(visibleContentIds, region.id),
    findExistingEvidence(visibleContentIds),
  ]);
  const selection = selectAccessibilityTargets({
    officialItems: officialTargets,
    localPois: localPois as AccessibilityLocalPoi[],
    existingEvidence,
    maxItems: params.maxItems,
  });
  const poiByContentId = new Map(localPois.filter((poi) => poi.externalId).map((poi) => [poi.externalId as string, poi]));
  const categoryDistribution: Record<string, number> = {};
  for (const poi of selection.matchedPois) {
    addCategory(categoryDistribution, poi.category);
  }
  const fetchTargets = selection.fetchTargets;
  const result: AccessibilityEnrichmentResult = {
    status: "COMPLETED",
    regionCode: region.code,
    regionName: region.name,
    listEndpoint: `${ACCESSIBILITY_BASE_URL}/areaBasedSyncList2`,
    detailEndpoint: `${ACCESSIBILITY_BASE_URL}/detailWithTour2`,
    listPagesFetched: list.pagesFetched,
    listTotalCount: list.totalCount,
    officialListItemCount: officialTargets.length,
    officialUniqueContentIdCount: selection.officialItems.length + selection.hiddenItems.length,
    hiddenOfficialItemCount: selection.hiddenItems.length,
    localApiPoiCount,
    localMatchCount: selection.matchedTargets.length,
    localMismatchCount: selection.unmatchedContentIds.length,
    bruteForceDetailCalls: localApiPoiCount,
    plannedDetailCalls: fetchTargets.length,
    detailCallsAttempted: 0,
    detailCallsReduced: Math.max(0, localApiPoiCount - selection.matchedTargets.length),
    cacheHits: selection.cacheHits.length,
    changedTargetCount: selection.changedTargets.length,
    savedSuccess: 0,
    savedEmpty: 0,
    savedError: 0,
    dryRun: Boolean(params.dryRun),
    categoryDistribution,
    dimensionStatusDistribution: emptyDimensionDistribution(),
    messages: [],
  };
  if (selection.changedTargets.length > params.maxItems) result.messages.push(`변경 대상 ${selection.changedTargets.length}건 중 이번 실행은 ${params.maxItems}건만 처리합니다.`);
  if (selection.unmatchedContentIds.length > 0) result.messages.push(`공식 목록과 local Poi.externalId가 맞지 않는 ${selection.unmatchedContentIds.length}건은 상세 호출하지 않았습니다.`);
  if (list.items.some((item) => item.contentid === "")) result.messages.push("contentId가 빈 목록 항목은 상세 호출 대상에서 제외했습니다.");
  if (params.dryRun) return result;

  for (const target of fetchTargets) {
    if (result.detailCallsAttempted > 0) await sleep(params.delayMs);
    result.detailCallsAttempted++;
    const detail = await fetchAccessibilityDetail({ serviceKey, contentId: target.contentid });
    const poi = poiByContentId.get(target.contentid);
    if (!poi) continue;
    if (detail.status === "SUCCESS") {
      const item = detail.items.find((candidate) => candidate.contentId === target.contentid);
      if (!item) {
        await saveEvidence({ poiId: poi.id, contentId: target.contentid, sourceModifiedTime: target.sourceModifiedTime, sourceShowFlag: target.sourceShowFlag, status: "ERROR", dimensionDetails: null, rawPayload: null, errorCode: "DETAIL_CONTENT_MISMATCH", errorMessage: "상세 응답에 요청한 contentId가 없어 원문을 저장하지 않았습니다." });
        result.savedError++;
        continue;
      }
      const dimensionDetails = normalizeAccessibilityDetail(item.rawPayload);
      await saveEvidence({ poiId: poi.id, contentId: target.contentid, sourceModifiedTime: target.sourceModifiedTime, sourceShowFlag: target.sourceShowFlag, status: "SUCCESS", dimensionDetails, rawPayload: item.rawPayload });
      addDimensionDistribution(result.dimensionStatusDistribution, dimensionDetails);
      result.savedSuccess++;
      continue;
    }
    if (detail.status === "EMPTY") {
      await saveEvidence({ poiId: poi.id, contentId: target.contentid, sourceModifiedTime: target.sourceModifiedTime, sourceShowFlag: target.sourceShowFlag, status: "EMPTY", dimensionDetails: null, rawPayload: null });
      result.savedEmpty++;
      continue;
    }
    await saveEvidence({ poiId: poi.id, contentId: target.contentid, sourceModifiedTime: target.sourceModifiedTime, sourceShowFlag: target.sourceShowFlag, status: "ERROR", dimensionDetails: null, rawPayload: null, errorCode: detail.resultCode, errorMessage: detail.resultMsg });
    result.savedError++;
    result.messages.push(`${target.contentid}: ${detail.resultCode} ${detail.resultMsg}`);
    if (hasRateLimitCode(detail.resultCode)) {
      result.messages.push("공식 API quota/호출 제한 응답으로 이번 실행을 중단했습니다.");
      break;
    }
  }
  return result;
}
