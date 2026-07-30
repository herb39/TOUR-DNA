// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getProjectDetail = vi.fn();

vi.mock("@/lib/services/projectQueries", () => ({
  getProjectDetail: (...args: unknown[]) => getProjectDetail(...args),
}));

// print/page.tsx가 POI 적합도 요약(P0-1)을 계산할 때 @/lib/db(Prisma)까지 로드되는 실제 서비스 체인을
// 타지 않도록 모킹한다 — 이 테스트는 홍보자료 출력 로직만 검증하며, 실제 DB 연결(DATABASE_URL)이
// 필요 없어야 한다. 반환값은 "적합도 결과 없음"에 해당하며, 이 상태에서도 화면이 정상 렌더링됨을
// 함께 확인한다.
vi.mock("@/lib/services/poiFitService", () => ({
  buildStrategyPoiFitSummary: vi.fn().mockResolvedValue({ fitsByPoiId: {}, shortage: null }),
}));

import PrintPage from "@/app/projects/[id]/print/page";
import { buildPromoContent } from "@/lib/domain/promoContent";
import type { PromoContent } from "@/lib/domain/promoContent";

function samplePromoContent(role: "TRAVEL_AGENCY" | "LOCAL_GOV" = "TRAVEL_AGENCY"): PromoContent {
  return buildPromoContent({
    project: { role, regionName: "강릉시", nationality: "DOMESTIC", travelYear: 2026, travelMonth: 9, preferredThemes: [] },
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

// promoContent만 다르게 채우는 SelectedPlan/Project/AnalysisResult 고정 fixture — 실제 getProjectDetail
// 조회 결과 구조(select 아닌 전체 include)와 print/page.tsx가 실제로 읽는 필드만 갖췄다.
function baseProject(promoContent: unknown) {
  return {
    id: "project-1",
    name: "테스트 프로젝트",
    travelYear: 2026,
    travelMonth: 9,
    role: "TRAVEL_AGENCY",
    region: { name: "강릉시" },
    input: { duration: "DAY_TRIP", budgetLevel: "MID", transport: "PUBLIC_TRANSPORT", groupType: "FIT" },
    selectedPlan: {
      strategyResultId: "strategy-1",
      productName: "강릉 미식 코스",
      conceptText: "콘셉트",
      background: "배경",
      targetSummary: "타깃",
      course: {
        days: [
          {
            dayIndex: 1,
            items: [{ order: 1, poiId: "p1", poiName: "경포대", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "이동" }],
            lodging: null,
          },
        ],
      },
      operationChecklist: ["체크1"],
      risks: [{ risk: "위험1", mitigation: "대응1" }],
      kpis: [{ name: "kpi", method: "method" }],
      promoContent,
    },
    analysisResult: {
      strategyResults: [{ id: "strategy-1", name: "로컬미식·시장 연계형", totalScore: 82 }],
      evidences: [],
      modelVersion: "tour-dna-v1.0.0",
    },
  };
}

async function renderPrintPage(promoContent: unknown) {
  getProjectDetail.mockResolvedValue(baseProject(promoContent));
  const ui = await PrintPage({ params: Promise.resolve({ id: "project-1" }) });
  render(ui);
}

beforeEach(() => {
  getProjectDetail.mockReset();
});

describe("PrintPage — 홍보자료 출력", () => {
  it("유효한 콘텐츠가 있으면 홍보자료를 출력한다", async () => {
    await renderPrintPage(JSON.parse(JSON.stringify(samplePromoContent())));
    expect(screen.getByText("홍보자료")).toBeInTheDocument();
  });

  it("promoContent가 DB NULL이면 홍보자료 섹션을 출력하지 않는다", async () => {
    await renderPrintPage(null);
    expect(screen.queryByText("홍보자료")).not.toBeInTheDocument();
  });

  it("잘못된 JSON이면 홍보자료 섹션을 출력하지 않는다(조용히 잘못된 데이터를 출력하지 않음)", async () => {
    await renderPrintPage({ garbage: true });
    expect(screen.queryByText("홍보자료")).not.toBeInTheDocument();
  });

  it("TRAVEL_AGENCY 역할이면 여행상품 홍보자료 구조로 출력된다", async () => {
    await renderPrintPage(JSON.parse(JSON.stringify(samplePromoContent("TRAVEL_AGENCY"))));
    expect(screen.getByText("여행상품 홍보자료")).toBeInTheDocument();
    expect(screen.queryByText("보도자료")).not.toBeInTheDocument();
  });

  it("LOCAL_GOV 역할이면 보도자료 구조로 출력된다", async () => {
    await renderPrintPage(JSON.parse(JSON.stringify(samplePromoContent("LOCAL_GOV"))));
    expect(screen.getByText("보도자료")).toBeInTheDocument();
    expect(screen.queryByText("여행상품 홍보자료")).not.toBeInTheDocument();
  });

  it("textarea나 편집·저장·복사 버튼이 없다(읽기 전용 출력 — 기존 '인쇄/PDF 저장' 버튼은 예외)", async () => {
    await renderPrintPage(JSON.parse(JSON.stringify(samplePromoContent())));
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재생성" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /복사/ })).not.toBeInTheDocument();
  });
});
