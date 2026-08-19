import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  fetchPetTourDetail,
  fetchPetTourListPage,
  PET_TOUR_API_VERSION,
  PET_TOUR_BASE_URL,
  PET_TOUR_DETAIL_SOURCE_CODE,
  type PetTourListItem,
} from "@/lib/public-data/adapters/petTour";
import {
  normalizePetTourDetail,
  selectPetTourTargets,
  type ExistingPetTourEvidence,
  type PetTourLocalPoi,
} from "@/lib/domain/petTourEvidence";
import { ALLOW_REMOTE_DATA_SYNC_ENV, checkDataSyncTarget } from "@/lib/services/dataSyncTargetGuard";
import { MAX_PET_TOUR_DETAIL_ITEMS_PER_RUN, MAX_PET_TOUR_LIST_PAGES_PER_RUN } from "@/lib/domain/petTourLimits";
import { resolvePetTourRegionCodes } from "@/lib/domain/petTourRegion";

export const PET_TOUR_LIST_PAGE_SIZE = 1000;

export interface PetTourEnrichmentParams {
  regionCode?: string;
  allRegions?: boolean;
  mode: "sync" | "area";
  maxItems: number;
  maxListPages: number;
  delayMs: number;
  dryRun?: boolean;
  /** 현재 후보·코스 감사에서 런타임으로 계산한 contentId 우선순위. 프로젝트/POI를 하드코딩하지 않는다. */
  priorityContentIds?: string[];
}

export interface PetTourEnrichmentResult {
  status: "COMPLETED" | "BLOCKED" | "FAILED";
  mode: "sync" | "area";
  scope: string;
  regionCount: number;
  listEndpoint: string;
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
  regionDistribution: Record<string, number>;
  messages: string[];
}

interface RegionScope {
  id: string;
  code: string;
  name: string;
  level: string;
  lDongRegnCd: string | null;
  lDongSignguCd: string | null;
}

const EMPTY_RESULT = (params: PetTourEnrichmentParams, scope: string): PetTourEnrichmentResult => ({
  status: "FAILED",
  mode: params.mode,
  scope,
  regionCount: 0,
  listEndpoint: params.mode === "sync" ? "petTourSyncList2" : "areaBasedList2",
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
  regionDistribution: {},
  messages: [],
});

function emptyDistribution(): Record<string, number> {
  return {};
}

function addDistribution(distribution: Record<string, number>, key: string): void {
  distribution[key] = (distribution[key] ?? 0) + 1;
}

function sleep(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

async function fetchPetTourList(params: {
  serviceKey: string;
  mode: "sync" | "area";
  region?: RegionScope;
  maxListPages: number;
}): Promise<{
  ok: boolean;
  items: PetTourListItem[];
  pagesFetched: number;
  totalCount: number;
  message?: string;
}> {
  const endpoint = params.mode === "sync" ? "petTourSyncList2" : "areaBasedList2";
  const regionCodes = params.region
    ? { lDongRegnCd: params.region.lDongRegnCd, lDongSignguCd: params.region.lDongSignguCd }
    : { lDongRegnCd: null, lDongSignguCd: null };
  if (params.mode === "area" && (!regionCodes.lDongRegnCd || !regionCodes.lDongSignguCd)) {
    return {
      ok: false,
      items: [],
      pagesFetched: 0,
      totalCount: 0,
      message: "대상 지역에 공식 API용 lDongRegnCd/lDongSignguCd가 없어 지역 목록을 호출하지 않았습니다.",
    };
  }

  const items: PetTourListItem[] = [];
  let pagesFetched = 0;
  let totalCount = 0;
  for (let pageNo = 1; pageNo <= params.maxListPages; pageNo++) {
    const page = await fetchPetTourListPage({
      serviceKey: params.serviceKey,
      endpoint,
      pageNo,
      pageSize: PET_TOUR_LIST_PAGE_SIZE,
      lDongRegnCd: params.mode === "area" ? regionCodes.lDongRegnCd ?? undefined : undefined,
      lDongSignguCd: params.mode === "area" ? regionCodes.lDongSignguCd ?? undefined : undefined,
    });
    pagesFetched++;
    totalCount = page.totalCount;
    if (page.status === "ERROR") {
      return { ok: false, items, pagesFetched, totalCount, message: `${endpoint} ${page.resultCode}: ${page.resultMsg}` };
    }
    if (page.status === "EMPTY") break;
    items.push(...page.items);
    const expectedPages = totalCount > 0 ? Math.ceil(totalCount / PET_TOUR_LIST_PAGE_SIZE) : page.items.length < PET_TOUR_LIST_PAGE_SIZE ? pageNo : pageNo + 1;
    if (pageNo >= expectedPages || page.items.length < PET_TOUR_LIST_PAGE_SIZE) break;
  }

  if (totalCount > params.maxListPages * PET_TOUR_LIST_PAGE_SIZE) {
    return {
      ok: false,
      items,
      pagesFetched,
      totalCount,
      message: `공식 목록이 ${params.maxListPages}페이지 상한을 초과해 상세 수집을 중단했습니다. --max-list-pages를 늘려 재실행하세요.`,
    };
  }
  return { ok: true, items, pagesFetched, totalCount };
}

async function findPoisByContentIds(contentIds: string[], regionIds: string[]): Promise<PetTourLocalPoi[]> {
  const rows: PetTourLocalPoi[] = [];
  for (let index = 0; index < contentIds.length; index += 1000) {
    const chunk = contentIds.slice(index, index + 1000);
    const pois = await prisma.poi.findMany({
      where: {
        externalId: { in: chunk },
        sourceType: "API",
        ...(regionIds.length > 0 ? { regionId: { in: regionIds } } : {}),
      },
      select: {
        id: true,
        externalId: true,
        regionId: true,
        sourceType: true,
        category: true,
        region: { select: { code: true, name: true } },
      },
    });
    rows.push(
      ...pois.map((poi) => ({
        id: poi.id,
        externalId: poi.externalId,
        regionId: poi.regionId,
        sourceType: poi.sourceType,
        category: poi.category,
        regionCode: poi.region.code,
        regionName: poi.region.name,
      })),
    );
  }
  return rows;
}

async function findExistingEvidence(contentIds: string[]): Promise<ExistingPetTourEvidence[]> {
  const rows: ExistingPetTourEvidence[] = [];
  for (let index = 0; index < contentIds.length; index += 1000) {
    const chunk = contentIds.slice(index, index + 1000);
    const evidences = await prisma.poiConditionEvidence.findMany({
      where: { conditionType: "PET", contentId: { in: chunk } },
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

async function countLocalApiPois(regionIds: string[]): Promise<number> {
  return prisma.poi.count({
    where: { sourceType: "API", ...(regionIds.length > 0 ? { regionId: { in: regionIds } } : {}) },
  });
}

async function saveEvidence(params: {
  poi: PetTourLocalPoi;
  contentId: string;
  sourceModifiedTime: string | null;
  sourceShowFlag: string;
  status: "SUCCESS" | "EMPTY" | "ERROR";
  availability: "CONFIRMED" | "CONDITIONAL" | "UNKNOWN";
  scope: "ALL" | "PARTIAL" | "UNKNOWN";
  requirements: string[];
  capacityNote: string | null;
  riskNote: string | null;
  facilityNote: string | null;
  rawPayload: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.poiConditionEvidence.upsert({
    where: { conditionType_contentId: { conditionType: "PET", contentId: params.contentId } },
    create: {
      poiId: params.poi.id,
      conditionType: "PET",
      contentId: params.contentId,
      sourceCode: PET_TOUR_DETAIL_SOURCE_CODE,
      endpoint: `${PET_TOUR_BASE_URL}/detailPetTour2`,
      apiVersion: PET_TOUR_API_VERSION,
      status: params.status,
      availability: params.availability,
      scope: params.scope,
      requirements: params.requirements as Prisma.InputJsonValue,
      capacityNote: params.capacityNote,
      riskNote: params.riskNote,
      facilityNote: params.facilityNote,
      sourceModifiedTime: params.sourceModifiedTime,
      sourceShowFlag: params.sourceShowFlag,
      rawPayload: params.rawPayload === null ? Prisma.JsonNull : (params.rawPayload as Prisma.InputJsonValue),
      fetchedAt: now,
      lastErrorCode: params.errorCode ?? null,
      lastErrorMessage: params.errorMessage?.slice(0, 1000) ?? null,
    },
    update: {
      poiId: params.poi.id,
      sourceCode: PET_TOUR_DETAIL_SOURCE_CODE,
      endpoint: `${PET_TOUR_BASE_URL}/detailPetTour2`,
      apiVersion: PET_TOUR_API_VERSION,
      status: params.status,
      availability: params.availability,
      scope: params.scope,
      requirements: params.requirements as Prisma.InputJsonValue,
      capacityNote: params.capacityNote,
      riskNote: params.riskNote,
      facilityNote: params.facilityNote,
      sourceModifiedTime: params.sourceModifiedTime,
      sourceShowFlag: params.sourceShowFlag,
      rawPayload: params.rawPayload === null ? Prisma.JsonNull : (params.rawPayload as Prisma.InputJsonValue),
      fetchedAt: now,
      lastErrorCode: params.errorCode ?? null,
      lastErrorMessage: params.errorMessage?.slice(0, 1000) ?? null,
    },
  });
}

function hasRateLimitCode(resultCode: string): boolean {
  return new Set(["22", "23", "29", "LIMITED_TRAFFIC"]).has(resultCode);
}

export async function enrichPetTourEvidence(params: PetTourEnrichmentParams): Promise<PetTourEnrichmentResult> {
  const scope = params.allRegions ? "ALL_SIGUNGU" : params.regionCode ?? "";
  const empty = EMPTY_RESULT(params, scope);
  if (params.maxItems < 1 || params.maxItems > MAX_PET_TOUR_DETAIL_ITEMS_PER_RUN) {
    return { ...empty, messages: [`maxItems는 1~${MAX_PET_TOUR_DETAIL_ITEMS_PER_RUN} 범위여야 합니다.`] };
  }
  if (params.maxListPages < 1 || params.maxListPages > MAX_PET_TOUR_LIST_PAGES_PER_RUN) {
    return { ...empty, messages: [`maxListPages는 1~${MAX_PET_TOUR_LIST_PAGES_PER_RUN} 범위여야 합니다.`] };
  }
  if (params.delayMs < 0 || params.delayMs > 5000) {
    return { ...empty, messages: ["delayMs는 0~5000 범위여야 합니다."] };
  }
  if (params.mode === "area" && params.allRegions) {
    return { ...empty, messages: ["area 모드는 한 번에 한 SIGUNGU만 허용합니다. 전국은 sync 모드를 사용하세요."] };
  }

  const targetCheck = checkDataSyncTarget(process.env.DATABASE_URL, process.env[ALLOW_REMOTE_DATA_SYNC_ENV]);
  if (!targetCheck.allowed) return { ...empty, status: "BLOCKED", messages: [targetCheck.blockedReason ?? "DB 대상이 허용되지 않았습니다."] };

  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) return { ...empty, messages: ["TOUR_API_SERVICE_KEY가 설정되지 않았습니다."] };

  const regions = params.allRegions
    ? await prisma.region.findMany({
        where: { level: "SIGUNGU" },
        select: { id: true, code: true, name: true, level: true, apiAreaCode: true, apiSigunguCode: true, tourApiLdongRegnCd: true, tourApiLdongSignguCd: true },
        orderBy: { code: "asc" },
      })
    : await prisma.region.findUnique({
        where: { code: params.regionCode },
        select: { id: true, code: true, name: true, level: true, apiAreaCode: true, apiSigunguCode: true, tourApiLdongRegnCd: true, tourApiLdongSignguCd: true },
      }).then((region) => (region ? [region] : []));
  if (regions.length === 0) return { ...empty, messages: [`지역 코드를 찾을 수 없습니다: ${params.regionCode ?? "SIGUNGU"}`] };
  if (regions.some((region) => region.level !== "SIGUNGU")) return { ...empty, messages: ["반려동물 증분 수집은 SIGUNGU 지역만 지원합니다."] };

  const regionScopes: RegionScope[] = regions.map((region) => ({
    id: region.id,
    code: region.code,
    name: region.name,
    level: region.level,
    ...resolvePetTourRegionCodes(region),
  }));
  const listRegion = params.mode === "area" ? regionScopes[0] : undefined;
  const list = await fetchPetTourList({ serviceKey, mode: params.mode, region: listRegion, maxListPages: params.maxListPages });
  if (!list.ok) {
    return {
      ...empty,
      regionCount: regions.length,
      listPagesFetched: list.pagesFetched,
      listTotalCount: list.totalCount,
      messages: [list.message ?? "공식 반려동물 목록을 가져오지 못했습니다."],
    };
  }

  let officialItems = list.items;
  if (params.mode === "sync" && !params.allRegions) {
    const region = regionScopes[0];
    officialItems = officialItems.filter((item) => item.lDongRegnCd === region.lDongRegnCd && item.lDongSignguCd === region.lDongSignguCd);
  }
  const allOfficialContentIds = [...new Set(officialItems.map((item) => item.contentid))];
  const regionIds = regionScopes.map((region) => region.id);
  const [localPois, localApiPoiCount, existingEvidence] = await Promise.all([
    findPoisByContentIds(allOfficialContentIds, regionIds),
    countLocalApiPois(regionIds),
    findExistingEvidence(allOfficialContentIds),
  ]);
  const selection = selectPetTourTargets({
    officialItems,
    localPois,
    existingEvidence,
    maxItems: params.maxItems,
    priorityContentIds: params.priorityContentIds,
  });
  const categoryDistribution = emptyDistribution();
  const regionDistribution = emptyDistribution();
  for (const poi of selection.matchedPois) {
    addDistribution(categoryDistribution, poi.category);
    addDistribution(regionDistribution, poi.regionName);
  }

  const result: PetTourEnrichmentResult = {
    status: "COMPLETED",
    mode: params.mode,
    scope,
    regionCount: regions.length,
    listEndpoint: params.mode === "sync" ? "petTourSyncList2" : "areaBasedList2",
    listPagesFetched: list.pagesFetched,
    listTotalCount: list.totalCount,
    officialListItemCount: officialItems.length,
    officialUniqueContentIdCount: selection.officialItems.length + selection.hiddenItems.length,
    hiddenOfficialItemCount: selection.hiddenItems.length,
    localApiPoiCount,
    localMatchCount: selection.matchedPois.length,
    localMismatchCount: selection.unmatchedContentIds.length,
    bruteForceDetailCalls: localApiPoiCount,
    plannedDetailCalls: selection.fetchTargets.length,
    detailCallsAttempted: 0,
    detailCallsReduced: Math.max(0, localApiPoiCount - selection.matchedPois.length),
    cacheHits: selection.cacheHits.length,
    changedTargetCount: selection.changedTargets.length,
    savedSuccess: 0,
    savedEmpty: 0,
    savedError: 0,
    dryRun: Boolean(params.dryRun),
    categoryDistribution,
    regionDistribution,
    messages: [],
  };
  if (selection.changedTargets.length > params.maxItems) {
    result.messages.push(`변경 대상 ${selection.changedTargets.length}건 중 이번 실행은 ${params.maxItems}건만 처리합니다. 다음 실행에서 이어집니다.`);
  }
  if (selection.unmatchedContentIds.length > 0) {
    result.messages.push(`공식 목록과 local Poi.externalId가 맞지 않는 contentId ${selection.unmatchedContentIds.length}건은 상세 호출하지 않았습니다.`);
  }
  if (params.dryRun) return result;

  const poiByContentId = new Map(selection.matchedPois.map((poi) => [poi.externalId as string, poi]));
  for (const target of selection.fetchTargets) {
    if (result.detailCallsAttempted > 0) await sleep(params.delayMs);
    result.detailCallsAttempted++;
    const detail = await fetchPetTourDetail({ serviceKey, contentId: target.contentid });
    const poi = poiByContentId.get(target.contentid);
    if (!poi) continue;

    if (detail.status === "SUCCESS") {
      const item = detail.items.find((candidate) => candidate.contentId === target.contentid);
      if (!item) {
        await saveEvidence({
          poi,
          contentId: target.contentid,
          sourceModifiedTime: target.sourceModifiedTime,
          sourceShowFlag: target.sourceShowFlag,
          status: "ERROR",
          availability: "UNKNOWN",
          scope: "UNKNOWN",
          requirements: [],
          capacityNote: null,
          riskNote: null,
          facilityNote: null,
          rawPayload: null,
          errorCode: "DETAIL_CONTENT_MISMATCH",
          errorMessage: "상세 응답에 요청한 contentId가 없어 원문을 저장하지 않았습니다.",
        });
        result.savedError++;
        continue;
      }
      const normalized = normalizePetTourDetail(item.rawPayload);
      await saveEvidence({
        poi,
        contentId: target.contentid,
        sourceModifiedTime: target.sourceModifiedTime,
        sourceShowFlag: target.sourceShowFlag,
        status: "SUCCESS",
        ...normalized,
        rawPayload: item.rawPayload,
      });
      result.savedSuccess++;
      continue;
    }

    if (detail.status === "EMPTY") {
      await saveEvidence({
        poi,
        contentId: target.contentid,
        sourceModifiedTime: target.sourceModifiedTime,
        sourceShowFlag: target.sourceShowFlag,
        status: "EMPTY",
        availability: "UNKNOWN",
        scope: "UNKNOWN",
        requirements: [],
        capacityNote: null,
        riskNote: null,
        facilityNote: null,
        rawPayload: null,
      });
      result.savedEmpty++;
      continue;
    }

    await saveEvidence({
      poi,
      contentId: target.contentid,
      sourceModifiedTime: target.sourceModifiedTime,
      sourceShowFlag: target.sourceShowFlag,
      status: "ERROR",
      availability: "UNKNOWN",
      scope: "UNKNOWN",
      requirements: [],
      capacityNote: null,
      riskNote: null,
      facilityNote: null,
      rawPayload: null,
      errorCode: detail.resultCode,
      errorMessage: detail.resultMsg,
    });
    result.savedError++;
    result.messages.push(`${target.contentid}: ${detail.resultCode} ${detail.resultMsg}`);
    if (hasRateLimitCode(detail.resultCode)) {
      result.messages.push("공식 API quota/호출 제한 응답으로 이번 실행을 중단했습니다. 다음 회차에서 이어집니다.");
      break;
    }
  }
  return result;
}
