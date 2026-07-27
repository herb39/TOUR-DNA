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
 * **미확인 사항(2026-07-27, 이번 전환 세션에서 확인 시도했으나 실패)**: 신 법정동 코드(`lDongRegnCd`/
 * `lDongSignguCd`, `ldongCode2` 오퍼레이션으로 조회)와 신 분류체계 코드(`lclsSystm1~3`, `lclsSystmCode2`
 * 오퍼레이션으로 조회)의 **실제 코드값**은 이번 세션에서 실 서비스키로 라이브 호출을 시도했으나
 * `apis.data.go.kr`가 401(Unauthorized)을 반환해 확인하지 못했다(네트워크 프록시 차단이 아니라 키
 * 인증 자체가 거부됨 — sandbox 네트워크 제한을 해제한 뒤에도 동일하게 401). 아래 `FOOD_SUBCATEGORY_
 * NAME_BY_LCLS_SYSTM3`가 비어 있는 이유이며, 필드명·파라미터명(신 체계의 계약 자체)은 사용자가 명시한
 * 사양을 그대로 반영했지만 **분류값 테이블은 검증된 실 코드가 아니라 의도적으로 비워뒀다** — 실키
 * 접근이 가능한 환경에서 `ldongCode2`/`lclsSystmCode2`를 호출해 채워야 한다(추측으로 채우지 않음).
 */

const itemSchema = z.object({
  contentid: z.string().optional(),
  contenttypeid: z.string().optional(),
  title: z.string(),
  addr1: z.string().optional(),
  /** 법정동 시도 코드(신 체계). ldongCode2로 조회하는 코드와 같은 체계. */
  lDongRegnCd: z.string().optional(),
  /** 법정동 시군구 코드(신 체계). */
  lDongSignguCd: z.string().optional(),
  mapx: z.coerce.number().optional(),
  mapy: z.coerce.number().optional(),
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
 * 음식점(contentTypeId=39) 하위 lclsSystm3 코드 → 명칭. **비어 있음(2026-07-27)** — 구 cat3 체계의
 * `FOOD_SUBCATEGORY_NAME_BY_CAT3`(7개 코드, 실키로 확인됨)를 신 코드로 "이름만 바꿔" 채우지 않았다.
 * 신 lclsSystm3 실제 코드값은 이 파일 상단 주석에 적은 이유로 이번 세션에서 확인하지 못했다 —
 * `lclsSystmCode2` 오퍼레이션을 실키로 호출해(예: `scripts/verify-region-codes.ts`에 유사 헬퍼 추가)
 * 카페/전통찻집에 해당하는 실제 코드를 확인한 뒤 이 테이블을 채워야 한다. 비어 있는 동안은
 * `isMealEligibleFoodLclsSystm3`가 모든 lclsSystm3 값을 "알 수 없는 코드"로 보아 안전하게 식사 불가로
 * 판정한다(기존 "cat3 알 수 없으면 false" 정책과 동일한 안전한 기본값 — 잘못 배치하지 않는 쪽을
 * 우선한다).
 */
export const FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3: Record<string, string> = {};

/** 카페/전통찻집 등 "장소 유형상 정식 식사가 어렵다"고 확인된 lclsSystm3만 여기 둔다. 현재 비어
 * 있음(위 FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3 참고 — 실 코드값 미확인). foodClassification.ts가
 * 카페/일반 식사 세부 분류에 그대로 재사용한다(단일 기준 유지). */
export const NON_MEAL_FOOD_LCLS_SYSTM3_CODES = new Set<string>();

/** lclsSystm3 기준으로 이 음식점이 점심·저녁 후보로 쓸 수 있는 "식사 가능" 장소인지 판별한다.
 * lclsSystm3가 없거나(구버전 데이터 등) 알려진 코드가 아니면 안전하게 false(식사 불가로 간주 — 잘못
 * 배치하는 것보다 식사 슬롯을 생략하는 쪽을 우선한다). 위 테이블이 채워지기 전까지는 항상 false를
 * 반환한다 — 이는 버그가 아니라 미확인 신 코드값에 대한 의도된 안전한 기본값이다. */
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
