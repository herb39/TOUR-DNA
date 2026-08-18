// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGet(name) }),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

class FakeRedirectSignal extends Error {
  constructor(public to: string) {
    super("NEXT_REDIRECT");
  }
}
const redirect = vi.fn((to: string) => {
  throw new FakeRedirectSignal(to);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

const projectFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { project: { findUnique: (...args: unknown[]) => projectFindUnique(...args) } },
}));

const fetchFestivalAnchorCandidates = vi.fn();
vi.mock("@/lib/services/festivalAnchorService", () => ({
  fetchFestivalAnchorCandidates: (...args: unknown[]) => fetchFestivalAnchorCandidates(...args),
}));

const saveProjectAnchor = vi.fn();
const deleteProjectAnchor = vi.fn();
vi.mock("@/lib/services/projectAnchorService", () => ({
  saveProjectAnchor: (...args: unknown[]) => saveProjectAnchor(...args),
  deleteProjectAnchor: (...args: unknown[]) => deleteProjectAnchor(...args),
}));

import { deleteFestivalAnchorAction, saveFestivalAnchorAction } from "@/app/projects/[id]/analysis/festivalAnchorActions";

const lookup = {
  status: "AVAILABLE" as const,
  candidates: [
    {
      id: "tourapi-festival-1",
      externalId: "1",
      contentTypeId: "15",
      name: "공식 여름 축제",
      startDate: "2026-08-20",
      endDate: "2026-08-22",
      address: "테스트시 테스트구",
      lat: 36.1,
      lng: 127.1,
      telephone: null,
      imageUrl: null,
      sourceLabel: "한국관광공사 TourAPI 행사정보" as const,
    },
  ],
  message: "1건을 확인했습니다.",
  provenance: {
    provider: "한국관광공사" as const,
    dataset: "행사정보 조회(searchFestival2)" as const,
    regionCode: "SGG_TEST",
    travelYear: 2026,
    travelMonth: 8,
    eventStartDate: "2026-08-01",
    eventEndDate: "2026-08-31",
    fetchedAt: "2026-08-18T08:00:00.000Z",
    apiItemCount: 1,
    matchedItemCount: 1,
  },
};

function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

beforeEach(() => {
  cookieGet.mockReset().mockReturnValue(undefined);
  projectFindUnique.mockReset();
  fetchFestivalAnchorCandidates.mockReset().mockResolvedValue(lookup);
  saveProjectAnchor.mockReset().mockResolvedValue({ ok: true });
  deleteProjectAnchor.mockReset().mockResolvedValue({ ok: true });
  redirect.mockClear();
  revalidatePath.mockClear();
});

describe("festivalAnchorActions", () => {
  it("잠긴 프로젝트는 후보 재조회·저장을 하기 전에 공통 접근 가드에서 거부한다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: "not-a-valid-cookie-session" });

    const result = await saveFestivalAnchorAction(
      "project-1",
      { success: false },
      form({
        candidateId: "tourapi-festival-1",
        expectedProjectUpdatedAt: "2026-08-18T08:00:00.000Z",
      }),
    );

    expect(result).toEqual({ success: false, message: "이 프로젝트는 비밀번호 확인이 필요합니다." });
    expect(fetchFestivalAnchorCandidates).not.toHaveBeenCalled();
    expect(saveProjectAnchor).not.toHaveBeenCalled();
  });

  it("공개 프로젝트는 서버가 다시 조회한 공식 후보와 명시 조건만 저장하고 분석 화면으로 돌아간다", async () => {
    projectFindUnique
      .mockResolvedValueOnce({ passwordHash: null })
      .mockResolvedValueOnce({
        updatedAt: new Date("2026-08-18T08:00:00.000Z"),
        travelYear: 2026,
        travelMonth: 8,
        region: { code: "SGG_TEST" },
        input: { duration: "TWO_NIGHTS_THREE_DAYS" },
      });

    await expect(
      saveFestivalAnchorAction(
        "project-1",
        { success: false },
        form({
          candidateId: "tourapi-festival-1",
          expectedProjectUpdatedAt: "2026-08-18T08:00:00.000Z",
          plannedDate: "2026-08-21",
          plannedDayIndex: "2",
          timeStatus: "UNCONFIRMED",
        }),
      ),
    ).rejects.toMatchObject({ to: "/projects/project-1/analysis" });

    expect(saveProjectAnchor).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        expectedProjectUpdatedAt: new Date("2026-08-18T08:00:00.000Z"),
        confirmation: expect.objectContaining({ sourceId: "1", plannedDate: "2026-08-21", plannedDayIndex: 2 }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/projects/project-1/plan");
  });

  it("행사 기간 밖 날짜는 DB mutation 없이 거부한다", async () => {
    projectFindUnique
      .mockResolvedValueOnce({ passwordHash: null })
      .mockResolvedValueOnce({
        updatedAt: new Date("2026-08-18T08:00:00.000Z"),
        travelYear: 2026,
        travelMonth: 8,
        region: { code: "SGG_TEST" },
        input: { duration: "DAY_TRIP" },
      });

    const result = await saveFestivalAnchorAction(
      "project-1",
      { success: false },
      form({
        candidateId: "tourapi-festival-1",
        expectedProjectUpdatedAt: "2026-08-18T08:00:00.000Z",
        plannedDate: "2026-08-01",
        plannedDayIndex: "1",
        timeStatus: "UNCONFIRMED",
      }),
    );

    expect(result.success).toBe(false);
    expect(saveProjectAnchor).not.toHaveBeenCalled();
  });

  it("삭제도 보호 쿠키를 먼저 확인하고 성공 시 분석 화면을 갱신한다", async () => {
    projectFindUnique.mockResolvedValue({ passwordHash: null });

    await expect(
      deleteFestivalAnchorAction(
        "project-1",
        { success: false },
        form({ expectedProjectUpdatedAt: "2026-08-18T08:00:00.000Z" }),
      ),
    ).rejects.toMatchObject({ to: "/projects/project-1/analysis" });

    expect(deleteProjectAnchor).toHaveBeenCalledWith({
      projectId: "project-1",
      expectedProjectUpdatedAt: new Date("2026-08-18T08:00:00.000Z"),
    });
  });
});
