import { validateBaseYmFormat } from "./baseYm";

export const SYNC_CLI_USAGE =
  '사용법: npm run sync:tourism-data -- --base-ym=YYYYMM (예: --base-ym=202606)\n' +
  '       또는: npm run sync:tourism-data -- --base-ym YYYYMM\n' +
  '       특정 지역 1곳만 동기화하려면: npm run sync:tourism-data -- --base-ym=202606 --region-code=SGG_JECHEON\n' +
  "(--region-code는 SIGUNGU 코드만 지정할 수 있습니다 — src/lib/fixtures/regions.ts의 REGION_SEED 참고)\n" +
  '       전국을 재개 가능한 배치로 나눠 돌리려면: npm run sync:tourism-data -- --base-ym=202606 --all-regions --max-regions=20\n' +
  "(--all-regions는 --region-code와 함께 쓸 수 없고, --max-regions(이번 실행에서 실제 API를 호출할 최대 지역 수, 양의 정수)를 반드시 함께 지정해야 합니다 — 기본값을 임의로 추정하지 않습니다. 이미 성공/빈 응답으로 완료된 지역×데이터소스는 자동으로 건너뛰고, quota/429가 감지되면 그 시점까지의 결과를 보존한 채 안전하게 종료합니다. 다음 실행에서 같은 옵션으로 다시 실행하면 이어서 진행됩니다.)\n" +
  '       현재 STAGING dataset을 대상으로 증분 동기화하려면(Phase 2-B, npm run dataset:discover로 먼저 발견): npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=20\n' +
  "(--dataset=staging은 --base-ym 대신 현재 STAGING 상태인 baseYm을 DB에서 조회해 자동으로 씁니다 — 이 값을 정확히 알아도 --base-ym과 함께 지정할 수 없습니다. STAGING dataset이 없으면 즉시 실패합니다. ACTIVE dataset은 이 옵션으로 절대 바뀌지 않습니다 — 승격은 별도로 npm run dataset:activate를 실행해야 합니다.)\n" +
  "인자를 생략하면 TOUR_DATA_BASE_YM 환경변수 → 최신 공통월 자동 탐색 순으로 사용합니다.";

export type ParsedSyncCliArgs =
  // baseYm이 null이면 CLI에서 명시적으로 지정하지 않음(env/자동 탐색으로 넘어감).
  // regionCode가 null이면 지역 필터 없음(기존과 동일하게 전체 SIGUNGU 동기화).
  // allRegions가 true면 재개 가능한 전국 순차 배치 모드(2026-08-09 도입) — 이때만 maxRegions가 채워진다.
  // dataset이 "staging"이면(2026-08-11 도입, Phase 2-B) baseYm은 항상 null이고, 실행 시점에 현재
  // STAGING dataset의 baseYm을 DB에서 조회해 대신 쓴다 — --base-ym과 동시에 지정할 수 없다.
  | { ok: true; baseYm: string | null; regionCode: string | null; allRegions: false; maxRegions: null; dataset: "staging" | null }
  | { ok: true; baseYm: string | null; regionCode: null; allRegions: true; maxRegions: number; dataset: "staging" | null }
  | { ok: false; error: string };

/**
 * `scripts/sync-tourism-data.ts`의 CLI 인자를 파싱·검증한다(2026-08-08 도입, 같은 날 --region-code
 * 옵션 추가). 이전에는 `process.argv[2]`를 그대로 baseYm으로 썼는데, `--base-ym=202606` 같은 플래그
 * 형식을 그대로 문자열로 저장해버려(`"--base-ym=202606"`) 실제 API 호출과 DB에 잘못된 baseYm이 100건
 * 넘게 쌓인 사고가 있었다. 이 함수는 API 호출·DB 쓰기 전에 순수하게 인자만 검증하므로 부작용이 전혀
 * 없다(단위테스트로 전수 검증 가능).
 *
 * 지원 형식: `--base-ym=YYYYMM`, `--base-ym YYYYMM`(공백 구분), `--region-code=<코드>`, `--all-regions`,
 * `--max-regions=<N>`(조합 가능한 조건은 아래 참고), 인자 없음(생략). 그 외(구 위치 인자 형식 포함,
 * 알 수 없는 옵션, 중첩된 플래그 문자열, 같은 옵션 중복 지정 등)는 전부 명시적으로 거부한다 — 잘못된
 * 입력을 DEFAULT_BASE_YM 등으로 조용히 대체하지 않는다. `--region-code` 값이 실제 존재하는 SIGUNGU
 * 코드인지는 여기서 확인하지 않는다(DB 조회가 필요해 순수 함수 밖의 일이다) — `runTourismDataSync`가
 * API 호출 전에 확인한다.
 *
 * `--all-regions`(2026-08-09 도입, 재개 가능한 전국 순차 배치 모드)는 `--region-code`와 함께 쓸 수
 * 없고, `--max-regions=<양의 정수>`를 반드시 함께 지정해야 한다 — 공공 API 일일 호출 한도는 이
 * 코드베이스가 알 수 없으므로 기본값을 임의로 추정하지 않고 사용자가 매번 명시하게 한다.
 */
export function parseSyncCliArgs(argv: string[]): ParsedSyncCliArgs {
  let baseYmRaw: string | null = null;
  let regionCode: string | null = null;
  let allRegions = false;
  let maxRegionsRaw: string | null = null;
  let dataset: "staging" | null = null;
  let i = 0;

  while (i < argv.length) {
    const token = argv[i];

    if (token.startsWith("--base-ym=")) {
      if (baseYmRaw !== null) {
        return { ok: false, error: `--base-ym을 두 번 이상 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
      }
      baseYmRaw = token.slice("--base-ym=".length);
      i += 1;
      continue;
    }

    if (token === "--base-ym") {
      if (baseYmRaw !== null) {
        return { ok: false, error: `--base-ym을 두 번 이상 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
      }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          error: `--base-ym 뒤에 값이 정확히 하나 와야 합니다(예: --base-ym 202606).\n${SYNC_CLI_USAGE}`,
        };
      }
      baseYmRaw = value;
      i += 2;
      continue;
    }

    if (token.startsWith("--region-code=")) {
      if (regionCode !== null) {
        return { ok: false, error: `--region-code를 두 번 이상 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
      }
      const value = token.slice("--region-code=".length);
      if (value.length === 0) {
        return { ok: false, error: `--region-code 값이 비어 있습니다.\n${SYNC_CLI_USAGE}` };
      }
      regionCode = value;
      i += 1;
      continue;
    }

    if (token === "--all-regions") {
      if (allRegions) {
        return { ok: false, error: `--all-regions를 두 번 이상 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
      }
      allRegions = true;
      i += 1;
      continue;
    }

    if (token.startsWith("--max-regions=")) {
      if (maxRegionsRaw !== null) {
        return { ok: false, error: `--max-regions를 두 번 이상 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
      }
      maxRegionsRaw = token.slice("--max-regions=".length);
      i += 1;
      continue;
    }

    if (token.startsWith("--dataset=")) {
      if (dataset !== null) {
        return { ok: false, error: `--dataset을 두 번 이상 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
      }
      const value = token.slice("--dataset=".length);
      if (value !== "staging") {
        return { ok: false, error: `--dataset은 현재 "staging"만 지원합니다: "${value}"\n${SYNC_CLI_USAGE}` };
      }
      dataset = "staging";
      i += 1;
      continue;
    }

    if (token.startsWith("--")) {
      return { ok: false, error: `알 수 없는 옵션입니다: "${token}"\n${SYNC_CLI_USAGE}` };
    }

    // 구 위치 인자 형식(예: `sync-tourism-data.ts 202606`)은 더 이상 지원하지 않는다 — 실수로 잘못된
    // 플래그 문자열이 그대로 값으로 들어가는 사고를 근본적으로 막기 위해 `--플래그=값` 형식만 허용한다.
    return {
      ok: false,
      error: `위치 인자 형식은 더 이상 지원하지 않습니다: "${token}"\n${SYNC_CLI_USAGE}`,
    };
  }

  let baseYm: string | null = null;
  if (baseYmRaw !== null) {
    const validated = validateBaseYmFormat(baseYmRaw);
    if (!validated.ok) {
      return { ok: false, error: `${validated.error}\n${SYNC_CLI_USAGE}` };
    }
    baseYm = validated.baseYm;
  }

  if (dataset !== null && baseYm !== null) {
    return { ok: false, error: `--dataset과 --base-ym은 함께 지정할 수 없습니다(대상 baseYm을 정하는 방법이 서로 다릅니다).\n${SYNC_CLI_USAGE}` };
  }

  if (allRegions && regionCode !== null) {
    return { ok: false, error: `--all-regions와 --region-code는 함께 지정할 수 없습니다.\n${SYNC_CLI_USAGE}` };
  }

  if (maxRegionsRaw !== null && !allRegions) {
    return { ok: false, error: `--max-regions는 --all-regions와 함께 지정해야 합니다.\n${SYNC_CLI_USAGE}` };
  }

  if (allRegions && maxRegionsRaw === null) {
    return {
      ok: false,
      error: `--all-regions를 사용하려면 --max-regions=<이번 실행에서 처리할 최대 지역 수>를 반드시 함께 지정해야 합니다(공공 API 일일 호출 한도를 고려해 값을 직접 정하세요 — 기본값을 임의로 추정하지 않습니다).\n${SYNC_CLI_USAGE}`,
    };
  }

  let maxRegions: number | null = null;
  if (maxRegionsRaw !== null) {
    if (!/^[0-9]+$/.test(maxRegionsRaw) || Number(maxRegionsRaw) <= 0) {
      return { ok: false, error: `--max-regions 값은 1 이상의 정수여야 합니다: "${maxRegionsRaw}"\n${SYNC_CLI_USAGE}` };
    }
    maxRegions = Number(maxRegionsRaw);
  }

  if (allRegions) {
    return { ok: true, baseYm, regionCode: null, allRegions: true, maxRegions: maxRegions as number, dataset };
  }
  return { ok: true, baseYm, regionCode, allRegions: false, maxRegions: null, dataset };
}
