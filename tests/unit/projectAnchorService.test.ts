// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FestivalAnchorConfirmation } from "@/lib/domain/festivalAnchorProject";

const projectAnchorFindFirst = vi.fn();
const projectAnchorFindUnique = vi.fn();
const projectAnchorUpsert = vi.fn();
const projectAnchorDeleteMany = vi.fn();
const projectUpdateMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    projectAnchor: {
      findFirst: (...args: unknown[]) => projectAnchorFindFirst(...args),
      findUnique: (...args: unknown[]) => projectAnchorFindUnique(...args),
    },
    project: { updateMany: (...args: unknown[]) => projectUpdateMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import {
  deleteProjectAnchor,
  getProjectAnchor,
  isMissingProjectAnchorSchemaError,
  saveProjectAnchor,
} from "@/lib/services/projectAnchorService";

const confirmation: FestivalAnchorConfirmation = {
  source: "TOUR_API_FESTIVAL",
  sourceId: "official-1",
  contentTypeId: "15",
  name: "공식 여름 축제",
  eventStartDate: "2026-08-20",
  eventEndDate: "2026-08-22",
  plannedDate: "2026-08-21",
  plannedDayIndex: 2,
  timeStatus: "UNCONFIRMED",
  timeSlot: null,
  timeStart: null,
  timeEnd: null,
  regionCode: "SGG_TEST",
  address: "테스트시 테스트구",
  lat: 36.1,
  lng: 127.1,
  sourceSnapshot: {
    source: "TOUR_API_FESTIVAL",
    sourceId: "official-1",
    contentTypeId: "15",
    name: "공식 여름 축제",
    eventStartDate: "2026-08-20",
    eventEndDate: "2026-08-22",
    address: "테스트시 테스트구",
    lat: 36.1,
    lng: 127.1,
  },
  provenance: {
    provider: "한국관광공사",
    dataset: "행사정보 조회(searchFestival2)",
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

const row = {
  id: "anchor-1",
  projectId: "project-1",
  status: "CONFIRMED",
  source: confirmation.source,
  sourceId: confirmation.sourceId,
  contentTypeId: confirmation.contentTypeId,
  name: confirmation.name,
  eventStartDate: confirmation.eventStartDate,
  eventEndDate: confirmation.eventEndDate,
  plannedDate: confirmation.plannedDate,
  plannedDayIndex: confirmation.plannedDayIndex,
  timeStatus: confirmation.timeStatus,
  timeSlot: null,
  timeStart: null,
  timeEnd: null,
  regionCode: confirmation.regionCode,
  address: confirmation.address,
  lat: confirmation.lat,
  lng: confirmation.lng,
  sourceSnapshot: confirmation.sourceSnapshot,
  provenance: confirmation.provenance,
  confirmedAt: new Date("2026-08-18T09:00:00.000Z"),
  updatedAt: new Date("2026-08-18T09:00:00.000Z"),
};

beforeEach(() => {
  projectAnchorFindFirst.mockReset().mockResolvedValue(null);
  projectAnchorFindUnique.mockReset().mockResolvedValue(row);
  projectAnchorUpsert.mockReset().mockResolvedValue(row);
  projectAnchorDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  projectUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  transaction.mockReset().mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      project: { updateMany: (...args: unknown[]) => projectUpdateMany(...args) },
      projectAnchor: {
        upsert: (...args: unknown[]) => projectAnchorUpsert(...args),
        deleteMany: (...args: unknown[]) => projectAnchorDeleteMany(...args),
      },
    }),
  );
});

describe("projectAnchorService", () => {
  it("서버 저장된 Anchor를 읽고 최소 스냅샷을 그대로 노출한다", async () => {
    const result = await getProjectAnchor("project-1");

    expect(result.storage).toBe("AVAILABLE");
    expect(result.anchor).toMatchObject({ sourceId: "official-1", plannedDate: "2026-08-21", plannedDayIndex: 2 });
    expect(result.anchor?.sourceSnapshot).not.toHaveProperty("rawPayload");
  });

  it("스키마가 없는 구 Production에서도 읽기 오류를 화면 중단으로 전파하지 않는다", async () => {
    projectAnchorFindUnique.mockRejectedValue({ code: "P2021", message: "The table `public.ProjectAnchor` does not exist." });

    await expect(getProjectAnchor("project-1")).resolves.toEqual({
      storage: "UNAVAILABLE",
      anchor: null,
      message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다.",
    });
    expect(isMissingProjectAnchorSchemaError({ code: "P2021" })).toBe(true);
  });

  it("확정 저장은 Project.updatedAt를 조건으로 upsert해 오래된 화면을 거부한다", async () => {
    const expectedProjectUpdatedAt = new Date("2026-08-18T08:00:00.000Z");
    const result = await saveProjectAnchor({ projectId: "project-1", expectedProjectUpdatedAt, confirmation });

    expect(result.ok).toBe(true);
    expect(projectUpdateMany).toHaveBeenCalledWith({
      where: { id: "project-1", updatedAt: expectedProjectUpdatedAt },
      data: { updatedAt: expect.any(Date) },
    });
    expect(projectAnchorUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-1" } }));
  });

  it("구 Production 스키마에서는 프로젝트를 건드리지 않고 저장을 보류한다", async () => {
    projectAnchorFindFirst.mockRejectedValue({ code: "P2021", message: "ProjectAnchor does not exist" });

    const result = await saveProjectAnchor({
      projectId: "project-1",
      expectedProjectUpdatedAt: new Date("2026-08-18T08:00:00.000Z"),
      confirmation,
    });

    expect(result).toEqual({
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다. 잠시 후 다시 시도해주세요.",
    });
    expect(projectUpdateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("동시 수정이면 Anchor를 upsert하지 않는다", async () => {
    projectUpdateMany.mockResolvedValue({ count: 0 });

    const result = await saveProjectAnchor({
      projectId: "project-1",
      expectedProjectUpdatedAt: new Date("2026-08-18T08:00:00.000Z"),
      confirmation,
    });

    expect(result).toEqual({
      ok: false,
      code: "CONCURRENT",
      message: "다른 화면에서 프로젝트가 변경되었습니다. 분석 화면을 새로고침한 뒤 다시 확정해주세요.",
    });
    expect(projectAnchorUpsert).not.toHaveBeenCalled();
  });

  it("삭제도 같은 optimistic concurrency 조건을 사용한다", async () => {
    const result = await deleteProjectAnchor({
      projectId: "project-1",
      expectedProjectUpdatedAt: new Date("2026-08-18T08:00:00.000Z"),
    });

    expect(result).toEqual({ ok: true });
    expect(projectAnchorDeleteMany).toHaveBeenCalledWith({ where: { projectId: "project-1" } });
  });
});
