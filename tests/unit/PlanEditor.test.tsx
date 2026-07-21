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
  };
}

const plan = makePlan();

function timeInputValue(poiName: string): string {
  return (screen.getByLabelText(`${poiName} 시간`) as HTMLInputElement).value;
}

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

describe("PlanEditor 운영 체크리스트/위험/KPI 편집", () => {
  it("운영 체크리스트 항목을 추가하고 삭제할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} />);

    fireEvent.change(screen.getByPlaceholderText("새 체크리스트 항목"), { target: { value: "우천 대비 우산 준비" } });
    // "추가" 버튼은 체크리스트(0)/위험(1)/KPI(2) 순서로 나온다
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[0]);

    expect(screen.getByText("· 우천 대비 우산 준비")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('체크리스트 "우천 대비 우산 준비" 삭제'));
    expect(screen.queryByText("· 우천 대비 우산 준비")).not.toBeInTheDocument();
  });

  it("위험 요인/대응안을 추가하고 삭제할 수 있다", () => {
    render(<PlanEditor plan={makePlan()} />);

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

    fireEvent.change(screen.getByPlaceholderText("새 KPI 이름"), { target: { value: "재방문율" } });
    fireEvent.change(screen.getByPlaceholderText("측정 방법"), { target: { value: "3개월 후 설문" } });
    // "추가" 버튼은 체크리스트(0)/위험(1)/KPI(2) 순서로 나온다
    fireEvent.click(screen.getAllByRole("button", { name: "추가" })[2]);

    expect(screen.getByText("재방문율")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('KPI "재방문율" 삭제'));
    expect(screen.queryByText("재방문율")).not.toBeInTheDocument();
  });
});
