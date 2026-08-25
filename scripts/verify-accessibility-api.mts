/**
 * 무장애 API 승인 반영 여부와 실제 응답 품질을 최소 범위로 확인하는 읽기 전용 스크립트.
 *
 * 제품 adapter·DB schema·PoiConditionEvidence 저장 경로는 변경하지 않는다.
 * Region master에서 법정동 코드를 읽어 대표 SIGUNGU 한 곳의 목록을 1회 조회하고,
 * local POI와 정확히 매칭된 대상이 있을 때만 category 균형 기준으로 detailWithTour2를
 * 최대 8회 조회한다. 응답 원문은 저장하지 않고 필드명·값 형태·coverage 요약만 출력한다.
 */
import { prisma } from "../src/lib/db";
import { isFestivalAnchorItem, type CourseDay } from "../src/lib/domain/planBuilder";
import { resolvePetTourRegionCodes } from "../src/lib/domain/petTourRegion";
import { fetchPublicDataJson } from "../src/lib/public-data/client";
import { withRequestCounter } from "../src/lib/public-data/requestCounter";
import { buildRecommendedPoiCandidates } from "../src/lib/services/candidatePoolService";
import { preferredThemeLabels } from "../src/lib/validation/project-preferences";

const ACCESSIBILITY_BASE_URL = "https://apis.data.go.kr/B551011/KorWithService2";
const LIST_ENDPOINT = "areaBasedSyncList2" as const;
const LIST_SOURCE_CODE = "TOUR_ACCESSIBILITY_LIST";
const DETAIL_SOURCE_CODE = "TOUR_ACCESSIBILITY_DETAIL";
const DEFAULT_REGION_CODE = "SGG_GYEONGJU";
const REPRESENTATIVE_PROJECT_ID = "cmsyyjt82000050ilm31nygzn";
const DETAIL_LIMIT = 8;
const REQUESTED_REGION_CODE = process.argv.find((argument) => argument.startsWith("--region-code="))?.slice("--region-code=".length) ?? DEFAULT_REGION_CODE;
const LIST_ONLY = process.argv.includes("--list-only");
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

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function responseStatus(result: { ok: boolean; status?: number; errorMessage?: string }): number | null {
  if (result.status !== undefined) return result.status;
  const matched = result.errorMessage?.match(/HTTP\s+(\d{3})/i);
  return matched ? Number(matched[1]) : null;
}

function responseMeta(data: unknown): { resultCode: string | null; resultMsg: string | null; totalCount: number; items: RecordValue[] } {
  if (!isRecord(data)) return { resultCode: null, resultMsg: null, totalCount: 0, items: [] };
  const rootResultCode = text(data.resultCode);
  const rootResultMsg = text(data.resultMsg);
  const response = isRecord(data.response) ? data.response : null;
  const header = response && isRecord(response.header) ? response.header : null;
  const body = response && isRecord(response.body) ? response.body : null;
  const resultCode = text(header?.resultCode) ?? rootResultCode;
  const resultMsg = text(header?.resultMsg) ?? rootResultMsg;
  const totalCountValue = body?.totalCount;
  const totalCount = Number(totalCountValue ?? 0);
  const itemsValue = body && isRecord(body.items) ? body.items.item : null;
  const values = itemsValue === "" || itemsValue === null || itemsValue === undefined ? [] : Array.isArray(itemsValue) ? itemsValue : [itemsValue];
  return {
    resultCode,
    resultMsg,
    totalCount: Number.isFinite(totalCount) ? totalCount : 0,
    items: values.filter(isRecord),
  };
}

function buildListUrl(serviceKey: string, region: { lDongRegnCd: string; lDongSignguCd: string }): string {
  const query = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    _type: "json",
    numOfRows: "100",
    pageNo: "1",
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

function valueState(value: unknown): "MISSING" | "EMPTY_STRING" | "NULL" | "NON_EMPTY_STRING" | "OTHER" {
  if (value === undefined) return "MISSING";
  if (value === null) return "NULL";
  if (typeof value === "string") return value.trim().length === 0 ? "EMPTY_STRING" : "NON_EMPTY_STRING";
  return "OTHER";
}

function fieldQuality(items: RecordValue[]): Record<string, Record<string, number>> {
  const fields = uniqueStrings(items.flatMap((item) => Object.keys(item)));
  return Object.fromEntries(
    fields.map((field) => {
      const counts: Record<string, number> = {};
      for (const item of items) {
        const state = valueState(item[field]);
        counts[state] = (counts[state] ?? 0) + 1;
      }
      return [field, counts];
    }),
  );
}

function semanticState(value: unknown): "EXPLICIT_AVAILABLE" | "EXPLICIT_UNAVAILABLE" | "CONDITIONAL_OR_RESTRICTED" | "FREE_TEXT" | "UNKNOWN" {
  if (value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)) return "UNKNOWN";
  const normalized = String(value).replace(/\s+/g, "");
  if (/없음|불가|불가능|미설치|미제공|없다/.test(normalized)) return "EXPLICIT_UNAVAILABLE";
  if (/문의|확인|예약|사전|일부|조건|제한|필요|협의/.test(normalized)) return "CONDITIONAL_OR_RESTRICTED";
  if (/가능|있음|설치|구비|제공|확보|완비|접근/.test(normalized)) return "EXPLICIT_AVAILABLE";
  return "FREE_TEXT";
}

function semanticQuality(items: RecordValue[]): Record<string, Record<string, number>> {
  const fields = uniqueStrings(items.flatMap((item) => Object.keys(item)));
  return Object.fromEntries(
    fields.map((field) => {
      const counts: Record<string, number> = {};
      for (const item of items) {
        const state = semanticState(item[field]);
        counts[state] = (counts[state] ?? 0) + 1;
      }
      return [field, counts];
    }),
  );
}

function asCourseDays(value: unknown): CourseDay[] {
  if (!isRecord(value) || !Array.isArray(value.days)) return [];
  return value.days as CourseDay[];
}

function coursePoiIds(course: unknown): string[] {
  return asCourseDays(course).flatMap((day) => [
    ...(day.items ?? []).filter((item) => !isFestivalAnchorItem(item)).map((item) => item.poiId),
    ...(day.lodging ? [day.lodging.poiId] : []),
  ]);
}

function categoryCounts(rows: Array<{ category: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
    return counts;
  }, {});
}

function chooseDetailTargets(rows: Array<{ id: string; externalId: string; category: string }>): Array<{ id: string; externalId: string; category: string }> {
  const sorted = [...rows].sort((left, right) => left.externalId.localeCompare(right.externalId) || left.id.localeCompare(right.id));
  const selected: typeof sorted = [];
  for (const category of CATEGORY_ORDER) {
    const candidate = sorted.find((row) => row.category === category && !selected.some((item) => item.id === row.id));
    if (candidate) selected.push(candidate);
  }
  for (const row of sorted) {
    if (selected.length >= DETAIL_LIMIT) break;
    if (!selected.some((item) => item.id === row.id)) selected.push(row);
  }
  return selected;
}

async function main(): Promise<void> {
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) throw new Error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다.");

  const region = await prisma.region.findUnique({
    where: { code: REQUESTED_REGION_CODE },
    select: { id: true, code: true, name: true, apiAreaCode: true, apiSigunguCode: true, tourApiLdongRegnCd: true, tourApiLdongSignguCd: true },
  });
  if (!region) throw new Error(`Region master에서 ${REQUESTED_REGION_CODE}를 찾지 못했습니다.`);
  const resolved = resolvePetTourRegionCodes(region);
  if (!resolved.lDongRegnCd || !resolved.lDongSignguCd) throw new Error("Region master의 법정동 코드가 비어 있습니다.");

  const listUrl = buildListUrl(serviceKey, { lDongRegnCd: resolved.lDongRegnCd, lDongSignguCd: resolved.lDongSignguCd });
  const { result: listResponse, requestCounts } = await withRequestCounter(() =>
    fetchPublicDataJson(listUrl, { sourceCode: LIST_SOURCE_CODE, timeoutMs: 10000, maxRetries: 0 }),
  );
  const listMeta = listResponse.ok ? responseMeta(listResponse.data) : { resultCode: null, resultMsg: listResponse.errorMessage ?? null, totalCount: 0, items: [] };
  const officialByContentId = new Map<string, RecordValue>();
  for (const item of listMeta.items) {
    const contentId = text(item.contentid);
    if (contentId && !officialByContentId.has(contentId)) officialByContentId.set(contentId, item);
  }
  const officialContentIds = [...officialByContentId.keys()];

  const localPois = await prisma.poi.findMany({
    where: { regionId: region.id, sourceType: "API" },
    select: { id: true, externalId: true, category: true, name: true },
  });
  const localByExternalId = new Map(localPois.filter((poi) => poi.externalId).map((poi) => [poi.externalId as string, poi]));
  const matched = officialContentIds.map((contentId) => localByExternalId.get(contentId)).filter((poi): poi is NonNullable<typeof poi> => Boolean(poi));
  const intersectionIds = new Set(matched.map((poi) => poi.externalId as string));
  const categoryDistribution = categoryCounts(matched);
  const detailTargets = LIST_ONLY
    ? []
    : chooseDetailTargets(matched.map((poi) => ({ id: poi.id, externalId: poi.externalId as string, category: poi.category })));

  const detailResults: Array<{ contentId: string; category: string; status: number | null; resultCode: string | null; resultMsg: string | null; items: RecordValue[] }> = [];
  for (const target of detailTargets) {
    const detailResponse = await fetchPublicDataJson(buildDetailUrl(serviceKey, target.externalId), {
      sourceCode: DETAIL_SOURCE_CODE,
      timeoutMs: 10000,
      maxRetries: 0,
    });
    const meta = detailResponse.ok
      ? responseMeta(detailResponse.data)
      : { resultCode: null, resultMsg: detailResponse.errorMessage ?? null, totalCount: 0, items: [] };
    detailResults.push({
      contentId: target.externalId,
      category: target.category,
      status: responseStatus(detailResponse),
      resultCode: meta.resultCode,
      resultMsg: meta.resultMsg,
      items: meta.items,
    });
  }

  const project = LIST_ONLY
    ? null
    : await prisma.project.findUnique({
        where: { id: REPRESENTATIVE_PROJECT_ID },
        include: { region: true, input: true, selectedPlan: true, analysisResult: { include: { strategyResults: true } } },
      });
  let candidateOverlap: Record<string, unknown> = { status: "NOT_AVAILABLE" };
  if (project?.input && project.selectedPlan && project.analysisResult) {
    const strategy = project.analysisResult.strategyResults.find((item) => item.id === project.selectedStrategyResultId);
    if (strategy) {
      const candidates = await buildRecommendedPoiCandidates({
        templateId: strategy.templateId,
        regionCode: project.region.code,
        travelMonth: project.travelMonth,
        preferredThemes: preferredThemeLabels(project.input.preferredThemes),
        existingPoiIds: coursePoiIds(project.selectedPlan.course),
      });
      const candidateRows = candidates.map((candidate) => {
        const poi = localPois.find((item) => item.id === candidate.id);
        const externalId = poi?.externalId ?? null;
        return { id: candidate.id, name: candidate.name, category: candidate.category, externalId, inOfficialList: externalId !== null && intersectionIds.has(externalId) };
      });
      candidateOverlap = {
        status: "AVAILABLE",
        total: candidateRows.length,
        officialListOverlap: candidateRows.filter((row) => row.inOfficialList).length,
        notInOfficialList: candidateRows.filter((row) => !row.inOfficialList).length,
        categoryDistribution: categoryCounts(candidateRows),
        rows: candidateRows.map(({ name, category, externalId, inOfficialList }) => ({ name, category, externalId, inOfficialList })),
      };
    }
  }

  const detailItems = detailResults.flatMap((result) => result.items);
  const actualFields = uniqueStrings(detailItems.flatMap((item) => Object.keys(item)));
  const fieldQualityByField = fieldQuality(detailItems);
  const semanticQualityByField = semanticQuality(detailItems);
  const expectedFieldPresence = Object.fromEntries(ACCESSIBILITY_FIELD_HINTS.map((field) => [field, fieldQualityByField[field] ?? { MISSING: detailItems.length }]));
  const httpStatuses = [...new Set([responseStatus(listResponse), ...detailResults.map((result) => result.status)].filter((status): status is number => status !== null))];
  const apiRequestCounts = {
    byDataSource: { ...requestCounts.byDataSource, ...(detailResults.length > 0 ? { [DETAIL_SOURCE_CODE]: detailResults.length } : {}) },
    total: requestCounts.total + detailResults.length,
  };

  console.log(JSON.stringify({
    scope: {
      regionCode: region.code,
      regionName: region.name,
      apiCodes: resolved,
      endpoint: `${ACCESSIBILITY_BASE_URL}/${LIST_ENDPOINT}`,
      detailEndpoint: `${ACCESSIBILITY_BASE_URL}/detailWithTour2`,
    },
    list: {
      httpStatus: responseStatus(listResponse),
      ok: listResponse.ok,
      resultCode: listMeta.resultCode,
      resultMsg: listMeta.resultMsg,
      totalCount: listMeta.totalCount,
      returnedContentIdCount: officialContentIds.length,
      actualItemFields: uniqueStrings(listMeta.items.flatMap((item) => Object.keys(item))),
      fieldQuality: fieldQuality(listMeta.items),
      sampleFieldPresence: Object.fromEntries(
        ["contentid", "contenttypeid", "title", "addr1", "addr2", "lDongRegnCd", "lDongSignguCd", "mapx", "mapy", "modifiedtime", "showflag"].map((field) => [field, fieldQuality(listMeta.items)[field] ?? { MISSING: listMeta.items.length }]),
      ),
    },
    localPoi: {
      apiPoiCount: localPois.length,
      officialListOverlap: matched.length,
      overlapRate: localPois.length === 0 ? null : matched.length / localPois.length,
      categoryDistribution,
    },
    detail: {
      attempted: detailResults.length,
      httpStatuses,
      results: detailResults.map(({ contentId, category, status, resultCode, resultMsg, items }) => ({ contentId, category, httpStatus: status, resultCode, resultMsg, returnedItemCount: items.length })),
      actualFields,
      fieldQuality: fieldQualityByField,
      expectedFieldPresence,
      semanticQuality: semanticQualityByField,
    },
    candidateOverlap,
    modelJudgement: detailItems.length === 0
      ? "BLOCKED_OR_NO_DETAIL_SAMPLE"
      : "B_EXISTING_EVIDENCE_ENVELOPE_WITH_JSON_DIMENSION_DETAIL",
    apiRequestCounts,
    note: `목록·상세 원문은 저장하지 않았고, DB 쓰기·schema 변경·Neon 접근은 하지 않았다. ${LIST_ONLY ? "이 실행은 목록만 확인했다." : "상세 호출은 목록 교집합에서만 최대 8건 수행했다."}`,
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
