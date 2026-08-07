import { runTourismDataSync } from "../src/lib/services/syncService";
import { parseSyncCliArgs, SYNC_CLI_USAGE } from "../src/lib/services/syncCliArgs";
import { validateBaseYmFormat } from "../src/lib/services/baseYm";
import { findLatestCommonBaseYm } from "../src/lib/services/latestCommonBaseYm";
import { probeTarSvcDemLive, probeTouResDemLive } from "../src/lib/services/baseYmProbeAdapters";
import { prisma } from "../src/lib/db";

/**
 * 기준월(baseYm) 결정 순서(2026-08-08 재설계): CLI 인자 → TOUR_DATA_BASE_YM 환경변수 → 최신 공통월
 * 자동 탐색. 이전에는 `process.argv[2]`를 그대로 baseYm으로 쓰고, 셋 다 없으면 DEFAULT_BASE_YM(고정
 * 상수)으로 조용히 넘어갔다 — 그 결과 `--base-ym=202606` 같은 플래그 형식을 그대로 문자열 값으로
 * 저장해버린 사고(정크 스냅샷 108건)가 있었고, 기준월이 굳어져 있어 지원지역이 늘어날수록 수동
 * 유지보수 부담도 커졌다. 이제는 셋 다 실패하면 API 호출·DB 쓰기 없이 즉시 종료한다.
 */
async function resolveBaseYm(argv: string[]): Promise<string | null> {
  const cliResult = parseSyncCliArgs(argv);
  if (!cliResult.ok) {
    console.error(`[sync-cli] 잘못된 인자: ${cliResult.error}`);
    return null;
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
  const baseYm = await resolveBaseYm(process.argv.slice(2));
  if (!baseYm) {
    process.exitCode = 1;
    return;
  }

  console.log(`[sync-cli] baseYm=${baseYm} 동기화 시작`);
  const result = await runTourismDataSync({ baseYm, triggeredBy: "CLI" });
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
