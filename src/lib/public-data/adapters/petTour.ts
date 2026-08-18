import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, SUCCESS_RESULT_CODE } from "../types";

/** 한국관광공사 반려동물 동반여행 서비스 2의 공식 REST base URL. */
export const PET_TOUR_BASE_URL = "https://apis.data.go.kr/B551011/KorPetTourService2";
export const PET_TOUR_API_VERSION = "KorPetTourService2";
export const PET_TOUR_LIST_SOURCE_CODE = "TOUR_PET_LIST";
export const PET_TOUR_SYNC_SOURCE_CODE = "TOUR_PET_SYNC";
export const PET_TOUR_DETAIL_SOURCE_CODE = "TOUR_PET_DETAIL";

const optionalString = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  },
  z.string().optional(),
);

const requiredString = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return value;
    return String(value).trim();
  },
  z.string().min(1),
);

const petTourListItemSchema = z
  .object({
    contentid: requiredString,
    contenttypeid: optionalString,
    title: optionalString,
    addr1: optionalString,
    addr2: optionalString,
    lDongRegnCd: optionalString,
    lDongSignguCd: optionalString,
    areacode: optionalString,
    sigungucode: optionalString,
    mapx: optionalString,
    mapy: optionalString,
    createdtime: optionalString,
    modifiedtime: optionalString,
    showflag: optionalString,
  })
  .passthrough();

export type PetTourListItem = z.infer<typeof petTourListItemSchema>;

const petTourDetailItemSchema = z
  .object({
    contentid: requiredString,
    relaAcdntRiskMtr: optionalString,
    acmpyTypeCd: optionalString,
    relaPosesFclty: optionalString,
    relaFrnshPrdlst: optionalString,
    etcAcmpyInfo: optionalString,
    relaPurcPrdlst: optionalString,
    acmpyPsblCpam: optionalString,
    relaRntlPrdlst: optionalString,
    acmpyNeedMtr: optionalString,
  })
  .passthrough();

export type PetTourDetailRawItem = z.infer<typeof petTourDetailItemSchema>;

export interface PetTourDetailItem {
  contentId: string;
  rawPayload: PetTourDetailRawItem;
}

export interface PetTourListPageResult {
  status: "SUCCESS" | "EMPTY" | "ERROR";
  items: PetTourListItem[];
  resultCode: string;
  resultMsg: string;
  totalCount: number;
  raw: unknown;
  malformedItemCount: number;
  httpStatus?: number;
}

export interface PetTourDetailResult {
  status: "SUCCESS" | "EMPTY" | "ERROR";
  items: PetTourDetailItem[];
  resultCode: string;
  resultMsg: string;
  raw: unknown;
  httpStatus?: number;
}

const NO_DATA_RESULT_CODES = new Set(["03", "NO_DATA", "NO_DATA_FOUND"]);

function getBody(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const response = (raw as Record<string, unknown>).response;
  if (!response || typeof response !== "object") return null;
  const body = (response as Record<string, unknown>).body;
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}

function getTotalCount(body: Record<string, unknown> | null): number {
  const value = body?.totalCount;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function getItemValues(body: Record<string, unknown> | null): unknown[] | null {
  const items = body?.items;
  if (items === "") return [];
  if (!items || typeof items !== "object" || Array.isArray(items)) return null;
  const item = (items as Record<string, unknown>).item;
  if (item === "" || item === undefined || item === null) return [];
  return Array.isArray(item) ? item : [item];
}

function parseEnvelopeItems<T>(
  raw: unknown,
  schema: z.ZodType<T>,
): { status: "SUCCESS" | "EMPTY" | "ERROR"; items: T[]; resultCode: string; resultMsg: string; totalCount: number; malformedItemCount: number } {
  const meta = extractResultMeta(raw);
  const resultCode = meta.resultCode ?? "UNKNOWN_ERROR_SHAPE";
  const resultMsg = meta.resultMsg ?? "공공데이터 응답 구조가 예상과 다릅니다.";
  const body = getBody(raw);
  const totalCount = getTotalCount(body);

  if (NO_DATA_RESULT_CODES.has(resultCode)) {
    return { status: "EMPTY", items: [], resultCode, resultMsg, totalCount, malformedItemCount: 0 };
  }
  if (resultCode !== SUCCESS_RESULT_CODE) {
    return { status: "ERROR", items: [], resultCode, resultMsg, totalCount, malformedItemCount: 0 };
  }

  const values = getItemValues(body);
  if (values === null) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "INVALID_RESPONSE_SHAPE",
      resultMsg: "response.body.items 구조가 예상과 다릅니다.",
      totalCount,
      malformedItemCount: 0,
    };
  }
  if (values.length === 0) {
    return { status: "EMPTY", items: [], resultCode, resultMsg, totalCount, malformedItemCount: 0 };
  }

  const items: T[] = [];
  let malformedItemCount = 0;
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (parsed.success) items.push(parsed.data);
    else malformedItemCount++;
  }

  if (items.length === 0) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "MALFORMED_ITEM",
      resultMsg: "응답 항목에 유효한 contentid가 없어 저장하지 않았습니다.",
      totalCount,
      malformedItemCount,
    };
  }
  return { status: "SUCCESS", items, resultCode, resultMsg, totalCount, malformedItemCount };
}

/** 목록 응답 단위 테스트와 수집 서비스가 함께 사용하는 보수적 parser. */
export function parsePetTourListResponse(raw: unknown): PetTourListPageResult {
  const parsed = parseEnvelopeItems(raw, petTourListItemSchema);
  return { ...parsed, raw };
}

/** 상세 응답은 공식 계약상 contentId만 받는다. contentTypeId를 추가하지 않는다. */
export function parsePetTourDetailResponse(raw: unknown): PetTourDetailResult {
  const parsed = parseEnvelopeItems(raw, petTourDetailItemSchema);
  return {
    ...parsed,
    items: parsed.items.map((item) => ({ contentId: item.contentid, rawPayload: item })),
    raw,
  };
}

function buildListUrl(params: {
  serviceKey: string;
  endpoint: "areaBasedList2" | "petTourSyncList2";
  pageNo: number;
  pageSize: number;
  lDongRegnCd?: string;
  lDongSignguCd?: string;
  modifiedtime?: string;
}): string {
  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    _type: "json",
    numOfRows: String(params.pageSize),
    pageNo: String(params.pageNo),
  });
  for (const [key, value] of Object.entries({
    lDongRegnCd: params.lDongRegnCd,
    lDongSignguCd: params.lDongSignguCd,
    modifiedtime: params.modifiedtime,
  })) {
    if (value) query.set(key, value);
  }
  return `${PET_TOUR_BASE_URL}/${params.endpoint}?${query.toString()}`;
}

export function buildPetTourDetailUrl(params: { serviceKey: string; contentId: string }): string {
  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    contentId: params.contentId,
    _type: "json",
  });
  return `${PET_TOUR_BASE_URL}/detailPetTour2?${query.toString()}`;
}

export async function fetchPetTourListPage(params: {
  serviceKey: string;
  endpoint: "areaBasedList2" | "petTourSyncList2";
  pageNo: number;
  pageSize: number;
  lDongRegnCd?: string;
  lDongSignguCd?: string;
  modifiedtime?: string;
}): Promise<PetTourListPageResult> {
  const sourceCode = params.endpoint === "petTourSyncList2" ? PET_TOUR_SYNC_SOURCE_CODE : PET_TOUR_LIST_SOURCE_CODE;
  const response = await fetchPublicDataJson(buildListUrl(params), { sourceCode });
  if (!response.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: response.errorMessage ?? "공식 목록 API 호출에 실패했습니다.",
      totalCount: 0,
      raw: null,
      malformedItemCount: 0,
      httpStatus: response.status,
    };
  }
  return { ...parsePetTourListResponse(response.data), httpStatus: response.status };
}

export async function fetchPetTourDetail(params: { serviceKey: string; contentId: string }): Promise<PetTourDetailResult> {
  const response = await fetchPublicDataJson(buildPetTourDetailUrl(params), { sourceCode: PET_TOUR_DETAIL_SOURCE_CODE });
  if (!response.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: response.errorMessage ?? "공식 상세 API 호출에 실패했습니다.",
      raw: null,
      httpStatus: response.status,
    };
  }
  return { ...parsePetTourDetailResponse(response.data), httpStatus: response.status };
}
