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

  it("대표 시나리오 카드 3개가 표시된다", () => {
    render(<ProjectInputForm regionOptions={regionOptions} baseYm="202509" />);
    expect(screen.getByRole("button", { name: /강릉 여름 미식·자연 상품/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /경주 가을 문화·역사 전략/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /제천 겨울 웰니스 상품/ })).toBeInTheDocument();
  });

  it("경주 시나리오 카드를 고르면 폼 필드에 정확한 값이 채워진다", () => {
    const wideRegionOptions: RegionOption[] = [
      ...regionOptions,
      { code: "SIDO_GYEONGBUK", name: "경상북도", sigungus: [{ code: "SGG_GYEONGJU", name: "경주시" }] },
    ];
    render(<ProjectInputForm regionOptions={wideRegionOptions} baseYm="202509" />);

    fireEvent.click(screen.getByRole("button", { name: /경주 가을 문화·역사 전략/ }));

    expect((screen.getByLabelText("시·도") as HTMLSelectElement).value).toBe("SIDO_GYEONGBUK");
    expect((screen.getByLabelText("시·군·구") as HTMLSelectElement).value).toBe("SGG_GYEONGJU");
    expect((screen.getByLabelText("여행 월") as HTMLSelectElement).value).toBe("10");
    expect((screen.getByRole("radio", { name: "지자체/관광재단" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "내국인" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: /^문화·역사/ })).toBeChecked();
  });

  it("프리셋 적용 후에도 사용자가 값을 자유롭게 다시 수정할 수 있다", () => {
    render(<ProjectInputForm regionOptions={regionOptions} baseYm="202509" />);

    fireEvent.click(screen.getByRole("button", { name: /제천 겨울 웰니스 상품/ }));
    expect((screen.getByLabelText("여행 월") as HTMLSelectElement).value).toBe("12");

    const monthSelect = screen.getByLabelText("여행 월") as HTMLSelectElement;
    fireEvent.change(monthSelect, { target: { value: "6" } });
    expect(monthSelect.value).toBe("6");
  });

  it("콘텐츠 테마와 여행 조건을 서로 독립적으로 선택한다", () => {
    render(<ProjectInputForm regionOptions={regionOptions} baseYm="202509" />);

    fireEvent.click(screen.getByRole("checkbox", { name: /^미식/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^무장애·이동약자/ }));

    expect(screen.getByRole("checkbox", { name: /^미식/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^무장애·이동약자/ })).toBeChecked();
  });
});
