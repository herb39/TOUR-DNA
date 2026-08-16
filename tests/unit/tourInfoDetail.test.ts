// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTourInfoDetail } from "@/lib/public-data/adapters/tourInfoDetail";

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

describe("fetchTourInfoDetail — detailIntro2 운영시간·휴무일 파싱", () => {
  afterEach(() => vi.restoreAllMocks());

  it("문화시설(14)의 usetimeculture/restdateculture를 정규화한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        envelope([
          {
            contentid: "4067990",
            contenttypeid: "14",
            usetimeculture: "10:00~14:00",
            restdateculture: "매주 월요일, 화요일",
            infocenterculture: "032-851-8881",
          },
        ]),
      ),
    );

    const result = await fetchTourInfoDetail({
      serviceKey: "key",
      baseUrl: "https://apis.data.go.kr/B551011/KorService2",
      contentId: "4067990",
      contentTypeId: "14",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.items[0]).toMatchObject({
      contentId: "4067990",
      contentTypeId: "14",
      operatingHours: "10:00~14:00",
      closedDays: "매주 월요일, 화요일",
    });
    expect(result.items[0].rawPayload.infocenterculture).toBe("032-851-8881");

    const url = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(url.pathname).toContain("/detailIntro2");
    expect(url.searchParams.get("contentId")).toBe("4067990");
    expect(url.searchParams.get("contentTypeId")).toBe("14");
  });

  it("관광지·음식점은 contentTypeId별 필드명을 사용하고 빈 값은 null로 보존한다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(envelope([{ contentid: "12", contenttypeid: "12", usetime: "09:00~18:00", restdate: "월요일" }])))
      .mockResolvedValueOnce(jsonResponse(envelope([{ contentid: "39", contenttypeid: "39", opentimefood: "11:00~21:00", restdatefood: "" }])));

    const tourist = await fetchTourInfoDetail({ serviceKey: "key", baseUrl: "https://example.test", contentId: "12", contentTypeId: "12" });
    const food = await fetchTourInfoDetail({ serviceKey: "key", baseUrl: "https://example.test", contentId: "39", contentTypeId: "39" });

    expect(tourist.items[0]).toMatchObject({ operatingHours: "09:00~18:00", closedDays: "월요일" });
    expect(food.items[0]).toMatchObject({ operatingHours: "11:00~21:00", closedDays: null });
  });

  it("레포츠(28)는 usetimeleports/restdateleports를 정규화한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        envelope([
          {
            contentid: "28",
            contenttypeid: "28",
            usetimeleports: "09:00~18:00",
            restdateleports: "매주 화요일",
          },
        ]),
      ),
    );

    const result = await fetchTourInfoDetail({
      serviceKey: "key",
      baseUrl: "https://example.test",
      contentId: "28",
      contentTypeId: "28",
    });

    expect(result.items[0]).toMatchObject({ operatingHours: "09:00~18:00", closedDays: "매주 화요일" });
  });

  it("상세 API가 빈 응답이면 성공 데이터로 가장하지 않고 EMPTY를 반환한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(envelope([])));

    const result = await fetchTourInfoDetail({ serviceKey: "key", baseUrl: "https://example.test", contentId: "none", contentTypeId: "14" });

    expect(result.status).toBe("EMPTY");
    expect(result.items).toEqual([]);
  });
});
