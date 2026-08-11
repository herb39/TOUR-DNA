import { prisma } from "../src/lib/db";
import { checkDatasetCompleteness } from "../src/lib/services/activeDataset";

/**
 * Phase 2-A/2-B(2026-08-11): 현재 등록된 Dataset(baseYm+status) 전체를 읽기 전용으로 보여준다.
 * STAGING dataset은 진행률(완료 지역 수/전국 SIGUNGU 수, ERROR 수, source별 완료 현황)까지 함께
 * 계산해서 보여준다 — 진행률을 Dataset 테이블에 별도 컬럼으로 저장하지 않고, 기존 완전성 판정
 * (`checkDatasetCompleteness`가 재사용하는 `auditTourismDataQuality`의 DataSnapshot 집계)을 그대로
 * 다시 계산한다(derived 상태 중복 저장 금지 원칙 — Dataset.syncedRegions 같은 컬럼을 추가하지 않는다).
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
    if (d.status === "STAGING") {
      const { complete, report } = await checkDatasetCompleteness(d.baseYm);
      console.log(
        `    진행률: ${report.snapshot.fullyCompleteRegions}/${report.region.totalSigungu} 지역 완료 · ` +
          `ERROR ${report.snapshot.errorRegions}곳 · 판정=${report.verdict} · ACTIVE 승격 가능=${complete ? "예" : "아니오"}`,
      );
      for (const code of ["TAR_SVC_DEM", "TOU_DIV_IX", "TOU_RES_DEM", "TOUR_INFO"] as const) {
        const s = report.snapshot.bySource[code];
        console.log(`      ${code}: SUCCESS ${s.SUCCESS} / EMPTY ${s.EMPTY} / ERROR ${s.ERROR} / 미수집 ${s.NONE}`);
      }
    }
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
