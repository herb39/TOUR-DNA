// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const listProjectSummaries = vi.fn();
const getLatestDataFreshness = vi.fn(async () => ({ baseYm: "202606", lastSyncedAt: new Date("2026-08-01T00:00:00Z") }));
const getDemoProject = vi.fn(async () => null);

vi.mock("@/lib/services/projectQueries", () => ({
  listProjectSummaries: (params: unknown) => listProjectSummaries(params),
  getLatestDataFreshness: () => getLatestDataFreshness(),
  getDemoProject: () => getDemoProject(),
}));

import HomePage, { ProjectListSection } from "@/app/page";

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

  it("페이지당 표시 개수 선택 링크(10/30/50)가 모두 보인다", async () => {
    render(await ProjectListSection({ page: 1, pageSize: 10 }));
    expect(screen.getByRole("link", { name: "10개씩 보기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30개씩 보기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "50개씩 보기" })).toBeInTheDocument();
  });

  it("생성일(createdAt) 기준 컬럼 헤더를 사용한다(수정일이 아님)", async () => {
    render(await ProjectListSection({ page: 1, pageSize: 10 }));
    expect(screen.getByText("생성일")).toBeInTheDocument();
    expect(screen.queryByText("수정일")).not.toBeInTheDocument();
  });
});

describe("ProjectListSection — 페이지 범위 보정(clamp)", () => {
  it("전체 페이지보다 큰 page를 요청하면 마지막 유효 페이지로 리다이렉트한다", async () => {
    listProjectSummaries.mockResolvedValue({ projects: [makeProject()], totalCount: 5 });
    await expect(ProjectListSection({ page: 99, pageSize: 10 })).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
