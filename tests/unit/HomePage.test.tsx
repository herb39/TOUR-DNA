// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const routerPush = vi.fn();
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ push: routerPush }) };
});

const listProjectSummaries = vi.fn();
const getLatestDataFreshness = vi.fn(async () => ({ baseYm: "202606", lastSyncedAt: new Date("2026-08-01T00:00:00Z") }));
const getDemoProject = vi.fn(async () => null);

vi.mock("@/lib/services/projectQueries", () => ({
  listProjectSummaries: (params: unknown) => listProjectSummaries(params),
  getLatestDataFreshness: () => getLatestDataFreshness(),
  getDemoProject: () => getDemoProject(),
}));

import HomePage, { ProjectListSection } from "@/app/page";
import { ProjectPageSizeSelect } from "@/components/project/ProjectPageSizeSelect";

function makeProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p1",
    name: "테스트 프로젝트",
    status: "DRAFT",
    role: "TRAVEL_AGENCY",
    travelYear: 2026,
    travelMonth: 9,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-05T00:00:00Z"),
    isProtected: false,
    region: { name: "제천시" },
    analysisResult: null,
    ...overrides,
  };
}

async function renderHomePage(params: { page?: string; pageSize?: string } = {}) {
  const ui = await HomePage({ searchParams: Promise.resolve(params) });
  render(ui);
}

beforeEach(() => {
  listProjectSummaries.mockReset();
  listProjectSummaries.mockResolvedValue({ projects: [makeProject()], totalCount: 1 });
});

/** 메인 프로젝트 목록 서버 페이지네이션(2026-08-08 도입). */
describe("HomePage — 페이지네이션 기본값·검증", () => {
  it("인자가 없으면 1페이지·10개로 조회한다", async () => {
    await renderHomePage();
    expect(listProjectSummaries).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it("pageSize=30을 지정하면 그대로 반영된다", async () => {
    await renderHomePage({ pageSize: "30" });
    expect(listProjectSummaries).toHaveBeenCalledWith({ page: 1, pageSize: 30 });
  });

  it("허용되지 않은 pageSize(20)는 기본값(10)으로 안전하게 처리한다", async () => {
    await renderHomePage({ pageSize: "20" });
    expect(listProjectSummaries).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it("page가 숫자가 아니면 1페이지로 처리한다", async () => {
    await renderHomePage({ page: "abc" });
    expect(listProjectSummaries).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
  });

  it("전체 0건이면 빈 상태 문구를 보여준다", async () => {
    listProjectSummaries.mockResolvedValue({ projects: [], totalCount: 0 });
    render(await ProjectListSection({ page: 1, pageSize: 10 }));
    expect(screen.getByText("아직 생성된 프로젝트가 없습니다.")).toBeInTheDocument();
  });

  it("전체 건수와 페이지 이동 UI가 표시된다", async () => {
    listProjectSummaries.mockResolvedValue({
      projects: Array.from({ length: 10 }, (_, i) => makeProject({ id: `p${i}`, name: `프로젝트${i}` })),
      totalCount: 25,
    });
    render(await ProjectListSection({ page: 1, pageSize: 10 }));
    expect(screen.getByText(/전체 25건/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "페이지 이동" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute("aria-disabled", "true");
  });

  it("생성일(createdAt) 기준 컬럼 헤더를 사용한다(수정일이 아님)", async () => {
    render(await ProjectListSection({ page: 1, pageSize: 10 }));
    expect(screen.getByText("생성일")).toBeInTheDocument();
    expect(screen.queryByText("수정일")).not.toBeInTheDocument();
  });
});

/**
 * 페이지당 표시 개수 select box(2026-08-07 버튼형에서 select로 변경).
 * HomePage 전체를 RTL로 render하면(ProjectListSection이 비동기 컴포넌트로 트리에 섞여 있어)
 * 트리 전체가 빈 DOM으로 렌더되는 기존 제약(HomePage.test.tsx 상단 설명 참고)이 있으므로,
 * 이 select 자체는 별도로 render해서 값/옵션을 검증하고, HomePage가 실제로 이 컴포넌트를
 * '최근 프로젝트' 헤딩과 같은 행에 올바른 pageSize prop으로 넣는지는 반환된 React 엘리먼트
 * 트리를 직접 순회해 구조적으로 검증한다(DOM render에 의존하지 않음).
 */
describe("ProjectPageSizeSelect — select box 자체", () => {
  beforeEach(() => {
    routerPush.mockClear();
  });

  it("값 변경 시 page=1로 초기화하고 선택한 pageSize로 이동한다", () => {
    render(<ProjectPageSizeSelect pageSize={10} />);
    const select = screen.getByRole("combobox", { name: "페이지당 프로젝트 수" });
    fireEvent.change(select, { target: { value: "30" } });
    expect(routerPush).toHaveBeenCalledWith("/?page=1&pageSize=30");
  });

  it("pageSize=10이면 select에 10이 선택되어 있고 옵션이 10/30/50이다", () => {
    render(<ProjectPageSizeSelect pageSize={10} />);
    const select = screen.getByRole("combobox", { name: "페이지당 프로젝트 수" });
    expect(select).toHaveValue("10");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["10", "30", "50"]);
  });

  it("pageSize=30/50이면 각각 그대로 선택되어 있다", () => {
    const { unmount } = render(<ProjectPageSizeSelect pageSize={30} />);
    expect(screen.getByRole("combobox", { name: "페이지당 프로젝트 수" })).toHaveValue("30");
    unmount();
    render(<ProjectPageSizeSelect pageSize={50} />);
    expect(screen.getByRole("combobox", { name: "페이지당 프로젝트 수" })).toHaveValue("50");
  });
});

describe("HomePage — 헤더 영역 구조(엘리먼트 트리 검증)", () => {
  function findHeaderRow(node: unknown): { headingText: unknown; select: unknown } | null {
    if (node == null || typeof node !== "object") return null;
    const el = node as { type?: unknown; props?: { children?: unknown } };
    if (el.type === ProjectPageSizeSelect) return null;
    const children = el.props?.children;
    const childArray = Array.isArray(children) ? children : [children];
    const heading = childArray.find(
      (c) => c && typeof c === "object" && (c as { type?: unknown }).type === "h2",
    ) as { props?: { children?: unknown } } | undefined;
    const select = childArray.find(
      (c) => c && typeof c === "object" && (c as { type?: unknown }).type === ProjectPageSizeSelect,
    );
    if (heading && select) return { headingText: heading.props?.children, select };
    for (const child of childArray) {
      const found = findHeaderRow(child);
      if (found) return found;
    }
    return null;
  }

  it("'최근 프로젝트' 헤딩과 pageSize select가 같은 헤더 행(div)에 함께 존재한다", async () => {
    const ui = await HomePage({ searchParams: Promise.resolve({ pageSize: "30" }) });
    const headerRow = findHeaderRow(ui);
    expect(headerRow).not.toBeNull();
    expect(headerRow?.headingText).toBe("최근 프로젝트");
    expect((headerRow?.select as { props: { pageSize: number } }).props.pageSize).toBe(30);
  });
});

describe("ProjectListSection — 페이지 범위 보정(clamp)", () => {
  it("전체 페이지보다 큰 page를 요청하면 마지막 유효 페이지로 리다이렉트한다", async () => {
    listProjectSummaries.mockResolvedValue({ projects: [makeProject()], totalCount: 5 });
    await expect(ProjectListSection({ page: 99, pageSize: 10 })).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
