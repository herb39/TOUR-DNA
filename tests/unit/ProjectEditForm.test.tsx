// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/[id]/edit/actions", () => ({
  updateProjectAndReanalyzeAction: vi.fn(async (_projectId: string, state: unknown) => state),
}));

import { ProjectEditForm, type ProjectEditFormInitialValues } from "@/components/forms/ProjectEditForm";
import type { RegionOption } from "@/lib/services/regionQueries";

const regionOptions: RegionOption[] = [
  { code: "SIDO_GANGWON", name: "강원특별자치도", sigungus: [{ code: "SGG_GANGNEUNG", name: "강릉시" }] },
  { code: "SIDO_CHUNGBUK", name: "충청북도", sigungus: [{ code: "SGG_JECHEON", name: "제천시" }] },
];

function baseInitial(overrides: Partial<ProjectEditFormInitialValues> = {}): ProjectEditFormInitialValues {
  return {
    projectName: "강릉 미식 체류형 여행상품",
    role: "TRAVEL_AGENCY",
    sidoCode: "SIDO_GANGWON",
    sigunguCode: "SGG_GANGNEUNG",
    travelYear: 2026,
    travelMonth: 9,
    nationality: "DOMESTIC",
    ageGroups: ["AGE_20S"],
    companionType: "COMPANION_SOLO",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: null,
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "MIXED",
    groupType: "FIT",
    preferredThemes: "미식",
    excludedThemes: "",
    memo: "",
    ...overrides,
  };
}

/** Phase 6(조건 수정 및 재분석) — 변경사항 미리보기 문구는 지역을 실제로 바꿨는지에 따라 DNA
 * 불변/재계산 안내가 정확히 갈린다는 사실을 회귀로 고정한다(2026-08-13). */
describe("ProjectEditForm — 현재 값 프리로드 및 변경사항 미리보기", () => {
  it("현재 프로젝트 값이 그대로 프리로드된다", () => {
    render(
      <ProjectEditForm
        projectId="proj-1"
        regionOptions={regionOptions}
        projectUpdatedAt="2026-08-01T00:00:00.000Z"
        hasSelectedPlan={false}
        hasPromoContent={false}
        initial={baseInitial()}
      />,
    );

    expect(screen.getByLabelText("프로젝트명")).toHaveValue("강릉 미식 체류형 여행상품");
    expect(screen.getByLabelText("시·도")).toHaveValue("SIDO_GANGWON");
    expect(screen.getByLabelText("시·군·구")).toHaveValue("SGG_GANGNEUNG");
    expect(screen.getByLabelText("여행 월")).toHaveValue("9");
    expect(screen.getByRole("checkbox", { name: /^미식/ })).toBeChecked();
  });

  it("지역을 바꾸지 않으면 'DNA는 바뀌지 않는다'는 안내를 보여준다", () => {
    render(
      <ProjectEditForm
        projectId="proj-1"
        regionOptions={regionOptions}
        projectUpdatedAt="2026-08-01T00:00:00.000Z"
        hasSelectedPlan={false}
        hasPromoContent={false}
        initial={baseInitial()}
      />,
    );

    expect(screen.getByText(/관광 DNA 5축 점수는 바뀌지 않습니다/)).toBeInTheDocument();
  });

  it("시·도를 바꾸면 '새 지역 기준으로 다시 계산'한다는 안내로 전환된다", () => {
    render(
      <ProjectEditForm
        projectId="proj-1"
        regionOptions={regionOptions}
        projectUpdatedAt="2026-08-01T00:00:00.000Z"
        hasSelectedPlan={false}
        hasPromoContent={false}
        initial={baseInitial()}
      />,
    );

    fireEvent.change(screen.getByLabelText("시·도"), { target: { value: "SIDO_CHUNGBUK" } });

    expect(screen.getByText(/지역을 변경했습니다/)).toBeInTheDocument();
    expect(screen.getByText(/새 지역 기준으로 전부 다시 계산합니다/)).toBeInTheDocument();
  });

  it("실행안(홍보자료 포함)이 있으면 확인 체크 없이는 제출 버튼이 비활성화된다", () => {
    render(
      <ProjectEditForm
        projectId="proj-1"
        regionOptions={regionOptions}
        projectUpdatedAt="2026-08-01T00:00:00.000Z"
        hasSelectedPlan={true}
        hasPromoContent={true}
        initial={baseInitial()}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "저장하고 재분석" });
    expect(submitButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /위 내용을 확인했으며/ }));
    expect(submitButton).not.toBeDisabled();
  });

  it("변경 요약 영역에 지역·역할·국적·테마가 현재 선택값대로 표시된다", () => {
    render(
      <ProjectEditForm
        projectId="proj-1"
        regionOptions={regionOptions}
        projectUpdatedAt="2026-08-01T00:00:00.000Z"
        hasSelectedPlan={false}
        hasPromoContent={false}
        initial={baseInitial()}
      />,
    );

    const summary = screen.getByText("변경 요약").closest("aside")!;
    expect(summary).toHaveTextContent("강릉시");
    expect(summary).toHaveTextContent("여행사/DMC");
    expect(summary).toHaveTextContent("미식");
  });
});
