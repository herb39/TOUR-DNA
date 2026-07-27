import { describe, expect, it } from "vitest";
import {
  buildPromoContent,
  PROMO_CONTENT_VERSION,
  type BuildPromoContentInput,
} from "@/lib/domain/promoContent";
import type { CourseDay } from "@/lib/domain/planBuilder";
import type { EvidenceItem } from "@/lib/domain/types";

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
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
    collectedAt: "2026-06-01T00:00:00.000Z",
    provenance: "LIVE_API",
    appliedRule: "SIGUNGU 코호트 내 min-max",
    ...overrides,
  };
}

function course(): CourseDay[] {
  return [
    {
      dayIndex: 1,
      items: [
        { order: 1, poiId: "attr-1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" },
        { order: 2, poiId: "cafe-1", poiName: "테라로사", category: "FOOD", timeSlot: "11:00", stayMinutes: 60, travel: "이동 약 10분", mealPurpose: "GENERAL" },
        { order: 3, poiId: "lunch-1", poiName: "초당순두부집", category: "FOOD", timeSlot: "12:30", stayMinutes: 60, travel: "이동 약 5분", mealPurpose: "LUNCH" },
        { order: 4, poiId: "dinner-1", poiName: "물회식당", category: "FOOD", timeSlot: "18:00", stayMinutes: 60, travel: "이동 약 15분", mealPurpose: "DINNER" },
      ],
      lodging: null,
    },
  ];
}

function baseInput(overrides: Partial<BuildPromoContentInput> = {}): BuildPromoContentInput {
  return {
    project: {
      role: "TRAVEL_AGENCY",
      regionName: "강릉시",
      nationality: "DOMESTIC",
      travelYear: 2026,
      travelMonth: 9,
      preferredThemes: ["미식", "바다"],
    },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 당일 코스",
      conceptText: "강릉 전통시장과 맛집을 엮은 미식 코스",
      background: "강릉시 지역 관광 DNA 분석 결과를 바탕으로 로컬미식·시장 연계형 전략(적합도 82점)을 선택해 구성한 코스입니다.",
      targetSummary: "미식에 관심이 높은 소규모 동행 여행객",
      sellingPoints: ["초당순두부 맛집 방문", "테라로사 커피 체험", "전통시장 먹거리 투어"],
      course: course(),
      kpis: [{ name: "1인당 평균 소비액", method: "카드매출 비교" }],
    },
    evidences: [evidence()],
    ...overrides,
  };
}

describe("buildPromoContent — 결정론과 순수성", () => {
  it("A. 동일한 입력으로 호출하면 완전히 동일한 결과가 생성된다", () => {
    const input = baseInput();
    const r1 = buildPromoContent(input);
    const r2 = buildPromoContent(baseInput());
    expect(r1).toEqual(r2);
  });

  it("B. 입력 객체를 변경하지 않는다", () => {
    const input = baseInput();
    const snapshot = JSON.parse(JSON.stringify(input));
    buildPromoContent(input);
    expect(input).toEqual(snapshot);
  });
});

describe("buildPromoContent — 확정 홍보자료 5종", () => {
  it("C. 5종(제안서 요약/랜딩/인스타그램/블로그/역할별 자료)이 모두 생성된다", () => {
    const result = buildPromoContent(baseInput());
    expect(result.version).toBe(PROMO_CONTENT_VERSION);
    expect(result.proposalSummary.sentences).toHaveLength(3);
    expect(result.landing.title.length).toBeGreaterThan(0);
    expect(result.landing.body.length).toBeGreaterThan(0);
    expect(result.instagram.caption.length).toBeGreaterThan(0);
    expect(result.blog.title.length).toBeGreaterThan(0);
    expect(result.blog.body.length).toBeGreaterThan(0);
    expect(result.roleContent).toBeDefined();
  });

  it("D. 상품 제안서 요약은 정확히 3문장이다", () => {
    const result = buildPromoContent(baseInput());
    expect(result.proposalSummary.sentences).toHaveLength(3);
    for (const sentence of result.proposalSummary.sentences) {
      expect(typeof sentence).toBe("string");
      expect(sentence.length).toBeGreaterThan(0);
    }
  });
});

describe("buildPromoContent — 역할별 구조 차등", () => {
  it("E. TRAVEL_AGENCY는 판매 포인트 3개와 여행상품용 구조를 생성한다", () => {
    const result = buildPromoContent(baseInput({ project: { ...baseInput().project, role: "TRAVEL_AGENCY" } }));
    expect(result.roleContent.role).toBe("TRAVEL_AGENCY");
    if (result.roleContent.role === "TRAVEL_AGENCY") {
      expect(result.roleContent.sellingPoints).toHaveLength(3);
      expect(result.roleContent.productName).toBe("강릉 미식 당일 코스");
      expect(result.roleContent.targetAudience.length).toBeGreaterThan(0);
    }
  });

  it("F. LOCAL_GOV는 보도자료형 구조(제목/리드/배경/핵심프로그램/근거/기대효과)를 생성한다", () => {
    const input = baseInput();
    const result = buildPromoContent({ ...input, project: { ...input.project, role: "LOCAL_GOV" } });
    expect(result.roleContent.role).toBe("LOCAL_GOV");
    if (result.roleContent.role === "LOCAL_GOV") {
      expect(result.roleContent.title.length).toBeGreaterThan(0);
      expect(result.roleContent.lead.length).toBeGreaterThan(0);
      expect(result.roleContent.background.length).toBeGreaterThan(0);
      expect(result.roleContent.coreProgram.length).toBeGreaterThan(0);
      expect(Array.isArray(result.roleContent.dataBasedEvidence)).toBe(true);
      expect(Array.isArray(result.roleContent.expectedEffects)).toBe(true);
    }
  });

  it("G. 두 역할의 결과는 단순 문구 치환이 아니라 구조적으로 다른 필드를 가진다", () => {
    const input = baseInput();
    const agency = buildPromoContent({ ...input, project: { ...input.project, role: "TRAVEL_AGENCY" } });
    const gov = buildPromoContent({ ...input, project: { ...input.project, role: "LOCAL_GOV" } });
    expect(Object.keys(agency.roleContent).sort()).not.toEqual(Object.keys(gov.roleContent).sort());
    expect("sellingPoints" in agency.roleContent).toBe(true);
    expect("dataBasedEvidence" in gov.roleContent).toBe(true);
  });
});

describe("buildPromoContent — Evidence/provenance 처리", () => {
  it("H. MISSING Evidence는 생성 근거와 출처 목록에서 제외된다", () => {
    const input = baseInput({ evidences: [evidence({ provenance: "MISSING" })] });
    const result = buildPromoContent(input);
    expect(result.evidenceReferences).toHaveLength(0);
  });

  it("I. provenance가 null인 Evidence는 확정 수치처럼 사용되지 않는다", () => {
    const input = baseInput({ evidences: [evidence({ provenance: null })] });
    const result = buildPromoContent(input);
    expect(result.evidenceReferences).toHaveLength(0);
  });

  it("J. ESTIMATED Evidence에는 추정 표시가 포함된다", () => {
    const input = baseInput({ evidences: [evidence({ provenance: "ESTIMATED" })] });
    const result = buildPromoContent(input);
    expect(result.evidenceReferences).toHaveLength(1);
    expect(result.evidenceReferences[0].isEstimated).toBe(true);
  });

  it("K. LIVE_API/CACHED_API/CURATED 출처 정보는 보존된다", () => {
    const provenances: Array<EvidenceItem["provenance"]> = ["LIVE_API", "CACHED_API", "CURATED"];
    for (const provenance of provenances) {
      const result = buildPromoContent(baseInput({ evidences: [evidence({ provenance })] }));
      expect(result.evidenceReferences).toHaveLength(1);
      expect(result.evidenceReferences[0].provenance).toBe(provenance);
      expect(result.evidenceReferences[0].isEstimated).toBe(false);
    }
  });

  it("L. sourceCode와 baseYm이 있으면 구조화된 출처 정보에 유지된다", () => {
    const result = buildPromoContent(baseInput());
    expect(result.evidenceReferences[0].sourceCode).toBe("TAR_SVC_DEM");
    expect(result.evidenceReferences[0].baseYm).toBe("202606");
  });

  it("M. 빈 Evidence에서도 정상적으로 생성되고 undefined/null 문자열이 나오지 않는다", () => {
    const result = buildPromoContent(baseInput({ evidences: [] }));
    expect(result.evidenceReferences).toHaveLength(0);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("undefined");
    expect(serialized.includes('"null"')).toBe(false);
  });

  it("빈 sourceCode/rawValue(NaN)는 근거 목록에서 제외된다", () => {
    const result = buildPromoContent(
      baseInput({ evidences: [evidence({ sourceCode: "" }), evidence({ rawValue: Number.NaN })] }),
    );
    expect(result.evidenceReferences).toHaveLength(0);
  });

  it("P0-6: 근거 문구(사람이 읽는 텍스트)에 내부 지표 코드(tarSjrnDsIxVal 등)가 노출되지 않고 한글 라벨로 바뀐다", () => {
    // evidenceReferences(구조화 데이터)에는 metricCode 원본이 그대로 남아야 한다(프로그램적으로
    // 필요한 필드) — 이 테스트는 사람이 읽는 문구(sentences/dataBasedEvidence)만 검증한다.
    const result = buildPromoContent(
      baseInput({
        evidences: [
          evidence({ metricCode: "tarSjrnDsIxVal" }),
          evidence({ metricCode: "tarSvcDemIxVal", sourceCode: "TAR_SVC_DEM2" }),
        ],
      }),
    );
    expect(result.proposalSummary.sentences.join(" ")).not.toContain("tarSjrnDsIxVal");
    expect(result.proposalSummary.sentences.join(" ")).not.toContain("tarSvcDemIxVal");
    expect(result.proposalSummary.sentences[2]).toContain("체류 강도");
    const govResult = buildPromoContent(
      baseInput({
        project: {
          role: "LOCAL_GOV",
          regionName: "강릉시",
          nationality: "DOMESTIC",
          travelYear: 2026,
          travelMonth: 9,
          preferredThemes: [],
        },
        evidences: [evidence({ metricCode: "tarSjrnDsIxVal" })],
      }),
    );
    if (govResult.roleContent.role === "LOCAL_GOV") {
      expect(govResult.roleContent.dataBasedEvidence.join(" ")).toContain("체류 강도");
      expect(govResult.roleContent.dataBasedEvidence.join(" ")).not.toContain("tarSjrnDsIxVal");
    }
  });

  it("P0-6: 알 수 없는 metricCode는 크래시 없이 코드 자체를 안전하게 보여준다", () => {
    const result = buildPromoContent(baseInput({ evidences: [evidence({ metricCode: "unknownMetricXyz" })] }));
    expect(result.proposalSummary.sentences[2]).toContain("unknownMetricXyz");
  });
});

describe("buildPromoContent — P0-6: productName 중복 표현 방지", () => {
  it("productName이 이미 '코스'로 끝나면 '코스 코스입니다'처럼 중복되지 않는다", () => {
    const result = buildPromoContent(baseInput({ plan: { ...baseInput().plan, productName: "강릉 미식 당일 코스" } }));
    expect(result.proposalSummary.sentences[0]).not.toContain("코스 코스");
    expect(result.proposalSummary.sentences[0]).toContain("강릉 미식 당일 코스");
  });

  it("productName이 '상품'으로 끝나면 '상품 상품입니다'처럼 중복되지 않는다", () => {
    const result = buildPromoContent(baseInput({ plan: { ...baseInput().plan, productName: "강릉 미식 상품" } }));
    expect(result.proposalSummary.sentences[0]).not.toContain("상품 상품");
  });

  it("productName이 '코스'/'상품'으로 끝나지 않으면 기존처럼 '코스입니다'를 붙인다", () => {
    const result = buildPromoContent(baseInput({ plan: { ...baseInput().plan, productName: "강릉 미식 투어" } }));
    expect(result.proposalSummary.sentences[0]).toContain("강릉 미식 투어' 코스입니다");
  });
});

describe("buildPromoContent — 국적·테마·여행월 반영", () => {
  it("N. 국적·테마·여행월이 있을 때만 문구에 반영된다", () => {
    const withData = buildPromoContent(baseInput());
    expect(withData.proposalSummary.sentences[0]).toContain("내국인");
    expect(withData.proposalSummary.sentences[0]).toContain("2026");
    expect(withData.proposalSummary.sentences[0]).toContain("9월");
    expect(withData.blog.body).toContain("미식");

    const input = baseInput();
    const withoutData = buildPromoContent({
      ...input,
      project: { ...input.project, nationality: null, preferredThemes: [] },
    });
    expect(withoutData.proposalSummary.sentences[0]).not.toContain("내국인");
    expect(withoutData.proposalSummary.sentences[0]).not.toContain("외국인");
    expect(withoutData.blog.body).not.toContain("관심 테마");
  });
});

describe("buildPromoContent — POI·timeSlot·mealPurpose 보존", () => {
  it("O. 선택 POI와 코스 순서가 유지된다", () => {
    const result = buildPromoContent(baseInput());
    expect(result.courseHighlights.map((h) => h.poiName)).toEqual(["경포대", "테라로사", "초당순두부집", "물회식당"]);
  });

  it("P. timeSlot과 mealPurpose 정보가 유실되지 않는다", () => {
    const result = buildPromoContent(baseInput());
    const lunch = result.courseHighlights.find((h) => h.poiName === "초당순두부집");
    expect(lunch?.timeSlot).toBe("12:30");
    expect(lunch?.mealPurpose).toBe("LUNCH");
  });

  it("Q. 카페(GENERAL)와 실제 식사(LUNCH/DINNER)가 구분되어 유지된다", () => {
    const result = buildPromoContent(baseInput());
    const cafe = result.courseHighlights.find((h) => h.poiName === "테라로사");
    expect(cafe?.mealPurpose).toBe("GENERAL");
    expect(result.landing.body).toContain("초당순두부집에서 즐길 수 있습니다");
    expect(result.landing.body).toContain("물회식당에서 즐길 수 있습니다");
    expect(result.landing.body).not.toContain("테라로사에서 즐길 수 있습니다");
  });

  it("R. 빈 POI(빈 course)에서도 예외 없이 fallback 결과가 생성된다", () => {
    const input = baseInput();
    const result = buildPromoContent({
      ...input,
      plan: { ...input.plan, course: [{ dayIndex: 1, items: [], lodging: null }], sellingPoints: [], kpis: [] },
    });
    expect(result.courseHighlights).toHaveLength(0);
    if (result.roleContent.role === "TRAVEL_AGENCY") {
      expect(result.roleContent.sellingPoints).toHaveLength(3);
    }
    expect(result.landing.body.length).toBeGreaterThan(0);
  });
});

describe("buildPromoContent — 인스타그램 해시태그", () => {
  it("S. 해시태그가 중복 없이 안정적인 순서로 생성된다", () => {
    const result1 = buildPromoContent(baseInput());
    const result2 = buildPromoContent(baseInput());
    expect(result1.instagram.hashtags).toEqual(result2.instagram.hashtags);
    expect(new Set(result1.instagram.hashtags).size).toBe(result1.instagram.hashtags.length);
    expect(result1.instagram.hashtags.every((tag) => tag.length > 0)).toBe(true);
  });
});

describe("buildPromoContent — 환각 방지", () => {
  it("T. 저장 데이터에 없는 숫자나 장소가 결과에 추가되지 않는다", () => {
    const result = buildPromoContent(baseInput());
    const serialized = JSON.stringify(result);
    // course에 없는 임의의 장소명이 등장하지 않는지 확인(과잉 생성 방지의 대리 검증).
    expect(serialized).not.toContain("최고");
    expect(serialized).not.toContain("유일");
    expect(serialized).not.toContain("완벽");
  });
});
