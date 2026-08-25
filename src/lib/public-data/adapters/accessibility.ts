import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, SUCCESS_RESULT_CODE } from "../types";

/** 한국관광공사 무장애 여행정보 서비스 2의 공식 REST base URL. */
export const ACCESSIBILITY_BASE_URL = "https://apis.data.go.kr/B551011/KorWithService2";
export const ACCESSIBILITY_API_VERSION = "KorWithService2";
export const ACCESSIBILITY_LIST_SOURCE_CODE = "TOUR_ACCESSIBILITY_LIST";
export const ACCESSIBILITY_DETAIL_SOURCE_CODE = "TOUR_ACCESSIBILITY_DETAIL";

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

const accessibilityListItemSchema = z.object({
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
}).passthrough();

const accessibilityDetailItemSchema = z.object({
  contentid: requiredString,
  wheelchair: optionalString,
  exit: optionalString,
  elevator: optionalString,
  restroom: optionalString,
  guidesystem: optionalString,
  blindhandicapetc: optionalString,
  signguide: optionalString,
  videoguide: optionalString,
  hearingroom: optionalString,
  hearinghandicapetc: optionalString,
  stroller: optionalString,
  lactationroom: optionalString,
  babysparechair: optionalString,
  infantsfamilyetc: optionalString,
  auditorium: optionalString,
  room: optionalString,
  handicapetc: optionalString,
  braileblock: optionalString,
  helpdog: optionalString,
  guidehuman: optionalString,
  audioguide: optionalString,
  bigprint: optionalString,
  brailepromotion: optionalString,
  parking: optionalString,
  route: optionalString,
  publictransport: optionalString,
  ticketoffice: optionalString,
  promotion: optionalString,
}).passthrough();

export type AccessibilityListItem = z.infer<typeof accessibilityListItemSchema>;
export type AccessibilityDetailRawItem = z.infer<typeof accessibilityDetailItemSchema>;

export interface AccessibilityListPageResult {
  status: "SUCCESS" | "EMPTY" | "ERROR";
  items: AccessibilityListItem[];
  resultCode: string;
  resultMsg: string;
  totalCount: number;
  pageNo: number;
  pageSize: number;
  malformedItemCount: number;
  raw: unknown;
  httpStatus?: number;
}

export interface AccessibilityDetailResult {
  status: "SUCCESS" | "EMPTY" | "ERROR";
  items: Array<{ contentId: string; rawPayload: AccessibilityDetailRawItem }>;
  resultCode: string;
  resultMsg: string;
  malformedItemCount: number;
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

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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
  defaults: { pageNo: number; pageSize: number },
): {
  status: "SUCCESS" | "EMPTY" | "ERROR";
  items: T[];
  resultCode: string;
  resultMsg: string;
  totalCount: number;
  pageNo: number;
  pageSize: number;
  malformedItemCount: number;
} {
  const meta = extractResultMeta(raw);
  const resultCode = meta.resultCode ?? "UNKNOWN_ERROR_SHAPE";
  const resultMsg = meta.resultMsg ?? "공공데이터 응답 구조가 예상과 다릅니다.";
  const body = getBody(raw);
  const totalCount = numberValue(body?.totalCount, 0);
  const pageNo = numberValue(body?.pageNo, defaults.pageNo);
  const pageSize = numberValue(body?.numOfRows, defaults.pageSize);

  if (NO_DATA_RESULT_CODES.has(resultCode)) {
    return { status: "EMPTY", items: [], resultCode, resultMsg, totalCount, pageNo, pageSize, malformedItemCount: 0 };
  }
  if (resultCode !== SUCCESS_RESULT_CODE) {
    return { status: "ERROR", items: [], resultCode, resultMsg, totalCount, pageNo, pageSize, malformedItemCount: 0 };
  }

  const values = getItemValues(body);
  if (values === null) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "INVALID_RESPONSE_SHAPE",
      resultMsg: "response.body.items 구조가 예상과 다릅니다.",
      totalCount,
      pageNo,
      pageSize,
      malformedItemCount: 0,
    };
  }
  if (values.length === 0) {
    return { status: "EMPTY", items: [], resultCode, resultMsg, totalCount, pageNo, pageSize, malformedItemCount: 0 };
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
      pageNo,
      pageSize,
      malformedItemCount,
    };
  }
  return { status: "SUCCESS", items, resultCode, resultMsg, totalCount, pageNo, pageSize, malformedItemCount };
}

export function parseAccessibilityListResponse(raw: unknown, defaults = { pageNo: 1, pageSize: 1000 }): AccessibilityListPageResult {
  const parsed = parseEnvelopeItems(raw, accessibilityListItemSchema, defaults);
  return { ...parsed, raw };
}

export function parseAccessibilityDetailResponse(raw: unknown): AccessibilityDetailResult {
  const parsed = parseEnvelopeItems(raw, accessibilityDetailItemSchema, { pageNo: 1, pageSize: 1 });
  return {
    ...parsed,
    items: parsed.items.map((item) => ({ contentId: item.contentid, rawPayload: item })),
    raw,
  };
}

export function buildAccessibilityListUrl(params: {
  serviceKey: string;
  pageNo: number;
  pageSize: number;
  lDongRegnCd: string;
  lDongSignguCd: string;
}): string {
  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    _type: "json",
    numOfRows: String(params.pageSize),
    pageNo: String(params.pageNo),
    lDongRegnCd: params.lDongRegnCd,
    lDongSignguCd: params.lDongSignguCd,
  });
  return `${ACCESSIBILITY_BASE_URL}/areaBasedSyncList2?${query.toString()}`;
}

export function buildAccessibilityDetailUrl(params: { serviceKey: string; contentId: string }): string {
  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    contentId: params.contentId,
    _type: "json",
  });
  return `${ACCESSIBILITY_BASE_URL}/detailWithTour2?${query.toString()}`;
}

export async function fetchAccessibilityListPage(params: {
  serviceKey: string;
  pageNo: number;
  pageSize: number;
  lDongRegnCd: string;
  lDongSignguCd: string;
}): Promise<AccessibilityListPageResult> {
  const response = await fetchPublicDataJson(buildAccessibilityListUrl(params), { sourceCode: ACCESSIBILITY_LIST_SOURCE_CODE });
  if (!response.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: response.errorMessage ?? "공식 무장애 목록 API 호출에 실패했습니다.",
      totalCount: 0,
      pageNo: params.pageNo,
      pageSize: params.pageSize,
      malformedItemCount: 0,
      raw: null,
      httpStatus: response.status,
    };
  }
  return { ...parseAccessibilityListResponse(response.data, { pageNo: params.pageNo, pageSize: params.pageSize }), httpStatus: response.status };
}

export async function fetchAccessibilityDetail(params: { serviceKey: string; contentId: string }): Promise<AccessibilityDetailResult> {
  const response = await fetchPublicDataJson(buildAccessibilityDetailUrl(params), { sourceCode: ACCESSIBILITY_DETAIL_SOURCE_CODE });
  if (!response.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: response.errorMessage ?? "공식 무장애 상세 API 호출에 실패했습니다.",
      malformedItemCount: 0,
      raw: null,
      httpStatus: response.status,
    };
  }
  return { ...parseAccessibilityDetailResponse(response.data), httpStatus: response.status };
}
