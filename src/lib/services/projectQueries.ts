import { prisma } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, type PageSize } from "@/lib/pagination";

/** 목록 화면에는 비밀번호 해시를 절대 내보내지 않는다 — 보호 여부(boolean)만 파생해 남긴다.
 * 정렬은 "최신 생성 프로젝트가 항상 위"가 되도록 `createdAt desc`를 쓴다(2026-08-08 — 이전에는
 * `updatedAt desc`를 써서 오래된 프로젝트를 편집하면 목록 맨 위로 다시 올라오는 문제가 있었다).
 * `id desc`는 같은 `createdAt`(밀리초 단위로 동시 생성된 경우)일 때의 안정적인 2차 정렬 기준이다 —
 * cuid는 생성 시각을 포함해 대체로 시간순이지만 완전히 보장되지는 않으므로, 정렬 자체의 안정성
 * (같은 조건으로 다시 조회해도 항상 같은 순서)을 위해 명시적으로 둔다.
 *
 * `count`와 `findMany` 양쪽에 동일한 `where`(현재는 조건 없음 — 전체 프로젝트 목록이며, 접근 제어는
 * 사이트 전체 비밀번호 게이트가 별도로 담당한다)를 써서 페이지 수 계산과 실제 목록이 항상 일치하게
 * 한다.
 */
export async function listProjectSummaries(params: { page?: number; pageSize?: PageSize } = {}) {
  const page = params.page && params.page >= 1 ? params.page : 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const where = {};

  const [projects, totalCount] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        region: true,
        input: true,
        selectedPlan: true,
        analysisResult: {
          include: { strategyResults: { where: { rank: 1 } } },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  return {
    projects: projects.map(({ passwordHash, ...rest }) => ({ ...rest, isProtected: passwordHash !== null })),
    totalCount,
  };
}

export async function getLatestDataFreshness() {
  // 2026-08-13(로딩 성능 조사) — 두 조회가 서로 의존하지 않는데 순차 await로 걸려 있었다. Promise.all로
  // 병렬화한다(반환값·정렬 기준 등 조회 로직 자체는 그대로).
  const [latestSnapshot, latestSyncLog] = await Promise.all([
    prisma.dataSnapshot.findFirst({ orderBy: { fetchedAt: "desc" } }),
    prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
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
