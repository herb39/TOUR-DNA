// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/app/projects/new/actions", () => ({
  createProjectAction: vi.fn(async (state: unknown) => state),
}));

import { ProjectInputForm } from "@/components/forms/ProjectInputForm";
import type { RegionOption } from "@/lib/services/regionQueries";

const regionOptions: RegionOption[] = [
  { code: "SIDO_GANGWON", name: "강원특별자치도", sigungus: [{ code: "SGG_YANGYANG", name: "양양군" }] },
  { code: "SIDO_DAEJEON", name: "대전광역시", sigungus: [{ code: "SGG_DAEJEON", name: "대전광역시" }] },
  { code: "SIDO_CHUNGBUK", name: "충청북도", sigungus: [{ code: "SGG_JECHEON", name: "제천시" }] },
];

describe("ProjectInputForm", () => {
  it("시·도를 변경하면 시·군·구 옵션이 해당 시도의 하위 지역으로 갱신된다", () => {
    render(<ProjectInputForm regionOptions={regionOptions} baseYm="202509" />);

    const sidoSelect = screen.getByLabelText("시·도") as HTMLSelectElement;
    const sigunguSelect = screen.getByLabelText("시·군·구") as HTMLSelectElement;

    expect(sidoSelect.value).toBe("SIDO_GANGWON");
    expect(Array.from(sigunguSelect.options).map((o) => o.value)).toEqual(["SGG_YANGYANG"]);

    fireEvent.change(sidoSelect, { target: { value: "SIDO_DAEJEON" } });

    expect(Array.from(sigunguSelect.options).map((o) => o.value)).toEqual(["SGG_DAEJEON"]);
  });

  it("연령대 체크박스를 선택하면 입력 요약에 선택 개수가 반영된다", () => {
    render(<ProjectInputForm regionOptions={regionOptions} baseYm="202509" />);

    const checkbox20s = screen.getByRole("checkbox", { name: "20대" });
    fireEvent.click(checkbox20s);

    expect(screen.getByText("1개 선택")).toBeInTheDocument();
  });

  it("여행 월을 바꾸면 입력 요약에 즉시 반영된다", () => {
    render(<ProjectInputForm regionOptions={regionOptions} baseYm="202509" />);

    const monthSelect = screen.getByLabelText("여행 월") as HTMLSelectElement;
    fireEvent.change(monthSelect, { target: { value: "3" } });

    expect(screen.getByText("2026년 3월")).toBeInTheDocument();
  });
});
