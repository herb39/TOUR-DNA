import { describe, expect, it } from "vitest";
import {
  formatBlogForCopy,
  formatCardNewsForCopy,
  formatFullPromoContentForCopy,
  formatInstagramForCopy,
  formatLandingForCopy,
  formatProposalSummaryForCopy,
  formatRoleContentForCopy,
  parseHashtagsInput,
  roleContentSectionLabel,
} from "@/lib/domain/promoContentFormat";
import { ALL_PROMO_CHANNELS, buildPromoContent } from "@/lib/domain/promoContent";
import type {
  FestivalPlannerPromo,
  LocalGovPromo,
  PromoContent,
  PromoUserRole,
  TravelAgencyPromo,
} from "@/lib/domain/promoContent";

function sampleContent(
  role: PromoUserRole = "TRAVEL_AGENCY",
  nationality: "DOMESTIC" | "FOREIGN" = "DOMESTIC",
): PromoContent {
  return buildPromoContent({
    project: { role, regionName: "강릉시", nationality, travelYear: 2026, travelMonth: 9, preferredThemes: ["미식"] },
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

/** 채널 키 → 전체 복사 결과에 실제로 등장하는 라벨(promoContentFormat.ts의 channelSection과 동일한
 * 매핑이어야 한다 — 다른 매핑을 쓰면 이 테스트가 무의미해진다). */
function channelLabel(content: PromoContent, channel: (typeof ALL_PROMO_CHANNELS)[number]): string {
  if (channel === "roleContent") return `[${roleContentSectionLabel(content.roleContent.role)}]`;
  const LABELS: Record<Exclude<(typeof ALL_PROMO_CHANNELS)[number], "roleContent">, string> = {
    proposalSummary: "[제안서 요약]",
    landing: "[랜딩페이지]",
    instagram: "[Instagram]",
    blog: "[블로그]",
    cardNews: "[카드뉴스]",
  };
  return LABELS[channel];
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

describe("formatCardNewsForCopy", () => {
  it("슬라이드를 번호와 함께 제목/본문 순으로 결합한다", () => {
    const result = formatCardNewsForCopy({ slides: [{ title: "표지", body: "요약" }, { title: "장소", body: "설명" }] });
    expect(result).toBe("1. 표지\n요약\n\n2. 장소\n설명");
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

describe("formatFullPromoContentForCopy — 역할별 channelPriority 순서를 그대로 따른다(2026-08-01 보완)", () => {
  it("전체 복사 결과는 항상 content.channelPriority 순서와 정확히 일치한다(하드코딩된 순서가 아니라 실제 값을 검증)", () => {
    for (const role of ["TRAVEL_AGENCY", "LOCAL_GOV", "FESTIVAL_PLANNER"] as const) {
      const content = sampleContent(role);
      const result = formatFullPromoContentForCopy(content);
      const indices = content.channelPriority.map((channel) => result.indexOf(channelLabel(content, channel)));
      for (const idx of indices) expect(idx).toBeGreaterThanOrEqual(0);
      const sorted = [...indices].sort((a, b) => a - b);
      expect(indices).toEqual(sorted);
    }
  });

  it("지자체·관광재단 담당자는 보도자료(roleContent)·제안서 요약이 SNS·카드뉴스보다 먼저 나온다", () => {
    const content = sampleContent("LOCAL_GOV");
    const result = formatFullPromoContentForCopy(content);
    const govIdx = result.indexOf("[보도자료]");
    const proposalIdx = result.indexOf("[제안서 요약]");
    const instagramIdx = result.indexOf("[Instagram]");
    const cardNewsIdx = result.indexOf("[카드뉴스]");
    expect(govIdx).toBeGreaterThanOrEqual(0);
    expect(govIdx).toBeLessThan(instagramIdx);
    expect(govIdx).toBeLessThan(cardNewsIdx);
    expect(proposalIdx).toBeLessThan(instagramIdx);
    expect(proposalIdx).toBeLessThan(cardNewsIdx);
  });

  it("축제·행사 기획자는 SNS(Instagram)·카드뉴스가 보도자료류보다 먼저 나온다", () => {
    const content = sampleContent("FESTIVAL_PLANNER");
    const result = formatFullPromoContentForCopy(content);
    const instagramIdx = result.indexOf("[Instagram]");
    const cardNewsIdx = result.indexOf("[카드뉴스]");
    const proposalIdx = result.indexOf("[제안서 요약]");
    const landingIdx = result.indexOf("[랜딩페이지]");
    expect(instagramIdx).toBeGreaterThanOrEqual(0);
    expect(instagramIdx).toBeLessThan(proposalIdx);
    expect(instagramIdx).toBeLessThan(landingIdx);
    expect(cardNewsIdx).toBeLessThan(proposalIdx);
    expect(cardNewsIdx).toBeLessThan(landingIdx);
  });

  it("여행사·관광상품 기획자는 상품 소개문(roleContent)·SNS·블로그가 제안서 요약보다 먼저 나온다", () => {
    const content = sampleContent("TRAVEL_AGENCY");
    const result = formatFullPromoContentForCopy(content);
    const agencyIdx = result.indexOf("[여행상품 홍보자료]");
    const instagramIdx = result.indexOf("[Instagram]");
    const blogIdx = result.indexOf("[블로그]");
    const proposalIdx = result.indexOf("[제안서 요약]");
    expect(agencyIdx).toBeGreaterThanOrEqual(0);
    expect(agencyIdx).toBeLessThan(proposalIdx);
    expect(instagramIdx).toBeLessThan(proposalIdx);
    expect(blogIdx).toBeLessThan(proposalIdx);
  });

  it("카드뉴스 슬라이드 내용이 전체 복사 결과에 포함된다", () => {
    const content = sampleContent("TRAVEL_AGENCY");
    const result = formatFullPromoContentForCopy(content);
    expect(content.cardNews.slides.length).toBeGreaterThan(0);
    for (const slide of content.cardNews.slides) {
      expect(result).toContain(slide.title);
    }
  });

  it("모든 지원 채널(ALL_PROMO_CHANNELS)의 섹션 헤더가 전체 복사 결과에 정확히 한 번씩 등장한다", () => {
    // 2026-08-02 보완: 이전에는 `result.split(label).length - 1`로 라벨 문자열의 등장 "횟수"를
    // 셌다. 그런데 LOCAL_GOV(보도자료)의 roleContent.title 자체가 실제 언론 배포 관행에 따라
    // "[보도자료] 강릉시 ... 추진"처럼 라벨과 같은 대괄호 문구로 시작한다(promoContent.ts
    // buildLocalGovPromo) — 이는 채널이 중복 생성된 게 아니라 역할별 콘텐츠 "본문" 한 줄이 우연히
    // 섹션 헤더와 같은 문자열을 포함하는 경우다. formatFullPromoContentForCopy는 각 섹션을
    // `[label]\n본문` 형태로 만들어 헤더가 항상 "그 줄 전체와 정확히 일치하는 한 줄"이라는 포맷
    // 계약을 갖는다(promoContentFormat.ts channelSection/formatFullPromoContentForCopy 참고) —
    // 반면 title 안에 포함된 라벨 문구는 그 줄 전체와 일치하지 않는다(뒤에 추가 텍스트가 이어짐).
    // 그래서 부분 문자열 카운트 대신 "라벨과 정확히 일치하는 줄"의 개수만 센다 — 실제로 같은 채널이
    // 두 번 생성되는 회귀가 생기면 헤더 줄도 그대로 두 번 나타나므로 이 테스트는 여전히 감지한다.
    const content = sampleContent("LOCAL_GOV");
    const result = formatFullPromoContentForCopy(content);
    const lines = result.split("\n");
    for (const channel of ALL_PROMO_CHANNELS) {
      const label = channelLabel(content, channel);
      const headerLineCount = lines.filter((line) => line === label).length;
      expect(headerLineCount).toBe(1);
    }
  });

  it("역할별 콘텐츠 본문에 섹션 헤더와 같은 문구가 포함돼도(LOCAL_GOV의 '[보도자료]' 접두사 등) 중복 블록으로 오인하지 않는다", () => {
    const content = sampleContent("LOCAL_GOV");
    const result = formatFullPromoContentForCopy(content);
    // roleContent.title 자체에 라벨과 같은 문구가 포함돼 부분 문자열로는 2회 등장하지만(의도된
    // 동작), 실제 섹션 헤더 줄은 여전히 정확히 1개뿐이어야 한다.
    const govLabel = channelLabel(content, "roleContent");
    expect(result.split(govLabel).length - 1).toBeGreaterThanOrEqual(2);
    expect(result.split("\n").filter((line) => line === govLabel)).toHaveLength(1);
  });

  it("외국인 대상(FOREIGN)이면 전체 복사 결과 끝에 번역 안내가 포함된다", () => {
    const content = sampleContent("TRAVEL_AGENCY", "FOREIGN");
    expect(content.translationNotice).not.toBeNull();
    const result = formatFullPromoContentForCopy(content);
    expect(result).toContain("[안내]");
    expect(result).toContain(content.translationNotice as string);
  });

  it("내국인 대상(DOMESTIC)이면 번역 안내를 붙이지 않는다", () => {
    const content = sampleContent("TRAVEL_AGENCY", "DOMESTIC");
    expect(content.translationNotice).toBeNull();
    const result = formatFullPromoContentForCopy(content);
    expect(result).not.toContain("[안내]");
  });

  it("LOCAL_GOV 역할이면 역할별 섹션 라벨이 '보도자료'다", () => {
    const content = sampleContent("LOCAL_GOV");
    const result = formatFullPromoContentForCopy(content);
    expect(result).toContain("[보도자료]");
  });

  it("FESTIVAL_PLANNER 역할이면 역할별 섹션 라벨이 '프로그램 운영 자료'다", () => {
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
