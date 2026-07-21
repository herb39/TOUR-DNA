// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/plan/actions", () => ({
  savePlanAction: vi.fn(async (state: unknown) => state),
  searchAvailablePoisAction: vi.fn(async () => []),
}));

import { PlanEditor, type PlanEditorData } from "@/components/plan/PlanEditor";
import { searchAvailablePoisAction } from "@/app/projects/[id]/plan/actions";

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
            { order: 1, poiId: "poi-a", poiName: "A장소", category: "FOOD", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" },
            { order: 2, poiId: "poi-b", poiName: "B장소", category: "FOOD", timeSlot: "13:00", stayMinutes: 60, travel: "이동 15~20분" },
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
  };
}

const plan = makePlan();

describe("PlanEditor 코스 순서 변경", () => {
  it("장소를 위로 이동하면 시간대는 자리(슬롯)에 남고 장소 정보만 이동한다", () => {
    render(<PlanEditor plan={plan} />);

    expect(screen.getByText("10:00 A장소")).toBeInTheDocument();
    expect(screen.getByText("13:00 B장소")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("B장소 위로 이동"));

    // B가 첫 슬롯(10:00)으로, A가 둘째 슬롯(13:00)으로 — 시간대는 위치에 고정되고 장소만 바뀐다
    expect(screen.getByText("10:00 B장소")).toBeInTheDocument();
    expect(screen.getByText("13:00 A장소")).toBeInTheDocument();
  });
});

describe("PlanEditor 코스 추가/삭제/이동", () => {
  it("삭제 버튼을 누르면 목록에서 빠지고 남은 장소가 앞 슬롯으로 당겨진다", () => {
    render(<PlanEditor plan={makePlan()} />);

    fireEvent.click(screen.getByLabelText("A장소 삭제"));

    expect(screen.queryByText(/A장소/)).not.toBeInTheDocument();
    expect(screen.getByText("10:00 B장소")).toBeInTheDocument();
  });

  it("다른 날짜로 이동하면 원래 날짜에서는 빠지고 대상 날짜에 나타난다", () => {
    render(<PlanEditor plan={makePlan()} />);

    const select = screen.getByLabelText("A장소 다른 날짜로 이동") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });

    // 1일차에는 B장소만 남아 10:00으로 당겨지고, A장소는 2일차의 첫 슬롯(10:00)으로 옮겨간다
    expect(screen.getByText("10:00 B장소")).toBeInTheDocument();
    expect(screen.getByText("10:00 A장소")).toBeInTheDocument();
  });

  it("검색 결과에서 장소를 골라 추가하면 해당 날짜의 새 슬롯으로 들어간다", async () => {
    vi.mocked(searchAvailablePoisAction).mockResolvedValueOnce([
      { id: "poi-c", name: "C장소", category: "EXPERIENCE", address: "어딘가", lat: 36.35, lng: 127.38, operatingHours: null, closedDays: null },
    ]);

    render(<PlanEditor plan={makePlan()} />);

    // 1일차(2곳)/2일차(0곳) 둘 다 여유가 있어 "+ 장소 추가" 버튼이 2개 나온다 — 2일차(두 번째) 버튼을 누른다
    const addButtons = screen.getAllByRole("button", { name: "+ 장소 추가" });
    expect(addButtons).toHaveLength(2);
    fireEvent.click(addButtons[1]);
    fireEvent.change(screen.getByPlaceholderText("장소 이름 검색"), { target: { value: "C" } });

    const addButton = await screen.findByRole("button", { name: "추가" });
    fireEvent.click(addButton);

    expect(await screen.findByText("10:00 C장소")).toBeInTheDocument();
    // 추가 후에는 검색 패널이 닫히고 다시 "+ 장소 추가" 버튼으로 돌아간다
    expect(screen.getAllByRole("button", { name: "+ 장소 추가" })).toHaveLength(2);
  });

  it("한 날짜에 이미 4곳(최대치)이 있으면 추가 버튼이 비활성화된다", () => {
    const fullPlan = makePlan();
    fullPlan.course.days[0].items = [
      { order: 1, poiId: "p1", poiName: "P1", category: "FOOD", timeSlot: "10:00", stayMinutes: 60, travel: "숙소/집결지에서 이동" },
      { order: 2, poiId: "p2", poiName: "P2", category: "FOOD", timeSlot: "13:00", stayMinutes: 60, travel: "" },
      { order: 3, poiId: "p3", poiName: "P3", category: "FOOD", timeSlot: "16:00", stayMinutes: 60, travel: "" },
      { order: 4, poiId: "p4", poiName: "P4", category: "FOOD", timeSlot: "18:30", stayMinutes: 60, travel: "" },
    ];
    render(<PlanEditor plan={fullPlan} />);

    expect(screen.getByRole("button", { name: "이 날짜는 가득 찼습니다 (최대 4곳)" })).toBeDisabled();
  });
});
