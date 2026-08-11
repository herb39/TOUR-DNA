import { describe, expect, it } from "vitest";
import { computeDna } from "@/lib/domain/dna";
import { minMaxNormalize } from "@/lib/domain/normalize";
import { METRIC_CODES, type DnaEngineInput, type RegionMetricValue } from "@/lib/domain/types";

const BASE_YM = "202509";

function metric(regionCode: string, rawValue: number, metricCode: string): RegionMetricValue {
  return {
    regionCode,
    baseYm: BASE_YM,
    metricCode,
    rawValue,
    unit: "index",
    adminLevel: "SIGUNGU",
    sourceCode: "TAR_SVC_DEM",
    collectedAt: "2026-07-01T00:00:00.000Z",
    provenance: "LIVE_API",
    isSnapshotFallback: false,
  };
}

function baseInput(overrides: Partial<DnaEngineInput> = {}): DnaEngineInput {
  const cohortFor = (metricCode: string, values: [string, number][]) =>
    values.map(([region, v]) => metric(region, v, metricCode));

  return {
    regionCode: "DAEJEON",
    baseYm: BASE_YM,
    adminLevel: "SIGUNGU",
    metricCohorts: {
      [METRIC_CODES.DEMAND_SERVICE]: cohortFor(METRIC_CODES.DEMAND_SERVICE, [
        ["DAEJEON", 80],
        ["JECHEON", 40],
        ["YANGYANG", 60],
      ]),
      [METRIC_CODES.DEMAND_RESOURCE]: cohortFor(METRIC_CODES.DEMAND_RESOURCE, [
        ["DAEJEON", 70],
        ["JECHEON", 50],
        ["YANGYANG", 90],
      ]),
      [METRIC_CODES.STAY]: cohortFor(METRIC_CODES.STAY, [
        ["DAEJEON", 55],
        ["JECHEON", 65],
        ["YANGYANG", 95],
      ]),
      [METRIC_CODES.SPEND]: cohortFor(METRIC_CODES.SPEND, [
        ["DAEJEON", 60],
        ["JECHEON", 30],
        ["YANGYANG", 45],
      ]),
      [METRIC_CODES.DIVERSITY]: cohortFor(METRIC_CODES.DIVERSITY, [
        ["DAEJEON", 90],
        ["JECHEON", 40],
        ["YANGYANG", 55],
      ]),
    },
    networkInputs: {
      attractionCount: 8,
      relatedPoiCount: 0,
      foodCount: 20,
      lodgingCount: 10,
      experienceCount: 5,
      collectedAt: "2026-07-01T00:00:00.000Z",
      poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
      relation: null,
    },
    ...overrides,
  };
}

describe("computeDna", () => {
  it("모든 축에 데이터가 있으면 overallDataMode가 LIVE이고 liveAxisCount가 5", () => {
    const result = computeDna(baseInput());
    expect(result.overallDataMode).toBe("LIVE");
    expect(result.liveAxisCount).toBe(5);
    expect(result.demand.score).not.toBeNull();
    expect(result.stay.score).not.toBeNull();
    expect(result.spend.score).not.toBeNull();
    expect(result.diversity.score).not.toBeNull();
    expect(result.network.score).not.toBeNull();
  });

  it("모든 점수는 0~100 범위 안에 있다", () => {
    const result = computeDna(baseInput());
    for (const axis of [result.demand, result.stay, result.spend, result.diversity, result.network]) {
      if (axis.score !== null) {
        expect(axis.score).toBeGreaterThanOrEqual(0);
        expect(axis.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("코호트 내 최댓값을 가진 지역은 해당 축에서 100점에 가깝다", () => {
    // DAEJEON은 DEMAND_SERVICE 코호트에서 최댓값(80)을 가짐
    const result = computeDna(baseInput());
    expect(result.demand.score).toBeGreaterThan(50);
  });

  it("지표가 전혀 없는 축은 null과 MISSING 상태를 반환한다 (0점 아님)", () => {
    const input = baseInput();
    delete input.metricCohorts[METRIC_CODES.STAY];
    const result = computeDna(input);
    expect(result.stay.score).toBeNull();
    expect(result.stay.status).toBe("MISSING");
    expect(result.overallDataMode).not.toBe("LIVE");
  });

  it("networkInputs가 없으면 network 축이 MISSING", () => {
    const input = baseInput({ networkInputs: null });
    const result = computeDna(input);
    expect(result.network.score).toBeNull();
    expect(result.network.status).toBe("MISSING");
  });

  describe("Network 축 — P0-2: 체감(로그형) 곡선으로 포화 방지", () => {
    function withAttractionCount(count: number) {
      return baseInput({
        networkInputs: {
          attractionCount: count,
          relatedPoiCount: 0,
          foodCount: 1,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: count, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: null,
        },
      });
    }

    it("중심 관광지 개수가 많아져도(25개) 즉시 100점에 포화되지 않는다", () => {
      const result = computeDna(withAttractionCount(25));
      expect(result.network.score).not.toBeNull();
      expect(result.network.score as number).toBeLessThan(100);
    });

    it("중심 관광지 개수가 아주 많아도(200개) 100점에 도달하지 않는다(점근선)", () => {
      const result = computeDna(withAttractionCount(200));
      expect(result.network.score as number).toBeLessThan(100);
      expect(result.network.score as number).toBeGreaterThan(70);
    });

    it("중심 관광지 개수가 다르면 점수도 다르다(개수·다양성·핵심관광지 구성 구분)", () => {
      const few = computeDna(withAttractionCount(3)).network.score as number;
      const many = computeDna(withAttractionCount(30)).network.score as number;
      expect(many).toBeGreaterThan(few);
    });

    it("개수가 0이면 해당 구성요소 기여도는 0이다(업종 커버리지만 반영)", () => {
      const result = computeDna(withAttractionCount(0));
      // categoryCoverage=3/3(food/lodging/experience 모두 1개 이상)이므로 30점만 나와야 한다.
      expect(result.network.score).toBe(30);
    });
  });

  describe("Network 축 — POI 근거/관계 근거 분리(Phase 1-E)", () => {
    it("POI/관계 근거가 서로 다른 metricCode의 별도 Evidence로 생성된다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 3,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: { count: 3, provenance: "CURATED", isSnapshotFallback: true },
        },
      });
      const result = computeDna(input);
      expect(result.network.evidence).toHaveLength(2);
      const codes = result.network.evidence.map((e) => e.metricCode);
      expect(codes).toContain("networkPoiCount");
      expect(codes).toContain("networkRelationCount");
    });

    it("API POI만 있으면 POI 근거는 LIVE_API/isSnapshotFallback:false다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 0,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 12, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: null,
        },
      });
      const result = computeDna(input);
      const poiEvidence = result.network.evidence.find((e) => e.metricCode === "networkPoiCount");
      expect(poiEvidence?.provenance).toBe("LIVE_API");
    });

    it("fixture POI가 섞이면 POI 근거는 CURATED/isSnapshotFallback:true다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 0,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 5, fixtureCount: 3, provenance: "CURATED", isSnapshotFallback: true },
          relation: null,
        },
      });
      const result = computeDna(input);
      const poiEvidence = result.network.evidence.find((e) => e.metricCode === "networkPoiCount");
      expect(poiEvidence?.provenance).toBe("CURATED");
      // 혼합 상태를 API/fixture 건수로 투명하게 노출한다(단순히 "하나라도 API면 LIVE_API"가 아님).
      expect(poiEvidence?.appliedRule).toContain("API 수집 5건");
      expect(poiEvidence?.appliedRule).toContain("큐레이션(FIXTURE) 3건");
    });

    it("관계 근거(CURATED)가 있어도 API POI 근거는 CURATED로 격하되지 않는다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 4,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 10, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: { count: 4, provenance: "CURATED", isSnapshotFallback: true },
        },
      });
      const result = computeDna(input);
      const poiEvidence = result.network.evidence.find((e) => e.metricCode === "networkPoiCount");
      const relationEvidence = result.network.evidence.find((e) => e.metricCode === "networkRelationCount");
      // 관계는 CURATED지만 POI 근거는 여전히 LIVE_API — 관계가 POI 근거를 격하하지 않는다.
      expect(poiEvidence?.provenance).toBe("LIVE_API");
      expect(relationEvidence?.provenance).toBe("CURATED");
      // 단, 축 전체 상태는 두 근거 중 하나라도 fallback이면 SNAPSHOT(기존 원칙 유지).
      expect(result.network.status).toBe("SNAPSHOT");
    });

    it("관계가 하나도 없으면(relation: null) 관계 Evidence 자체를 만들지 않는다", () => {
      const input = baseInput({
        networkInputs: {
          attractionCount: 8,
          relatedPoiCount: 0,
          foodCount: 2,
          lodgingCount: 1,
          experienceCount: 1,
          collectedAt: "2026-07-01T00:00:00.000Z",
          poi: { apiCount: 8, fixtureCount: 0, provenance: "LIVE_API", isSnapshotFallback: false },
          relation: null,
        },
      });
      const result = computeDna(input);
      expect(result.network.evidence).toHaveLength(1);
      expect(result.network.evidence[0].metricCode).toBe("networkPoiCount");
      // 관계 근거가 없을 뿐 POI 근거만으로는 여전히 LIVE 판정이 가능하다.
      expect(result.network.status).toBe("LIVE");
    });
  });

  it("일부 지표가 스냅샷 폴백이면 해당 축 상태가 SNAPSHOT이고 overallDataMode는 HYBRID", () => {
    const input = baseInput();
    const stayCohort = input.metricCohorts[METRIC_CODES.STAY]!;
    input.metricCohorts[METRIC_CODES.STAY] = stayCohort.map((m) =>
      m.regionCode === "DAEJEON" ? { ...m, isSnapshotFallback: true } : m,
    );
    const result = computeDna(input);
    expect(result.stay.status).toBe("SNAPSHOT");
    expect(result.overallDataMode).toBe("HYBRID");
  });

  it("방문자수 증감률이 있으면 demand 축 근거에 포함된다", () => {
    const input = baseInput({
      previousVisitorCount: {
        value: 1000,
        baseYm: "202508",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-06-01T00:00:00.000Z",
        provenance: "ESTIMATED",
        isSnapshotFallback: true,
      },
      currentVisitorCount: {
        value: 1200,
        baseYm: "202509",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-07-01T00:00:00.000Z",
        provenance: "ESTIMATED",
        isSnapshotFallback: true,
      },
    });
    const result = computeDna(input);
    expect(result.demand.evidence.some((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH)).toBe(
      true,
    );
    // 방문자수 Evidence의 provenance는 ESTIMATED 그대로 보존된다 — 임의로 LIVE_API로 승격하지 않는다.
    const growthEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH);
    expect(growthEvidence?.provenance).toBe("ESTIMATED");
  });

  it("방문자수 증감률 근거는 current/previous 둘 다 LIVE_API일 때만 LIVE_API로 분류된다", () => {
    const input = baseInput({
      previousVisitorCount: {
        value: 1000,
        baseYm: "202508",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-06-01T00:00:00.000Z",
        provenance: "LIVE_API",
        isSnapshotFallback: false,
      },
      currentVisitorCount: {
        value: 1200,
        baseYm: "202509",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-07-01T00:00:00.000Z",
        provenance: "LIVE_API",
        isSnapshotFallback: false,
      },
    });
    const result = computeDna(input);
    const growthEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH);
    expect(growthEvidence?.provenance).toBe("LIVE_API");
  });

  it("방문자수 증감률 근거는 current/previous 중 하나라도 fallback이면 전체가 fallback으로 취급된다", () => {
    const input = baseInput({
      previousVisitorCount: {
        value: 1000,
        baseYm: "202508",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-06-01T00:00:00.000Z",
        provenance: "CACHED_API",
        isSnapshotFallback: true,
      },
      currentVisitorCount: {
        value: 1200,
        baseYm: "202509",
        sourceCode: "VISITOR_CNT",
        collectedAt: "2026-07-01T00:00:00.000Z",
        provenance: "LIVE_API",
        isSnapshotFallback: false,
      },
    });
    const result = computeDna(input);
    // demand 축은 서비스수요/자원수요 다른 지표도 섞이므로, 증감률 evidence 자체의 fallback 여부는
    // combineAxisStatus에 들어가는 entries를 통해 간접 확인한다(evidence 자체엔 별도 필드 없음) —
    // 대신 provenance가 current(LIVE_API)를 우선하되, 증감률이 신뢰할 수 있는 값인지는 두 값을 모두
    // 사용한다는 점에서 previous가 fallback이면 axis 결합 상태도 영향을 받아야 한다.
    expect(result.demand.status).not.toBe("LIVE");
  });

  it("강점 2개, 기회 2개, 주의점 1개를 항상 반환한다", () => {
    const result = computeDna(baseInput());
    expect(result.strengths).toHaveLength(2);
    expect(result.opportunities).toHaveLength(2);
    expect(result.cautions).toHaveLength(1);
  });

  it("동일 입력에 대해 결정론적으로 동일한 결과를 반환한다", () => {
    const input = baseInput();
    const r1 = computeDna(input);
    const r2 = computeDna(input);
    expect(r1).toEqual(r2);
  });

  describe("2026-08-11: 수요·소비 축 log1p+min-max 전환(전국 감사 결과 극단값 민감도 완화)", () => {
    it("Demand의 tarSvcDemIxVal/touResDemIxVal 근거는 log1p 변환이 적용됐음을 appliedRule에 명시한다", () => {
      const result = computeDna(baseInput());
      const serviceEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_SERVICE);
      const resourceEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_RESOURCE);
      expect(serviceEvidence?.appliedRule).toContain("log1p");
      expect(resourceEvidence?.appliedRule).toContain("log1p");
    });

    it("Spend(tarExpDsIxVal) 근거도 log1p 변환이 적용됐음을 appliedRule에 명시한다", () => {
      const result = computeDna(baseInput());
      const spendEvidence = result.spend.evidence.find((e) => e.metricCode === METRIC_CODES.SPEND);
      expect(spendEvidence?.appliedRule).toContain("log1p");
    });

    it("Stay/Diversity 근거는 그대로 선형 min-max를 쓴다(appliedRule에 log1p가 없음) — 회귀 없음", () => {
      const result = computeDna(baseInput());
      const stayEvidence = result.stay.evidence.find((e) => e.metricCode === METRIC_CODES.STAY);
      const diversityEvidence = result.diversity.evidence.find((e) => e.metricCode === METRIC_CODES.DIVERSITY);
      expect(stayEvidence?.appliedRule).not.toContain("log1p");
      expect(diversityEvidence?.appliedRule).not.toContain("log1p");
    });

    it("Network 축 점수는 log1p 전환과 무관하게 그대로다(회귀 없음)", () => {
      const before = computeDna(baseInput());
      // Spend 코호트에 극단값을 섞어도 Network 산식(POI 개수 기반)에는 영향이 없어야 한다.
      const withExtremeSpend = baseInput();
      withExtremeSpend.metricCohorts[METRIC_CODES.SPEND] = [
        ...withExtremeSpend.metricCohorts[METRIC_CODES.SPEND]!,
        metric("EXTREME", 5000, METRIC_CODES.SPEND),
      ];
      const after = computeDna(withExtremeSpend);
      expect(after.network.score).toBe(before.network.score);
    });

    it("극단값이 섞인 코호트에서 Spend는 기존 선형 min-max보다 중하위 지역을 더 잘 구분한다", () => {
      // 실제 전국 데이터 규모(60~200대)를 흉내낸 코호트 — YANGYANG(65)은 최솟값(60)이 아닌 중하위권이다.
      const input = baseInput({ regionCode: "YANGYANG" });
      input.metricCohorts[METRIC_CODES.SPEND] = [
        metric("DAEJEON", 60, METRIC_CODES.SPEND),
        metric("JECHEON", 62, METRIC_CODES.SPEND),
        metric("YANGYANG", 65, METRIC_CODES.SPEND),
        metric("EXTREME", 201, METRIC_CODES.SPEND),
      ];
      const result = computeDna(input);
      const linearYangyang = minMaxNormalize(65, [60, 62, 65, 201]);
      // 선형 min-max라면 (65-60)/(201-60)*100 ≈ 3.5점으로 뭉개진다. log1p+min-max는 약 6.6점으로
      // 유의미하게(1.5배 이상) 더 넓게 펼쳐 보여줘야 한다 — Spend 축은 metric이 1개뿐이라 평균 없이
      // 바로 점수가 되므로 정확히 비교 가능하다.
      expect(result.spend.score as number).toBeGreaterThan(linearYangyang * 1.5);
    });

    it("방문자수 증감률이 음수여도(방문객 감소) NaN 없이 정상적인 0~100 범위 값을 낸다", () => {
      const input = baseInput({
        previousVisitorCount: {
          value: 2000,
          baseYm: "202508",
          sourceCode: "VISITOR_CNT",
          collectedAt: "2026-06-01T00:00:00.000Z",
          provenance: "LIVE_API",
          isSnapshotFallback: false,
        },
        currentVisitorCount: {
          value: 1000,
          baseYm: "202509",
          sourceCode: "VISITOR_CNT",
          collectedAt: "2026-07-01T00:00:00.000Z",
          provenance: "LIVE_API",
          isSnapshotFallback: false,
        },
      });
      const result = computeDna(input);
      const growthEvidence = result.demand.evidence.find((e) => e.metricCode === METRIC_CODES.DEMAND_VISITOR_GROWTH);
      expect(growthEvidence?.rawValue).toBeLessThan(0); // 실제로 감소했음을 확인
      expect(Number.isFinite(growthEvidence?.normalizedValue)).toBe(true);
      expect(growthEvidence?.normalizedValue).toBeGreaterThanOrEqual(0);
      expect(growthEvidence?.normalizedValue).toBeLessThanOrEqual(100);
      expect(growthEvidence?.appliedRule).not.toContain("log1p");
      expect(Number.isFinite(result.demand.score)).toBe(true);
    });
  });
});
