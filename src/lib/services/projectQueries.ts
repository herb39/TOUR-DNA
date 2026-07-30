import { prisma } from "@/lib/db";

/** 목록 화면에는 비밀번호 해시를 절대 내보내지 않는다 — 보호 여부(boolean)만 파생해 남긴다. */
export async function listProjectSummaries() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      region: true,
      input: true,
      selectedPlan: true,
      analysisResult: {
        include: { strategyResults: { where: { rank: 1 } } },
      },
    },
    take: 50,
  });
  return projects.map(({ passwordHash, ...rest }) => ({ ...rest, isProtected: passwordHash !== null }));
}

export async function getLatestDataFreshness() {
  const latestSnapshot = await prisma.dataSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
  });
  const latestSyncLog = await prisma.syncLog.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return {
    baseYm: latestSnapshot?.baseYm ?? process.env.TOUR_DATA_BASE_YM ?? null,
    lastSyncedAt: latestSyncLog?.endedAt ?? latestSnapshot?.fetchedAt ?? null,
  };
}

export async function getDemoProject() {
  return prisma.project.findFirst({
    where: { name: { startsWith: "[데모]" } },
    orderBy: { createdAt: "asc" },
    omit: { passwordHash: true },
  });
}

export async function getProjectDetail(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      region: { include: { parent: true } },
      input: true,
      analysisResult: {
        include: {
          strategyResults: { orderBy: { rank: "asc" }, include: { evidences: true } },
          evidences: true,
        },
      },
      selectedPlan: true,
    },
    omit: { passwordHash: true },
  });
}
