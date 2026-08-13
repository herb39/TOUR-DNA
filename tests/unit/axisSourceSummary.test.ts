import { describe, expect, it } from "vitest";
import { summarizeAxisSource, summarizeGenericAxisSource, summarizeNetworkAxisSource } from "@/lib/domain/axisSourceSummary";

describe("summarizeGenericAxisSource — 일반 축(수요/체류/소비/다양성) 출처 배지", () => {
  it("점수 계산에 쓰인 근거가 모두 LIVE_API면 '모두 실시간 API'를 반환한다", () => {
    const r = summarizeGenericAxisSource([
      { normalizedValue: 50, provenance: "LIVE_API" },
      { normalizedValue: 80, provenance: "LIVE_API" },
    ]);
    expect(r).toEqual({ tier: "ALL_LIVE", label: "모두 실시간 API" });
  });

  it("LIVE_API와 ESTIMATED가 섞이면 SNAPSHOT 같은 enum 원문 없이 건수 breakdown을 보여준다", () => {
    const r = summarizeGenericAxisSource([
      { normalizedValue: 4.77, provenance: "LIVE_API" },
      { normalizedValue: 0, provenance: "ESTIMATED" },
      { normalizedValue: 100, provenance: "LIVE_API" },
    ]);
    expect(r.tier).toBe("MIXED");
    expect(r.label).toContain("실시간 2");
    expect(r.label).toContain("추정 1");
    expect(r.label).not.toMatch(/SNAPSHOT|LIVE_API|ESTIMATED/);
  });

  it("점수 계산에 쓰인 근거가 하나도 없으면(전부 display-only이거나 빈 배열) '데이터 부족'이다", () => {
    expect(summarizeGenericAxisSource([])).toEqual({ tier: "MISSING", label: "데이터 부족" });
    expect(summarizeGenericAxisSource([{ normalizedValue: null, provenance: "LIVE_API" }])).toEqual({
      tier: "MISSING",
      label: "데이터 부족",
    });
  });

  it("provenance가 null(판정 정보 없음)인 항목도 별도로 구분해 보여준다", () => {
    const r = summarizeGenericAxisSource([{ normalizedValue: 10, provenance: null }]);
    expect(r.tier).toBe("MIXED");
    expect(r.label).toBe("판정없음 1");
  });
});

describe("summarizeNetworkAxisSource — 연계 축 출처 배지", () => {
  it("API POI만 있고 FIXTURE·관계 근거가 없으면 '모두 실시간 API'다", () => {
    const r = summarizeNetworkAxisSource([
      {
        metricCode: "networkPoiCount",
        rawValue: 791,
        provenance: "LIVE_API",
        appliedRule: "API 수집 791건, 큐레이션(FIXTURE) 0건.",
      },
    ]);
    expect(r).toEqual({ tier: "ALL_LIVE", label: "모두 실시간 API" });
  });

  it("실제 제천 프로젝트 사례(API 249 · FIXTURE 7, Phase 3부터 관계 근거는 더 이상 없음)를 정확히 재현한다", () => {
    const r = summarizeNetworkAxisSource([
      {
        metricCode: "networkPoiCount",
        rawValue: 249,
        provenance: "CURATED",
        appliedRule: "... API 수집 249건, 큐레이션(FIXTURE) 7건.",
      },
    ]);
    expect(r.tier).toBe("MIXED");
    expect(r.label).toBe("API 249 · 정제 7");
  });

  it("appliedRule 문구가 예상 형식과 다르면 크래시 없이 provenance 기반으로 안전하게 대체한다", () => {
    const r = summarizeNetworkAxisSource([
      { metricCode: "networkPoiCount", rawValue: 42, provenance: "CURATED", appliedRule: "형식이 다른 문구" },
    ]);
    expect(r.tier).toBe("MIXED");
    expect(r.label).toBe("정제 42");
  });

  it("POI 근거 자체가 없으면 '데이터 부족'이다", () => {
    expect(summarizeNetworkAxisSource([])).toEqual({ tier: "MISSING", label: "데이터 부족" });
  });
});

describe("summarizeAxisSource — 축 키에 따라 올바른 함수로 위임한다", () => {
  it("network는 summarizeNetworkAxisSource 로직을 쓴다", () => {
    const r = summarizeAxisSource("network", [
      {
        metricCode: "networkPoiCount",
        rawValue: 10,
        normalizedValue: null,
        provenance: "LIVE_API",
        appliedRule: "API 수집 10건, 큐레이션(FIXTURE) 0건.",
      },
    ]);
    expect(r.tier).toBe("ALL_LIVE");
  });

  it("demand 등 나머지 축은 summarizeGenericAxisSource 로직을 쓴다", () => {
    const r = summarizeAxisSource("demand", [
      { metricCode: "tarSvcDemIxVal", rawValue: 75, normalizedValue: 4.77, provenance: "LIVE_API", appliedRule: "" },
    ]);
    expect(r.tier).toBe("ALL_LIVE");
  });
});
