/**
 * TAR_SVC_DEM·TOU_RES_DEM이 공통으로 제공하는 최신 완전월을 확인만 하는 dry-run 명령(2026-08-08
 * 도입). DB 쓰기와 지역 전체 동기화를 전혀 하지 않는다 — `DataSource` 조회(읽기)만 하고, 대표 지역
 * 1곳(제천시)에 대해 오퍼레이션 1개씩만 호출한다. Batch 3~5 실행 전에 먼저 이 명령으로 기준월을
 * 확인하는 것을 권장한다.
 *
 * 실행: npm run check:base-ym
 */
import { findLatestCommonBaseYm } from "../src/lib/services/latestCommonBaseYm";
import { probeTarSvcDemLive, probeTouResDemLive } from "../src/lib/services/baseYmProbeAdapters";
import { prisma } from "../src/lib/db";

async function main() {
  console.log("[check-base-ym] TAR_SVC_DEM·TOU_RES_DEM 최신 공통월 확인 시작(대표 지역: 제천시, DB 쓰기 없음)");

  const result = await findLatestCommonBaseYm({
    probeTarSvcDem: probeTarSvcDemLive,
    probeTouResDem: probeTouResDemLive,
  });

  for (const c of result.checked) {
    console.log(
      `  ${c.baseYm}: TAR_SVC_DEM=${c.tarSvcDem.ok ? (c.tarSvcDem.hasData ? "데이터 있음" : "EMPTY") : "실패"} · ` +
        `TOU_RES_DEM=${c.touResDem.ok ? (c.touResDem.hasData ? "데이터 있음" : "EMPTY") : "실패"} · ` +
        `공통=${c.bothHaveData ? "예" : "아니오"}`,
    );
  }

  if (result.state === "FOUND") {
    console.log(`[check-base-ym] 최신 공통월: ${result.baseYm}`);
    console.log(`실제 동기화 시 사용: npm run sync:tourism-data -- --base-ym=${result.baseYm}`);
  } else if (result.state === "RATE_LIMITED") {
    console.log(`[check-base-ym] 확인 중단 — API 호출 한도(429)로 보입니다: ${result.message}`);
    console.log("한도가 회복된 뒤 다시 시도하거나, 명확히 확인된 기준월을 --base-ym=YYYYMM으로 직접 지정하세요.");
    process.exitCode = 1;
  } else {
    console.log(`[check-base-ym] 확인한 ${result.checked.length}개월 범위 안에서 공통월을 찾지 못했습니다.`);
    console.log("확인된 기준월을 --base-ym=YYYYMM으로 직접 지정하세요.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
