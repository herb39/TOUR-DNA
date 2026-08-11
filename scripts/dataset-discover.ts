import { discoverLatestDataset } from "../src/lib/services/datasetDiscovery";
import { ensureStagingDataset } from "../src/lib/services/activeDataset";
import { prisma } from "../src/lib/db";

/**
 * Phase 2-B(2026-08-11): 공공 API에 ACTIVE보다 최신인 공통월(TAR_SVC_DEM·TOU_RES_DEM 기준)이
 * 등장했는지 저비용으로 확인하고, 발견되면 STAGING dataset만 생성한다. ACTIVE는 이 스크립트로
 * 절대 바뀌지 않으며, 전국 동기화도 이 스크립트에서 실행하지 않는다 — 실제 데이터 수집은 별도로
 * `npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=<N>`을 여러 번 나눠
 * 실행해야 한다.
 *
 * 사용법: npm run dataset:discover
 */
async function main() {
  const discovery = await discoverLatestDataset();

  console.log(`[dataset:discover] 현재 ACTIVE: ${discovery.activeBaseYm ?? "(없음)"}`);
  console.log(`[dataset:discover] ${discovery.message}`);
  console.log(
    `[dataset:discover] source 확인 상태 — TAR_SVC_DEM: ${discovery.sourceAvailability.TAR_SVC_DEM}, ` +
      `TOU_RES_DEM: ${discovery.sourceAvailability.TOU_RES_DEM}, ` +
      `TOU_DIV_IX: ${discovery.sourceAvailability.TOU_DIV_IX}(의도적으로 탐색 안 함 — 일일 한도 이력), ` +
      `TOUR_INFO: ${discovery.sourceAvailability.TOUR_INFO}(baseYm 무관이라 대상 아님), ` +
      `VISITOR_CNT: ${discovery.sourceAvailability.VISITOR_CNT}(별도 탐색기 사용, 여기선 호출 안 함)`,
  );
  console.log(`[dataset:discover] 이번 탐색이 발생시킨 실제 HTTP 요청 수: ${discovery.httpRequestCount}회`);

  if (discovery.outcome !== "NEW_DATASET_CANDIDATE" || !discovery.discoveredBaseYm) {
    console.log(`[dataset:discover] 종료 — outcome=${discovery.outcome}(추가 조치 없음, 전국 batch 실행 안 함)`);
    return;
  }

  const staging = await ensureStagingDataset(discovery.discoveredBaseYm);
  if (staging.outcome === "CREATED") {
    console.log(`[dataset:discover] STAGING dataset 생성: baseYm=${staging.baseYm}`);
    console.log(
      `[dataset:discover] 다음 단계: npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=<N>`,
    );
  } else if (staging.outcome === "ALREADY_EXISTS") {
    console.log(
      `[dataset:discover] 이미 등록된 dataset — baseYm=${staging.baseYm}, status=${staging.existingStatus}(중복 생성 안 함)`,
    );
  } else if (staging.outcome === "BLOCKED_BY_OTHER_STAGING") {
    console.log(
      `[dataset:discover] 새 STAGING 생성 보류 — 이미 다른 baseYm(${staging.blockingBaseYm})이 STAGING 상태다. ` +
        `그 dataset을 먼저 승격(npm run dataset:activate)하거나 정리한 뒤 다시 실행하세요(여러 baseYm을 동시에 ` +
        `STAGING으로 두면 제한된 API 호출 한도가 분산돼 어느 쪽도 완료되지 않는다).`,
    );
  } else {
    console.error(`[dataset:discover] STAGING 생성 차단됨 — ${staging.blockedReason}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
