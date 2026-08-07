/**
 * 관광 분석 지원지역 확대(2026-08-07, Batch 1+2) §9 플랜 생성 스모크테스트용으로 만든 임시 Production
 * 프로젝트 6건을 삭제한다. 안전정책상 Claude Code가 직접 실행하지 않는다 — 사용자가 직접 실행해야 한다.
 *
 * 실행: npx tsx --env-file=.env.local scripts/delete-region-expansion-verification-projects.mts
 */
import { prisma } from "../src/lib/db";

const TARGETS: Array<{ id: string; namePrefix: string }> = [
  { id: "cmsi7ngc80000asil609jnbus", namePrefix: "[검증용-임시] 해양 유형" },
  { id: "cmsi7nqxa000rasilex9quyys", namePrefix: "[검증용-임시] 역사 유형" },
  { id: "cmsi7o050001gasilz03d31z0", namePrefix: "[검증용-임시] 산악 유형" },
  { id: "cmsi7o8wg0025asilwgm3xzt3", namePrefix: "[검증용-임시] 도심 유형" },
  { id: "cmsi7oi4u002uasilzh2htmc2", namePrefix: "[검증용-임시] 휴양 유형" },
  { id: "cmsi7oqul003jasilviblbuxt", namePrefix: "[검증용-임시] 미식 유형" },
];

async function main() {
  for (const { id, namePrefix } of TARGETS) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      console.log(`이미 삭제됨(또는 존재하지 않음) — 건너뜀: ${id}`);
      continue;
    }
    if (!project.name.startsWith(namePrefix)) {
      console.error(`제목이 예상과 달라 삭제를 중단합니다: ${id} (${project.name})`);
      continue;
    }
    await prisma.project.delete({ where: { id } }); // onDelete: Cascade로 input/analysisResult/selectedPlan도 함께 삭제됨
    console.log(`삭제 완료: ${id} (${project.name})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
