import { describe, expect, it } from "vitest";
import {
  buildPromoContentInputFromProjectData,
  mapEvidenceToEvidenceItem,
  toPromoContentJson,
  PromoContentSerializationError,
  type PromoEvidenceSourceRow,
} from "@/lib/services/promoContentAdapter";
import { buildPromoContent } from "@/lib/domain/promoContent";
import type { PromoContent } from "@/lib/domain/promoContent";

function row(overrides: Partial<PromoEvidenceSourceRow> = {}): PromoEvidenceSourceRow {
  return {
    axis: "demand",
    metricCode: "tarSvcDemIxVal",
    rawValue: 72.5,
    normalizedValue: 80,
    unit: "index",
    adminLevel: "SIGUNGU",
    regionCode: "GANGNEUNG",
    baseYm: "202606",
    sourceCode: "TAR_SVC_DEM",
    collectedAt: new Date("2026-06-01T00:00:00.000Z"),
    appliedRule: "SIGUNGU 코호트 내 min-max",
    provenance: "LIVE_API",
    ...overrides,
  };
}

describe("mapEvidenceToEvidenceItem", () => {
  it("정상 숫자 값이 EvidenceItem으로 변환된다", () => {
    const result = mapEvidenceToEvidenceItem(row());
    expect(result).not.toBeNull();
    expect(result?.rawValue).toBe(72.5);
    expect(result?.metricCode).toBe("tarSvcDemIxVal");
    expect(result?.collectedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("null normalizedValue가 0으로 바뀌지 않는다", () => {
    const result = mapEvidenceToEvidenceItem(row({ normalizedValue: null }));
    expect(result?.normalizedValue).toBeNull();
  });

  it("rawValue가 NaN/Infinity/-Infinity이면 유효 근거로 변환되지 않는다", () => {
    expect(mapEvidenceToEvidenceItem(row({ rawValue: Number.NaN }))).toBeNull();
    expect(mapEvidenceToEvidenceItem(row({ rawValue: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(mapEvidenceToEvidenceItem(row({ rawValue: Number.NEGATIVE_INFINITY }))).toBeNull();
  });

  it("provenance가 명시적으로 보존된다", () => {
    expect(mapEvidenceToEvidenceItem(row({ provenance: "ESTIMATED" }))?.provenance).toBe("ESTIMATED");
    expect(mapEvidenceToEvidenceItem(row({ provenance: null }))?.provenance).toBeNull();
  });

  it("알 수 없는 provenance/axis 문자열은 null로 안전하게 처리된다(타입 단언으로 통과시키지 않음)", () => {
    const malformed = row({ provenance: "UNKNOWN" as unknown as PromoEvidenceSourceRow["provenance"], axis: "UNKNOWN_AXIS" });
    const result = mapEvidenceToEvidenceItem(malformed);
    expect(result?.provenance).toBeNull();
    expect(result?.axis).toBeNull();
  });

  it("sourceCode와 baseYm이 보존된다", () => {
    const result = mapEvidenceToEvidenceItem(row());
    expect(result?.sourceCode).toBe("TAR_SVC_DEM");
    expect(result?.baseYm).toBe("202606");
  });

  it("빈 sourceCode는 근거로 변환되지 않는다", () => {
    expect(mapEvidenceToEvidenceItem(row({ sourceCode: "" }))).toBeNull();
  });
});

describe("buildPromoContentInputFromProjectData", () => {
  it("Evidence 입력 순서가 유지된다(재정렬하지 않음)", () => {
    const rows = [row({ metricCode: "a" }), row({ metricCode: "b" }), row({ metricCode: "c", rawValue: Number.NaN })];
    const input = buildPromoContentInputFromProjectData({
      project: { role: "TRAVEL_AGENCY", travelYear: 2026, travelMonth: 9, regionName: "강릉시", nationality: "DOMESTIC", preferredThemes: ["미식"] },
      plan: {
        productName: "p",
        conceptText: "c",
        background: "b",
        targetSummary: "t",
        sellingPoints: ["1", "2", "3"],
        course: { days: [] },
        kpis: [],
        operationChecklist: [],
        risks: [],
      },
      strategyName: "로컬미식·시장 연계형",
      evidenceRows: rows,
    });
    expect(input.evidences.map((e) => e.metricCode)).toEqual(["a", "b"]); // NaN 항목은 걸러지고 순서는 유지
  });

  it("Json 필드가 예상 형태가 아니면 안전한 fallback(빈 배열)으로 매핑된다", () => {
    const input = buildPromoContentInputFromProjectData({
      project: { role: "LOCAL_GOV", travelYear: 2026, travelMonth: 5, regionName: "통영시", nationality: null, preferredThemes: "이상한값" },
      plan: {
        productName: "p",
        conceptText: "c",
        background: "b",
        targetSummary: "t",
        sellingPoints: { not: "an array" },
        course: null,
        kpis: [{ name: "kpi1", method: "m1" }, { broken: true }],
        operationChecklist: ["체크1", 123],
        risks: [{ risk: "위험1", mitigation: "대응1" }, { broken: true }],
      },
      strategyName: "전략",
      evidenceRows: [],
    });
    expect(input.project.preferredThemes).toEqual([]);
    expect(input.plan.sellingPoints).toEqual([]);
    expect(input.plan.course).toEqual([]);
    expect(input.plan.kpis).toEqual([{ name: "kpi1", method: "m1" }]);
  });

  it("역할·지역·국적·여행연월이 DB 값 그대로 전달된다", () => {
    const input = buildPromoContentInputFromProjectData({
      project: { role: "TRAVEL_AGENCY", travelYear: 2027, travelMonth: 3, regionName: "제천시", nationality: "FOREIGN", preferredThemes: [] },
      plan: {
        productName: "p",
        conceptText: "c",
        background: "b",
        targetSummary: "t",
        sellingPoints: [],
        course: { days: [] },
        kpis: [],
        operationChecklist: [],
        risks: [],
      },
      strategyName: "전략명",
      evidenceRows: [],
    });
    expect(input.project.role).toBe("TRAVEL_AGENCY");
    expect(input.project.regionName).toBe("제천시");
    expect(input.project.nationality).toBe("FOREIGN");
    expect(input.project.travelYear).toBe(2027);
    expect(input.project.travelMonth).toBe(3);
    expect(input.strategy.name).toBe("전략명");
  });
});

function samplePromoContent(): PromoContent {
  return buildPromoContent({
    project: { role: "TRAVEL_AGENCY", regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "강릉 미식 코스 소개",
      background: "배경 설명",
      targetSummary: "타깃 요약",
      sellingPoints: ["a", "b", "c"],
      course: [{ dayIndex: 1, items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "이동" }], lodging: null }],
      kpis: [{ name: "kpi", method: "method" }],
      operationChecklist: ["체크리스트 항목"],
      risks: [{ risk: "위험", mitigation: "대응" }],
    },
    evidences: [],
  });
}

describe("toPromoContentJson", () => {
  it("정상 PromoContent는 예외 없이 JSON 값으로 변환된다(round trip 시 의미 보존)", () => {
    const content = samplePromoContent();
    const json = toPromoContentJson(content);
    expect(JSON.parse(JSON.stringify(json))).toEqual(JSON.parse(JSON.stringify(content)));
  });

  it("입력 객체를 mutate하지 않는다", () => {
    const content = samplePromoContent();
    const snapshot = JSON.parse(JSON.stringify(content));
    toPromoContentJson(content);
    expect(content).toEqual(snapshot);
  });

  it("Date/Map/Set/함수/undefined/bigint가 포함되면 거부한다", () => {
    const withDate = { ...samplePromoContent(), extra: new Date() } as unknown as PromoContent;
    expect(() => toPromoContentJson(withDate)).toThrow(PromoContentSerializationError);

    const withMap = { ...samplePromoContent(), extra: new Map() } as unknown as PromoContent;
    expect(() => toPromoContentJson(withMap)).toThrow(PromoContentSerializationError);

    const withSet = { ...samplePromoContent(), extra: new Set() } as unknown as PromoContent;
    expect(() => toPromoContentJson(withSet)).toThrow(PromoContentSerializationError);

    const withFn = { ...samplePromoContent(), extra: () => 1 } as unknown as PromoContent;
    expect(() => toPromoContentJson(withFn)).toThrow(PromoContentSerializationError);

    const withBigint = { ...samplePromoContent(), extra: BigInt(1) } as unknown as PromoContent;
    expect(() => toPromoContentJson(withBigint)).toThrow(PromoContentSerializationError);
  });

  it("non-finite number가 포함되면 거부한다", () => {
    const withNaN = { ...samplePromoContent(), extra: Number.NaN } as unknown as PromoContent;
    expect(() => toPromoContentJson(withNaN)).toThrow(PromoContentSerializationError);

    const withInfinity = { ...samplePromoContent(), extra: Number.POSITIVE_INFINITY } as unknown as PromoContent;
    expect(() => toPromoContentJson(withInfinity)).toThrow(PromoContentSerializationError);
  });
});
