import { prisma } from "../src/lib/db";

/**
 * Phase 2-A(2026-08-11): 현재 등록된 Dataset(baseYm+status) 전체를 읽기 전용으로 보여준다.
 * DB에 어떤 쓰기도 하지 않는다.
 *
 * 사용법: npm run dataset:status
 */
async function main() {
  const datasets = await prisma.dataset.findMany({ orderBy: [{ status: "asc" }, { baseYm: "desc" }] });
  if (datasets.length === 0) {
    console.log("[dataset:status] 등록된 dataset이 없습니다.");
    return;
  }
  console.log("[dataset:status]");
  for (const d of datasets) {
    console.log(
      `  ${d.baseYm}: ${d.status}${d.activatedAt ? ` (activatedAt=${d.activatedAt.toISOString()})` : ""}`,
    );
  }
  const active = datasets.find((d) => d.status === "ACTIVE");
  console.log(`\n현재 ACTIVE: ${active ? active.baseYm : "(없음 — 분석이 안전하게 실패하는 상태)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
