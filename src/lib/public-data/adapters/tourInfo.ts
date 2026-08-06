import { z } from "zod";
import { fetchPublicDataJson } from "../client";
import { extractResultMeta, parsePublicDataEnvelope, type NormalizedItemsResult } from "../types";

/**
 * 한국관광공사_국문 관광정보 서비스_GW (KorService2, TourAPI 4.2 신 법정동·분류체계).
 * 2026-07-27 구코드(areaCode/sigunguCode/cat1-3) → 신코드(lDongRegnCd/lDongSignguCd/lclsSystm1-3)
 * 전환. 실 서비스키로 확인된 사항(2026-07-21, 구코드 기준):
 * - base: https://apis.data.go.kr/B551011/KorService2
 * - 지역기반 목록 조회: /areaBasedList2 (실제 데이터 확인됨 — 대전 유성구 "갑천" 등, 엔드포인트 자체는
 *   신구 체계 전환과 무관하게 유지된다)
 * - contentTypeId(공식 문서 기준): 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠,
 *   32=숙박, 38=쇼핑, 39=음식점(신구 체계와 무관, 변경 없음).
 *
 * 신 법정동 코드(`lDongRegnCd`/`lDongSignguCd`)와 신 분류체계 코드(`lclsSystm1~3`)는 2026-07-28 실
 * 서비스키로 `ldongCode2`/`lclsSystmCode2`를 직접 호출해 확인했다(이전 세션의 401은 승인되지 않은
 * 키였던 것으로 확인됨 — 새 키로 재시도해 정상 응답을 받았다). `areaBasedList2` 실 응답에서 구
 * 필드(`areacode`/`sigungucode`/`cat1~3`)는 전부 빈 문자열로 오고, 신 필드(`lDongRegnCd`/
 * `lDongSignguCd`/`lclsSystm1~3`)에 실제 값이 채워져 있음을 확인했다(2026-07-28, `lDongRegnCd=43&
 * lDongSignguCd=150` 요청이 실제로 충북 제천시 항목만 반환).
 */

/** mapx/mapy가 문자열 리터럴 `"null"`로 오는 응답이 실제로 있다(2026-08-07, 가평군 "몽덕산" 등에서
 * 확인 — 좌표 자체가 없는 정상적인 케이스). `z.coerce.number()`는 이 값을 NaN으로 변환해버려 파싱
 * 자체가 실패했고, 그 결과 이 항목 하나 때문에 해당 페이지 전체(다른 정상 항목까지)가 버려졌다.
 * 좌표를 지어내지 않고 그냥 undefined로 처리해 이 항목만 좌표 없음으로 건너뛰게 한다(호출부
 * syncService.ts가 이미 `mapx === undefined` 항목을 건너뛰는 로직을 갖고 있다 — 그 경로를 정상적으로
 * 타게 하는 것뿐, 새 필터링 로직을 추가하지 않는다). */
const coordinateSchema = z
  .preprocess((v) => {
    if (v === "null" || v === null || v === undefined) return undefined;
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : undefined;
  }, z.number().optional())
  .optional();

const itemSchema = z.object({
  contentid: z.string().optional(),
  contenttypeid: z.string().optional(),
  title: z.string(),
  addr1: z.string().optional(),
  /** 법정동 시도 코드(신 체계). ldongCode2로 조회하는 코드와 같은 체계. */
  lDongRegnCd: z.string().optional(),
  /** 법정동 시군구 코드(신 체계). */
  lDongSignguCd: z.string().optional(),
  mapx: coordinateSchema,
  mapy: coordinateSchema,
  tel: z.string().optional(),
  /** 신 분류체계 대분류(예: 음식=FD 계열 — 정확한 코드는 lclsSystmCode2로 확인 필요, 아래 파일 상단 주석 참고). */
  lclsSystm1: z.string().optional(),
  /** 신 분류체계 중분류. */
  lclsSystm2: z.string().optional(),
  /** 신 분류체계 소분류 — 음식점의 실제 식사 가능 여부(카페 vs 일반 식사) 판별에 쓴다. */
  lclsSystm3: z.string().optional(),
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
 * 묶은 코스라서 POI로 upsert하지 않는다(null 반환). 신구 분류체계 전환과 무관 — contentTypeId는
 * 변경되지 않았다.
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
 * 음식점(lclsSystm1="FD") 하위 lclsSystm3 코드 → 명칭. 2026-07-28 실 서비스키로 `lclsSystmCode2`를
 * 직접 호출해 확인했다(대분류 FD="음식" 하위 중분류 5개: FD01 한식/FD02 외국식/FD03 간이음식/FD04
 * 주점/FD05 카페·찻집, 그 아래 소분류 총 21개 — 이 21개가 전부다). 구 cat3(7개, 한식·서양식·일식·
 * 중식·이색음식점·카페전통찻집·클럽)보다 훨씬 세분화됐다 — 특히 구 체계에서는 없다고 문서화했던
 * 제과(베이커리/디저트) 전용 코드(FD030100)가 신 체계에는 별도로 존재한다.
 */
export const FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3: Record<string, string> = {
  FD010100: "관광식당",
  FD010200: "모범음식점",
  FD020100: "중식",
  FD020200: "일식",
  FD020300: "서양식",
  FD020400: "기타외국식",
  FD020500: "퓨전음식",
  FD030100: "제과",
  FD030200: "피자,햄버거,샌드위치 및 유사음식",
  FD030300: "치킨",
  FD030400: "김밥 분식",
  FD030500: "이동음식",
  FD030600: "기타간이음식",
  FD040100: "바/펍",
  FD040200: "생맥주전문점",
  FD040300: "클럽",
  FD040400: "전통주/민속주점",
  FD040500: "기타주점",
  FD050100: "카페",
  FD050200: "찻집",
  FD050300: "기타음료점",
};

/** "장소 유형상 정식 식사(점심/저녁)가 어렵다"고 확인된 lclsSystm3 — 카페/찻집류(FD05 전체),
 * 주점류(FD04 전체, 정식 식사 자리가 아님), 제과(FD030100, 베이커리/디저트류)를 포함한다. 간이음식
 * 중 나머지(피자/햄버거/샌드위치/치킨/김밥분식/이동음식/기타간이음식)는 정식 식사로 충분히 쓰이는
 * 곳으로 보아 포함하지 않는다. foodClassification.ts가 카페/일반 식사 세부 분류에 그대로 재사용한다
 * (단일 기준 유지). */
export const NON_MEAL_FOOD_LCLS_SYSTM3_CODES = new Set([
  "FD030100", // 제과
  "FD040100", // 바/펍
  "FD040200", // 생맥주전문점
  "FD040300", // 클럽
  "FD040400", // 전통주/민속주점
  "FD040500", // 기타주점
  "FD050100", // 카페
  "FD050200", // 찻집
  "FD050300", // 기타음료점
]);

/** lclsSystm3 기준으로 이 음식점이 점심·저녁 후보로 쓸 수 있는 "식사 가능" 장소인지 판별한다.
 * lclsSystm3가 없거나(구버전 데이터 등) 알려진 21개 코드에 없는 값이면 안전하게 false(식사 불가로
 * 간주 — 잘못 배치하는 것보다 식사 슬롯을 생략하는 쪽을 우선한다). */
export function isMealEligibleFoodLclsSystm3(lclsSystm3: string | null | undefined): boolean {
  if (!lclsSystm3) return false;
  if (!(lclsSystm3 in FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3)) return false;
  return !NON_MEAL_FOOD_LCLS_SYSTM3_CODES.has(lclsSystm3);
}

/**
 * === 구 체계(cat1/cat2/cat3) — 신규 요청에는 사용하지 않는다. ===
 * 2026-07-24 실 서비스키로 확인된 구 분류체계 코드 테이블이다(`categoryCode2` 오퍼레이션, 대전 기준
 * cat1=A05·cat2=A0502, totalCount=7). 신규 라이브 동기화는 더 이상 이 체계를 요청하지 않지만, 신
 * 체계 전환 이전(2026-07-27 이전)에 저장된 `Poi.rawPayload`에는 `cat3`만 있고 `lclsSystm3`가 없다 —
 * 그런 과거 데이터를 재조회·재분석할 때만 `poiDetails.ts`의 fallback 경로에서 참조한다(구형 데이터
 * 호환 전용, 신규 요청 파라미터로는 절대 쓰지 않는다).
 */
export const LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3: Record<string, string> = {
  A05020100: "한식",
  A05020200: "서양식",
  A05020300: "일식",
  A05020400: "중식",
  A05020700: "이색음식점",
  A05020900: "카페/전통찻집",
  A05021000: "클럽",
};

/** 구 체계 카페/전통찻집·클럽 코드(구형 데이터 호환 전용). */
export const LEGACY_NON_MEAL_FOOD_CAT3_CODES = new Set(["A05020900", "A05021000"]);

/** 구형 rawPayload(cat3만 있고 lclsSystm3가 없는 과거 저장 데이터)에 대해서만 쓰는 판별 함수. */
export function isMealEligibleFoodLegacyCat3(cat3: string | null | undefined): boolean {
  if (!cat3) return false;
  if (!(cat3 in LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3)) return false;
  return !LEGACY_NON_MEAL_FOOD_CAT3_CODES.has(cat3);
}

export interface TourInfoParams {
  serviceKey: string;
  baseUrl: string;
  /** 법정동 시도 코드(신 체계, `ldongCode2`로 조회). Region.tourApiLdongRegnCd. */
  lDongRegnCd: string;
  /** 법정동 시군구 코드(신 체계). Region.tourApiLdongSignguCd. */
  lDongSignguCd?: string;
  contentTypeId?: string;
}

const ROWS_PER_PAGE = 1000;
// lDongRegnCd는 시/도 단위라 한 페이지(1000건)로는 전체를 못 덮는 도가 많다(예: 강원 3,198건, 구코드
// 기준 확인값 — 신코드도 같은 지역 범위이므로 페이지 수 정책은 그대로 유지). lDongSignguCd가 있으면
// 시군구 단위로 좁혀지므로 페이지 수가 줄어들지만, 상한은 안전하게 유지한다.
const MAX_PAGES = 5;

function buildUrl(baseUrl: string, params: TourInfoParams, pageNo: number): string {
  const qs = new URLSearchParams({
    serviceKey: params.serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    lDongRegnCd: params.lDongRegnCd,
    numOfRows: String(ROWS_PER_PAGE),
    pageNo: String(pageNo),
    _type: "json",
  });
  if (params.lDongSignguCd) qs.set("lDongSignguCd", params.lDongSignguCd);
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
