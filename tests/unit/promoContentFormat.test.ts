import { describe, expect, it } from "vitest";
import {
  formatBlogForCopy,
  formatFullPromoContentForCopy,
  formatInstagramForCopy,
  formatLandingForCopy,
  formatProposalSummaryForCopy,
  formatRoleContentForCopy,
  parseHashtagsInput,
} from "@/lib/domain/promoContentFormat";
import { buildPromoContent } from "@/lib/domain/promoContent";
import type { FestivalPlannerPromo, LocalGovPromo, PromoContent, TravelAgencyPromo } from "@/lib/domain/promoContent";

function sampleContent(role: "TRAVEL_AGENCY" | "LOCAL_GOV" | "FESTIVAL_PLANNER" = "TRAVEL_AGENCY"): PromoContent {
  return buildPromoContent({
    project: { role, regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
    strategy: { name: "로컬미식·시장 연계형" },
    plan: {
      productName: "강릉 미식 코스",
      conceptText: "강릉 미식 코스 소개",
      background: "배경 설명",
      targetSummary: "타깃 요약",
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

describe("formatProposalSummaryForCopy", () => {
  it("3문장을 줄바꿈으로 결합한다(원래 순서 유지)", () => {
    const content = sampleContent();
    const result = formatProposalSummaryForCopy(content.proposalSummary);
    expect(result).toBe(content.proposalSummary.sentences.join("\n"));
    expect(result.split("\n")).toHaveLength(3);
  });
});

describe("formatLandingForCopy / formatBlogForCopy", () => {
  it("제목과 본문을 빈 줄로 구분해 결합한다", () => {
    const landing = { title: "제목", body: "본문" };
    expect(formatLandingForCopy(landing)).toBe("제목\n\n본문");
    expect(formatBlogForCopy(landing)).toBe("제목\n\n본문");
  });
});

describe("formatInstagramForCopy", () => {
  it("해시태그가 있으면 캡션 뒤에 '#' 접두사를 붙여 결합한다", () => {
    const result = formatInstagramForCopy({ caption: "캡션", hashtags: ["강릉시", "미식"] });
    expect(result).toBe("캡션\n\n#강릉시 #미식");
  });

  it("해시태그가 없으면 캡션만 반환한다(빈 섹션 생략)", () => {
    expect(formatInstagramForCopy({ caption: "캡션", hashtags: [] })).toBe("캡션");
  });
});

describe("formatRoleContentForCopy", () => {
  it("TRAVEL_AGENCY 구조를 올바르게 포맷한다", () => {
    const roleContent: TravelAgencyPromo = {
      role: "TRAVEL_AGENCY",
      productName: "상품",
      targetAudience: "타깃",
      sellingPoints: ["p1", "p2", "p3"],
      itineraryHighlight: "하이라이트",
    };
    const result = formatRoleContentForCopy(roleContent);
    expect(result).toContain("상품명: 상품");
    expect(result).toContain("1. p1");
    expect(result).toContain("2. p2");
    expect(result).toContain("3. p3");
    expect(result).toContain("일정 하이라이트: 하이라이트");
  });

  it("LOCAL_GOV — dataBasedEvidence/expectedEffects가 빈 배열이면 해당 섹션이 생략된다", () => {
    const roleContent: LocalGovPromo = {
      role: "LOCAL_GOV",
      title: "제목",
      lead: "리드",
      background: "배경",
      coreProgram: "프로그램",
      dataBasedEvidence: [],
      expectedEffects: [],
    };
    const result = formatRoleContentForCopy(roleContent);
    expect(result).not.toContain("데이터 기반 근거");
    expect(result).not.toContain("기대 효과");
  });

  it("LOCAL_GOV — 값이 있으면 근거/기대효과 섹션이 포함된다", () => {
    const roleContent: LocalGovPromo = {
      role: "LOCAL_GOV",
      title: "제목",
      lead: "리드",
      background: "배경",
      coreProgram: "프로그램",
      dataBasedEvidence: ["근거1"],
      expectedEffects: ["효과1"],
    };
    const result = formatRoleContentForCopy(roleContent);
    expect(result).toContain("데이터 기반 근거");
    expect(result).toContain("- 근거1");
    expect(result).toContain("기대 효과");
    expect(result).toContain("- 효과1");
  });

  it("FESTIVAL_PLANNER — 콘텐츠 구성/시간대/체류 유도/운영 체크리스트/위험요인이 모두 포함된다", () => {
    const roleContent: FestivalPlannerPromo = {
      role: "FESTIVAL_PLANNER",
      title: "제목",
      programHighlight: "콘텐츠 구성 요약",
      timeSlotPlan: ["1일차 10:00 — 경포대"],
      retentionTip: "체류 유도 힌트",
      operationChecklist: ["체크1"],
      risks: ["위험1"],
    };
    const result = formatRoleContentForCopy(roleContent);
    expect(result).toContain("콘텐츠 구성: 콘텐츠 구성 요약");
    expect(result).toContain("- 1일차 10:00 — 경포대");
    expect(result).toContain("체류 유도: 체류 유도 힌트");
    expect(result).toContain("- 체크1");
    expect(result).toContain("- 위험1");
  });
});

describe("formatFullPromoContentForCopy", () => {
  it("화면 표시 순서(제안서→랜딩→Instagram→블로그→역할별)와 동일한 순서로 결합한다", () => {
    const content = sampleContent("TRAVEL_AGENCY");
    const result = formatFullPromoContentForCopy(content);
    const order = ["[제안서 요약]", "[랜딩페이지]", "[Instagram]", "[블로그]", "[여행상품 홍보자료]"];
    let lastIndex = -1;
    for (const label of order) {
      const idx = result.indexOf(label);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("LOCAL_GOV 역할이면 마지막 섹션 라벨이 '보도자료'다", () => {
    const content = sampleContent("LOCAL_GOV");
    const result = formatFullPromoContentForCopy(content);
    expect(result).toContain("[보도자료]");
  });

  it("FESTIVAL_PLANNER 역할이면 마지막 섹션 라벨이 '프로그램 운영 자료'다", () => {
    const content = sampleContent("FESTIVAL_PLANNER");
    const result = formatFullPromoContentForCopy(content);
    expect(result).toContain("[프로그램 운영 자료]");
  });

  it("입력 객체를 mutate하지 않는다", () => {
    const content = sampleContent();
    const snapshot = JSON.parse(JSON.stringify(content));
    formatFullPromoContentForCopy(content);
    expect(content).toEqual(snapshot);
  });
});

describe("parseHashtagsInput", () => {
  it("쉼표·공백·줄바꿈을 구분자로 인식하고 순서를 유지한다", () => {
    expect(parseHashtagsInput("강릉시, 미식\n바다 여행")).toEqual(["강릉시", "미식", "바다", "여행"]);
  });

  it("선행 '#'만 한 번 제거한다(중복 # 방지)", () => {
    expect(parseHashtagsInput("#강릉시 ##미식")).toEqual(["강릉시", "#미식"]);
  });

  it("빈 항목은 제거된다", () => {
    expect(parseHashtagsInput("강릉시,,, 미식,   ")).toEqual(["강릉시", "미식"]);
  });

  it("대소문자·내부 문자를 임의로 정규화하지 않는다", () => {
    expect(parseHashtagsInput("Gangneung-Trip")).toEqual(["Gangneung-Trip"]);
  });
});
