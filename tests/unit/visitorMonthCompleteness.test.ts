// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  expectedDatesOfMonth,
  assessDateCoverage,
  collectBaseYmdSet,
  assessVisitorMonthCompleteness,
  enforceDateCompleteness,
  enforceCombinedDateCompleteness,
} from "@/lib/services/visitorMonthCompleteness";
import type { VisitorCntFetchResult } from "@/lib/public-data/adapters/visitorCnt";

function successResult(code: string, baseYmds: string[]): VisitorCntFetchResult {
  return {
    status: "SUCCESS",
    resultCode: "0000",
    resultMsg: "OK",
    rawPages: [{ dummy: true }],
    byCode: new Map([
      [
        code,
        {
          code,
          name: null,
          localNum: 0,
          otherDomesticNum: 0,
          foreignNum: 0,
          visitorCnt: 0,
          rawItems: baseYmds.map((baseYmd) => ({ code, touDivCd: "2", touNum: 1, baseYmd })),
        },
      ],
    ]),
  };
}

function emptyResult(): VisitorCntFetchResult {
  return { status: "EMPTY", resultCode: "0000", resultMsg: "OK", rawPages: [{ dummy: true }], byCode: new Map() };
}

function errorResult(): VisitorCntFetchResult {
  return { status: "ERROR", byCode: null, resultCode: "99", resultMsg: "SERVICE ERROR", rawPages: [{ dummy: true }] };
}

describe("expectedDatesOfMonth", () => {
  it("30일짜리 달(6월)의 1일~30일을 모두 반환한다", () => {
    const dates = expectedDatesOfMonth("202606");
    expect(dates[0]).toBe("20260601");
    expect(dates[dates.length - 1]).toBe("20260630");
    expect(dates).toHaveLength(30);
  });

  it("2월(윤년 아님, 28일)을 정확히 처리한다", () => {
    const dates = expectedDatesOfMonth("202602");
    expect(dates).toHaveLength(28);
    expect(dates[dates.length - 1]).toBe("20260228");
  });
});

describe("assessDateCoverage", () => {
  it("모든 날짜가 있으면 complete=true, missingDates=[]다", () => {
    const result = assessDateCoverage("202602", expectedDatesOfMonth("202602"));
    expect(result.complete).toBe(true);
    expect(result.missingDates).toEqual([]);
  });

  it("일부 날짜가 없으면 complete=false이고 누락된 날짜를 정확히 알려준다", () => {
    const present = expectedDatesOfMonth("202602").slice(0, 20); // 1~20일만
    const result = assessDateCoverage("202602", present);
    expect(result.complete).toBe(false);
    expect(result.missingDates).toContain("20260221");
    expect(result.missingDates).toHaveLength(8);
  });
});

describe("collectBaseYmdSet", () => {
  it("SUCCESS 응답에서 모든 코드의 rawItems.baseYmd를 모은다", () => {
    const result = successResult("30200", ["20260601", "20260602"]);
    const set = collectBaseYmdSet(result);
    expect(Array.from(set).sort()).toEqual(["20260601", "20260602"]);
  });

  it("ERROR 응답이면 빈 집합을 반환한다(지어내지 않음)", () => {
    expect(collectBaseYmdSet(errorResult()).size).toBe(0);
  });
});

describe("assessVisitorMonthCompleteness", () => {
  it("기초/광역 모두 날짜가 완전하면 complete=true다", () => {
    const full = expectedDatesOfMonth("202602");
    const assessment = assessVisitorMonthCompleteness("202602", successResult("30200", full), successResult("30", full));
    expect(assessment.complete).toBe(true);
    expect(assessment.reason).toBeNull();
  });

  it("기초지자체가 ERROR면 LOCGO_ERROR로 불완전 처리한다", () => {
    const assessment = assessVisitorMonthCompleteness("202602", errorResult(), successResult("30", expectedDatesOfMonth("202602")));
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).toBe("LOCGO_ERROR");
  });

  it("기초지자체가 EMPTY면 LOCGO_EMPTY로 불완전 처리한다", () => {
    const assessment = assessVisitorMonthCompleteness("202602", emptyResult(), successResult("30", expectedDatesOfMonth("202602")));
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).toBe("LOCGO_EMPTY");
  });

  it("기초지자체 날짜가 일부 누락되면 LOCGO_INCOMPLETE_DATES로 불완전 처리한다", () => {
    const partial = expectedDatesOfMonth("202602").slice(0, 10);
    const assessment = assessVisitorMonthCompleteness("202602", successResult("30200", partial), successResult("30", expectedDatesOfMonth("202602")));
    expect(assessment.complete).toBe(false);
    expect(assessment.reason).toBe("LOCGO_INCOMPLETE_DATES");
    expect(assessment.locgo.missingDates.length).toBeGreaterThan(0);
  });

  it("광역지자체가 ERROR/EMPTY/날짜 누락이면 각각 METCO_* 사유로 불완전 처리한다(기초는 완전해도)", () => {
    const full = expectedDatesOfMonth("202602");
    expect(assessVisitorMonthCompleteness("202602", successResult("30200", full), errorResult()).reason).toBe("METCO_ERROR");
    expect(assessVisitorMonthCompleteness("202602", successResult("30200", full), emptyResult()).reason).toBe("METCO_EMPTY");
    expect(
      assessVisitorMonthCompleteness("202602", successResult("30200", full), successResult("30", full.slice(0, 5))).reason,
    ).toBe("METCO_INCOMPLETE_DATES");
  });
});

describe("enforceDateCompleteness", () => {
  it("SUCCESS이고 날짜가 완전하면 그대로 통과시킨다", () => {
    const full = successResult("30200", expectedDatesOfMonth("202602"));
    expect(enforceDateCompleteness("202602", full)).toBe(full);
  });

  it("SUCCESS인데 날짜가 일부 누락되면 ERROR로 바꾸고 rawPages를 비운다(저장 방지)", () => {
    const partial = successResult("30200", expectedDatesOfMonth("202602").slice(0, 5));
    const result = enforceDateCompleteness("202602", partial);
    expect(result.status).toBe("ERROR");
    expect(result.resultCode).toBe("INCOMPLETE_MONTH");
    if (result.status === "ERROR") {
      expect(result.rawPages).toEqual([]);
    }
  });

  it("EMPTY/ERROR는 그대로 통과시킨다(이미 안전하게 처리되는 상태라 재해석하지 않음)", () => {
    const empty = emptyResult();
    const error = errorResult();
    expect(enforceDateCompleteness("202602", empty)).toBe(empty);
    expect(enforceDateCompleteness("202602", error)).toBe(error);
  });
});

describe("enforceCombinedDateCompleteness(원자적 게이트)", () => {
  it("기초/광역 모두 완전하면 원본 그대로 통과시킨다", () => {
    const full = expectedDatesOfMonth("202602");
    const locgo = successResult("30200", full);
    const metco = successResult("30", full);
    const result = enforceCombinedDateCompleteness("202602", locgo, metco);
    expect(result.locgo).toBe(locgo);
    expect(result.metco).toBe(metco);
    expect(result.assessment.complete).toBe(true);
  });

  it("기초는 완전하고 광역이 불완전하면(EMPTY) 기초도 함께 ERROR로 바뀐다(한쪽만 저장하지 않음)", () => {
    const full = expectedDatesOfMonth("202602");
    const locgo = successResult("30200", full);
    const metco = emptyResult();
    const result = enforceCombinedDateCompleteness("202602", locgo, metco);
    expect(result.locgo.status).toBe("ERROR");
    expect(result.metco.status).toBe("ERROR");
    expect(result.assessment.reason).toBe("METCO_EMPTY");
  });

  it("광역은 완전하고 기초가 불완전하면(날짜 누락) 광역도 함께 ERROR로 바뀐다(한쪽만 저장하지 않음)", () => {
    const full = expectedDatesOfMonth("202602");
    const locgo = successResult("30200", full.slice(0, 5));
    const metco = successResult("30", full);
    const result = enforceCombinedDateCompleteness("202602", locgo, metco);
    expect(result.locgo.status).toBe("ERROR");
    expect(result.metco.status).toBe("ERROR");
    expect(result.assessment.reason).toBe("LOCGO_INCOMPLETE_DATES");
  });

  it("불완전 판정의 ERROR는 rawPages를 비우지 않는다(다른 소스와 동일한 preserve/강등 정책을 태우기 위해)", () => {
    const result = enforceCombinedDateCompleteness("202602", emptyResult(), emptyResult());
    expect(result.locgo.status).toBe("ERROR");
    if (result.locgo.status === "ERROR") {
      expect(result.locgo.rawPages.length).toBeGreaterThan(0);
    }
  });
});
