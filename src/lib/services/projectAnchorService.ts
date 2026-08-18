import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { FestivalAnchorConfirmation } from "@/lib/domain/festivalAnchorProject";

export type ProjectAnchorTimeStatus = "UNCONFIRMED" | "USER_CONFIRMED";
export type ProjectAnchorTimeSlot = "MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM";

export interface ProjectAnchorRecord {
  id: string;
  projectId: string;
  status: "CONFIRMED";
  source: string;
  sourceId: string;
  contentTypeId: string;
  name: string;
  eventStartDate: string;
  eventEndDate: string;
  plannedDate: string;
  plannedDayIndex: number;
  timeStatus: ProjectAnchorTimeStatus;
  timeSlot: ProjectAnchorTimeSlot | null;
  timeStart: string | null;
  timeEnd: string | null;
  regionCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  sourceSnapshot: Record<string, unknown>;
  provenance: Record<string, unknown>;
  confirmedAt: string;
  updatedAt: string;
}

export type ProjectAnchorReadResult =
  | { storage: "AVAILABLE"; anchor: ProjectAnchorRecord | null }
  | { storage: "UNAVAILABLE"; anchor: null; message: string };

export type ProjectAnchorMutationResult =
  | { ok: true; anchor?: ProjectAnchorRecord }
  | { ok: false; code: "STORAGE_UNAVAILABLE" | "CONCURRENT" | "PROJECT_NOT_FOUND"; message: string };

/** 새 ProjectAnchor migration이 아직 없는 Production에서도 분석 화면 전체가 500으로 무너지지 않게 한다. */
export function isMissingProjectAnchorSchemaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    return true;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "P2021" || code === "P2022") return true;
  }
  return error instanceof Error && /ProjectAnchor|project anchor|does not exist|column .* does not exist/i.test(error.message);
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function serializeAnchor(row: {
  id: string;
  projectId: string;
  status: string;
  source: string;
  sourceId: string;
  contentTypeId: string;
  name: string;
  eventStartDate: string;
  eventEndDate: string;
  plannedDate: string;
  plannedDayIndex: number;
  timeStatus: string;
  timeSlot: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  regionCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  sourceSnapshot: Prisma.JsonValue;
  provenance: Prisma.JsonValue;
  confirmedAt: Date;
  updatedAt: Date;
}): ProjectAnchorRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    status: "CONFIRMED",
    source: row.source,
    sourceId: row.sourceId,
    contentTypeId: row.contentTypeId,
    name: row.name,
    eventStartDate: row.eventStartDate,
    eventEndDate: row.eventEndDate,
    plannedDate: row.plannedDate,
    plannedDayIndex: row.plannedDayIndex,
    timeStatus: row.timeStatus as ProjectAnchorTimeStatus,
    timeSlot: row.timeSlot as ProjectAnchorTimeSlot | null,
    timeStart: row.timeStart,
    timeEnd: row.timeEnd,
    regionCode: row.regionCode,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    sourceSnapshot: jsonObject(row.sourceSnapshot),
    provenance: jsonObject(row.provenance),
    confirmedAt: row.confirmedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertProjectAnchorTableAvailable(): Promise<boolean> {
  try {
    await prisma.projectAnchor.findFirst({ select: { id: true } });
    return true;
  } catch (error) {
    if (isMissingProjectAnchorSchemaError(error)) return false;
    throw error;
  }
}

export async function getProjectAnchor(projectId: string): Promise<ProjectAnchorReadResult> {
  try {
    const row = await prisma.projectAnchor.findUnique({ where: { projectId } });
    return { storage: "AVAILABLE", anchor: row ? serializeAnchor(row) : null };
  } catch (error) {
    if (isMissingProjectAnchorSchemaError(error)) {
      return {
        storage: "UNAVAILABLE",
        anchor: null,
        message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다.",
      };
    }
    throw error;
  }
}

export async function saveProjectAnchor(params: {
  projectId: string;
  expectedProjectUpdatedAt: Date;
  confirmation: FestivalAnchorConfirmation;
}): Promise<ProjectAnchorMutationResult> {
  if (!(await assertProjectAnchorTableAvailable())) {
    return {
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const touched = await tx.project.updateMany({
        where: { id: params.projectId, updatedAt: params.expectedProjectUpdatedAt },
        data: { updatedAt: new Date() },
      });
      if (touched.count === 0) {
        return {
          ok: false as const,
          code: "CONCURRENT" as const,
          message: "다른 화면에서 프로젝트가 변경되었습니다. 분석 화면을 새로고침한 뒤 다시 확정해주세요.",
        };
      }

      const value = params.confirmation;
      const row = await tx.projectAnchor.upsert({
        where: { projectId: params.projectId },
        create: {
          projectId: params.projectId,
          status: "CONFIRMED",
          source: value.source,
          sourceId: value.sourceId,
          contentTypeId: value.contentTypeId,
          name: value.name,
          eventStartDate: value.eventStartDate,
          eventEndDate: value.eventEndDate,
          plannedDate: value.plannedDate,
          plannedDayIndex: value.plannedDayIndex,
          timeStatus: value.timeStatus,
          timeSlot: value.timeSlot,
          timeStart: value.timeStart,
          timeEnd: value.timeEnd,
          regionCode: value.regionCode,
          address: value.address,
          lat: value.lat,
          lng: value.lng,
          sourceSnapshot: value.sourceSnapshot as Prisma.InputJsonValue,
          provenance: value.provenance as unknown as Prisma.InputJsonValue,
        },
        update: {
          status: "CONFIRMED",
          source: value.source,
          sourceId: value.sourceId,
          contentTypeId: value.contentTypeId,
          name: value.name,
          eventStartDate: value.eventStartDate,
          eventEndDate: value.eventEndDate,
          plannedDate: value.plannedDate,
          plannedDayIndex: value.plannedDayIndex,
          timeStatus: value.timeStatus,
          timeSlot: value.timeSlot,
          timeStart: value.timeStart,
          timeEnd: value.timeEnd,
          regionCode: value.regionCode,
          address: value.address,
          lat: value.lat,
          lng: value.lng,
          sourceSnapshot: value.sourceSnapshot as Prisma.InputJsonValue,
          provenance: value.provenance as unknown as Prisma.InputJsonValue,
          confirmedAt: new Date(),
        },
      });
      return { ok: true as const, anchor: serializeAnchor(row) };
    });
  } catch (error) {
    if (isMissingProjectAnchorSchemaError(error)) {
      return {
        ok: false,
        code: "STORAGE_UNAVAILABLE",
        message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다. 잠시 후 다시 시도해주세요.",
      };
    }
    throw error;
  }
}

export async function deleteProjectAnchor(params: {
  projectId: string;
  expectedProjectUpdatedAt: Date;
}): Promise<ProjectAnchorMutationResult> {
  if (!(await assertProjectAnchorTableAvailable())) {
    return {
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const touched = await tx.project.updateMany({
        where: { id: params.projectId, updatedAt: params.expectedProjectUpdatedAt },
        data: { updatedAt: new Date() },
      });
      if (touched.count === 0) {
        return {
          ok: false as const,
          code: "CONCURRENT" as const,
          message: "다른 화면에서 프로젝트가 변경되었습니다. 분석 화면을 새로고침한 뒤 다시 삭제해주세요.",
        };
      }
      await tx.projectAnchor.deleteMany({ where: { projectId: params.projectId } });
      return { ok: true as const };
    });
  } catch (error) {
    if (isMissingProjectAnchorSchemaError(error)) {
      return {
        ok: false,
        code: "STORAGE_UNAVAILABLE",
        message: "프로젝트 Anchor 저장 구조가 현재 배포 DB에 아직 적용되지 않았습니다. 잠시 후 다시 시도해주세요.",
      };
    }
    throw error;
  }
}
