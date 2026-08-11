import { runTourismDataSync, runResumableLocalBatchSync } from "../src/lib/services/syncService";
import { parseSyncCliArgs, SYNC_CLI_USAGE, type ParsedSyncCliArgs } from "../src/lib/services/syncCliArgs";
import { validateBaseYmFormat } from "../src/lib/services/baseYm";
import { findLatestCommonBaseYm } from "../src/lib/services/latestCommonBaseYm";
import { probeTarSvcDemLive, probeTouResDemLive } from "../src/lib/services/baseYmProbeAdapters";
import { getStagingDatasetBaseYm } from "../src/lib/services/activeDataset";
import { prisma } from "../src/lib/db";

/**
 * 기준월(baseYm) 결정 순서(2026-08-08 재설계, 2026-08-11 --dataset=staging 추가): --dataset=staging
 * → CLI --base-ym 인자 → TOUR_DATA_BASE_YM 환경변수 → 최신 공통월 자동 탐색. 이전에는
 * `process.argv[2]`를 그대로 baseYm으로 쓰고, 셋 다 없으면 DEFAULT_BASE_YM(고정 상수)으로 조용히
 * 넘어갔다 — 그 결과 `--base-ym=202606` 같은 플래그 형식을 그대로 문자열 값으로 저장해버린 사고(정크
 * 스냅샷 108건)가 있었고, 기준월이 굳어져 있어 지원지역이 늘어날수록 수동 유지보수 부담도 커졌다.
 * 이제는 전부 실패하면 API 호출·DB 쓰기 없이 즉시 종료한다.
 */
async function resolveBaseYm(cliResult: Extract<ParsedSyncCliArgs, { ok: true }>): Promise<string | null> {
  if (cliResult.dataset === "staging") {
    const stagingBaseYm = await getStagingDatasetBaseYm();
    if (!stagingBaseYm) {
      console.error("[sync-cli] --dataset=staging 지정됨 — 그러나 STAGING dataset이 없습니다.");
      console.error("먼저 npm run dataset:discover로 새 기준월을 발견·등록하세요.");
      return null;
    }
    console.log(`[sync-cli] --dataset=staging 지정 — 현재 STAGING baseYm 사용: ${stagingBaseYm}`);
    return stagingBaseYm;
  }

  if (cliResult.baseYm) {
    console.log(`[sync-cli] CLI 인자로 지정된 기준월 사용: ${cliResult.baseYm}`);
    return cliResult.baseYm;
  }

  const envValue = process.env.TOUR_DATA_BASE_YM;
  if (envValue) {
    const validated = validateBaseYmFormat(envValue);
    if (!validated.ok) {
      console.error(`[sync-cli] TOUR_DATA_BASE_YM 환경변수 값이 올바르지 않습니다: ${validated.error}`);
      return null;
    }
    console.log(`[sync-cli] TOUR_DATA_BASE_YM 환경변수로 지정된 기준월 사용: ${validated.baseYm}`);
    return validated.baseYm;
  }

  console.log("[sync-cli] 명시적 기준월 없음 — TAR_SVC_DEM·TOU_RES_DEM 공통 최신월 자동 탐색 시작(대표 지역: 제천시)");
  const result = await findLatestCommonBaseYm({
    probeTarSvcDem: probeTarSvcDemLive,
    probeTouResDem: probeTouResDemLive,
  });
  for (const c of result.checked) {
    console.log(
      `  ${c.baseYm}: TAR_SVC_DEM=${c.tarSvcDem.ok ? (c.tarSvcDem.hasData ? "있음" : "EMPTY") : "실패"} · ` +
        `TOU_RES_DEM=${c.touResDem.ok ? (c.touResDem.hasData ? "있음" : "EMPTY") : "실패"}`,
    );
  }
  if (result.state === "FOUND") {
    console.log(`[sync-cli] 자동 탐색으로 확인된 최신 공통월: ${result.baseYm}`);
    return result.baseYm;
  }
  if (result.state === "RATE_LIMITED") {
    console.error(`[sync-cli] 자동 탐색 중단 — API 호출 한도(429)로 보입니다: ${result.message}`);
  } else {
    console.error(`[sync-cli] 확인한 ${result.checked.length}개월 범위 안에서 공통월을 찾지 못했습니다.`);
  }
  console.error(`기준월을 확인한 뒤 직접 지정하세요.\n${SYNC_CLI_USAGE}`);
  return null;
}

async function main() {
  const cliResult = parseSyncCliArgs(process.argv.slice(2));
  if (!cliResult.ok) {
    console.error(`[sync-cli] 잘못된 인자: ${cliResult.error}`);
    process.exitCode = 1;
    return;
  }

  const baseYm = await resolveBaseYm(cliResult);
  if (!baseYm) {
    process.exitCode = 1;
    return;
  }

  if (cliResult.allRegions) {
    console.log(`[sync-cli] 전국 재개형 배치 모드 — 최대 ${cliResult.maxRegions}개 지역까지 처리`);
    if (cliResult.forceTourInfoRefresh) {
      console.log(`[sync-cli] --force-tour-info 지정 — TOUR_INFO TTL 재사용을 끄고 항상 실제로 호출합니다`);
    }
    console.log(`[sync-cli] baseYm=${baseYm} 배치 동기화 시작`);
    const result = await runResumableLocalBatchSync({
      baseYm,
      triggeredBy: "CLI",
      maxRegions: cliResult.maxRegions,
      forceTourInfoRefresh: cliResult.forceTourInfoRefresh,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0 && result.completed === 0 && result.skipped === 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (cliResult.regionCode) {
    console.log(`[sync-cli] 지역 필터 적용: ${cliResult.regionCode} 1곳만 동기화`);
  }
  console.log(`[sync-cli] baseYm=${baseYm} 동기화 시작`);
  const result = await runTourismDataSync({ baseYm, triggeredBy: "CLI", regionCode: cliResult.regionCode });
  console.log(JSON.stringify(result, null, 2));
  if (result.overallStatus === "FAILED") {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
