// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectFindMany = vi.fn();
const projectFindFirst = vi.fn();
const projectFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findMany: (...args: unknown[]) => projectFindMany(...args),
      findFirst: (...args: unknown[]) => projectFindFirst(...args),
      findUnique: (...args: unknown[]) => projectFindUnique(...args),
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
});

describe("listProjectSummaries — 비밀번호 해시를 응답에 절대 포함하지 않는다", () => {
  it("passwordHash 필드는 결과 객체에 존재하지 않는다", async () => {
    projectFindMany.mockResolvedValue([
      { id: "p1", name: "공개 프로젝트", passwordHash: null },
      { id: "p2", name: "보호 프로젝트", passwordHash: "saltHex:hashHex" },
    ]);

    const result = await listProjectSummaries();
    for (const p of result) {
      expect(Object.prototype.hasOwnProperty.call(p, "passwordHash")).toBe(false);
    }
  });

  it("isProtected는 passwordHash 존재 여부로만 파생된다", async () => {
    projectFindMany.mockResolvedValue([
      { id: "p1", name: "공개 프로젝트", passwordHash: null },
      { id: "p2", name: "보호 프로젝트", passwordHash: "saltHex:hashHex" },
    ]);

    const result = await listProjectSummaries();
    expect(result.find((p) => p.id === "p1")?.isProtected).toBe(false);
    expect(result.find((p) => p.id === "p2")?.isProtected).toBe(true);
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
