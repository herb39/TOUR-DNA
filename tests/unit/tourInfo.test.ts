// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTourInfo,
  isMealEligibleFoodLegacyCat3,
  LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3,
  isMealEligibleFoodLclsSystm3,
  FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3,
} from "@/lib/public-data/adapters/tourInfo";

// 실 서비스키로 categoryCode2(공식 분류 코드 조회, contentTypeId=39, cat1=A05, cat2=A0502) 및
// areaBasedList2(대전/강원 표본 200건) 응답을 직접 확인한 뒤(2026-07-24) 작성한 테스트다. 2026-07-27
// 신 법정동·분류체계(lDongRegnCd/lclsSystm1-3) 전환 이후로는 **구형 저장 데이터(rawPayload) 호환
// 전용**이다 — 신규 라이브 요청/응답에는 이 cat3 체계가 더 이상 쓰이지 않는다(아래 신규 체계 테스트 참고).
describe("isMealEligibleFoodLegacyCat3 — 구형 저장 데이터(cat3) 호환 전용, 신규 요청에는 미사용", () => {
  it("일반 식사가 가능한 것으로 확인된 cat3(한식/서양식/일식/중식/이색음식점)는 식사 가능으로 판별한다", () => {
    expect(isMealEligibleFoodLegacyCat3("A05020100")).toBe(true); // 한식
    expect(isMealEligibleFoodLegacyCat3("A05020200")).toBe(true); // 서양식
    expect(isMealEligibleFoodLegacyCat3("A05020300")).toBe(true); // 일식
    expect(isMealEligibleFoodLegacyCat3("A05020400")).toBe(true); // 중식
    expect(isMealEligibleFoodLegacyCat3("A05020700")).toBe(true); // 이색음식점
  });

  it("카페/전통찻집과 클럽은 명확한 비식사 장소로 식사 후보에서 제외한다", () => {
    expect(isMealEligibleFoodLegacyCat3("A05020900")).toBe(false); // 카페/전통찻집
    expect(isMealEligibleFoodLegacyCat3("A05021000")).toBe(false); // 클럽
  });

  it("cat3가 없거나(null/undefined) 알려진 7개 코드에 없는 값이면 안전하게 식사 불가로 본다", () => {
    expect(isMealEligibleFoodLegacyCat3(undefined)).toBe(false);
    expect(isMealEligibleFoodLegacyCat3(null)).toBe(false);
    expect(isMealEligibleFoodLegacyCat3("")).toBe(false);
    expect(isMealEligibleFoodLegacyCat3("A09999999")).toBe(false); // 알 수 없는 코드
  });

  it("categoryCode2로 실제 확인한 cat2=A0502 하위 코드는 정확히 7개이며, 디저트·베이커리·주점 전용 코드는 없다", () => {
    const codes = Object.keys(LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3);
    expect(codes).toHaveLength(7);
    expect(LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3["A05020900"]).toBe("카페/전통찻집");
    const names = Object.values(LEGACY_FOOD_SUBCATEGORY_NAME_BY_CAT3);
    expect(names).not.toContain("디저트");
    expect(names).not.toContain("베이커리");
    expect(names).not.toContain("주점");
  });
});

// 2026-07-28: 신 분류체계(lclsSystm3) 실제 코드값을 실 서비스키로 lclsSystmCode2를 직접 호출해
// 확인했다(대분류 FD="음식" 하위 중분류 5개, 소분류 21개 — 이 21개가 전부다).
describe("isMealEligibleFoodLclsSystm3 — 신 분류체계(실 코드값 확인됨, 2026-07-28)", () => {
  it("정식 식사가 가능한 것으로 확인된 lclsSystm3(한식/외국식/간이음식 중 제과 제외)는 식사 가능으로 판별한다", () => {
    expect(isMealEligibleFoodLclsSystm3("FD010100")).toBe(true); // 관광식당
    expect(isMealEligibleFoodLclsSystm3("FD010200")).toBe(true); // 모범음식점
    expect(isMealEligibleFoodLclsSystm3("FD020100")).toBe(true); // 중식
    expect(isMealEligibleFoodLclsSystm3("FD020200")).toBe(true); // 일식
    expect(isMealEligibleFoodLclsSystm3("FD020300")).toBe(true); // 서양식
    expect(isMealEligibleFoodLclsSystm3("FD030300")).toBe(true); // 치킨
    expect(isMealEligibleFoodLclsSystm3("FD030400")).toBe(true); // 김밥 분식
  });

  it("카페/찻집(FD05), 주점(FD04), 제과(FD030100)는 정식 식사 자리가 아니므로 식사 불가로 본다", () => {
    expect(isMealEligibleFoodLclsSystm3("FD050100")).toBe(false); // 카페
    expect(isMealEligibleFoodLclsSystm3("FD050200")).toBe(false); // 찻집
    expect(isMealEligibleFoodLclsSystm3("FD040100")).toBe(false); // 바/펍
    expect(isMealEligibleFoodLclsSystm3("FD040300")).toBe(false); // 클럽
    expect(isMealEligibleFoodLclsSystm3("FD030100")).toBe(false); // 제과(베이커리/디저트)
  });

  it("lclsSystm3가 없거나 알려진 21개 코드에 없는 값이면 안전하게 식사 불가로 본다", () => {
    expect(isMealEligibleFoodLclsSystm3(undefined)).toBe(false);
    expect(isMealEligibleFoodLclsSystm3(null)).toBe(false);
    expect(isMealEligibleFoodLclsSystm3("")).toBe(false);
    expect(isMealEligibleFoodLclsSystm3("FD999999")).toBe(false); // 알 수 없는 코드
  });

  it("lclsSystmCode2로 실제 확인한 FD(음식) 하위 코드는 정확히 21개이며, 구 체계에 없던 제과(베이커리) 전용 코드가 포함된다", () => {
    const codes = Object.keys(FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3);
    expect(codes).toHaveLength(21);
    expect(FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3["FD030100"]).toBe("제과");
    expect(FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3["FD050100"]).toBe("카페");
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) } as Response;
}

function envelope(items: unknown[]) {
  return {
    response: {
      header: { resultCode: "0000", resultMsg: "OK" },
      body: { items: { item: items }, numOfRows: items.length, pageNo: 1, totalCount: items.length },
    },
  };
}

describe("fetchTourInfo — areaBasedList2 신규 법정동 파라미터(2026-07-27 전환)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("요청에 lDongRegnCd/lDongSignguCd를 포함하고, 구 areaCode/sigunguCode는 포함하지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(envelope([])));

    await fetchTourInfo({
      serviceKey: "key",
      baseUrl: "https://apis.data.go.kr/B551011/KorService2",
      lDongRegnCd: "44",
      lDongSignguCd: "44130",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get("lDongRegnCd")).toBe("44");
    expect(requestedUrl.searchParams.get("lDongSignguCd")).toBe("44130");
    expect(requestedUrl.searchParams.has("areaCode")).toBe(false);
    expect(requestedUrl.searchParams.has("sigunguCode")).toBe(false);
  });

  it("lDongSignguCd를 생략하면 요청에도 포함되지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(envelope([])));

    await fetchTourInfo({ serviceKey: "key", baseUrl: "https://apis.data.go.kr/B551011/KorService2", lDongRegnCd: "44" });

    const requestedUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get("lDongRegnCd")).toBe("44");
    expect(requestedUrl.searchParams.has("lDongSignguCd")).toBe(false);
  });

  it("응답의 lclsSystm1~3을 그대로 정규화하고, cat1~3 필드는 결과 아이템에 없다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        envelope([
          {
            contentid: "1",
            contenttypeid: "39",
            title: "테스트 식당",
            addr1: "충남 어딘가",
            lDongRegnCd: "44",
            lDongSignguCd: "44130",
            mapx: "127.0",
            mapy: "36.5",
            lclsSystm1: "FD",
            lclsSystm2: "FD03",
            lclsSystm3: "FD030100",
          },
        ]),
      ),
    );

    const res = await fetchTourInfo({ serviceKey: "key", baseUrl: "https://apis.data.go.kr/B551011/KorService2", lDongRegnCd: "44" });

    expect(res.status).toBe("SUCCESS");
    expect(res.items).toHaveLength(1);
    const item = res.items[0];
    expect(item.lclsSystm1).toBe("FD");
    expect(item.lclsSystm2).toBe("FD03");
    expect(item.lclsSystm3).toBe("FD030100");
    expect((item as unknown as Record<string, unknown>).cat1).toBeUndefined();
    expect((item as unknown as Record<string, unknown>).cat2).toBeUndefined();
    expect((item as unknown as Record<string, unknown>).cat3).toBeUndefined();
  });
});
