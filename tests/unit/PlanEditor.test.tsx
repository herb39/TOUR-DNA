// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/plan/actions", () => ({
  savePlanAction: vi.fn(async (state: unknown) => state),
  searchAvailablePoisAction: vi.fn(async () => []),
  fetchPlanRouteGeometryAction: vi.fn(async () => ({ segments: [] })),
}));

import { PlanEditor, computeDragOutcome, type PlanEditorData } from "@/components/plan/PlanEditor";
import { savePlanAction, searchAvailablePoisAction } from "@/app/projects/[id]/plan/actions";
import type { PoiFitResult } from "@/lib/domain/poiFit";
import type { CourseDay } from "@/lib/domain/planBuilder";
import type { CandidatePoi } from "@/lib/services/candidatePoolService";
import type { AnchorCandidate } from "@/lib/services/anchorCandidateService";

function makePlan(): PlanEditorData {
  return {
    id: "plan-1",
    projectId: "project-1",
    regionId: "region-1",
    transport: "PUBLIC_TRANSPORT",
    productName: "테스트 상품",
    conceptText: "콘셉트",
    background: "배경",
    targetSummary: "타깃",
    sellingPoints: [],
    course: {
      days: [
        {
          dayIndex: 1,
          items: [
            {
              order: 1,
              poiId: "poi-a",
              poiName: "A장소",
              category: "FOOD",
              timeSlot: "10:00",
              stayMinutes: 60,
              travel: "숙소/집결지에서 이동",
              lat: 36.35,
              lng: 127.38,
            },
            {
              order: 2,
              poiId: "poi-b",
              poiName: "B장소",
              category: "FOOD",
              timeSlot: "13:00",
              stayMinutes: 60,
              travel: "이동 15~20분",
              lat: 36.4,
              lng: 127.45,
            },
          ],
        },
        { dayIndex: 2, items: [] },
      ],
    },
    operationChecklist: [],
    risks: [],
    kpis: [],
    memo: "",
    kpiMemo: "",
    primaryGoalCode: null,
    primaryGoalLabel: null,
  };
}

const plan = makePlan();

function makeFestivalAnchorPlan(timeOverrides: Partial<NonNullable<PlanEditorData["festivalAnchor"]>> = {}): PlanEditorData {
  const result = makePlan();
  result.festivalAnchor = {
    id: "anchor-1",
    projectId: "project-1",
    status: "CONFIRMED",
    source: "TOUR_API",
    sourceId: "festival-1",
    contentTypeId: "15",
    name: "지역 축제",
    eventStartDate: "2026-10-10",
    eventEndDate: "2026-10-12",
    plannedDate: "2026-10-10",
    plannedDayIndex: 1,
    timeStatus: "USER_CONFIRMED",
    timeSlot: "CUSTOM",
    timeStart: "15:00",
    timeEnd: "17:00",
    regionCode: "11110",
    address: "축제장",
    lat: 36.35,
    lng: 127.38,
    sourceSnapshot: {},
    provenance: {},
    confirmedAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T01:00:00.000Z",
    ...timeOverrides,
  };
  return result;
}

function timeInputValue(poiName: string): string {
  return (screen.getByLabelText(`${poiName} 시간`) as HTMLInputElement).value;
}

describe("PlanEditor 실시간 코스 품질검증", () => {
  it("현재 days 편집 상태를 기준으로 advisory 패널을 보여주고 저장 차단이 아님을 안내한다", () => {
    render(<PlanEditor plan={makePlan()} />);

    expect(screen.getByRole("region", { name: "실시간 코스 품질검증" })).toBeInTheDocument();
    expect(screen.getByText(/경고가 있어도 저장은 계속할 수 있습니다/)).toBeInTheDocument();
  });

  it("반려동물 조건이 선택되면 코스·추천 후보에 상태 배지를 표시한다", () => {
    const petPlan = makePlan();
    petPlan.petConditionActive = true;
    petPlan.petEvidenceByPoiId = {
      "poi-a": {
        status: "CONFIRMED",
        label: "공식 동반 정보 확인",
        detailLines: ["공식 동반 범위: 전구역 동반가능"],
        sourceLabel: "한국관광공사 반려동물 동반여행 정보",
        fetchedAtLabel: "2026.08.19",
        scope: "ALL",
      },
      "poi-b": {
        status: "CONDITIONAL",
        label: "조건부 동반",
        detailLines: ["필요 사항: 목줄 필요"],
        sourceLabel: "한국관광공사 반려동물 동반여행 정보",
        fetchedAtLabel: "2026.08.19",
        scope: "PARTIAL",
      },
    };
    render(
      <PlanEditor
        plan={petPlan}
        candidatePois={[
          {
            id: "pet-candidate",
            name: "반려 후보",
            category: "ATTRACTION",
            lat: 36.3,
            lng: 127.3,
            fit: {
              totalScore: 90,
              grade: "HIGH",
              recommendationStatus: "RECOMMENDED",
              breakdown: {
                categoryFit: { score: 30, tier: "CORE" },
                themeFit: { score: 45, evaluated: true, matched: true, source: "STRUCTURAL" },
                seasonFit: { score: 20, isIdealMonth: true },
              },
              positiveReasons: [],
              cautions: [],
              dataSource: {
                provenance: "LIVE_API",
                sourceLabel: "공식",
                operatingHoursConfirmed: false,
                operatingHoursText: null,
                closedDaysText: null,
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getAllByTestId("pet-evidence").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("공식 동반 정보 확인").length).toBeGreaterThan(0);
    expect(screen.getAllByText("조건부 동반").length).toBeGreaterThan(0);
    expect(screen.getAllByText("동반 정보 미확인").length).toBeGreaterThan(0);
    expect(screen.getByText(/정보 없음이 이용 불가를 의미하지 않습니다/)).toBeInTheDocument();
  });

  it("반려동물 조건이 없으면 PET 배지와 advisory를 표시하지 않는다", () => {
    render(<PlanEditor plan={makePlan()} />);

    expect(screen.queryByTestId("pet-evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("반려동물 동반 정보")).not.toBeInTheDocument();
  });

  it("무장애 조건이 선택되면 코스·추천 후보에 차원 근거와 미확인 advisory를 표시한다", () => {
    const accessibilityPlan = makePlan();
    accessibilityPlan.accessibilityConditionActive = true;
    accessibilityPlan.accessibilityEvidenceByPoiId = {
      "poi-a": {
        status: "OFFICIAL_INFO_AVAILABLE",
        label: "공식 접근성 정보",
        dimensions: [
          {
            key: "parking",
            label: "주차",
            status: "AVAILABLE",
            statusLabel: "이용 가능/설치 정보 있음",
            rawText: "주차 가능",
          },
        ],
        sourceLabel: "한국관광공사 공식 무장애 여행정보",
        fetchedAtLabel: "2026.08.25",
        hasMeaningfulDimensions: true,
      },
    };
    render(
      <PlanEditor
        plan={accessibilityPlan}
        candidatePois={[
          {
            id: "accessibility-candidate",
            name: "접근성 후보",
            category: "ATTRACTION",
            lat: 36.3,
            lng: 127.3,
            fit: {
              totalScore: 90,
              grade: "HIGH",
              recommendationStatus: "RECOMMENDED",
              breakdown: {
                categoryFit: { score: 30, tier: "CORE" },
                themeFit: { score: 45, evaluated: true, matched: true, source: "STRUCTURAL" },
                seasonFit: { score: 20, isIdealMonth: true },
              },
              positiveReasons: [],
              cautions: [],
              dataSource: {
                provenance: "LIVE_API",
                sourceLabel: "공식",
                operatingHoursConfirmed: false,
                operatingHoursText: null,
                closedDaysText: null,
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getAllByTestId("accessibility-evidence").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/공식 접근성 정보/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("공식 접근성 정보 미확인").length).toBeGreaterThan(0);
    expect(screen.getByText(/코스 2곳 중 1곳/)).toBeInTheDocument();
    expect(screen.getAllByText(/정보 미확인은 접근 불가를 뜻하지 않습니다/).length).toBeGreaterThan(0);
  });

  it("무장애 조건이 없으면 ACCESSIBILITY 배지를 표시하지 않는다", () => {
    render(<PlanEditor plan={makePlan()} />);

    expect(screen.queryByTestId("accessibility-evidence")).not.toBeInTheDocument();
    expect(screen.queryByText("무장애 공식 정보")).not.toBeInTheDocument();
  });
});

describe("PlanEditor — 확정 축제 Anchor 코스 연결(P1-2b)", () => {
  it("명시적으로 고정하면 기존 POI를 보존하고 Anchor는 고정 일정으로 표시한다", () => {
    render(<PlanEditor plan={makeFestivalAnchorPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "이 축제를 코스에 고정" }));

    expect(screen.getAllByText("지역 축제").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("축제 Anchor", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("A장소")).toBeInTheDocument();
    expect(screen.getByText("B장소")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지역 축제 코스에서만 제거" })).toBeInTheDocument();
    expect(screen.queryByLabelText("지역 축제 시간")).not.toBeInTheDocument();

    const submittedDays = JSON.parse((document.querySelector('input[name="courseJson"]') as HTMLInputElement).value).days;
    const anchorItem = submittedDays[0].items.find((item: { kind?: string }) => item.kind === "FESTIVAL_ANCHOR");
    expect(anchorItem).toMatchObject({
      poiId: "festival-anchor:anchor-1",
      timeSlot: "15:00",
      anchorUpdatedAt: "2026-08-18T01:00:00.000Z",
    });
    expect(submittedDays[0].items.map((item: { poiId: string }) => item.poiId)).toEqual([
      "poi-a",
      "poi-b",
      "festival-anchor:anchor-1",
    ]);
  });

  it("시간대만 있거나 미확정인 Anchor는 고정 버튼 대신 정확한 시각 확정을 안내한다", () => {
    render(
      <PlanEditor
        plan={makeFestivalAnchorPlan({ timeStatus: "UNCONFIRMED", timeSlot: "AFTERNOON", timeStart: null, timeEnd: null })}
      />,
    );

    expect(screen.queryByRole("button", { name: "이 축제를 코스에 고정" })).not.toBeInTheDocument();
    expect(screen.getByText(/정확한 시작·종료 시각을 확정해야 합니다/)).toBeInTheDocument();
  });

  it("Anchor를 코스에서만 제거하면 프로젝트 Anchor 안내는 남고 기존 POI는 유지된다", () => {
    const planWithAnchor = makeFestivalAnchorPlan();
    planWithAnchor.course.days[0].items.splice(1, 0, {
      kind: "FESTIVAL_ANCHOR",
      order: 2,
      poiId: "festival-anchor:anchor-1",
      poiName: "지역 축제",
      category: "FESTIVAL",
      timeSlot: "15:00",
      stayMinutes: 120,
      travel: "축제 Anchor",
      anchorId: "anchor-1",
      anchorUpdatedAt: "2026-08-18T01:00:00.000Z",
      anchorSourceId: "festival-1",
      anchorEventStartDate: "2026-10-10",
      anchorEventEndDate: "2026-10-12",
      anchorPlannedDate: "2026-10-10",
      anchorPlannedDayIndex: 1,
      anchorTimeStatus: "USER_CONFIRMED",
      anchorTimeSlot: "CUSTOM",
      anchorTimeStart: "15:00",
      anchorTimeEnd: "17:00",
    });
    render(<PlanEditor plan={planWithAnchor} />);

    fireEvent.click(screen.getByRole("button", { name: "지역 축제 코스에서만 제거" }));

    expect(screen.queryByRole("button", { name: "지역 축제 코스에서만 제거" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 축제를 코스에 고정" })).toBeInTheDocument();
    expect(screen.getByText("A장소")).toBeInTheDocument();
    expect(screen.getByText("B장소")).toBeInTheDocument();
  });
});

describe("PlanEditor 코스 순서 변경", () => {
  it("위/아래로 이동하면 목록 순서만 바뀌고 각 장소가 가진 시간은 그대로 유지된다", () => {
    render(<PlanEditor plan={plan} />);

    expect(timeInputValue("A장소")).toBe("10:00");
    expect(timeInputValue("B장소")).toBe("13:00");

    fireEvent.click(screen.getByLabelText("B장소 위로 이동"));

    // 순서만 바뀌고 각자의 시간은 그대로다 — B(13:00)가 A(10:00)보다 앞에 오게 되어 시간이 거꾸로
    // 흐르므로, 실행 가능성 경고가 떠야 한다.
    expect(timeInputValue("A장소")).toBe("10:00");
    expect(timeInputValue("B장소")).toBe("13:00");
    expect(screen.getByText(/전에 시작합니다/)).toBeInTheDocument();
  });

  it("시간을 직접 입력해 순서를 바로잡으면 경고가 사라진다", () => {
    render(<PlanEditor plan={makePlan()} />);
    fireEvent.click(screen.getByLabelText("B장소 위로 이동"));
    expect(screen.getByText(/전에 시작합니다/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("B장소 시간"), { target: { value: "09:00" } });

    expect(timeInputValue("B장소")).toBe("09:00");
    expect(screen.queryByText(/전에 시작합니다/)).not.toBeInTheDocument();
  });
});

describe("PlanEditor 코스 추가/삭제/이동", () => {
  it("삭제 버튼을 누르면 목록에서 빠진다", () => {
    render(<PlanEditor plan={makePlan()} />);

    fireEvent.click(screen.getByLabelText("A장소 삭제"));

    expect(screen.queryByText("A장소")).not.toBeInTheDocument();
    expect(screen.getByText("B장소")).toBeInTheDocument();
  });

  it("다른 날짜로 이동하면 원래 날짜에서는 빠지고, 대상 날짜에서는 원래 시간을 그대로 유지한 채 나타난다", () => {
    render(<PlanEditor plan={makePlan()} />);

    const select = screen.getByLabelText("A장소 다른 날짜로 이동") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });

    expect(screen.getByText("B장소")).toBeInTheDocument();
    expect(screen.getByText("A장소")).toBeInTheDocument();
    expect(timeInputValue("A장소")).toBe("10:00");
  });

  it("검색 결과에서 장소를 골라 추가하면 해당 날짜에 새 항목으로 들어간다", async () => {
    vi.mocked(searchAvailablePoisAction).mockResolvedValueOnce([
      { id: "poi-c", name: "C장소", category: "EXPERIENCE", address: "어딘가", lat: 36.35, lng: 127.38, operatingHours: null, closedDays: null },
    ]);

    render(<PlanEditor plan={makePlan()} />);

    // 1일차(2곳)/2일차(0곳) 둘 다 여유가 있어 "+ 장소 추가" 버튼이 2개 나온다 — 2일차(두 번째) 버튼을 누른다
    const addButtons = screen.getAllByRole("button", { name: "+ 장소 추가" });
    expect(addButtons).toHaveLength(2);
    fireEvent.click(addButtons[1]);
    fireEvent.change(screen.getByPlaceholderText("장소 이름 검색"), { target: { value: "C" } });

    const addButton = await screen.findByLabelText("C장소 코스에 추가");
    fireEvent.click(addButton);

    expect(await screen.findByText("C장소")).toBeInTheDocument();
    expect(timeInputValue("C장소")).toBe("10:00");
    // 추가 후에는 검색 패널이 닫히고 다시 "+ 장소 추가" 버튼으로 돌아간다
    expect(screen.getAllByRole("button", { name: "+ 장소 추가" })).toHaveLength(2);
  });

  it("하루에 이미 4곳이 있어도 제한 없이 더 추가할 수 있고, 5번째 장소는 기본 간격으로 이어진 시간을 받는다", async () => {
    vi.mocked(searchAvailablePoisAction).mockResolvedValueOnce([
      { id: "poi-e", name: "E장소", category: "EXPERIENCE", address: "어딘가", lat: 36.4, lng: 127.4, operatingHours: null, closedDays: null },
    ]);
    const fullPlan = makePlan();
    fullPlan.course.days[0].items = [
      { order: 1, poiId: "p1", poiName: "P1", category: "FOOD", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" },
      { order: 2, poiId: "p2", poiName: "P2", category: "FOOD", timeSlot: "13:00", stayMinutes: 60, travel: "" },
      { order: 3, poiId: "p3", poiName: "P3", category: "FOOD", timeSlot: "16:00", stayMinutes: 60, travel: "" },
      { order: 4, poiId: "p4", poiName: "P4", category: "FOOD", timeSlot: "18:30", stayMinutes: 60, travel: "" },
    ];
    render(<PlanEditor plan={fullPlan} />);

    const addButtons = screen.getAllByRole("button", { name: "+ 장소 추가" });
    fireEvent.click(addButtons[0]); // 이미 4곳인 1일차에도 추가 버튼이 존재하고 눌러진다(제한 없음)
    fireEvent.change(screen.getByPlaceholderText("장소 이름 검색"), { target: { value: "E" } });

    const addButton = await screen.findByLabelText("E장소 코스에 추가");
    fireEvent.click(addButton);

    expect(await screen.findByText("E장소")).toBeInTheDocument();
    // 고정 슬롯(10:00,13:00,16:00,18:30) 다음 자리는 마지막 슬롯에서 150분씩 이어간다 → 21:00
    expect(timeInputValue("E장소")).toBe("21:00");
  });

  it("체류시간을 직접 수정할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} />);

    const stayInput = screen.getByLabelText("A장소 체류시간(분)") as HTMLInputElement;
    expect(stayInput.value).toBe("60");

    fireEvent.change(stayInput, { target: { value: "90" } });

    expect((screen.getByLabelText("A장소 체류시간(분)") as HTMLInputElement).value).toBe("90");
  });
});

/** 운영 체크리스트/위험/KPI/메모는 기본 화면 밀도를 줄이기 위해 <details>로 접었다(2026-08-08,
 * 정보 위계 개선) — 기본 상태에서는 네이티브 <details>가 내용을 접근성 트리에서 숨기므로, "추가"
 * 버튼 등을 상호작용하기 전에 해당 <summary>를 먼저 열어야 한다. */
function openAllPlanDetails() {
  fireEvent.click(screen.getByText(/운영 체크리스트 보기/));
  fireEvent.click(screen.getByText(/위험과 대응안 보기/));
  fireEvent.click(screen.getByText(/KPI 보기/));
}

describe("PlanEditor 운영 체크리스트/위험/KPI 편집", () => {
  it("운영 체크리스트 항목을 추가하고 삭제할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} />);
    openAllPlanDetails();

    fireEvent.change(screen.getByPlaceholderText("새 체크리스트 항목"), { target: { value: "우천 대비 우산 준비" } });
    // "추가" 버튼은 체크리스트(0)/위험(1)/KPI(2) 순서로 나온다
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[0]);

    expect(screen.getByText("· 우천 대비 우산 준비")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('체크리스트 "우천 대비 우산 준비" 삭제'));
    expect(screen.queryByText("· 우천 대비 우산 준비")).not.toBeInTheDocument();
  });

  it("위험 요인/대응안을 추가하고 삭제할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} />);
    openAllPlanDetails();

    fireEvent.change(screen.getByPlaceholderText("새 위험 요인"), { target: { value: "주차 공간 부족" } });
    fireEvent.change(screen.getByPlaceholderText("대응안"), { target: { value: "인근 공영주차장 사전 안내" } });
    // "추가" 버튼은 체크리스트(0)/위험(1)/KPI(2) 순서로 나온다
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[1]);

    expect(screen.getByText("주차 공간 부족")).toBeInTheDocument();
    expect(screen.getByText(/인근 공영주차장 사전 안내/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('위험 요인 "주차 공간 부족" 삭제'));
    expect(screen.queryByText("주차 공간 부족")).not.toBeInTheDocument();
  });

  it("KPI를 추가하고 삭제할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} />);
    openAllPlanDetails();

    fireEvent.change(screen.getByPlaceholderText("새 KPI 이름"), { target: { value: "재방문율" } });
    fireEvent.change(screen.getByPlaceholderText("측정 방법"), { target: { value: "3개월 후 설문" } });
    // "추가" 버튼은 체크리스트(0)/위험(1)/KPI(2) 순서로 나온다
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[2]);

    expect(screen.getByText("재방문율")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('KPI "재방문율" 삭제'));
    expect(screen.queryByText("재방문율")).not.toBeInTheDocument();
  });

  it("새로 추가한 KPI도 측정 목적·연결 축·목표값 근거가 자동으로 채워진다(KPI 연결 보강)", () => {
    render(<PlanEditor plan={makePlan()} />);
    openAllPlanDetails();

    fireEvent.change(screen.getByPlaceholderText("새 KPI 이름"), { target: { value: "숙박 전환율" } });
    fireEvent.change(screen.getByPlaceholderText("측정 방법"), { target: { value: "예약 데이터 비교" } });
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[2]);

    expect(screen.getByText(/측정 목적:/)).toBeInTheDocument();
    expect(screen.getByText("체류(Stay)")).toBeInTheDocument();
    expect(screen.getByText(/기관 설정 필요/)).toBeInTheDocument();
  });
});

/** 정보 위계 개선(2026-08-08) — 운영 체크리스트/위험과 대응안/KPI/메모는 기본 화면 밀도를 줄이기
 * 위해 <details>로 접었다. 개수 요약이 summary에 보이고, 기본 상태는 닫혀 있어야 한다. */
describe("PlanEditor — 정보 위계 개선(체크리스트·위험·KPI·메모 기본 접힘)", () => {
  it("운영 체크리스트/위험과 대응안/KPI/메모는 기본적으로 접혀 있고 summary에 개수가 보인다", () => {
    render(<PlanEditor plan={makePlan()} />);

    const checklistDetails = screen.getByText(/운영 체크리스트 보기/).closest("details");
    const riskDetails = screen.getByText(/위험과 대응안 보기/).closest("details");
    const kpiDetails = screen.getByText(/KPI 보기/).closest("details");
    const memoDetails = screen.getByText("운영 메모 보기").closest("details");

    for (const details of [checklistDetails, riskDetails, kpiDetails, memoDetails]) {
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
    }
  });
});

describe("PlanEditor FOOD 목적 라벨(5단계 — 식사와 일반 방문 구분)", () => {
  function makePlanWithPurposes(): PlanEditorData {
    const base = makePlan();
    base.course.days[0].items = [
      { order: 1, poiId: "lunch-poi", poiName: "점심장소", category: "FOOD", timeSlot: "12:00", stayMinutes: 60, travel: "숙소/집결지에서 이동", mealPurpose: "LUNCH" },
      { order: 2, poiId: "dinner-poi", poiName: "저녁장소", category: "FOOD", timeSlot: "18:00", stayMinutes: 60, travel: "", mealPurpose: "DINNER" },
      { order: 3, poiId: "cafe-poi", poiName: "카페장소", category: "FOOD", timeSlot: "15:00", stayMinutes: 60, travel: "", mealPurpose: "GENERAL" },
      { order: 4, poiId: "attr-poi", poiName: "관광장소", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "" },
      { order: 5, poiId: "legacy-poi", poiName: "레거시장소", category: "FOOD", timeSlot: "20:00", stayMinutes: 60, travel: "" }, // mealPurpose 필드 자체가 없는 기존 저장 데이터
    ];
    return base;
  }

  it("점심·저녁·카페(일반 방문)를 서로 다른 라벨로 표시하고, ATTRACTION은 그대로 카테고리만 표시한다", () => {
    render(<PlanEditor plan={makePlanWithPurposes()} />);

    expect(screen.getByText(/FOOD · 점심/)).toBeInTheDocument();
    expect(screen.getByText(/FOOD · 저녁/)).toBeInTheDocument();
    expect(screen.getByText(/FOOD · 카페\/일반 방문/)).toBeInTheDocument();
    expect(screen.getByText(/\(ATTRACTION,/)).toBeInTheDocument();
  });

  it("mealPurpose 필드가 없는 legacy FOOD 항목도 크래시 없이 렌더링된다", () => {
    expect(() => render(<PlanEditor plan={makePlanWithPurposes()} />)).not.toThrow();
    expect(screen.getByText("레거시장소")).toBeInTheDocument();
  });

  it("장소를 다른 날짜로 옮기거나 순서를 바꿔도 mealPurpose 라벨이 그대로 유지된다", () => {
    render(<PlanEditor plan={makePlanWithPurposes()} />);

    fireEvent.click(screen.getByLabelText("점심장소 위로 이동"));

    expect(screen.getByText(/FOOD · 점심/)).toBeInTheDocument();
    expect(screen.getByText(/FOOD · 저녁/)).toBeInTheDocument();
  });

  it("저장 시 courseJson에 mealPurpose가 optional 필드로 그대로 포함된다", async () => {
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-07-26T00:00:00.000Z" });
    render(<PlanEditor plan={makePlanWithPurposes()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("모든 변경사항이 저장되었습니다.");

    const lastCall = vi.mocked(savePlanAction).mock.calls[vi.mocked(savePlanAction).mock.calls.length - 1];
    const submittedFormData = lastCall[3] as FormData;
    const submittedItems = JSON.parse(submittedFormData.get("courseJson") as string).days[0].items;

    expect(submittedItems.find((i: { poiId: string }) => i.poiId === "lunch-poi").mealPurpose).toBe("LUNCH");
    expect(submittedItems.find((i: { poiId: string }) => i.poiId === "dinner-poi").mealPurpose).toBe("DINNER");
    expect(submittedItems.find((i: { poiId: string }) => i.poiId === "cafe-poi").mealPurpose).toBe("GENERAL");
    expect(submittedItems.find((i: { poiId: string }) => i.poiId === "legacy-poi").mealPurpose).toBeUndefined();
  });
});

describe("PlanEditor 30분 단위 정렬 시각 저장·재진입 일관성(6단계 회귀)", () => {
  function makePlanWithAlignedTimes(): PlanEditorData {
    const base = makePlan();
    base.course.days[0].items = [
      { order: 1, poiId: "p1", poiName: "P1장소", category: "ATTRACTION", timeSlot: "11:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" },
      { order: 2, poiId: "p2", poiName: "P2장소", category: "FOOD", timeSlot: "12:30", stayMinutes: 60, travel: "", mealPurpose: "LUNCH" },
      { order: 3, poiId: "p3", poiName: "P3장소", category: "ATTRACTION", timeSlot: "14:00", stayMinutes: 60, travel: "" },
    ];
    return base;
  }

  it("자동 생성 결과(00분/30분 timeSlot)가 화면에 그대로 표시되고, 저장 payload에도 그대로 유지된다", async () => {
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-07-26T00:00:00.000Z" });
    render(<PlanEditor plan={makePlanWithAlignedTimes()} />);

    expect(timeInputValue("P1장소")).toBe("11:00");
    expect(timeInputValue("P2장소")).toBe("12:30");
    expect(timeInputValue("P3장소")).toBe("14:00");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("모든 변경사항이 저장되었습니다.");

    const lastCall = vi.mocked(savePlanAction).mock.calls[vi.mocked(savePlanAction).mock.calls.length - 1];
    const submittedFormData = lastCall[3] as FormData;
    const submittedItems = JSON.parse(submittedFormData.get("courseJson") as string).days[0].items;

    for (const item of submittedItems) {
      const [, minute] = item.timeSlot.split(":").map(Number);
      expect(minute === 0 || minute === 30).toBe(true);
    }
    // mealPurpose 라벨도 저장 후 그대로 유지된다.
    expect(submittedItems.find((i: { poiId: string }) => i.poiId === "p2").mealPurpose).toBe("LUNCH");
  });

  it("순서를 변경해도 각 항목의 정렬된 timeSlot 값 자체는 바뀌지 않는다(화면 표시만 바뀌는 것이 아님을 확인)", () => {
    render(<PlanEditor plan={makePlanWithAlignedTimes()} />);

    fireEvent.click(screen.getByLabelText("P2장소 위로 이동"));

    // 순서만 바뀌고 각 장소의 timeSlot 값 자체는 그대로 유지된다.
    expect(timeInputValue("P1장소")).toBe("11:00");
    expect(timeInputValue("P2장소")).toBe("12:30");
    expect(timeInputValue("P3장소")).toBe("14:00");
  });
});

describe("PlanEditor 숙박 읽기 전용 표시", () => {
  function makePlanWithLodging(): PlanEditorData {
    const base = makePlan();
    base.course.days[0].lodging = {
      order: 1,
      poiId: "poi-lodge",
      poiName: "숙소장소",
      category: "LODGING",
      timeSlot: "20:00",
      stayMinutes: 0,
      travel: "이동 약 10분(약 1.0km, 대중교통 기준)",
    };
    // 2일차는 lodging 필드 자체가 없는 기존 저장 데이터를 그대로 흉내(undefined)
    return base;
  }

  it("lodging이 있으면 숙박 카드로 장소명과 체크인 시각이 표시된다", () => {
    render(<PlanEditor plan={makePlanWithLodging()} />);

    expect(screen.getByText("숙박")).toBeInTheDocument();
    expect(screen.getByText("숙소장소")).toBeInTheDocument();
    expect(screen.getByText("20:00 체크인")).toBeInTheDocument();
  });

  it("lodging이 없으면(undefined) 숙박 영역이 표시되지 않는다", () => {
    render(<PlanEditor plan={makePlan()} />);

    expect(screen.queryByText("숙박")).not.toBeInTheDocument();
  });

  it("숙박은 일반 일정 목록(순서/위·아래 이동 버튼)에 포함되지 않는다", () => {
    render(<PlanEditor plan={makePlanWithLodging()} />);

    // 숙박 장소명은 표시되지만, 일반 항목처럼 시간 입력/위아래 이동/삭제 버튼이 붙지 않는다.
    expect(screen.queryByLabelText("숙소장소 시간")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("숙소장소 위로 이동")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("숙소장소 삭제")).not.toBeInTheDocument();
    // 일반 항목(A장소/B장소)의 위/아래 이동 버튼 개수는 숙박과 무관하게 그대로다(총 4개: 각 2개씩).
    expect(screen.getAllByLabelText(/위로 이동$|아래로 이동$/)).toHaveLength(4);
  });
});

describe("PlanEditor 저장 후 날짜 select 값 유지(회귀)", () => {
  function makeThreeDayPlan(): PlanEditorData {
    const base = makePlan();
    base.course.days = [
      {
        dayIndex: 1,
        items: [{ order: 1, poiId: "d1", poiName: "D1장소", category: "FOOD", timeSlot: "09:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" }],
        lodging: { order: 1, poiId: "lodge-1", poiName: "1일차숙소", category: "LODGING", timeSlot: "20:00", stayMinutes: 0, travel: "이동 약 5분" },
      },
      { dayIndex: 2, items: [{ order: 1, poiId: "d2", poiName: "D2장소", category: "FOOD", timeSlot: "11:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" }] },
      { dayIndex: 3, items: [{ order: 1, poiId: "d3", poiName: "D3장소", category: "FOOD", timeSlot: "14:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" }] },
    ];
    return base;
  }

  function selectValue(poiName: string): string {
    return (screen.getByLabelText(`${poiName} 다른 날짜로 이동`) as HTMLSelectElement).value;
  }

  it("2박 3일 저장 전에는 각 항목의 날짜 select가 서로 다른 값(1/2/3)으로 표시된다", () => {
    render(<PlanEditor plan={makeThreeDayPlan()} />);

    expect(selectValue("D1장소")).toBe("1");
    expect(selectValue("D2장소")).toBe("2");
    expect(selectValue("D3장소")).toBe("3");
  });

  it("저장(성공) 후에도 각 항목의 날짜 select가 1일차·2일차·3일차로 그대로 유지된다", async () => {
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-07-23T00:00:00.000Z" });
    render(<PlanEditor plan={makeThreeDayPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("모든 변경사항이 저장되었습니다.");

    expect(selectValue("D1장소")).toBe("1");
    expect(selectValue("D2장소")).toBe("2");
    expect(selectValue("D3장소")).toBe("3");
  });

  it("저장 후에도 시간 입력값과 lodging 표시가 그대로 유지된다(회귀가 select에만 국한되는지 확인)", async () => {
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-07-23T00:00:00.000Z" });
    render(<PlanEditor plan={makeThreeDayPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("모든 변경사항이 저장되었습니다.");

    expect(timeInputValue("D1장소")).toBe("09:00");
    expect(timeInputValue("D2장소")).toBe("11:00");
    expect(timeInputValue("D3장소")).toBe("14:00");
    expect(screen.getByText("1일차숙소")).toBeInTheDocument();
    expect(screen.getByText("20:00 체크인")).toBeInTheDocument();
  });

  it("저장 시 실제로 서버 액션에 전달되는 courseJson에 dayIndex와 lodging이 그대로 보존된다", async () => {
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-07-23T00:00:00.000Z" });
    render(<PlanEditor plan={makeThreeDayPlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("모든 변경사항이 저장되었습니다.");

    // savePlanAction은 컴포넌트 안에서 .bind(null, plan.id, plan.projectId)로 감싸져 호출되므로,
    // 실제 mock 호출 인자는 [planId, projectId, prevState, formData] 순서다.
    const lastCall = vi.mocked(savePlanAction).mock.calls[vi.mocked(savePlanAction).mock.calls.length - 1];
    const submittedFormData = lastCall[3] as FormData;
    const submittedDays = JSON.parse(submittedFormData.get("courseJson") as string).days;

    expect(submittedDays.map((d: { dayIndex: number }) => d.dayIndex)).toEqual([1, 2, 3]);
    expect(submittedDays[0].lodging.poiId).toBe("lodge-1");
    expect(submittedDays[1].lodging ?? null).toBeNull();
  });

  it("일반 일정을 편집(체류시간 수정)한 뒤에도 각 날짜 select 값은 그대로 유지된다", () => {
    render(<PlanEditor plan={makeThreeDayPlan()} />);

    fireEvent.change(screen.getByLabelText("D2장소 체류시간(분)"), { target: { value: "90" } });

    expect(selectValue("D1장소")).toBe("1");
    expect(selectValue("D2장소")).toBe("2");
    expect(selectValue("D3장소")).toBe("3");
  });

  it("dayIndex가 0인 날짜가 있어도(0-based 데이터를 흉내) select 값이 fallback으로 대체되지 않는다", () => {
    // 이 프로젝트의 정책은 1-based(dayIndex: d+1, planBuilder.ts)이지만, 0이 falsy라서
    // `dayIndex || 1` 같은 코드가 실수로 들어오면 깨지는 것을 막기 위한 방어 테스트다.
    const zeroBasedPlan = makePlan();
    zeroBasedPlan.course.days = [
      { dayIndex: 0, items: [{ order: 1, poiId: "z0", poiName: "Z0장소", category: "FOOD", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" }] },
      { dayIndex: 1, items: [{ order: 1, poiId: "z1", poiName: "Z1장소", category: "FOOD", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" }] },
    ];
    render(<PlanEditor plan={zeroBasedPlan} />);

    expect((screen.getByLabelText("Z0장소 다른 날짜로 이동") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Z1장소 다른 날짜로 이동") as HTMLSelectElement).value).toBe("1");
  });
});

/**
 * 2026-08-06 회귀 재현: 카카오 실제 경로 API 호출·저장은 성공하는데도 화면에 반영되지 않던 버그.
 *
 * 원인: savePlanAction은 클라이언트가 보낸 course를 그대로 저장하지 않고 서버에서 PRIVATE_VEHICLE
 * 인접 구간을 실제 경로로 다시 enrichment한 뒤 저장한다. 그런데 PlanEditor의 `days` state는 이미
 * 마운트된 컴포넌트의 로컬 state라, 저장 성공 후 부모(Server Component)가 revalidatePath로 새 props를
 * 계산해도 React가 이미 있는 useState를 그 값으로 되돌리지 않는다 — 그 결과 저장이 성공했다는 메시지는
 * 뜨지만 화면의 travel 문자열·배지는 저장 "이전"(카카오 결과가 반영되기 전) 값 그대로 남았다.
 *
 * 수정: savePlanAction이 자신이 실제로 반영한 course.days를 SavePlanFormState.days로 함께 돌려주고,
 * PlanEditor는 저장 성공을 인식하는 바로 그 렌더에서 setDays(state.days)로 로컬 state를 서버가 계산한
 * 값으로 덮어쓴다.
 */
describe("PlanEditor — 저장 후 카카오 실제 경로 결과가 새로고침 없이 화면에 반영된다(2026-08-06 회귀 수정)", () => {
  function makePrivateVehiclePlan(): PlanEditorData {
    const p = makePlan();
    p.transport = "PRIVATE_VEHICLE";
    p.course.days = [
      {
        dayIndex: 1,
        items: [
          { order: 1, poiId: "poi-a", poiName: "A장소", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동", lat: 37.0, lng: 128.0 },
          { order: 2, poiId: "poi-b", poiName: "B장소", category: "ATTRACTION", timeSlot: "13:00", stayMinutes: 60, travel: "이동 약 41분(약 13.6km, 차량 기준)", lat: 37.1, lng: 128.2 },
        ],
      },
    ];
    return p;
  }

  /** courseJson hidden input(파일 상단 다른 테스트들이 이미 쓰는 방식)에서 현재 days state를 그대로
   * 읽는다 — item.travel 텍스트는 체류시간 입력 등과 같은 <span> 안에 섞여 있어 getByText 정확 일치로는
   * 찾을 수 없다(문자열이 여러 텍스트 노드로 쪼개짐). state 자체는 이 방식으로, 배지 표시는
   * getByText로(배지는 자기 완결 <span>이라 문제 없음) 각각 검증한다. */
  function currentDays(): { items: { travel: string; travelSource?: string }[] }[] {
    const input = document.querySelector('input[name="courseJson"]') as HTMLInputElement;
    return JSON.parse(input.value).days;
  }

  it("저장 전에는 haversine 추정 문구('직선거리 기반 추정')만 보인다", () => {
    render(<PlanEditor plan={makePrivateVehiclePlan()} />);
    expect(currentDays()[0].items[1].travel).toBe("이동 약 41분(약 13.6km, 차량 기준)");
    expect(screen.getByText("직선거리 기반 추정")).toBeInTheDocument();
    expect(screen.queryByText("실제 도로 기준")).not.toBeInTheDocument();
  });

  it("저장 응답에 실려온 실제 경로 결과(days)가 새로고침 없이 즉시 화면에 반영된다", async () => {
    const enrichedDays = [
      {
        dayIndex: 1,
        items: [
          { order: 1, poiId: "poi-a", poiName: "A장소", category: "ATTRACTION", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동", lat: 37.0, lng: 128.0 },
          {
            order: 2,
            poiId: "poi-b",
            poiName: "B장소",
            category: "ATTRACTION",
            timeSlot: "13:00",
            stayMinutes: 60,
            travel: "18.3km · 약 29분",
            lat: 37.1,
            lng: 128.2,
            travelDistanceKm: 18.3,
            travelMinutes: 29,
            travelSource: "LIVE_API" as const,
            travelProvider: "KAKAO_MOBILITY" as const,
            travelCalculatedAt: "2026-08-06T00:00:00.000Z",
          },
        ],
      },
    ];
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-08-06T00:00:00.000Z", days: enrichedDays });

    render(<PlanEditor plan={makePrivateVehiclePlan()} />);
    expect(currentDays()[0].items[1].travel).toBe("이동 약 41분(약 13.6km, 차량 기준)"); // 저장 전: 추정치

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    // "모든 변경사항이 저장되었습니다." 문구는 dirty 여부(스냅샷 비교)만 보고 뜨므로 편집이 전혀 없던
    // 이 케이스에서는 클릭 전부터도 참일 수 있다 — 저장 완료 자체의 신뢰할 수 있는 동기화 지점은 실제
    // 로컬 course state(items[1].travel)가 서버 응답값으로 바뀌는 순간이다(핵심 회귀 검증).
    await waitFor(() => {
      const updated = currentDays()[0].items[1];
      expect(updated.travel).toBe("18.3km · 약 29분");
      expect(updated.travelSource).toBe("LIVE_API");
    });
    expect(screen.getByText("실제 도로 기준")).toBeInTheDocument();
    expect(screen.queryByText("직선거리 기반 추정")).not.toBeInTheDocument();
  });

  it("서버가 days를 돌려주지 않으면(예: 이 액션이 옛 버전이거나 실패 응답) 로컬 state를 그대로 유지한다(크래시 없음)", async () => {
    vi.mocked(savePlanAction).mockResolvedValueOnce({ success: true, savedAt: "2026-08-06T00:00:00.000Z" });
    render(<PlanEditor plan={makePrivateVehiclePlan()} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("모든 변경사항이 저장되었습니다.");

    expect(currentDays()[0].items[1].travel).toBe("이동 약 41분(약 13.6km, 차량 기준)");
  });
});

/**
 * 2026-08-11 감사: "적합도 낮음" 배지는 원래 grade==="LOW"에만 그대로 매핑됐다. 그런데 grade가 LOW로
 * 떨어지는 이유 중 하나는 "카테고리(CORE)는 확실히 일치하지만 선호 테마 키워드만 장소명에서 확인되지
 * 않은 경우"인데, 이 경우는 "확인된 부적합"이 아니라 "이름만으로는 근거가 약함"이라는 뜻이다(poiFit.ts의
 * recommendationStatus가 BELOW_MINIMUM_FIT이 아니라 INSUFFICIENT_EVALUATION_DATA/REQUIRED_SLOT일
 * 수도 있음). FOOD/LODGING처럼 등급과 무관하게 항상 코스에 남는 필수 슬롯에도 "낮음"이 그대로 붙어
 * 실제보다 부정적으로 보이는 문제가 있었다 — poiFit.ts의 점수/threshold는 건드리지 않고 화면 라벨만
 * 세분화했다.
 */
describe("PlanEditor 적합도 배지 라벨(2026-08-11 감사)", () => {
  function makeFit(overrides: {
    tier?: PoiFitResult["breakdown"]["categoryFit"]["tier"];
    themeEvaluated?: boolean;
    themeMatched?: boolean;
  } = {}): PoiFitResult {
    const tier = overrides.tier ?? "CORE";
    const themeEvaluated = overrides.themeEvaluated ?? true;
    const themeMatched = overrides.themeMatched ?? false;
    return {
      totalScore: 53,
      grade: "LOW",
      recommendationStatus: tier === "FALLBACK" || (themeEvaluated && !themeMatched) ? "BELOW_MINIMUM_FIT" : "INSUFFICIENT_EVALUATION_DATA",
      breakdown: {
        categoryFit: { score: tier === "CORE" ? 30 : tier === "SUPPLEMENT" ? 15 : 6, tier },
        themeFit: { score: 0, evaluated: themeEvaluated, matched: themeMatched, source: themeEvaluated ? "KEYWORD" : "NONE" },
        seasonFit: { score: 20, isIdealMonth: true },
      },
      positiveReasons: ["전략 핵심 카테고리(음식)와 일치합니다."],
      cautions: themeEvaluated && !themeMatched ? ["선호 테마와 일치하는 키워드를 장소명에서 확인하지 못했습니다."] : [],
      dataSource: {
        provenance: "LIVE_API",
        sourceLabel: "실제 공공데이터 동기화 결과",
        operatingHoursConfirmed: false,
        operatingHoursText: null,
        closedDaysText: null,
      },
    };
  }

  it("카테고리는 핵심(CORE)과 일치하지만 선호 테마 키워드만 불일치해 LOW인 경우, '적합도 낮음' 대신 근거를 정확히 전달하는 라벨을 보여준다", () => {
    render(<PlanEditor plan={makePlan()} poiFits={{ "poi-a": makeFit({ tier: "CORE", themeEvaluated: true, themeMatched: false }) }} />);

    expect(screen.getByText("핵심 카테고리 일치 · 테마 근거 약함")).toBeInTheDocument();
    expect(screen.queryByText("적합도 낮음")).not.toBeInTheDocument();
  });

  it("보완 카테고리(SUPPLEMENT)와 일치하지만 선호 테마 키워드만 불일치해 LOW인 경우도 같은 방식으로 세분화한다", () => {
    render(<PlanEditor plan={makePlan()} poiFits={{ "poi-a": makeFit({ tier: "SUPPLEMENT", themeEvaluated: true, themeMatched: false }) }} />);

    expect(screen.getByText("보완 카테고리 일치 · 테마 근거 약함")).toBeInTheDocument();
  });

  it("카테고리 자체가 전략과 무관한 FALLBACK 티어라 실제로 근거 있게 부적합한 경우에는 '적합도 낮음'을 그대로 표시한다", () => {
    render(<PlanEditor plan={makePlan()} poiFits={{ "poi-a": makeFit({ tier: "FALLBACK", themeEvaluated: true, themeMatched: false }) }} />);

    expect(screen.getByText("적합도 낮음")).toBeInTheDocument();
  });

  it("선호 테마 자체를 입력하지 않아 테마 판단 근거가 없는 경우(themeEvaluated=false)에는 '적합도 낮음'을 그대로 표시한다", () => {
    render(<PlanEditor plan={makePlan()} poiFits={{ "poi-a": makeFit({ tier: "CORE", themeEvaluated: false, themeMatched: false }) }} />);

    expect(screen.getByText("적합도 낮음")).toBeInTheDocument();
  });

  /** 2026-08-14(운영 문제 재현 보완) — 선호 테마를 입력하지 않으면 카테고리+계절만으로도 grade가
   * HIGH/MEDIUM에 도달할 수 있다(themeFit이 만점 계산에서 빠져 분모가 줄어들기 때문). 이 경우 "적합도
   * 높음"만 단독으로 보이면 사용자가 테마까지 확인된 것으로 오해할 수 있어, 테마 미입력 사실을
   * 라벨에 그대로 덧붙이는지 확인한다(판정 산식은 변경하지 않음 — 표시 문구만 확인). */
  function makeHighGradeFitWithoutTheme(): PoiFitResult {
    return {
      totalScore: 100,
      grade: "HIGH",
      recommendationStatus: "RECOMMENDED",
      breakdown: {
        categoryFit: { score: 30, tier: "CORE" },
        themeFit: { score: 0, evaluated: false, matched: false, source: "NONE" },
        seasonFit: { score: 20, isIdealMonth: true },
      },
      positiveReasons: ["전략 핵심 카테고리와 일치합니다."],
      cautions: [],
      dataSource: {
        provenance: "LIVE_API",
        sourceLabel: "실제 공공데이터 동기화 결과",
        operatingHoursConfirmed: false,
        operatingHoursText: null,
        closedDaysText: null,
      },
    };
  }

  it("선호 테마를 입력하지 않아 카테고리·계절만으로 '적합도 높음'이 나온 경우, 테마 미입력 사실을 라벨에 함께 표시한다", () => {
    render(<PlanEditor plan={makePlan()} poiFits={{ "poi-a": makeHighGradeFitWithoutTheme() }} />);

    expect(screen.getByText("적합도 높음 (테마 미입력)")).toBeInTheDocument();
    expect(screen.queryByText("적합도 높음")).not.toBeInTheDocument();
  });

  it("선호 테마가 실제로 평가·일치된 경우에는 '(테마 미입력)' 문구를 붙이지 않는다(회귀 방지)", () => {
    render(<PlanEditor plan={makePlan()} poiFits={{ "poi-a": makeFit({ tier: "CORE", themeEvaluated: true, themeMatched: true }) }} />);

    // makeFit()은 grade:"LOW"만 만들 수 있으므로, HIGH 등급 회귀는 아래 별도 확인으로 보강한다(같은
    // 스위트의 기존 CORE_MINIMUM_RESERVE 테스트가 이미 evaluated=true 경로의 다른 라벨을 검증한다).
    expect(screen.queryByText(/테마 미입력/)).not.toBeInTheDocument();
  });
});

describe("PlanEditor — 추천 후보 풀(Phase B 첫 단계, 2026-08-16)", () => {
  function makeCandidateFit(overrides: Partial<PoiFitResult> = {}): PoiFitResult {
    return {
      totalScore: 90,
      grade: "HIGH",
      recommendationStatus: "RECOMMENDED",
      breakdown: {
        categoryFit: { score: 30, tier: "CORE" },
        themeFit: { score: 45, evaluated: true, matched: true, source: "STRUCTURAL" },
        seasonFit: { score: 20, isIdealMonth: true },
      },
      positiveReasons: ["한국관광공사 공식 분류상 문화·역사 테마와 일치합니다."],
      cautions: [],
      dataSource: {
        provenance: "LIVE_API",
        sourceLabel: "실제 공공데이터 동기화 결과",
        operatingHoursConfirmed: false,
        operatingHoursText: null,
        closedDaysText: null,
      },
      ...overrides,
    };
  }

  function makeCandidate(id: string, name: string) {
    return { id, name, category: "ATTRACTION" as const, lat: 35.8, lng: 129.2, fit: makeCandidateFit() };
  }

  it("후보를 이름·카테고리·추천 근거와 함께 목록으로 보여준다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={[makeCandidate("cand-1", "첨성대")]} />);
    expect(screen.getByText("첨성대")).toBeInTheDocument();
    expect(screen.getByText("한국관광공사 공식 분류상 문화·역사 테마와 일치합니다.")).toBeInTheDocument();
  });

  it("현재 코스와의 최소 직선거리를 추천 후보에 보조 근거로 표시한다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={[makeCandidate("cand-1", "첨성대")]} />);

    expect(screen.getByText(/현재 코스 기준 직선거리 약/)).toBeInTheDocument();
  });

  it("LS 중분류 후보는 공식 레저 분류를 함께 보여준다", () => {
    const candidate = {
      ...makeCandidate("cand-leisure", "선재낚시공원"),
      category: "EXPERIENCE" as const,
      lclsSystm1: "LS",
      lclsSystm2: "LS02",
    };
    render(<PlanEditor plan={makePlan()} candidatePois={[candidate]} />);

    expect(screen.getByText("공식 분류: 수상레저스포츠")).toBeInTheDocument();
  });

  it("현재 course에 이미 포함된 POI는 후보 목록에 나타나지 않는다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={[makeCandidate("poi-a", "A장소(이미 코스에 있음)")]} />);
    expect(screen.queryByText("A장소(이미 코스에 있음)")).not.toBeInTheDocument();
  });

  it("추천 후보가 없으면(빈 배열) 이해 가능한 빈 상태 문구를 보여준다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={[]} />);
    expect(screen.getByText("현재 조건에서 추가로 추천할 수 있는 장소가 없습니다.")).toBeInTheDocument();
  });

  it("후보 조회 자체가 실패하면(null) 오류 상태를 보여주되 기존 일정 편집은 그대로 가능하다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={null} />);
    expect(screen.getByText(/추천 후보를 불러오지 못했습니다/)).toBeInTheDocument();
    // 기존 일정(A장소)은 여전히 정상 렌더링된다 — 후보 풀 오류가 페이지 전체를 막지 않는다.
    expect(screen.getByText("A장소")).toBeInTheDocument();
  });

  it("후보를 특정 날짜에 추가하면 그 날짜의 코스에 반영되고, 후보 목록에서 즉시 사라진다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={[makeCandidate("cand-1", "첨성대")]} />);
    expect(screen.getByText("첨성대")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "첨성대 1일차에 추가" }));

    // 후보 카드(추가 버튼)는 사라지고, 1일차 코스 목록에 새로 추가된 장소가 나타난다(기존 장소 추가
    // 흐름 재사용 확인).
    expect(screen.queryByRole("button", { name: /첨성대.*에 추가/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("첨성대 시간")).toBeInTheDocument();
  });

  it("선택한 날짜를 바꿔서 다른 날짜에 추가할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} candidatePois={[makeCandidate("cand-1", "첨성대")]} />);
    fireEvent.change(screen.getByLabelText("첨성대 추가할 날짜"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "첨성대 2일차에 추가" }));
    expect(screen.getByLabelText("첨성대 시간")).toBeInTheDocument();
  });

  it("기존 course의 POI를 삭제하면(계속 좋은 후보라면) 후보 풀에 다시 나타난다", () => {
    // "poi-a"(기존 1일차 코스 항목)가 후보 목록에도 나오도록 candidatePois에 함께 넘긴다 — 아직 코스에
    // 있으니 처음에는 숨겨져야 하고, 삭제하면 다시 보여야 한다.
    render(
      <PlanEditor
        plan={makePlan()}
        candidatePois={[{ id: "poi-a", name: "A장소", category: "FOOD" as const, lat: 36.35, lng: 127.38, fit: makeCandidateFit() }]}
      />,
    );
    expect(screen.queryByRole("button", { name: /A장소.*에 추가/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "A장소 삭제" })[0]);

    expect(screen.getByRole("button", { name: /A장소.*에 추가/ })).toBeInTheDocument();
  });

  it("고정된 Anchor의 행사 전 후보를 Anchor 앞에 추가하고 Anchor 시각을 보존한다", () => {
    const candidate: AnchorCandidate = {
      id: "anchor-pre-1",
      name: "행사 전 명소",
      category: "ATTRACTION",
      lat: 36.351,
      lng: 127.381,
      role: "PRE_EVENT",
      roleLabel: "행사 전",
      suggestedPosition: "BEFORE_ANCHOR",
      dayIndex: 1,
      distanceKm: 0.2,
      distanceLabel: "0.2km",
      distanceMethod: "HAVERSINE",
      reason: "Anchor 시작 전 연결 후보입니다.",
      recommendationStatus: "ALLOW",
      recommendationReason: "전략 적합",
      representation: "DESTINATION",
      fit: makeCandidateFit(),
    };
    render(
      <PlanEditor
        plan={makeFestivalAnchorPlan()}
        anchorCandidates={{ status: "AVAILABLE", groups: { PRE_EVENT: [candidate], MEAL: [], POST_EVENT: [], STAY: [] }, total: 1 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 축제를 코스에 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "행사 전 명소 행사 전 후보를 일정에 추가" }));

    expect(screen.getByText("행사 전 명소")).toBeInTheDocument();
    expect(screen.getAllByText(/15:00~17:00/).length).toBeGreaterThan(0);
    const submittedDays = JSON.parse((document.querySelector('input[name="courseJson"]') as HTMLInputElement).value).days;
    expect(submittedDays[0].items.map((item: { poiId: string }) => item.poiId)).toEqual([
      "poi-a",
      "poi-b",
      "anchor-pre-1",
      "festival-anchor:anchor-1",
    ]);
    expect(submittedDays[0].items.find((item: { kind?: string }) => item.kind === "FESTIVAL_ANCHOR").timeSlot).toBe("15:00");
  });
});

describe("computeDragOutcome — Drag & Drop 결과 계산(Phase B 2단계, 2026-08-16)", () => {
  function makeDay(dayIndex: number, poiIds: string[]): CourseDay {
    return {
      dayIndex,
      items: poiIds.map((id, i) => ({
        order: i + 1,
        poiId: id,
        poiName: `POI-${id}`,
        category: "ATTRACTION",
        timeSlot: `${10 + i}:00`,
        stayMinutes: 60,
        travel: i === 0 ? "숙소/집결지에서 이동" : "이동 10분",
        lat: 36 + i * 0.01,
        lng: 127 + i * 0.01,
      })),
    };
  }

  function makeCandidate(id: string): CandidatePoi {
    return {
      id,
      name: `후보-${id}`,
      category: "ATTRACTION",
      lat: 36.5,
      lng: 127.5,
      fit: {
        totalScore: 90,
        grade: "HIGH",
        recommendationStatus: "RECOMMENDED",
        breakdown: {
          categoryFit: { score: 30, tier: "CORE" },
          themeFit: { score: 45, evaluated: true, matched: true, source: "STRUCTURAL" },
          seasonFit: { score: 20, isIdealMonth: true },
        },
        positiveReasons: [],
        cautions: [],
        dataSource: {
          provenance: "LIVE_API",
          sourceLabel: "실제 공공데이터 동기화 결과",
          operatingHoursConfirmed: false,
          operatingHoursText: null,
          closedDaysText: null,
        },
      },
    };
  }

  function poiIdsOf(day: CourseDay): string[] {
    return day.items.map((it) => it.poiId);
  }

  it("일정 항목을 같은 날짜의 다른 항목 위에 놓으면 그 자리로 재정렬된다", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    const outcome = computeDragOutcome(days, [], "WALK", "schedule-item:c", "schedule-item:a");
    expect(outcome).not.toBeNull();
    expect(poiIdsOf(outcome!.days[0])).toEqual(["c", "a", "b"]);
  });

  it("일정 항목을 다른 날짜의 항목 위에 놓으면 그 날짜로 이동한다", () => {
    const days = [makeDay(1, ["a", "b"]), makeDay(2, ["x"])];
    const outcome = computeDragOutcome(days, [], "WALK", "schedule-item:b", "schedule-item:x");
    expect(outcome).not.toBeNull();
    expect(poiIdsOf(outcome!.days[0])).toEqual(["a"]);
    expect(poiIdsOf(outcome!.days[1])).toEqual(["b", "x"]);
  });

  it("일정 항목을 날짜 빈 공간(day-container)에 놓으면 그 날짜의 끝자리에 추가된다", () => {
    const days = [makeDay(1, ["a", "b"]), makeDay(2, ["x"])];
    const outcome = computeDragOutcome(days, [], "WALK", "schedule-item:a", "day-container:2");
    expect(outcome).not.toBeNull();
    expect(poiIdsOf(outcome!.days[0])).toEqual(["b"]);
    expect(poiIdsOf(outcome!.days[1])).toEqual(["x", "a"]);
  });

  it("추천 후보를 일정 항목 위에 놓으면 그 자리에 삽입되고(기존 addPoiToDay와 동일 경로) 후보 정보를 그대로 반영한다", () => {
    const days = [makeDay(1, ["a", "b"])];
    const candidate = makeCandidate("cand-1");
    const outcome = computeDragOutcome(days, [candidate], "WALK", "candidate:cand-1", "schedule-item:b");
    expect(outcome).not.toBeNull();
    expect(poiIdsOf(outcome!.days[0])).toEqual(["a", "cand-1", "b"]);
  });

  it("추천 후보를 빈 날짜(day-container)에 놓으면 그 날짜에 추가된다", () => {
    const days = [makeDay(1, []), makeDay(2, [])];
    const candidate = makeCandidate("cand-1");
    const outcome = computeDragOutcome(days, [candidate], "WALK", "candidate:cand-1", "day-container:1");
    expect(outcome).not.toBeNull();
    expect(poiIdsOf(outcome!.days[0])).toEqual(["cand-1"]);
  });

  it("drop 대상이 없으면(over===null) 변경 없이 null을 반환한다 — DnD 실패가 기존 기능을 막지 않는다", () => {
    const days = [makeDay(1, ["a"])];
    expect(computeDragOutcome(days, [], "WALK", "schedule-item:a", null)).toBeNull();
  });

  it("해석할 수 없는 over id면 null을 반환한다", () => {
    const days = [makeDay(1, ["a"])];
    expect(computeDragOutcome(days, [], "WALK", "schedule-item:a", "unknown:xyz")).toBeNull();
  });

  it("존재하지 않는 후보 id면 null을 반환한다", () => {
    const days = [makeDay(1, ["a"])];
    expect(computeDragOutcome(days, [], "WALK", "candidate:missing", "schedule-item:a")).toBeNull();
  });

  it("결정론적이다 — 같은 (active, over) 입력은 같은 결과를 낸다", () => {
    const days = [makeDay(1, ["a", "b", "c"])];
    const r1 = computeDragOutcome(days, [], "WALK", "schedule-item:c", "schedule-item:a");
    const r2 = computeDragOutcome(days, [], "WALK", "schedule-item:c", "schedule-item:a");
    expect(poiIdsOf(r1!.days[0])).toEqual(poiIdsOf(r2!.days[0]));
  });
});

describe("PlanEditor — Drag & Drop UI 요소(Phase B 2단계, 2026-08-16)", () => {
  it("일정 항목마다 드래그 손잡이가 있고, 기존 위/아래/날짜 이동/삭제 버튼도 함께 존재한다(버튼 fallback 유지)", () => {
    render(<PlanEditor plan={makePlan()} />);
    expect(screen.getByRole("button", { name: "A장소 드래그로 순서·날짜 변경" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A장소 위로 이동" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A장소 아래로 이동" })).toBeInTheDocument();
    expect(screen.getByLabelText("A장소 다른 날짜로 이동")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A장소 삭제" })).toBeInTheDocument();
  });

  it("추천 후보 카드에도 드래그 손잡이가 있고, 기존 날짜 select·추가 버튼도 함께 존재한다(버튼 fallback 유지)", () => {
    const candidate: CandidatePoi = {
      id: "cand-1",
      name: "첨성대",
      category: "ATTRACTION",
      lat: 35.8,
      lng: 129.2,
      fit: {
        totalScore: 90,
        grade: "HIGH",
        recommendationStatus: "RECOMMENDED",
        breakdown: {
          categoryFit: { score: 30, tier: "CORE" },
          themeFit: { score: 45, evaluated: true, matched: true, source: "STRUCTURAL" },
          seasonFit: { score: 20, isIdealMonth: true },
        },
        positiveReasons: ["테마 일치"],
        cautions: [],
        dataSource: {
          provenance: "LIVE_API",
          sourceLabel: "실제 공공데이터 동기화 결과",
          operatingHoursConfirmed: false,
          operatingHoursText: null,
          closedDaysText: null,
        },
      },
    };
    render(<PlanEditor plan={makePlan()} candidatePois={[candidate]} />);
    expect(screen.getByRole("button", { name: "첨성대 드래그로 일정에 놓기" })).toBeInTheDocument();
    expect(screen.getByLabelText("첨성대 추가할 날짜")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첨성대 1일차에 추가" })).toBeInTheDocument();
  });
});
