import { describe, expect, it } from "vitest";
import { parsePromoContent, parsePromoContentForSave } from "@/lib/validation/promoContent.schema";
import { ALL_PROMO_CHANNELS, DEFAULT_CHANNEL_PRIORITY, buildPromoContent } from "@/lib/domain/promoContent";

function baseContent() {
  return buildPromoContent({
    project: { role: "TRAVEL_AGENCY", regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "콘셉트",
      background: "배경",
      targetSummary: "타깃",
      sellingPoints: ["a", "b", "c"],
      course: [
        {
          dayIndex: 1,
          items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "이동" }],
          lodging: null,
        },
      ],
      kpis: [{ name: "kpi", method: "method" }],
      operationChecklist: ["체크1"],
      risks: [{ risk: "위험1", mitigation: "대응1" }],
    },
    evidences: [],
  });
}

function withChannelPriority(content: ReturnType<typeof baseContent>, channelPriority: unknown) {
  return { ...content, channelPriority };
}

describe("promoContent.schema — 지원 채널 수 확인(2026-08-01 보완)", () => {
  it("현재 지원 채널은 정확히 6개다", () => {
    expect(ALL_PROMO_CHANNELS).toHaveLength(6);
    expect(new Set(ALL_PROMO_CHANNELS).size).toBe(6);
  });
});

describe("parsePromoContentForSave — 신규 저장 입력은 엄격하게 검증한다", () => {
  it("6개 채널 전체를 포함한 정상 순열은 통과한다", () => {
    const content = withChannelPriority(baseContent(), [...ALL_PROMO_CHANNELS].reverse());
    const result = parsePromoContentForSave(content);
    expect(result.ok).toBe(true);
  });

  it("역할별로 순서가 달라도(순열이기만 하면) 통과한다", () => {
    const orderA = ["roleContent", "instagram", "blog", "landing", "cardNews", "proposalSummary"];
    const orderB = ["instagram", "cardNews", "roleContent", "proposalSummary", "landing", "blog"];
    expect(parsePromoContentForSave(withChannelPriority(baseContent(), orderA)).ok).toBe(true);
    expect(parsePromoContentForSave(withChannelPriority(baseContent(), orderB)).ok).toBe(true);
  });

  it("빈 배열은 거부한다", () => {
    const result = parsePromoContentForSave(withChannelPriority(baseContent(), []));
    expect(result.ok).toBe(false);
  });

  it("같은 채널이 중복된 배열은 거부한다", () => {
    const dup = ["proposalSummary", "proposalSummary", "instagram", "blog", "cardNews", "roleContent"];
    const result = parsePromoContentForSave(withChannelPriority(baseContent(), dup));
    expect(result.ok).toBe(false);
  });

  it("일부 채널이 누락된 배열은 거부한다", () => {
    const partial = ["proposalSummary", "instagram", "blog"];
    const result = parsePromoContentForSave(withChannelPriority(baseContent(), partial));
    expect(result.ok).toBe(false);
  });

  it("지원하지 않는 채널 이름이 섞여 있으면 거부한다", () => {
    const unknown = ["proposalSummary", "instagram", "blog", "landing", "cardNews", "unknownChannel"];
    const result = parsePromoContentForSave(withChannelPriority(baseContent(), unknown));
    expect(result.ok).toBe(false);
  });

  it("channelPriority 필드 자체가 없으면 거부한다(저장 입력에서는 관대하게 채우지 않는다)", () => {
    const content = baseContent() as Record<string, unknown>;
    delete content.channelPriority;
    const result = parsePromoContentForSave(content);
    expect(result.ok).toBe(false);
  });
});

describe("parsePromoContent — 조회(레거시 파싱)는 관대하게 받아들인다", () => {
  it("channelPriority 필드 자체가 없는 레거시 데이터는 기본 순서로 정상 파싱된다", () => {
    const content = baseContent() as Record<string, unknown>;
    delete content.channelPriority;
    delete content.cardNews;
    delete content.translationNotice;
    const result = parsePromoContent(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.channelPriority).toEqual(DEFAULT_CHANNEL_PRIORITY);
      expect(result.value.cardNews).toEqual({ slides: [] });
      expect(result.value.translationNotice).toBeNull();
    }
  });

  it("channelPriority가 빈 배열이면 형식 오류로 막지 않고 기본 순서로 안전하게 복구한다", () => {
    const result = parsePromoContent(withChannelPriority(baseContent(), []));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.channelPriority).toEqual(DEFAULT_CHANNEL_PRIORITY);
  });

  it("channelPriority에 중복 채널이 있으면 기본 순서로 안전하게 복구한다", () => {
    const dup = ["proposalSummary", "proposalSummary", "instagram", "blog", "cardNews", "roleContent"];
    const result = parsePromoContent(withChannelPriority(baseContent(), dup));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.channelPriority).toEqual(DEFAULT_CHANNEL_PRIORITY);
  });

  it("channelPriority에 일부 채널이 누락되면 기본 순서로 안전하게 복구한다", () => {
    const partial = ["proposalSummary", "instagram", "blog"];
    const result = parsePromoContent(withChannelPriority(baseContent(), partial));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.channelPriority).toEqual(DEFAULT_CHANNEL_PRIORITY);
  });

  it("정상적인(전체 채널을 포함한) channelPriority는 그대로 유지한다", () => {
    const valid = [...ALL_PROMO_CHANNELS].reverse();
    const result = parsePromoContent(withChannelPriority(baseContent(), valid));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.channelPriority).toEqual(valid);
  });

  it("정상 데이터(모든 신규 필드 포함)는 그대로 파싱된다(회귀 확인)", () => {
    const result = parsePromoContent(baseContent());
    expect(result.ok).toBe(true);
  });
});
