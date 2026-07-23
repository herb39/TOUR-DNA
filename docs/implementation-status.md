# 구현 상태 (REVIEW_ONLY 재검증, 2026-07-23)

> 기준 커밋: `5e16dec`. 상태값: `NOT_STARTED` / `BLOCKED` / `IN_PROGRESS` / `DONE`.
> 각 항목은 실제 코드/스키마를 읽고 확인한 결과이며, 마스터 프롬프트(`TOUR-DNA-Claude-Code-Implementation-Prompt.md`)가
> "확인된 핵심 문제"로 지목한 항목이 지금도 재현되는지 파일·라인 단위로 표시한다.

## Phase 1. 데이터 출처 및 상태 모델 정비 — `IN_PROGRESS` (1-A, 1-B, 1-C `DONE`)

| 하위 항목 | 상태 | 근거 |
|---|---|---|
| **1-A provenance 컬럼 추가(스키마만)** | **DONE (2026-07-23)** | `DataProvenance` enum(`LIVE_API/CACHED_API/CURATED/ESTIMATED/MISSING`) 추가, `NormalizedMetric.provenance`/`Evidence.provenance` nullable 컬럼 추가. Migration `20260723000000_add_data_provenance`(미적용, additive). |
| **1-B 실제 raw snapshot 저장** | **DONE (2026-07-23, 보완 완료)** | `src/lib/services/syncService.ts`의 `runTourismDataSync()`에 5개 지표+POI 호출 지점마다 `upsertSnapshot()`을 추가해 실제 응답 객체를 `DataSnapshot`에 저장. 기존 SUCCESS/EMPTY 스냅샷 보존 정책 포함(보완 완료). |
| **1-C 실제 provenance/fallback 판정 연결** | **DONE (2026-07-23)** | 상세 내역 아래 참고 |
| 1-3 Network 근거 분리(POI 수 vs 관계 수) | NOT_STARTED(Phase 1-E 예정) | [buildDnaEngineInput.ts](../src/lib/services/buildDnaEngineInput.ts) Network Evidence가 아직 한 행이다(provenance/fallback 판정은 1-C로 정확해졌지만, POI 근거와 관계 근거를 별도 행으로 나누는 것은 별개 작업으로 남음) |

### Phase 1-C 상세

- **`isSnapshotFallback` 하드코딩 3곳 교체 완료**:
  - [metricCohort.ts](../src/lib/services/metricCohort.ts) — `NormalizedMetric.provenance`를 읽어 `isSnapshotFallback = provenance !== "LIVE_API"`로 계산(NULL 포함 모든 비-LIVE_API 값은 fallback).
  - [buildDnaEngineInput.ts](../src/lib/services/buildDnaEngineInput.ts) — Network 축은 POI `sourceType`(API/FIXTURE 혼입 여부)과 `PoiRelation`(현재 syncService가 절대 채우지 않아 존재하면 항상 CURATED) 기준으로 `LIVE_API`/`CURATED` 판정.
  - [dna.ts](../src/lib/domain/dna.ts) — 방문자수 증감률 Evidence는 current/previous 두 `VisitorCountPoint`의 provenance/isSnapshotFallback을 합성(둘 중 하나라도 fallback이면 전체 fallback, provenance는 current 우선·없으면 previous).
- **`syncService.ts`의 `upsertMetric()`**: `provenance` 파라미터 필수화. STAY/SPEND/DIVERSITY/DEMAND_SERVICE(전부 실키 검증됨) → `"LIVE_API"`. VISITOR_CNT(엔드포인트 자체 미확인, `docs/public-api-status.md`) → API 성공 여부와 무관하게 `"ESTIMATED"`.
- **CACHED_API 판정**: `upsertSnapshot()`이 "기존 SUCCESS/EMPTY 보존, 이번 ERROR는 기록 안 함"을 결정하는 바로 그 실행 컨텍스트에서 `markMetricsAsCached()`(신규)를 호출해, 같은 [regionId, baseYm]의 해당 metricCode 중 **provenance가 정확히 `"LIVE_API"`인 행만** `"CACHED_API"`로 낮춘다. NULL/기타 값은 건드리지 않는다(근거 없는 배정 금지).
- **`Evidence.provenance` 연결**: `EvidenceItem`에 `provenance` 필드 추가, `dna.ts`의 3개 evidence 생성 지점(`toEvidence`/growthEntry/network)과 `analyzeProject.ts`의 `toEvidenceCreateData()`를 통해 분석 시점 provenance가 그대로 `Evidence.provenance`에 저장된다.
- **NULL provenance 처리**: 일괄 backfill 없음. 기존 레코드는 NULL 그대로 남고, 읽기 시점(`metricCohort.ts`)에서 NULL은 항상 `isSnapshotFallback: true`로 계산되어 `LIVE_API`로 오인되지 않는다.
- **schema/migration 변경 없음**(이번 단위 전체가 기존 컬럼만 사용).

**완료 조건 충족 여부**: Phase 1의 핵심 완료 조건("추정값이 포함된 데모에서 LIVE 5/5가 나오지 않는다")이 이제 코드 수준에서 충족된다 — 기존 seed 데이터는 provenance가 전부 NULL이라 다음 분석부터 모든 축이 SNAPSHOT/HYBRID로 표시된다(정확한 표시, 의도된 동작). 실제 라이브 동기화가 새로 실행되면 그 지역/월만 LIVE_API로 갱신된다. Network 근거 분리(1-3/1-E)와 `seed.ts` 가짜 envelope 정리(1-D)는 아직 남아 있다.

## Phase 2. 갱신형 DB 캐시와 최신 데이터 자동 반영 — `NOT_STARTED`

- `SyncJob`, `SourceWatermark`, `DataFreshness`, `DatasetVersion` 등 마스터 프롬프트가 요구하는 모델이 schema에 전혀 없다. 현재는 `SyncLog`(실행 로그)만 있고 이는 job 상태·재시도·TTL을 담지 못한다.
- `TOUR_DATA_BASE_YM`은 여전히 `.env`에 고정된 값(`202606`)이며, 최신 기준월 자동 탐색(probe) 로직이 없다 — [public-api-status.md](public-api-status.md) 서두에 "향후에도 이 값은 수동으로 유지보수해야 한다"고 스스로 명시.
- stale-while-revalidate, 중복 동기화 방지(advisory lock/jobKey), 원자적 `DatasetVersion` 발행, 관리자 관측 화면 — 전부 미착수.

**의존성**: Phase 1의 provenance 필드가 있어야 Phase 2의 freshness 상태 표시가 의미를 가지므로, Phase 1 이후 진행 권장(마스터 문서의 권장 순서와 일치).

## Phase 3. 결정론과 데이터 버전 정확성 — `IN_PROGRESS` (일부 구현, 핵심 결함 확인)

| 요구 | 상태 | 근거 |
|---|---|---|
| `dataVersion`에서 휘발성 값 제거 | **결함 확인** | [buildDnaEngineInput.ts:44](../src/lib/services/buildDnaEngineInput.ts#L44) `collectedAt: new Date().toISOString()`가 `networkInputs`에 포함되고, [dataVersion.ts:15](../src/lib/domain/dataVersion.ts#L15) `network: input.networkInputs` 전체가 해시 입력에 들어간다 — **동일 데이터로 재분석해도 매번 `dataVersion`이 달라진다.** 마스터 문서가 지목한 문제가 정확히 재현됨 |
| 코호트 변경 시 dataVersion 변경 | **결함 확인** | [dataVersion.ts:7-9](../src/lib/domain/dataVersion.ts#L7-L9) `ownMetrics`는 `cohort.find(c => c.regionCode === input.regionCode)`로 **대상 지역 값만** 뽑아 해시한다 — 다른 지역 값이 바뀌어 min-max 정규화 결과가 달라져도 dataVersion은 그대로 유지됨 |
| `analysisKey`에 role/nationality 포함 | **결함 확인** | [analyzeProject.ts:46-58](../src/lib/services/analyzeProject.ts#L46-L58)의 `scoringInput`(analysisKey 입력)에 `role`/`nationality` 필드 자체가 없음 |
| 배열 정렬 후 해시 | DONE | [analysisKey.ts:3-14](../src/lib/domain/analysisKey.ts#L3-L14) `sortDeep`이 객체 키를 정렬(단, 배열 요소 자체의 순서는 정렬하지 않음 — `preferredThemes` 등 배열의 원소 순서가 바뀌면 키가 달라질 수 있어 "의미상 순서 없는 배열은 정렬 후 해시"라는 요구를 완전히 충족하지 못함) |
| 같은 입력/데이터 → 같은 결과 테스트 | 부분 DONE | `analysisKey.test.ts`(4), `strategy.test.ts`(12)에 결정론 테스트 존재. 단 위 두 결함 때문에 "동일 데이터=동일 dataVersion" 전제 자체가 깨져 있어 테스트가 결함을 못 잡고 있을 가능성 있음(재검토 필요) |

## Phase 4. 역할·국적·테마 반영 — `NOT_STARTED`

- `role`(`UserRole`)은 domain 계층(`src/lib/domain/*`) 어디에도 등장하지 않는다(전체 검색 결과 0건) — role별 산출물(제목/배경/체크리스트/KPI/인쇄 구성)이 전혀 분기되지 않는다.
- `nationality`(`Nationality`)도 domain 계층에 없다 — FOREIGN 선택 시 외국어 안내/국제결제/문화 설명 체크리스트가 생성되지 않는다.
- 테마는 `strategy.ts`의 문자열 포함 검사 수준(보너스 +10, 완전 배제)만 있고, 구조화된 테마 코드 체계는 없다.

## Phase 5. 다채널 홍보 초안 — `NOT_STARTED`

- 코드 전체에서 SNS/블로그/랜딩페이지 카피 생성 기능 없음. `strategyTemplates.ts`의 "SNS 언급량"은 KPI 측정 방법 문구일 뿐 콘텐츠 생성이 아니다.

## Phase 6. 조건 수정 및 안전한 재분석 — `NOT_STARTED`

- `src/app/projects/[id]/` 하위에 분석 조건을 수정하는 route/action이 없다(글롭 검색 결과 0건). 전략 재선택은 가능하지만 `ProjectInput` 자체를 고쳐 재분석하는 흐름은 없다.

## Phase 7. 비교 코호트와 행정 범위 설명 — `IN_PROGRESS` (부분 구현)

- 대전 라벨("대전광역시 (DNA 지표는 유성구 기준)")은 이미 반영됨(직전 세션, `regionQueries.ts`).
- 그러나 분석 화면에 "7개 지역 내 상대점수"라는 명시적 문구, 지표별 코호트 수(N)·min/max 범위 표시는 없음(검색 결과 근거 패널 관련 컴포넌트에 코호트/표본 언급 없음).

## Phase 8. 사이트 전체 잠금 제거 + 프로젝트별 비밀번호 — `NOT_STARTED`

- 현재 `SITE_ACCESS_PASSWORD` + `src/proxy.ts` 전역 게이트가 그대로 존재([proxy.ts](../src/proxy.ts) 전체 내용 확인, 2026-07-21 도입 그대로).
- `OwnerSession`, `ProjectAccessSession`, `ProjectOwnerRecovery`, `ProjectAccessAttempt`, `Project.publicId`/`passwordHash` 등 마스터 프롬프트가 요구하는 모델이 schema에 전혀 없음.
- **가장 우선순위 높은 미착수 항목** — 마스터 문서 자체가 "최우선 보안 작업"으로 지정.

## Phase 9. 무료 운영비 가드 — `NOT_STARTED`

- `COST_MODE`, `ALLOW_PAID_SERVICES` 환경변수가 코드/`.env.example` 어디에도 없음.
- `docs/free-cost-policy.md` 파일 없음.
- 현재 운영 방식(Vercel Hobby + Neon Free)은 문서상 유지되고 있는 것으로 보이나, 한도 접근 경고/자동 중단 로직은 없음.

## Phase 10. `/admin/ops` 읽기 전용 운영 페이지 — `NOT_STARTED`

- `src/app`에 `admin` 관련 경로는 `/api/admin/sync-tourism-data`(동기화 트리거, `CRON_SECRET` 인증) 하나뿐. 화면(`/admin/ops`)은 없음.
- `OperationalEvent` 모델 없음.

## Phase 11. 빌드·CI·동기화 정비 — `NOT_STARTED`

- `.github/workflows/` 디렉터리 없음(Glob 결과 0건).
- `.nvmrc` 없음, `package.json`에 `engines`/`packageManager` 필드 없음.
- 로컬 환경 `node v24.11.1` / `npm 11.6.2` 확인 — 마스터 문서가 지목한 "npm 11 환경에서 npm ci 실패" 문제를 이번 세션에서 직접 재현하지는 않았음(BLOCKED: 재현 여부는 Phase 11 착수 시 `npm ci` 실행으로 재확인 필요).
- `prisma`가 `dependencies`에 있음(devDependency 아님) — 마스터 문서 Phase 11-3 대상.

## Phase 12. 실제 경로(카카오내비/카카오맵 경로 API) — `NOT_STARTED`

- `CourseMap.tsx`는 Haversine 직선거리 기반 Polyline만 그린다. `RouteProvider`, `KAKAO_NAVI`, `directions` 등 실제 경로 API 연동 코드 없음(전체 검색 0건).
- 무료 쿼터 조건 자체가 아직 확인되지 않았음 — `docs/route-api-status.md` 참고, Phase 12는 그 문서의 선검증 완료 전까지 `BLOCKED`로 둔다.

## 요약 테이블 (2026-07-23 재조정 — 지정과제 7번 직접 요구사항·심사 노출도 기준)

> 이전 버전은 마스터 문서의 "첫 번째 실행 지시" 순서(보안 최우선)를 그대로 따랐다. 이번 재조정은
> 사용자 지시에 따라 **공모전 지정과제 7번 직결 항목과 심사 노출도**를 최우선 기준으로 삼는다 — Phase 8
> (보안)의 중요성 자체는 여전하지만, 지정과제 채점표에는 등장하지 않고 시연 데모(비밀번호 없는 단일
> 접근)로도 충분히 넘어갈 수 있어 P1로 내렸다.

| Phase | 상태 | 우선순위(재조정) |
|---|---|---|
| 1. Provenance 모델 + 실제 snapshot 저장 | IN_PROGRESS(1-A/1-B/1-C DONE, 1-D/1-E 남음) | **P0-1** |
| 5. 다채널 홍보 초안 | NOT_STARTED | **P0-2** |
| 4. role/nationality/테마/여행월 반영 | NOT_STARTED | **P0-3** |
| (신규) 대표 시나리오 3개 차별화 + E2E | NOT_STARTED | **P0-4** |
| 8. 사이트 잠금 제거/프로젝트 비밀번호(축소 구현) | NOT_STARTED | P1-5 |
| 2. 최소 갱신 구조(축소 구현) | NOT_STARTED | P1-6 |
| 11. 빌드/CI 정비 | NOT_STARTED | P1-7 |
| 10. `/admin/ops` | NOT_STARTED | P2-8 |
| 12. 실제 경로 API | NOT_STARTED(BLOCKED — 쿼터/REST키/약관 일부 미확인) | P2-9 |
| 3. 결정론/dataVersion | IN_PROGRESS(결함 확인) | P0-3에 흡수(role/nationality를 analysisKey에 넣으려면 3의 결함도 같이 손봐야 함) |
| 6. 조건 수정/안전 재분석 | NOT_STARTED | P1 이후(P0~P1 완료 후 재검토) |
| 7. 코호트/행정범위 설명 | IN_PROGRESS(부분) | P1 이후(표시만 남은 작업이라 낮은 리스크로 아무 때나 끼워넣기 가능) |
| 9. 무료 운영비 가드 | NOT_STARTED | 전 Phase 횡단 적용(외부 API를 새로 호출하는 모든 구현 단위에 동시 적용) |

기존 76개 단위 테스트(`tests/unit/*` 11개 파일)와 8개 E2E(`e2e/core-flow.spec.ts`)는 모두 현재 보존되어 있으며, 이번 검토에서는 실행하지 않았다(REVIEW_ONLY, 코드 미수정이므로 재실행 불필요 — 마지막 실행은 직전 세션 커밋 `9e509ce` 기준 전부 통과).

## Phase 2 축소 검토 결과

현재 규모(7개 지역 × 6개 지표, 트리거는 Vercel Cron 1일 1회 + 관리자 수동 + CLI 3개뿐)에서는
`SyncJob`/`DatasetVersion`/advisory lock의 필요성이 입증되지 않는다 — 동시 트리거 충돌이 실제로
보고된 적이 없고, 중복 동기화가 일어나도 `upsertMetric`/`prisma.poi.upsert`가 이미 upsert라 데이터
정합성이 깨지지 않는다(최악의 경우 API 호출 낭비 정도). 따라서:

- **채택**: 기존 `DataSource` 모델에 `latestAvailableBaseYm`/`lastAttemptAt`/`lastSuccessAt` 필드만
  추가(신규 `SourceWatermark` 모델 대신 확장) — 최신 기준월 자동 탐색(probe)의 최소 기반.
- **보류**: `SyncJob`(재시도/잠금 상태 머신), `DatasetVersion`(원자적 버전 발행), PostgreSQL advisory
  lock. 전국 확대로 지역 수가 늘거나 동시 트리거가 실제 문제를 일으키면 그때 재검토.

## Phase 8 축소 검토 결과

- **`ProjectOwnerRecovery`(소유자 복구 코드)**: P1 이후로 보류. 근거: 공모전 시연 범위에서는 작성자가
  같은 브라우저로 계속 접근하므로 쿠키 분실 시나리오의 발생 확률이 낮고, 이 기능이 빠져도 핵심 사용자
  흐름(공개 열람/비밀번호 보호/OWNER 편집)은 완전히 동작한다. UI에는 "쿠키 삭제 시 복구 불가" 안내만
  넣는다.
- **`ProjectAccessAttempt`(비밀번호 rate limit)**: 재검토 결과 **유지 필요**로 결론. Vercel 서버리스
  환경에서는 인스턴스 간 공유 메모리가 없어 in-memory 카운터로는 rate limit이 보장되지 않고, 대체할
  기존 모델도 없다. 다만 이 모델은 **비밀번호 검증 기능과 반드시 같은 커밋(8-C)에서 함께 구현**한다 —
  rate limit 없이 비밀번호 검증만 먼저 배포하면 그 사이 브루트포스에 노출되는 중간 상태가 생기기
  때문이다(마스터 문서 "첫 번째 실행 지시" 3번의 "중간 상태를 production에 배포하지 않는다" 원칙과 동일).

## Phase 10 하향 근거

지정과제 7번 채점표(1차: 구현성/기획성/데이터활용/성장성, 최종: 적절성/완성도/실용성/발표력) 어디에도
"운영자 전용 관리 화면"은 항목으로 없다. 심사 시연은 공개 화면(랜딩~인쇄)만으로 완결되고, 데이터
신뢰성 문제(Phase 1)가 이미 근거 패널에 직접 노출되므로 `/admin/ops`가 없어도 감점 요인이 되지 않는다.
따라서 P2로 내린다 — 단, Phase 1의 provenance 필드가 생기면 이후 `/admin/ops` 구현 비용은 오히려
줄어든다(표시할 상태값이 이미 존재하므로).
