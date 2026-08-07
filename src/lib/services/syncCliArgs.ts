import { validateBaseYmFormat } from "./baseYm";

export const SYNC_CLI_USAGE =
  '사용법: npm run sync:tourism-data -- --base-ym=YYYYMM (예: --base-ym=202606)\n' +
  '       또는: npm run sync:tourism-data -- --base-ym YYYYMM\n' +
  '       특정 지역 1곳만 동기화하려면: npm run sync:tourism-data -- --base-ym=202606 --region-code=SGG_JECHEON\n' +
  "(--region-code는 SIGUNGU 코드만 지정할 수 있습니다 — src/lib/fixtures/regions.ts의 REGION_SEED 참고)\n" +
  "인자를 생략하면 TOUR_DATA_BASE_YM 환경변수 → 최신 공통월 자동 탐색 순으로 사용합니다.";

export type ParsedSyncCliArgs =
  // baseYm이 null이면 CLI에서 명시적으로 지정하지 않음(env/자동 탐색으로 넘어감).
  // regionCode가 null이면 지역 필터 없음(기존과 동일하게 전체 SIGUNGU 동기화).
  | { ok: true; baseYm: string | null; regionCode: string | null }
  | { ok: false; error: string };

/**
 * `scripts/sync-tourism-data.ts`의 CLI 인자를 파싱·검증한다(2026-08-08 도입, 같은 날 --region-code
 * 옵션 추가). 이전에는 `process.argv[2]`를 그대로 baseYm으로 썼는데, `--base-ym=202606` 같은 플래그
 * 형식을 그대로 문자열로 저장해버려(`"--base-ym=202606"`) 실제 API 호출과 DB에 잘못된 baseYm이 100건
 * 넘게 쌓인 사고가 있었다. 이 함수는 API 호출·DB 쓰기 전에 순수하게 인자만 검증하므로 부작용이 전혀
 * 없다(단위테스트로 전수 검증 가능).
 *
 * 지원 형식: `--base-ym=YYYYMM`, `--base-ym YYYYMM`(공백 구분), `--region-code=<코드>`(둘과 조합
 * 가능), 인자 없음(생략). 그 외(구 위치 인자 형식 포함, 알 수 없는 옵션, 중첩된 플래그 문자열, 같은
 * 옵션 중복 지정 등)는 전부 명시적으로 거부한다 — 잘못된 입력을 DEFAULT_BASE_YM 등으로 조용히
 * 대체하지 않는다. `--region-code` 값이 실제 존재하는 SIGUNGU 코드인지는 여기서 확인하지 않는다(DB
 * 조회가 필요해 순수 함수 밖의 일이다) — `runTourismDataSync`가 API 호출 전에 확인한다.
 */
export function parseSyncCliArgs(argv: string[]): ParsedSyncCliArgs {
  let baseYmRaw: string | null = null;
  let regionCode: string | null = null;
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

  return { ok: true, baseYm, regionCode };
}
