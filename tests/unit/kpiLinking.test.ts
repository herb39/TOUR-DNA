import { describe, expect, it } from "vitest";
import { enrichKpis, findRelatedKpiNames, KPI_TARGET_INSTITUTION_PLACEHOLDER } from "@/lib/domain/kpiLinking";

const GOAL = { primaryGoalCode: "GOAL_STAY_SPEND_EXPANSION", primaryGoalLabel: "체류 및 지역 소비 확대" };

describe("enrichKpis — 기본 연결(측정 목적/연결 축/연결 목표/권장 시점)", () => {
  it("연결 축이 있는 KPI는 목적 문구에 해당 축 라벨을 포함한다", () => {
    const [kpi] = enrichKpis(
      [{ name: "숙박 전환율", method: "당일 대비 1박 이상 예약 비율(예약 데이터)" }],
      { axisScores: null, ...GOAL },
    );
    expect(kpi.linkedAxis).toBe("stay");
    expect(kpi.purpose).toContain("체류(Stay)");
  });

  it("연결 축이 없는 운영 지표(안전사고 등)는 linkedAxis가 null이고 운영 품질 문구를 쓴다", () => {
    const [kpi] = enrichKpis([{ name: "안전사고 발생 건수", method: "운영 로그(0건 목표)" }], {
      axisScores: null,
      ...GOAL,
    });
    expect(kpi.linkedAxis).toBeNull();
    expect(kpi.purpose).toContain("운영 품질");
  });

  it("연결된 사업 목표 코드·라벨을 그대로 전달한다", () => {
    const [kpi] = enrichKpis([{ name: "1인당 평균 소비액", method: "카드매출 데이터 비교(전월 대비)" }], {
      axisScores: null,
      ...GOAL,
    });
    expect(kpi.linkedGoalCode).toBe("GOAL_STAY_SPEND_EXPANSION");
    expect(kpi.linkedGoalLabel).toBe("체류 및 지역 소비 확대");
  });

  it("사업 목표가 없는 프로젝트는 연결 목표를 null로 정직하게 표시한다", () => {
    const [kpi] = enrichKpis([{ name: "체류시간" }].map((k) => ({ ...k, method: "코스 전체 소요시간 로그" })), {
      axisScores: null,
      primaryGoalCode: null,
      primaryGoalLabel: null,
    });
    expect(kpi.linkedGoalCode).toBeNull();
    expect(kpi.linkedGoalLabel).toBeNull();
  });
});

describe("enrichKpis — 권장 측정 시점은 method 문구에서 유추한다(지어내지 않음)", () => {
  it("'설문'이 포함되면 코스 종료 직후로 유추한다", () => {
    const [kpi] = enrichKpis([{ name: "학습 만족도", method: "설문 5점 척도 평균" }], { axisScores: null, ...GOAL });
    expect(kpi.recommendedTiming).toContain("코스 종료 직후");
  });

  it("'매출'/'결제'가 포함되면 월별로 유추한다", () => {
    const [kpi] = enrichKpis([{ name: "1인당 소비액", method: "코스 내 결제업소 매출 비교" }], {
      axisScores: null,
      ...GOAL,
    });
    expect(kpi.recommendedTiming).toContain("월별");
  });

  it("'로그'만 있고 '목표'가 없으면 상시(운영 로그 기준)로 유추한다", () => {
    const [kpi] = enrichKpis([{ name: "평균 체류시간", method: "코스 전체 소요시간 로그" }], {
      axisScores: null,
      ...GOAL,
    });
    expect(kpi.recommendedTiming).toContain("상시");
  });

  it("'해시태그'/'SNS'가 포함되면 분기별로 유추한다", () => {
    const [kpi] = enrichKpis([{ name: "SNS 언급량", method: "행사 해시태그 언급 건수(정성 참고 지표)" }], {
      axisScores: null,
      ...GOAL,
    });
    expect(kpi.recommendedTiming).toContain("분기별");
  });

  it("어떤 단서도 없으면 기본값(분기별 정기 점검)으로 안전하게 처리한다", () => {
    const [kpi] = enrichKpis([{ name: "임의 지표", method: "알 수 없는 방법" }], { axisScores: null, ...GOAL });
    expect(kpi.recommendedTiming.length).toBeGreaterThan(0);
  });
});

describe("enrichKpis — 목표값은 수치를 지어내지 않고 기관 설정 필요로 귀결한다", () => {
  it("연결 축이 없으면 목표값 근거는 항상 '기관 설정 필요'다", () => {
    const [kpi] = enrichKpis([{ name: "정책 성과 보고 지표", method: "정례 보고서" }], { axisScores: null, ...GOAL });
    expect(kpi.targetBasis).toContain(KPI_TARGET_INSTITUTION_PLACEHOLDER);
  });

  it("축 데이터 자체가 없으면(axisScores=null) '기관 설정 필요'와 함께 확인 불가 사유를 남긴다", () => {
    const [kpi] = enrichKpis([{ name: "1인당 평균 소비액", method: "카드매출 비교" }], { axisScores: null, ...GOAL });
    expect(kpi.targetBasis).toContain(KPI_TARGET_INSTITUTION_PLACEHOLDER);
    expect(kpi.targetBasis).toContain("확인할 수 없어");
  });

  it("연결 축의 점수가 MISSING(null)이면 '기관 설정 필요'와 함께 데이터 없음을 명시한다", () => {
    const [kpi] = enrichKpis([{ name: "1인당 평균 소비액", method: "카드매출 비교" }], {
      axisScores: [{ axis: "spend", score: null, status: "MISSING" }],
      ...GOAL,
    });
    expect(kpi.targetBasis).toContain(KPI_TARGET_INSTITUTION_PLACEHOLDER);
    expect(kpi.targetBasis).toContain("데이터가 없어");
  });

  it("연결 축의 실제 점수가 있으면 참고 맥락으로 보여주되, 수치 목표는 만들지 않고 여전히 '기관 설정 필요'로 귀결한다", () => {
    const [kpi] = enrichKpis([{ name: "1인당 평균 소비액", method: "카드매출 비교" }], {
      axisScores: [{ axis: "spend", score: 42, status: "LIVE" }],
      ...GOAL,
    });
    expect(kpi.targetBasis).toContain("42점");
    expect(kpi.targetBasis).toContain(KPI_TARGET_INSTITUTION_PLACEHOLDER);
    // 실제 목표 수치(예: "30% 이상")를 임의로 만들어내지 않는다.
    expect(kpi.targetBasis).not.toMatch(/목표\s*[:：]?\s*\d+(\.\d+)?\s*%/);
  });

  it("연결 축 점수가 SNAPSHOT/추정 상태여도 그 사실을 그대로 밝힌다(지어내지 않음)", () => {
    const [kpi] = enrichKpis([{ name: "체류시간" }].map((k) => ({ ...k, method: "코스 전체 소요시간 로그" })), {
      axisScores: [{ axis: "stay", score: 30, status: "SNAPSHOT" }],
      ...GOAL,
    });
    expect(kpi.targetBasis).toContain("최근 확보");
  });
});

describe("enrichKpis — 알 수 없는(사용자 정의) KPI 이름도 안전하게 처리한다", () => {
  it("KPI_AXIS_LINK 표에 없는 이름은 축 없음(null)으로 안전하게 폴백한다", () => {
    const [kpi] = enrichKpis([{ name: "사용자 정의 지표 12345", method: "직접 입력" }], {
      axisScores: [{ axis: "spend", score: 90, status: "LIVE" }],
      ...GOAL,
    });
    expect(kpi.linkedAxis).toBeNull();
    expect(kpi.targetBasis).toContain(KPI_TARGET_INSTITUTION_PLACEHOLDER);
  });
});

describe("enrichKpis — 여러 KPI를 한 번에 처리하고 순서를 보존한다", () => {
  it("입력 순서를 그대로 유지한다", () => {
    const result = enrichKpis(
      [
        { name: "숙박 전환율", method: "예약 데이터" },
        { name: "야간 프로그램 참여율", method: "체크인 수" },
        { name: "체류시간 증가폭", method: "비중 비교" },
      ],
      { axisScores: null, ...GOAL },
    );
    expect(result.map((k) => k.name)).toEqual(["숙박 전환율", "야간 프로그램 참여율", "체류시간 증가폭"]);
    expect(result.every((k) => k.linkedAxis === "stay")).toBe(true);
  });
});

describe("findRelatedKpiNames — 사전검증 리포트의 위험·보완사항과 KPI를 연결한다", () => {
  const kpis = enrichKpis(
    [
      { name: "숙박 전환율", method: "예약 데이터" },
      { name: "1인당 평균 소비액", method: "카드매출 비교" },
      { name: "재방문 의사율", method: "설문" },
      { name: "안전사고 발생 건수", method: "운영 로그(0건 목표)" },
    ],
    { axisScores: null, ...GOAL },
  );

  it("지목된 축과 연결된 KPI 이름만 반환한다(체류 취약 지역 KPI 시나리오)", () => {
    expect(findRelatedKpiNames(kpis, ["stay"])).toEqual(["숙박 전환율"]);
  });

  it("소비 취약 지역 KPI 시나리오 — spend 축 KPI만 반환한다", () => {
    expect(findRelatedKpiNames(kpis, ["spend"])).toEqual(["1인당 평균 소비액"]);
  });

  it("수요 취약 지역 KPI 시나리오 — demand 축 KPI만 반환한다", () => {
    expect(findRelatedKpiNames(kpis, ["demand"])).toEqual(["재방문 의사율"]);
  });

  it("여러 축을 동시에 지정하면 해당하는 KPI를 전부 모은다(데이터 신뢰도 보완 KPI 시나리오)", () => {
    expect(findRelatedKpiNames(kpis, ["stay", "spend"]).sort()).toEqual(["1인당 평균 소비액", "숙박 전환율"].sort());
  });

  it("지목된 축이 없으면(전부 OK) 빈 배열이다 — 억지로 연결을 만들지 않는다", () => {
    expect(findRelatedKpiNames(kpis, [])).toEqual([]);
  });

  it("어떤 KPI도 연결되지 않은 축을 지정하면(예: network) 빈 배열을 반환한다", () => {
    expect(findRelatedKpiNames(kpis, ["network"])).toEqual([]);
  });
});
