// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/plan/actions", () => ({
  savePlanAction: vi.fn(async (state: unknown) => state),
  searchAvailablePoisAction: vi.fn(async () => []),
}));

import { PlanEditor, type PlanEditorData } from "@/components/plan/PlanEditor";
import { savePlanAction, searchAvailablePoisAction } from "@/app/projects/[id]/plan/actions";

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
