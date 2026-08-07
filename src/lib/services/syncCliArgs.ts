import { validateBaseYmFormat } from "./baseYm";

export const SYNC_CLI_USAGE =
  '사용법: npm run sync:tourism-data -- --base-ym=YYYYMM (예: --base-ym=202606)\n' +
  '       또는: npm run sync:tourism-data -- --base-ym YYYYMM\n' +
  "인자를 생략하면 TOUR_DATA_BASE_YM 환경변수 → 최신 공통월 자동 탐색 순으로 사용합니다.";

export type ParsedSyncCliArgs =
  | { ok: true; baseYm: string | null } // null이면 CLI에서 명시적으로 지정하지 않음(env/자동 탐색으로 넘어감)
  | { ok: false; error: string };

/**
 * `scripts/sync-tourism-data.ts`의 CLI 인자를 파싱·검증한다(2026-08-08 도입) — 이전에는
 * `process.argv[2]`를 그대로 baseYm으로 썼는데, `--base-ym=202606` 같은 플래그 형식을 그대로 문자열로
 * 저장해버려(`"--base-ym=202606"`) 실제 API 호출과 DB에 잘못된 baseYm이 100건 넘게 쌓인 사고가 있었다.
 * 이 함수는 API 호출·DB 쓰기 전에 순수하게 인자만 검증하므로 부작용이 전혀 없다(단위테스트로 전수
 * 검증 가능).
 *
 * 지원 형식: `--base-ym=YYYYMM`, `--base-ym YYYYMM`(공백 구분), 인자 없음(생략). 그 외(구 위치 인자
 * 형식 포함, 알 수 없는 옵션, 중첩된 플래그 문자열, 하이픈 포함 등)는 전부 명시적으로 거부한다 —
 * 잘못된 입력을 DEFAULT_BASE_YM 등으로 조용히 대체하지 않는다.
 */
export function parseSyncCliArgs(argv: string[]): ParsedSyncCliArgs {
  if (argv.length === 0) {
    return { ok: true, baseYm: null };
  }

  let rawValue: string;
  if (argv[0].startsWith("--base-ym=")) {
    if (argv.length > 1) {
      return { ok: false, error: `인자가 너무 많습니다(추가 인자: ${argv.slice(1).join(" ")}).\n${SYNC_CLI_USAGE}` };
    }
    rawValue = argv[0].slice("--base-ym=".length);
  } else if (argv[0] === "--base-ym") {
    if (argv.length !== 2) {
      return {
        ok: false,
        error: `--base-ym 뒤에 값이 정확히 하나 와야 합니다(예: --base-ym 202606).\n${SYNC_CLI_USAGE}`,
      };
    }
    rawValue = argv[1];
  } else if (argv[0].startsWith("--")) {
    return { ok: false, error: `알 수 없는 옵션입니다: "${argv[0]}"\n${SYNC_CLI_USAGE}` };
  } else {
    // 구 위치 인자 형식(예: `sync-tourism-data.ts 202606`)은 더 이상 지원하지 않는다 — 실수로 잘못된
    // 플래그 문자열이 그대로 값으로 들어가는 사고를 근본적으로 막기 위해 --base-ym= 형식만 허용한다.
    return {
      ok: false,
      error: `위치 인자 형식은 더 이상 지원하지 않습니다: "${argv[0]}"\n${SYNC_CLI_USAGE}`,
    };
  }

  const validated = validateBaseYmFormat(rawValue);
  if (!validated.ok) {
    return { ok: false, error: `${validated.error}\n${SYNC_CLI_USAGE}` };
  }
  return { ok: true, baseYm: validated.baseYm };
}
