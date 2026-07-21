// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/plan/actions", () => ({
  savePlanAction: vi.fn(async (state: unknown) => state),
}));

import { PlanEditor, type PlanEditorData } from "@/components/plan/PlanEditor";

const plan: PlanEditorData = {
  id: "plan-1",
  projectId: "project-1",
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
    ],
  },
  operationChecklist: [],
  risks: [],
  kpis: [],
  memo: "",
  kpiMemo: "",
};

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
