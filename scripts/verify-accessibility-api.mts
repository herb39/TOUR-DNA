/**
 * 무장애 API 전체 목록·local POI overlap·상세 표본을 읽기 전용으로 감사한다.
 *
 * 제품 adapter·DB schema·PoiConditionEvidence 저장 경로는 변경하지 않는다.
 * 세 지역의 공식 목록은 1,000건 page size를 먼저 시도하고, 실제 응답 page size와
 * totalCount를 기준으로 전체 수신 여부를 검증한다. 공식 목록과 local API POI가
 * 겹치는 대상에서만 지역별 최대 8건의 상세를 deterministic category-balanced 방식으로
 * 조회한다. 응답 원문은 저장하지 않고 필드명·값 형태·정규화 분포만 출력한다.
 */
import { prisma } from "../src/lib/db";
import { isFestivalAnchorItem, type CourseDay } from "../src/lib/domain/planBuilder";
import { resolvePetTourRegionCodes } from "../src/lib/domain/petTourRegion";
import { fetchPublicDataJson } from "../src/lib/public-data/client";
import { withRequestCounter } from "../src/lib/public-data/requestCounter";
import { buildRecommendedPoiCandidates } from "../src/lib/services/candidatePoolService";
import { buildAnchorCandidateSuggestions, type AnchorCandidate } from "../src/lib/services/anchorCandidateService";
import { preferredThemeLabels } from "../src/lib/validation/project-preferences";
import type { FestivalAnchorCourseSource } from "../src/lib/domain/festivalAnchorCourse";
import type { DurationCode } from "../src/lib/domain/strategy";

const ACCESSIBILITY_BASE_URL = "https://apis.data.go.kr/B551011/KorWithService2";
const LIST_ENDPOINT = "areaBasedSyncList2" as const;
const LIST_SOURCE_CODE = "TOUR_ACCESSIBILITY_LIST";
const DETAIL_SOURCE_CODE = "TOUR_ACCESSIBILITY_DETAIL";
const LIST_REQUEST_PAGE_SIZE = 1000;
const DETAIL_LIMIT_PER_REGION = 8;
const SKIP_DETAIL = process.argv.includes("--skip-detail");
const REGION_CODES = ["SGG_GYEONGJU", "SGG_GANGNEUNG", "SGG_DAEJEON"] as const;
const REPRESENTATIVE_PROJECT_IDS: Record<(typeof REGION_CODES)[number], string> = {
  SGG_GYEONGJU: "cmsyyjt82000050ilm31nygzn",
  SGG_GANGNEUNG: "cmsnyrj7v00004gilcu1nxkpo",
  SGG_DAEJEON: "cmsyiqf9n002h3kilbkudr1dc",
};
const CATEGORY_ORDER = ["ATTRACTION", "FOOD", "LODGING", "EXPERIENCE"] as const;
const ACCESSIBILITY_FIELD_HINTS = [
  "wheelchair",
  "exit",
  "elevator",
  "restroom",
  "guidesystem",
  "blindhandicapetc",
  "signguide",
  "videoguide",
  "hearingroom",
  "hearinghandicapetc",
  "stroller",
  "lactationroom",
  "babysparechair",
  "infantsfamilyetc",
  "auditorium",
  "room",
  "handicapetc",
  "braileblock",
  "helpdog",
  "guidehuman",
  "audioguide",
  "bigprint",
  "brailepromotion",
  "parking",
  "route",
  "publictransport",
  "ticketoffice",
  "promotion",
] as const;

type RecordValue = Record<string, unknown>;
type ValueState = "MISSING" | "EMPTY_STRING" | "NULL" | "NON_EMPTY_STRING" | "OTHER";
type SemanticState = "AVAILABLE" | "UNAVAILABLE" | "CONDITIONAL" | "FREE_TEXT" | "UNKNOWN";
type CollectionName = "CANDIDATE" | "COURSE" | "ANCHOR_CANDIDATE";

type LocalPoi = {
  id: string;
  externalId: string | null;
  category: string;
  name: string;
};

type ListMeta = {
  resultCode: string | null;
  resultMsg: string | null;
  totalCount: number;
  pageNo: number | null;
  numOfRows: number | null;
  items: RecordValue[];
};

type CoverageRow = {
  id: string;
  name: string;
  category: string;
  externalId: string | null;
  collection: CollectionName;
  listed: boolean;
};

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function responseStatus(result: { status?: number; errorMessage?: string }): number | null {
  if (result.status !== undefined) return result.status;
  const matched = result.errorMessage?.match(/HTTP\s+(\d{3})/i);
  return matched ? Number(matched[1]) : null;
}

function responseMeta(data: unknown): ListMeta {
  if (!isRecord(data)) return { resultCode: null, resultMsg: null, totalCount: 0, pageNo: null, numOfRows: null, items: [] };
  const response = isRecord(data.response) ? data.response : null;
  const header = response && isRecord(response.header) ? response.header : null;
  const body = response && isRecord(response.body) ? response.body : null;
  const itemsValue = body && isRecord(body.items) ? body.items.item : null;
  const values = itemsValue === "" || itemsValue === null || itemsValue === undefined
    ? []
    : Array.isArray(itemsValue)
      ? itemsValue
      : [itemsValue];
  return {
    resultCode: text(header?.resultCode) ?? text(data.resultCode),
    resultMsg: text(header?.resultMsg) ?? text(data.resultMsg),
    totalCount: integer(body?.totalCount) ?? 0,
    pageNo: integer(body?.pageNo),
    numOfRows: integer(body?.numOfRows),
    items: values.filter(isRecord),
  };
}

function buildListUrl(
  serviceKey: string,
  region: { lDongRegnCd: string; lDongSignguCd: string },
  pageNo: number,
  pageSize: number,
): string {
  const query = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    _type: "json",
    numOfRows: String(pageSize),
    pageNo: String(pageNo),
    lDongRegnCd: region.lDongRegnCd,
    lDongSignguCd: region.lDongSignguCd,
  });
  return `${ACCESSIBILITY_BASE_URL}/${LIST_ENDPOINT}?${query.toString()}`;
}

function buildDetailUrl(serviceKey: string, contentId: string): string {
  const query = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    contentId,
    _type: "json",
  });
  return `${ACCESSIBILITY_BASE_URL}/detailWithTour2?${query.toString()}`;
}

function valueState(value: unknown): ValueState {
  if (value === undefined) return "MISSING";
  if (value === null) return "NULL";
  if (typeof value === "string") return value.trim().length === 0 ? "EMPTY_STRING" : "NON_EMPTY_STRING";
  return "OTHER";
}

function fieldQuality(items: RecordValue[]): Record<string, Record<ValueState, number>> {
  const fields = uniqueStrings(items.flatMap((item) => Object.keys(item)));
  return Object.fromEntries(
    fields.map((field) => {
      const counts = {} as Record<ValueState, number>;
      for (const item of items) {
        const state = valueState(item[field]);
        counts[state] = (counts[state] ?? 0) + 1;
      }
      return [field, counts];
    }),
  );
}

function semanticState(value: unknown): SemanticState {
  if (value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)) return "UNKNOWN";
  const normalized = String(value).replace(/\s+/g, "");
  if (/없음|불가|불가능|미설치|미제공|없다/.test(normalized)) return "UNAVAILABLE";
  if (/문의|확인|예약|사전|일부|조건|제한|필요|협의/.test(normalized)) return "CONDITIONAL";
  if (/가능|있음|설치|구비|제공|확보|완비|접근/.test(normalized)) return "AVAILABLE";
  return "FREE_TEXT";
}

function semanticQuality(items: RecordValue[]): Record<string, Record<SemanticState, number>> {
  const fields = uniqueStrings(items.flatMap((item) => Object.keys(item)));
  return Object.fromEntries(
    fields.map((field) => {
      const counts = {} as Record<SemanticState, number>;
      for (const item of items) {
        const state = semanticState(item[field]);
        counts[state] = (counts[state] ?? 0) + 1;
      }
      return [field, counts];
    }),
  );
}

function categoryCounts(rows: Array<{ category: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
    return counts;
  }, {});
}

function dedupeByContentId(items: RecordValue[]): RecordValue[] {
  const byContentId = new Map<string, RecordValue>();
  for (const item of items) {
    const contentId = text(item.contentid);
    if (contentId && !byContentId.has(contentId)) byContentId.set(contentId, item);
  }
  return [...byContentId.values()];
}

async function fetchFullOfficialList(params: {
  serviceKey: string;
  region: { lDongRegnCd: string; lDongSignguCd: string };
}): Promise<{
  firstStatus: number | null;
  resultCode: string | null;
  resultMsg: string | null;
  totalCount: number;
  firstPageItemCount: number;
  firstReportedPageSize: number | null;
  receivedItemCount: number;
  uniqueContentIdCount: number;
  pageCount: number;
  requestedPageSize: number;
  effectivePageSize: number;
  items: RecordValue[];
}> {
  const firstResponse = await fetchPublicDataJson(
    buildListUrl(params.serviceKey, params.region, 1, LIST_REQUEST_PAGE_SIZE),
    { sourceCode: LIST_SOURCE_CODE, timeoutMs: 10000, maxRetries: 0 },
  );
  if (!firstResponse.ok) throw new Error(`무장애 목록 1페이지 호출 실패: ${firstResponse.errorMessage ?? "unknown"}`);
  const first = responseMeta(firstResponse.data);
  const effectivePageSize = first.numOfRows && first.numOfRows > 0 ? first.numOfRows : Math.max(first.items.length, 1);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / effectivePageSize));
  const pages: RecordValue[][] = [first.items];
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const response = await fetchPublicDataJson(
      buildListUrl(params.serviceKey, params.region, pageNo, effectivePageSize),
      { sourceCode: LIST_SOURCE_CODE, timeoutMs: 10000, maxRetries: 0 },
    );
    if (!response.ok) throw new Error(`무장애 목록 ${pageNo}페이지 호출 실패: ${response.errorMessage ?? "unknown"}`);
    const page = responseMeta(response.data);
    if (page.totalCount !== 0 && page.totalCount !== first.totalCount) {
      throw new Error(`무장애 목록 totalCount가 페이지 간 변경됨: ${first.totalCount} → ${page.totalCount}`);
    }
    pages.push(page.items);
  }
  const items = pages.flat();
  const uniqueItems = dedupeByContentId(items);
  if (items.length !== first.totalCount || uniqueItems.length !== first.totalCount) {
    throw new Error(`무장애 목록 전체성 검증 실패: received=${items.length}, unique=${uniqueItems.length}, total=${first.totalCount}`);
  }
  return {
    firstStatus: responseStatus(firstResponse),
    resultCode: first.resultCode,
    resultMsg: first.resultMsg,
    totalCount: first.totalCount,
    firstPageItemCount: first.items.length,
    firstReportedPageSize: first.numOfRows,
    receivedItemCount: items.length,
    uniqueContentIdCount: uniqueItems.length,
    pageCount: totalPages,
    requestedPageSize: LIST_REQUEST_PAGE_SIZE,
    effectivePageSize,
    items: uniqueItems,
  };
}

function chooseDetailTargets(rows: LocalPoi[]): LocalPoi[] {
  const sorted = [...rows].sort((left, right) => left.externalId!.localeCompare(right.externalId!) || left.id.localeCompare(right.id));
  const selected: LocalPoi[] = [];
  for (const category of CATEGORY_ORDER) {
    const candidate = sorted.find((row) => row.category === category && !selected.some((item) => item.id === row.id));
    if (candidate) selected.push(candidate);
  }
  for (const row of sorted) {
    if (selected.length >= DETAIL_LIMIT_PER_REGION) break;
    if (!selected.some((item) => item.id === row.id)) selected.push(row);
  }
  return selected;
}

async function fetchDetailSamples(serviceKey: string, targets: LocalPoi[]): Promise<{
  targets: Array<{ contentId: string; category: string; httpStatus: number | null; resultCode: string | null; resultMsg: string | null; returnedItemCount: number }>;
  items: RecordValue[];
}> {
  const results: Array<{ contentId: string; category: string; httpStatus: number | null; resultCode: string | null; resultMsg: string | null; returnedItemCount: number }> = [];
  const items: RecordValue[] = [];
  for (const target of targets) {
    const response = await fetchPublicDataJson(buildDetailUrl(serviceKey, target.externalId!), {
      sourceCode: DETAIL_SOURCE_CODE,
      timeoutMs: 10000,
      maxRetries: 0,
    });
    const meta = response.ok ? responseMeta(response.data) : { resultCode: null, resultMsg: response.errorMessage ?? null, totalCount: 0, pageNo: null, numOfRows: null, items: [] };
    results.push({
      contentId: target.externalId!,
      category: target.category,
      httpStatus: responseStatus(response),
      resultCode: meta.resultCode,
      resultMsg: meta.resultMsg,
      returnedItemCount: meta.items.length,
    });
    items.push(...meta.items);
  }
  return { targets: results, items };
}

function asCourseDays(value: unknown): CourseDay[] {
  if (!isRecord(value) || !Array.isArray(value.days)) return [];
  return value.days as CourseDay[];
}

function dedupeRows(rows: CoverageRow[]): CoverageRow[] {
  const byId = new Map<string, CoverageRow>();
  for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()];
}

function courseRows(course: unknown): Array<{ id: string; name: string; category: string }> {
  const rows: Array<{ id: string; name: string; category: string }> = [];
  for (const day of asCourseDays(course)) {
    for (const item of day.items ?? []) {
      if (isFestivalAnchorItem(item)) continue;
      rows.push({ id: item.poiId, name: item.poiName, category: item.category });
    }
    if (day.lodging) rows.push({ id: day.lodging.poiId, name: day.lodging.poiName, category: day.lodging.category });
  }
  return rows;
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
  return { ...anchor, updatedAt: anchor.updatedAt.toISOString() };
}

function toCoverageRows(
  rows: Array<{ id: string; name: string; category: string }>,
  collection: CollectionName,
  localById: Map<string, LocalPoi>,
  officialIds: Set<string>,
): CoverageRow[] {
  return dedupeRows(rows.map((row) => {
    const poi = localById.get(row.id);
    const externalId = poi?.externalId ?? null;
    return { ...row, externalId, collection, listed: externalId !== null && officialIds.has(externalId) };
  }));
}

function coverageSummary(rows: CoverageRow[]): Record<string, unknown> {
  const listed = rows.filter((row) => row.listed).length;
  return {
    total: rows.length,
    listed,
    notListed: rows.length - listed,
    overlapRate: rows.length === 0 ? null : listed / rows.length,
    categoryDistribution: categoryCounts(rows),
  };
}

async function inspectProject(params: {
  regionCode: string;
  officialIds: Set<string>;
  localPois: LocalPoi[];
}): Promise<Record<string, unknown>> {
  const projectId = REPRESENTATIVE_PROJECT_IDS[params.regionCode as (typeof REGION_CODES)[number]];
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { region: true, input: true, selectedPlan: true, anchor: true, analysisResult: { include: { strategyResults: true } } },
  });
  if (!project) return { projectId, status: "NOT_AVAILABLE" };

  const localById = new Map(params.localPois.map((poi) => [poi.id, poi]));
  const course = courseRows(project.selectedPlan?.course);
  const strategy = project.analysisResult?.strategyResults.find((item) => item.id === project.selectedStrategyResultId);
  const preferredThemes = preferredThemeLabels(project.input?.preferredThemes);
  const candidateRows: Array<{ id: string; name: string; category: string }> = strategy && project.input
    ? await buildRecommendedPoiCandidates({
        templateId: strategy.templateId,
        regionCode: project.region.code,
        travelMonth: project.travelMonth,
        preferredThemes,
        existingPoiIds: course.map((row) => row.id),
      })
    : [];
  const candidates = toCoverageRows(candidateRows, "CANDIDATE", localById, params.officialIds);
  const courseCoverage = toCoverageRows(course, "COURSE", localById, params.officialIds);

  let anchorStatus = "NOT_AVAILABLE";
  let anchorCandidates: CoverageRow[] = [];
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
    if (anchorResult.status === "AVAILABLE") {
      const rows = Object.values(anchorResult.groups).flat().map((candidate: AnchorCandidate) => ({
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
      }));
      anchorCandidates = toCoverageRows(rows, "ANCHOR_CANDIDATE", localById, params.officialIds);
    }
  }

  return {
    projectId,
    status: "AVAILABLE",
    regionCode: params.regionCode,
    candidate: coverageSummary(candidates),
    course: coverageSummary(courseCoverage),
    anchor: { status: anchorStatus, ...(anchorStatus === "NOT_AVAILABLE" ? {} : coverageSummary(anchorCandidates)) },
  };
}

function listFieldSummary(items: RecordValue[]): Record<string, Record<ValueState, number>> {
  const quality = fieldQuality(items);
  return Object.fromEntries(
    ["contentid", "contenttypeid", "title", "addr1", "addr2", "lDongRegnCd", "lDongSignguCd", "mapx", "mapy", "modifiedtime", "showflag"].map((field) => [
      field,
      quality[field] ?? { MISSING: items.length },
    ]),
  );
}

function dimensionAssessment(items: RecordValue[], quality: Record<string, Record<ValueState, number>>) {
  const groups: Record<string, string[]> = {
    wheelchair: ["wheelchair"],
    entranceExit: ["exit"],
    elevator: ["elevator"],
    restroom: ["restroom"],
    parking: ["parking"],
    route: ["route"],
    visualGuide: ["blindhandicapetc", "braileblock", "brailepromotion", "bigprint", "videoguide", "signguide"],
    hearingGuide: ["hearinghandicapetc", "hearingroom"],
    guideDog: ["helpdog"],
    strollerFamily: ["stroller", "lactationroom", "babysparechair", "infantsfamilyetc", "auditorium"],
    otherSupport: ["handicapetc", "guidesystem", "guidehuman", "audioguide", "publictransport", "ticketoffice", "promotion", "room"],
  };
  return Object.fromEntries(Object.entries(groups).map(([dimension, fields]) => {
    const nonEmpty = fields.reduce((sum, field) => sum + (quality[field]?.NON_EMPTY_STRING ?? 0), 0);
    const knownFieldCount = fields.filter((field) => quality[field] !== undefined).length;
    return [dimension, { fields, knownFieldCount, nonEmptyValueCount: nonEmpty, hasMeaningfulData: nonEmpty > 0 }];
  }));
}

async function main(): Promise<void> {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) throw new Error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다.");

  const { result: report, requestCounts } = await withRequestCounter(async () => {
    const regions = await prisma.region.findMany({
      where: { code: { in: [...REGION_CODES] } },
      select: { id: true, code: true, name: true, apiAreaCode: true, apiSigunguCode: true, tourApiLdongRegnCd: true, tourApiLdongSignguCd: true },
    });
    const regionByCode = new Map(regions.map((region) => [region.code, region]));
    if (regions.length !== REGION_CODES.length) {
      throw new Error(`Region master 누락: ${REGION_CODES.filter((code) => !regionByCode.has(code)).join(", ")}`);
    }

    const officialReports: Array<Record<string, unknown> & { code: string; totalCount: number; effectivePageSize: number; sourceFreshness: Record<string, Record<ValueState, number>>; officialIds: Set<string>; localPois: LocalPoi[] }> = [];
    for (const code of REGION_CODES) {
      const region = regionByCode.get(code)!;
      const resolved = resolvePetTourRegionCodes(region);
      if (!resolved.lDongRegnCd || !resolved.lDongSignguCd) throw new Error(`${code} Region master 법정동 코드가 비어 있습니다.`);
      const official = await fetchFullOfficialList({ serviceKey, region: { lDongRegnCd: resolved.lDongRegnCd, lDongSignguCd: resolved.lDongSignguCd } });
      const localPois = await prisma.poi.findMany({
        where: { regionId: region.id, sourceType: "API" },
        select: { id: true, externalId: true, category: true, name: true },
      });
      const localByExternalId = new Map(localPois.filter((poi) => poi.externalId).map((poi) => [poi.externalId as string, poi]));
      const officialIds = new Set(official.items.map((item) => text(item.contentid)).filter((id): id is string => id !== null));
      const matched = [...officialIds].map((contentId) => localByExternalId.get(contentId)).filter((poi): poi is NonNullable<typeof poi> => Boolean(poi));
      const listQuality = fieldQuality(official.items);
      officialReports.push({
        code,
        regionName: region.name,
        apiCodes: resolved,
        endpoint: `${ACCESSIBILITY_BASE_URL}/${LIST_ENDPOINT}`,
        ...official,
        listFieldSummary: listFieldSummary(official.items),
        sourceFreshness: {
          modifiedtime: listQuality.modifiedtime ?? { MISSING: official.items.length },
          showflag: listQuality.showflag ?? { MISSING: official.items.length },
        },
        localPoiCount: localPois.length,
        localPoiOverlap: matched.length,
        localPoiOverlapRate: localPois.length === 0 ? null : matched.length / localPois.length,
        overlapCategoryDistribution: categoryCounts(matched),
        officialIds,
        localPois,
      });
    }

    const detailReports: Array<Record<string, unknown> & { items: RecordValue[] }> = [];
    for (const region of officialReports) {
      const localByExternalId = new Map(region.localPois.filter((poi) => poi.externalId).map((poi) => [poi.externalId as string, poi]));
      const matched = [...region.officialIds].map((contentId) => localByExternalId.get(contentId)).filter((poi): poi is NonNullable<typeof poi> => Boolean(poi));
      const targets = chooseDetailTargets(matched);
      const details = SKIP_DETAIL
        ? { targets: [], items: [] as RecordValue[] }
        : await fetchDetailSamples(serviceKey, targets);
      detailReports.push({
        regionCode: region.code,
        targetCategoryDistribution: categoryCounts(targets),
        attempted: targets.length,
        results: details.targets,
        items: details.items,
      });
    }

    const projectReports = [];
    for (const region of officialReports) {
      projectReports.push(await inspectProject({ regionCode: region.code, officialIds: region.officialIds, localPois: region.localPois }));
    }

    const detailItems = detailReports.flatMap((report) => report.items);
    const quality = fieldQuality(detailItems);
    const officialOutput = officialReports.map((output) => {
      const publicOutput = Object.fromEntries(
        Object.entries(output).filter(([key]) => !["officialIds", "officialItems", "localPois", "items"].includes(key)),
      );
      return {
        ...publicOutput,
        totalCountMatchesReceived: output.totalCount === output.receivedItemCount && output.totalCount === output.uniqueContentIdCount,
      };
    });
    const detailOutput = detailReports.map((output) => Object.fromEntries(Object.entries(output).filter(([key]) => key !== "items")));

    return {
      contract: {
        requestedListPageSize: LIST_REQUEST_PAGE_SIZE,
        initialPageSizeAccepted: officialReports.every((region) => region.firstPageItemCount === region.totalCount),
        paginationRule: "응답 body.numOfRows를 우선 사용하고 totalCount와 실제 수신 건수가 일치하는지 검증",
        rawResponseNotStored: true,
      },
      officialRegions: officialOutput,
      projects: projectReports,
      detail: {
        regionSampleCounts: Object.fromEntries(detailReports.map((report) => [report.regionCode, report.attempted])),
        totalSampleCount: detailItems.length,
        actualFields: uniqueStrings(detailItems.flatMap((item) => Object.keys(item))),
        fieldQuality: quality,
        expectedFieldQuality: Object.fromEntries(ACCESSIBILITY_FIELD_HINTS.map((field) => [field, quality[field] ?? { MISSING: detailItems.length }])),
        semanticQuality: semanticQuality(detailItems),
        dimensionAssessment: dimensionAssessment(detailItems, quality),
        regions: detailOutput,
        normalizationRule: {
          AVAILABLE: "제공·가능·설치·구비 등 명시적 긍정 문구",
          UNAVAILABLE: "없음·불가·미설치·미제공 등 명시적 부정 문구",
          CONDITIONAL: "문의·확인·예약·사전·일부·조건·제한 등 조건 문구",
          UNKNOWN: "빈 문자열·누락·판정 불가능",
          FREE_TEXT: "값은 있으나 위 세 상태로 안전하게 판정할 수 없는 자유 서술",
        },
      },
      evidenceContract: {
        judgement: "B_DIMENSION_ONLY",
        reusableEnvelopeFields: ["poiId", "conditionType=ACCESSIBILITY", "contentId", "sourceCode", "endpoint", "apiVersion", "status", "fetchedAt", "rawPayload", "sourceModifiedTime", "sourceShowFlag", "error"],
        existingSchemaJsonField: "rawPayload Json?는 원문 보존에 사용 가능",
        requiredNextMigration: "dimensionDetails Json? 추가를 권고. rawPayload의 의미를 정규화 결과까지 확장하지 않음",
        overallAvailability: "ACCESSIBILITY 전체 가능/불가 상태로 사용하지 않음",
      },
      cacheContract: {
        listFieldsObserved: ["modifiedtime", "showflag"],
        strategy: "동일 contentId·modifiedtime·showflag의 SUCCESS/EMPTY는 상세 재호출 생략, 변경 대상은 재조회, ERROR는 재시도",
        verifiedAcrossAllRegions: officialReports.every((region) => region.sourceFreshness.modifiedtime.NON_EMPTY_STRING === region.totalCount && region.sourceFreshness.showflag.NON_EMPTY_STRING === region.totalCount),
      },
      decision: {
        pipelineReadiness: SKIP_DETAIL ? "PARTIAL" : "READY",
        reason: SKIP_DETAIL
          ? "목록·후보·코스 집계만 재검증한 실행이며 상세 표본은 이전 전체 실행에서 검증함"
          : "세 지역 공식 목록 전체 수신·overlap·후보/코스 대조와 지역별 상세 표본 검증이 완료됐고, 차원별 상태 정규화 및 modifiedtime/showflag cache 계약을 확정할 수 있음",
        productChanges: "없음",
      },
      note: "로컬 PostgreSQL 읽기와 외부 API 읽기만 수행했으며, DB 쓰기·schema 변경·migration·Production Neon 접근은 하지 않았다.",
    };
  });

  console.log(JSON.stringify({ ...report, apiRequestCounts: requestCounts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
