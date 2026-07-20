import { prisma } from "@/lib/db";

export async function listProjectSummaries() {
  return prisma.project.findMany({
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
  });
}
