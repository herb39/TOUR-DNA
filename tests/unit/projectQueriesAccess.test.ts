// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFindMany = vi.fn();
const projectFindFirst = vi.fn();
const projectFindUnique = vi.fn();
const projectCount = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findMany: (...args: unknown[]) => projectFindMany(...args),
      findFirst: (...args: unknown[]) => projectFindFirst(...args),
      findUnique: (...args: unknown[]) => projectFindUnique(...args),
      count: (...args: unknown[]) => projectCount(...args),
    },
    dataSnapshot: { findFirst: vi.fn() },
    syncLog: { findFirst: vi.fn() },
  },
}));

import { getDemoProject, getProjectDetail, listProjectSummaries } from "@/lib/services/projectQueries";

beforeEach(() => {
  projectFindMany.mockReset();
  projectFindFirst.mockReset();
  projectFindUnique.mockReset();
  projectCount.mockReset();
  projectCount.mockResolvedValue(2);
});

describe("listProjectSummaries — 비밀번호 해시를 응답에 절대 포함하지 않는다", () => {
  it("passwordHash 필드는 결과 객체에 존재하지 않는다", async () => {
    projectFindMany.mockResolvedValue([
      { id: "p1", name: "공개 프로젝트", passwordHash: null },
      { id: "p2", name: "보호 프로젝트", passwordHash: "saltHex:hashHex" },
    ]);

    const { projects } = await listProjectSummaries();
    for (const p of projects) {
      expect(Object.prototype.hasOwnProperty.call(p, "passwordHash")).toBe(false);
    }
  });

  it("isProtected는 passwordHash 존재 여부로만 파생된다", async () => {
    projectFindMany.mockResolvedValue([
      { id: "p1", name: "공개 프로젝트", passwordHash: null },
      { id: "p2", name: "보호 프로젝트", passwordHash: "saltHex:hashHex" },
    ]);

    const { projects } = await listProjectSummaries();
    expect(projects.find((p) => p.id === "p1")?.isProtected).toBe(false);
    expect(projects.find((p) => p.id === "p2")?.isProtected).toBe(true);
  });
});

/** 페이지네이션(2026-08-08 도입) — 최신 생성 프로젝트가 항상 위로 오도록 createdAt desc(+id desc
 * 안정 정렬)를 쓰고, count/findMany가 같은 where(현재는 조건 없음)를 쓰는지, skip/take가 page/pageSize로
 * 정확히 계산되는지 확인한다. */
describe("listProjectSummaries — 페이지네이션", () => {
  it("정렬은 createdAt desc, id desc를 사용한다", async () => {
    projectFindMany.mockResolvedValue([]);
    await listProjectSummaries({ page: 1, pageSize: 10 });
    expect(projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    );
  });

  it("page/pageSize로 skip/take를 정확히 계산한다", async () => {
    projectFindMany.mockResolvedValue([]);
    await listProjectSummaries({ page: 3, pageSize: 10 });
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("1페이지는 skip=0이다", async () => {
    projectFindMany.mockResolvedValue([]);
    await listProjectSummaries({ page: 1, pageSize: 30 });
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 30 }));
  });

  it("인자를 생략하면 기본값(1페이지, 10개)으로 조회한다", async () => {
    projectFindMany.mockResolvedValue([]);
    await listProjectSummaries();
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 10 }));
  });

  it("count와 findMany가 동일한 where 조건을 사용한다", async () => {
    projectFindMany.mockResolvedValue([]);
    await listProjectSummaries({ page: 1, pageSize: 10 });
    const findManyWhere = projectFindMany.mock.calls[0][0].where;
    const countWhere = projectCount.mock.calls[0][0].where;
    expect(findManyWhere).toEqual(countWhere);
  });

  it("totalCount를 함께 반환한다", async () => {
    projectFindMany.mockResolvedValue([]);
    projectCount.mockResolvedValue(42);
    const { totalCount } = await listProjectSummaries({ page: 1, pageSize: 10 });
    expect(totalCount).toBe(42);
  });
});

describe("getDemoProject / getProjectDetail — 쿼리 자체에서 passwordHash를 제외한다", () => {
  it("getDemoProject는 omit:{passwordHash:true}로 조회한다", async () => {
    projectFindFirst.mockResolvedValue({ id: "demo" });
    await getDemoProject();
    expect(projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ omit: { passwordHash: true } }));
  });

  it("getProjectDetail은 omit:{passwordHash:true}로 조회한다", async () => {
    projectFindUnique.mockResolvedValue({ id: "p1" });
    await getProjectDetail("p1");
    expect(projectFindUnique).toHaveBeenCalledWith(expect.objectContaining({ omit: { passwordHash: true } }));
  });
});
