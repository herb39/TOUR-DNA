/**
 * 대량 관광 데이터 동기화(전체 지역 API 호출 + DB 쓰기)가 실수로 원격 DB(Neon 등)를 대상으로 실행되는
 * 사고를 막는 공통 가드(2026-08-08 도입) — Neon Free 플랜의 월간 데이터 전송 한도를 소진한 뒤, 개발
 * 완료 전까지 모든 대량 배치 작업을 로컬 PostgreSQL(`tour_dna_local`)에서만 수행하기로 한 정책을
 * 코드로 강제한다. 판단 기준은 DATABASE_URL의 호스트명뿐이다 — 비밀번호 등 나머지 부분은 전혀 읽지
 * 않고, 로그에도 host/database 이름 정도만 남긴다.
 *
 * 이 가드는 `runTourismDataSync`(sync-tourism-data.ts CLI·`/api/cron/sync-tourism-data`·
 * `/api/admin/sync-tourism-data`가 공유), `sync-data-sources.ts`, `sync-visitor.ts` 등 "대량으로 외부
 * API를 호출하고 DB에 쓰는" 배치 진입점에서만 호출한다 — 일반 사용자 화면(프로젝트 생성·조회·분석)은
 * 이 함수들을 전혀 거치지 않으므로 영향받지 않는다.
 *
 * 원격 DB에 정말로 동기화해야 하는 시점(최종 배포 준비)이 오면 `ALLOW_REMOTE_DATA_SYNC=true`
 * 환경변수를 설정한 뒤 다시 실행하면 된다 — 기본값은 항상 차단이다.
 */

export const ALLOW_REMOTE_DATA_SYNC_ENV = "ALLOW_REMOTE_DATA_SYNC";

// URL.hostname은 IPv6 주소를 대괄호로 감싼 형태로 반환한다(예: "[::1]") — 두 표기 모두 인정한다.
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface DataSyncTargetCheck {
  /** 이번 배치를 진행해도 되면 true. */
  allowed: boolean;
  /** DATABASE_URL을 파싱할 수 있었을 때만 채워진다(비밀번호 등 나머지 부분은 절대 포함하지 않음). */
  host: string | null;
  database: string | null;
  /** 로그에 그대로 출력해도 안전한 진단 문구(예: "DB 대상: localhost / tour_dna_local"). */
  targetLabel: string;
  /** allowed=false일 때만 채워지는, 사용자에게 보여줄 한국어 차단 사유. */
  blockedReason?: string;
}

/**
 * DATABASE_URL과 (선택적) override 플래그만으로 순수하게 판정한다 — 실제 DB 연결을 시도하지 않고
 * API 호출 전에 동기 판단이 끝나므로, 호출부는 이 결과가 `allowed:false`면 어떤 I/O도 시작하지
 * 않아야 한다.
 */
export function checkDataSyncTarget(
  databaseUrl: string | undefined,
  allowRemoteFlag: string | undefined,
): DataSyncTargetCheck {
  if (!databaseUrl) {
    return {
      allowed: false,
      host: null,
      database: null,
      targetLabel: "DB 대상: (DATABASE_URL 미설정)",
      blockedReason: "DATABASE_URL이 설정되지 않았습니다 — .env.local을 확인하세요.",
    };
  }

  let host: string;
  let database: string | null;
  try {
    const parsed = new URL(databaseUrl);
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, "") || null;
  } catch {
    return {
      allowed: false,
      host: null,
      database: null,
      targetLabel: "DB 대상: (DATABASE_URL 형식 확인 불가)",
      blockedReason: "DATABASE_URL 형식을 확인할 수 없습니다.",
    };
  }

  const targetLabel = `DB 대상: ${host} / ${database ?? "(알 수 없음)"}`;

  if (LOCAL_HOSTNAMES.has(host)) {
    return { allowed: true, host, database, targetLabel };
  }

  if (allowRemoteFlag === "true") {
    return {
      allowed: true,
      host,
      database,
      targetLabel: `${targetLabel} (원격 — ${ALLOW_REMOTE_DATA_SYNC_ENV}=true로 허용됨)`,
    };
  }

  return {
    allowed: false,
    host,
    database,
    targetLabel,
    blockedReason:
      `대량 관광 데이터 동기화는 기본적으로 localhost/127.0.0.1 대상에서만 실행할 수 있습니다 ` +
      `(현재 대상: ${host}). 정말로 원격 DB에 동기화해야 하면 ${ALLOW_REMOTE_DATA_SYNC_ENV}=true를 ` +
      `설정한 뒤 다시 실행하세요.`,
  };
}
