import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_국문 관광정보 서비스_GW (KorService2, TourAPI 4.0 계열).
 * 실 서비스키로 확인된 사항(2026-07-21):
 * - base: https://apis.data.go.kr/B551011/KorService2
 * - 지역기반 목록 조회: /areaBasedList2 (실제 데이터 확인됨 — 대전 유성구 "갑천" 등)
 * - areaCode는 구식 TourAPI 코드(1~39, 대전=3/충북=33/강원=32 확인)로, AreaTarDemDsService 등의
 *   통계청 코드와는 다른 체계다(Region.tourApiAreaCode에 별도 저장).
 * - contentTypeId(공식 문서 기준): 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠,
 *   32=숙박, 38=쇼핑, 39=음식점.
 * - cat1/cat2/cat3(대/중/소분류): 실 서비스키로 확인됨(2026-07-24). 음식점(contentTypeId=39)은
 *   cat1="A05", cat2="A0502" 고정이고, 실제 데이터·categoryCode2(공식 분류 코드 조회) 응답 기준
 *   cat3는 아래 FOOD_SUBCATEGORY_NAME_BY_CAT3의 7개뿐이다(대전/강원 표본 200건에서 cat3 누락 0건).
 */

const itemSchema = z.object({
  contentid: z.string().optional(),
  contenttypeid: z.string().optional(),
  title: z.string(),
  addr1: z.string().optional(),
  areacode: z.string().optional(),
  sigungucode: z.string().optional(),
  mapx: z.coerce.number().optional(),
  mapy: z.coerce.number().optional(),
  tel: z.string().optional(),
  /** 대분류(음식점=A05). */
  cat1: z.string().optional(),
  /** 중분류(음식점 하위=A0502). */
  cat2: z.string().optional(),
  /** 소분류 — 음식점의 실제 식사 가능 여부 판별에 쓴다(MEAL_ELIGIBLE_FOOD_CAT3_CODES 참고). */
  cat3: z.string().optional(),
});

export type TourInfoItem = z.infer<typeof itemSchema>;

export const CONTENT_TYPE_ID = {
  ATTRACTION: "12",
  CULTURE: "14",
  FESTIVAL: "15",
  COURSE: "25",
  LEISURE_SPORTS: "28",
  LODGING: "32",
  SHOPPING: "38",
  FOOD: "39",
} as const;

/**
 * contentTypeId → PoiCategory(schema.prisma) 매핑. "여행코스"(25)는 개별 장소가 아니라 여러 장소를
 * 묶은 코스라서 POI로 upsert하지 않는다(null 반환).
 */
export function mapContentTypeToPoiCategory(
  contentTypeId: string | undefined,
): "ATTRACTION" | "FOOD" | "LODGING" | "EXPERIENCE" | "FESTIVAL" | "SHOPPING" | null {
  switch (contentTypeId) {
    case CONTENT_TYPE_ID.ATTRACTION:
    case CONTENT_TYPE_ID.CULTURE:
      return "ATTRACTION";
    case CONTENT_TYPE_ID.FESTIVAL:
      return "FESTIVAL";
    case CONTENT_TYPE_ID.LEISURE_SPORTS:
      return "EXPERIENCE";
    case CONTENT_TYPE_ID.LODGING:
      return "LODGING";
    case CONTENT_TYPE_ID.SHOPPING:
      return "SHOPPING";
    case CONTENT_TYPE_ID.FOOD:
      return "FOOD";
    default:
      return null;
  }
}

/**
 * 음식점(contentTypeId=39, cat1=A05, cat2=A0502) 하위 cat3 코드 → 명칭. 실 서비스키로
 * `categoryCode2`(공식 분류 코드 조회) 엔드포인트를 직접 호출해 확인했다(2026-07-24, 대전 기준,
 * cat1=A05·cat2=A0502 조건, totalCount=7 — 이 7개가 전부다). TourAPI는 디저트·베이커리·주점을
 * 별도 코드로 구분하지 않는다 — 실제 데이터에서 "성심당"(베이커리) 같은 곳도 카페/전통찻집
 * (A05020900) 하나로 들어온다.
 */
export const FOOD_SUBCATEGORY_NAME_BY_CAT3: Record<string, string> = {
  A05020100: "한식",
  A05020200: "서양식",
  A05020300: "일식",
  A05020400: "중식",
  A05020700: "이색음식점",
  A05020900: "카페/전통찻집",
  A05021000: "클럽",
};

/** 카페/전통찻집·클럽처럼 "장소 유형상 정식 식사가 어렵다"고 명확히 확인된 cat3만 여기 둔다.
 * 나머지(한식/서양식/일식/중식/이색음식점)는 일반적인 식사가 가능한 음식점으로 본다. */
const NON_MEAL_FOOD_CAT3_CODES = new Set(["A05020900", "A05021000"]);

/** cat3 기준으로 이 음식점이 점심·저녁 후보로 쓸 수 있는 "식사 가능" 장소인지 판별한다. cat3가
 * 없거나(구버전 데이터 등) 알려진 코드가 아니면 안전하게 false(식사 불가로 간주 — 잘못 배치하는 것보다
 * 식사 슬롯을 생략하는 쪽을 우선한다). */
export function isMealEligibleFoodCat3(cat3: string | null | undefined): boolean {
  if (!cat3) return false;
  if (!(cat3 in FOOD_SUBCATEGORY_NAME_BY_CAT3)) return false;
  return !NON_MEAL_FOOD_CAT3_CODES.has(cat3);
}

export interface TourInfoParams {
  serviceKey: string;
  baseUrl: string;
  /** 구식 TourAPI areaCode(1~39). Region.tourApiAreaCode. */
  areaCode: string;
  sigunguCode?: string;
  contentTypeId?: string;
}

const ROWS_PER_PAGE = 1000;
// areaCode는 시/도 단위라 한 페이지(1000건)로는 전체를 못 덮는 도가 많다(예: 강원 3,198건). 이후 주소
// 기반으로 시/군/구 단위까지 걸러내야 하므로, 몇 페이지 더 가져와 필터링 후 남는 양을 확보한다.
const MAX_PAGES = 5;

function buildUrl(baseUrl: string, params: TourInfoParams, pageNo: number): string {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCode: params.areaCode,
    numOfRows: String(ROWS_PER_PAGE),
    pageNo: String(pageNo),
    _type: "json",
  });
  if (params.sigunguCode) qs.set("sigunguCode", params.sigunguCode);
  if (params.contentTypeId) qs.set("contentTypeId", params.contentTypeId);
  return `${baseUrl}/areaBasedList2?${qs.toString()}`;
}

/** 실제로 받은 페이지 원본 응답들(있는 만큼만 — 지어내지 않음). */
export interface TourInfoRaw {
  pages: unknown[];
}

type AdapterResult =
  | (NormalizedItemsResult<TourInfoItem> & { raw: TourInfoRaw })
  | { status: "ERROR"; items: []; resultCode: string; resultMsg: string; raw: TourInfoRaw };

export async function fetchTourInfo(params: TourInfoParams): Promise<AdapterResult> {
  const firstRes = await fetchPublicDataJson(buildUrl(params.baseUrl, params, 1), { sourceCode: "TOUR_INFO" });
  if (!firstRes.ok) {
    // 네트워크/timeout 등으로 실제 응답 본문 자체가 없다 — raw.pages는 빈 배열(지어내지 않음).
    return { status: "ERROR", items: [], resultCode: "NETWORK_ERROR", resultMsg: firstRes.errorMessage ?? "unknown", raw: { pages: [] } };
  }

  const rawPages: unknown[] = [firstRes.data];
  let first: NormalizedItemsResult<TourInfoItem>;
  try {
    first = parsePublicDataEnvelope(itemSchema, firstRes.data);
  } catch {
    const meta = extractResultMeta(firstRes.data);
    return {
      status: "ERROR",
      items: [],
      resultCode: meta.resultCode ?? "UNKNOWN_ERROR_SHAPE",
      resultMsg: meta.resultMsg ?? "응답 구조가 예상과 달라 파싱하지 못함",
      raw: { pages: rawPages },
    };
  }
  const items = [...first.items];

  const totalCount =
    (firstRes.data as { response?: { body?: { totalCount?: number } } })?.response?.body?.totalCount ?? items.length;
  const totalPages = Math.min(MAX_PAGES, Math.ceil(totalCount / ROWS_PER_PAGE));
  for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
    const res = await fetchPublicDataJson(buildUrl(params.baseUrl, params, pageNo), { sourceCode: "TOUR_INFO" });
    if (!res.ok) break;
    rawPages.push(res.data);
    try {
      items.push(...parsePublicDataEnvelope(itemSchema, res.data).items);
    } catch {
      break;
    }
  }

  return {
    status: items.length === 0 ? "EMPTY" : "SUCCESS",
    items,
    resultCode: first.resultCode,
    resultMsg: first.resultMsg,
    raw: { pages: rawPages },
  };
}
