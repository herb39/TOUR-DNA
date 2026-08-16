import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * KorService2 `detailIntro2` 응답 중 운영시간·휴무일에 필요한 필드만 다룬다.
 * contentTypeId별 필드명이 달라 문화시설(14)은 `usetimeculture`/`restdateculture`,
 * 관광지(12)는 `usetime`/`restdate`, 레포츠(28)는 `usetimeleports`/`restdateleports`,
 * 음식점(39)은 `opentimefood`/`restdatefood`를 사용한다.
 * 나머지 원본 필드는 passthrough로 보존해 호출부가 임의로 사실을 지어내지 않도록 한다.
 */
const detailItemSchema = z
  .object({
    contentid: z.string().optional(),
    contenttypeid: z.string().optional(),
    usetime: z.string().optional(),
    restdate: z.string().optional(),
    usetimeculture: z.string().optional(),
    restdateculture: z.string().optional(),
    usetimeleports: z.string().optional(),
    restdateleports: z.string().optional(),
    opentimefood: z.string().optional(),
    restdatefood: z.string().optional(),
  })
  .passthrough();

export type TourInfoDetailRawItem = z.infer<typeof detailItemSchema>;

export interface TourInfoDetailItem {
  contentId: string | null;
  contentTypeId: string | null;
  operatingHours: string | null;
  closedDays: string | null;
  rawPayload: TourInfoDetailRawItem;
}

export interface TourInfoDetailParams {
  serviceKey: string;
  baseUrl: string;
  contentId: string;
  contentTypeId: string;
}

export interface TourInfoDetailRaw {
  pages: unknown[];
}

export type TourInfoDetailResult = NormalizedItemsResult<TourInfoDetailItem> & { raw: TourInfoDetailRaw };

function nonBlank(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function pickByContentType(item: TourInfoDetailRawItem, contentTypeId: string | undefined): { operatingHours: string | null; closedDays: string | null } {
  const fieldsByType: Record<string, [keyof TourInfoDetailRawItem, keyof TourInfoDetailRawItem]> = {
    "12": ["usetime", "restdate"],
    "14": ["usetimeculture", "restdateculture"],
    "28": ["usetimeleports", "restdateleports"],
    "39": ["opentimefood", "restdatefood"],
  };
  const [hoursField, closedField] = fieldsByType[contentTypeId ?? ""] ?? ["usetimeculture", "restdateculture"];
  return {
    operatingHours: nonBlank(item[hoursField] as string | undefined),
    closedDays: nonBlank(item[closedField] as string | undefined),
  };
}

function normalizeItem(item: TourInfoDetailRawItem): TourInfoDetailItem {
  const { operatingHours, closedDays } = pickByContentType(item, item.contenttypeid);
  return {
    contentId: item.contentid ?? null,
    contentTypeId: item.contenttypeid ?? null,
    operatingHours,
    closedDays,
    rawPayload: item,
  };
}

function buildUrl(params: TourInfoDetailParams): string {
  const query = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    contentId: params.contentId,
    contentTypeId: params.contentTypeId,
    _type: "json",
  });
  return `${params.baseUrl}/detailIntro2?${query.toString()}`;
}

/** 한 POI의 상세 소개에서 운영시간·휴무일을 읽는다. 대량 동기화가 아니라 호출부가 명시적으로 선택한
 * POI에 대해서만 사용하며, 응답에 값이 없으면 null을 반환한다. */
export async function fetchTourInfoDetail(params: TourInfoDetailParams): Promise<TourInfoDetailResult> {
  const response = await fetchPublicDataJson(buildUrl(params), { sourceCode: "TOUR_INFO_DETAIL" });
  if (!response.ok) {
    return {
      status: "ERROR",
      items: [],
      resultCode: "NETWORK_ERROR",
      resultMsg: response.errorMessage ?? "unknown",
      raw: { pages: [] },
    };
  }

  const rawPages: unknown[] = [response.data];
  try {
    const parsed = parsePublicDataEnvelope(detailItemSchema, response.data);
    return {
      ...parsed,
      items: parsed.items.map(normalizeItem),
      raw: { pages: rawPages },
    };
  } catch {
    const meta = extractResultMeta(response.data);
    return {
      status: "ERROR",
      items: [],
      resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
      resultMsg: meta.resultMsg ?? "응답 구조가 예상과 달라 파싱하지 못함",
      raw: { pages: rawPages },
    };
  }
}
