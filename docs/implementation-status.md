# 구현 상태 (REVIEW_ONLY 재검증, 2026-07-23)

> 기준 커밋: `5e16dec`. 상태값: `NOT_STARTED` / `BLOCKED` / `IN_PROGRESS` / `DONE`.
> 각 항목은 실제 코드/스키마를 읽고 확인한 결과이며, 마스터 프롬프트(`TOUR-DNA-Claude-Code-Implementation-Prompt.md`)가
> "확인된 핵심 문제"로 지목한 항목이 지금도 재현되는지 파일·라인 단위로 표시한다.

## Phase 1. 데이터 출처 및 상태 모델 정비 — `IN_PROGRESS` (1-A, 1-B, 1-C, 1-D `DONE`)

| 하위 항목 | 상태 | 근거 |
|---|---|---|
| **1-A provenance 컬럼 추가(스키마만)** | **DONE (2026-07-23)** | `DataProvenance` enum(`LIVE_API/CACHED_API/CURATED/ESTIMATED/MISSING`) 추가, `NormalizedMetric.provenance`/`Evidence.provenance` nullable 컬럼 추가. Migration `20260723000000_add_data_provenance`(미적용, additive). |
| **1-B 실제 raw snapshot 저장** | **DONE (2026-07-23, 보완 완료)** | `src/lib/services/syncService.ts`의 `runTourismDataSync()`에 5개 지표+POI 호출 지점마다 `upsertSnapshot()`을 추가해 실제 응답 객체를 `DataSnapshot`에 저장. 기존 SUCCESS/EMPTY 스냅샷 보존 정책 포함(보완 완료). |
| **1-C 실제 provenance/fallback 판정 연결** | **DONE (2026-07-23)** | 상세 내역 아래 참고 |
| **1-D seed 가짜 envelope 제거, provenance 명시** | **DONE (2026-07-23)** | 상세 내역 아래 참고 |
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

### Phase 1-D 상세

- **가짜 API 성공 envelope 완전 제거**: `prisma/seed.ts`의 `envelope()` 헬퍼(`resultCode:"0000"`/`resultMsg:"NORMAL SERVICE."`를 지어내던 함수)와 `upsertSnapshotAndMetric()`(seed 데이터로 가짜 `DataSnapshot` SUCCESS/EMPTY를 만들던 함수)을 삭제했다. **seed는 이제 `DataSnapshot`을 전혀 생성하지 않는다** — `DataSnapshot.status`(SUCCESS/EMPTY/ERROR)에는 "fixture/큐레이션" 상태값 자체가 없어, 실제 API 호출 없이 SUCCESS를 붙이면 정직하게 표현할 방법이 없기 때문(스키마 변경 없이는 fixture 전용 snapshot 상태를 새로 만들 수 없음 — 지시된 대로 스키마를 바꾸지 않고 "생성 자체를 제거"하는 방안을 택함).
- **의존 경로 확인**: `DataSnapshot`을 읽는 곳은 `projectQueries.ts`의 `getLatestDataFreshness()`(랜딩 페이지의 "마지막 동기화" 표시) 하나뿐. seed가 snapshot을 만들지 않아도 `formatDateTime(null)`이 이미 `"-"`를 반환하도록 구현돼 있어 안전하게 폴백된다(크래시 없음, 코드 미변경). 어떤 테스트도 seed가 만든 `DataSnapshot`에 의존하지 않음을 확인.
- **CURATED/ESTIMATED 판정 로직 분리**: `src/lib/services/seedMetrics.ts`(신규) — `classifyVerifiedMetricProvenance(baseYm)`가 순수 함수로 기준월별 판정을 노출(DB 없이 단위테스트 가능), `upsertSeedMetric()`이 `DataSnapshot` 없이 `NormalizedMetric`만 provenance와 함께 upsert. `prisma/seed.ts`는 이 함수들을 import해서 쓴다(로직 중복 없음).
- **seed metric provenance 규칙**: STAY/SPEND/DIVERSITY/DEMAND_SERVICE는 202605·202606(2026-07-21 실키로 사람이 직접 확인한 기준월) → `CURATED`, 그 이전 202508·202509(실키 발급 전 추정치, fixture 주석에 명시) → `ESTIMATED`. DEMAND_RESOURCE(문화자원수요)·VISITOR_CNT(방문자수)는 baseYm과 무관하게 항상 `ESTIMATED`(API 필드 의미 자체가 미확인 — Phase 1-C의 VISITOR_CNT 정책과 동일 원칙 적용). `LIVE_API`/`CACHED_API`는 `upsertSeedMetric()`의 파라미터 타입에서 아예 배제(`Extract<DataProvenance,"CURATED"|"ESTIMATED">`)해 실수로도 쓸 수 없게 했다.
- **MISSING 처리 유지**: 제천 202508의 DEMAND_RESOURCE는 여전히 "값 자체가 없는" 사례로 남기되, 가짜 EMPTY snapshot 대신 해당 `NormalizedMetric`을 아예 생성하지 않는다 — 기존 MISSING 축 처리가 그대로 적용됨.
- **seed POI/PoiRelation**: 코드 검토 결과 **이미 올바르게 구현돼 있었음**(변경 불필요) — POI는 항상 `sourceType:"FIXTURE"`, `PoiRelation`은 실제 API가 절대 채우지 않아 존재 자체가 CURATED 근거라는 점(Phase 1-C의 `buildDnaEngineInput.ts` 판정 규칙과 정확히 일치)을 명확히 하는 주석만 추가.
- **테스트**: `tests/unit/seedMetrics.test.ts`(신규 10개) — 기준월별 CURATED/ESTIMATED 분류, provenance 명시 저장, DataSnapshot 미호출, 재실행 dedup, `prisma/seed.ts` 소스에 가짜 envelope/함수가 남아있지 않은지 정적 검사.
- **공유 DB 미접속**: 이번 검증은 전부 `@/lib/db`를 mock으로 대체한 단위테스트로만 수행했다. 실제 `seed.ts` 전체 실행(운영/공유 Neon DB 접속 필요)은 하지 않았다 — 지시에 따름.

**완료 조건 충족 여부**: Phase 1의 핵심 완료 조건("추정값이 포함된 데모에서 LIVE 5/5가 나오지 않는다")이 이제 데이터 생성 경로 전체(실 동기화 + seed) 수준에서 충족된다. 다음 `npm run db:seed` 실행부터 새로 생성되는 seed metric은 CURATED/ESTIMATED가 명시되고, 실제 라이브 동기화 결과만 LIVE_API/CACHED_API로 구분된다. 기존에 이미 채워진 레코드(마이그레이션 이전)는 여전히 NULL로 남아 있으며(재실행 전까지), 이는 의도된 보수적 처리다. Network 근거 분리(1-3/1-E)만 남았다.

### Phase 1-D 이후 보완(2026-07-23, 같은 날 발견·수정)

- **DEMAND_SERVICE(tarSvcDemIxVal) seed sourceCode 정정**: `prisma/seed.ts`가 `"TAR_SVC_DEM"`으로 잘못 attribution하던 것을 실제 출처인 `"TOU_RES_DEM"`으로 고쳤다(`AreaTarDemDsService`엔 이 오퍼레이션 자체가 없음 — `docs/public-api-status.md`, 실제 `syncService.ts`가 이미 `TOU_RES_DEM` 블록에서 이 metricCode를 upsert하는 것과 대조해 확인). STAY/SPEND(`TAR_SVC_DEM`)·DIVERSITY(`TOU_DIV_IX`)는 원래 맞는 attribution이라 변경하지 않았다. `TOU_RES_DEM` DataSource는 이미 `DATA_SOURCE_SEED`에 존재하고 `upsertDataSources()`가 `seedMetrics()`보다 먼저 실행되므로 신규 DataSource 생성이나 순서 변경은 불필요했다. 정적 소스 검사 테스트 4개(`tests/unit/seedMetrics.test.ts`)로 이 attribution과 다른 3개 metricCode가 변경되지 않았음을 고정했다.
- **기존 가짜 DataSnapshot 잔존 여부(코드만으로 확인, DB 미접속)**: Phase 1-D 이전 `seed.ts` 실행으로 만들어졌을 수 있는 `resultCode="0000"`/`resultMsg="NORMAL SERVICE."`/`status=SUCCESS|EMPTY` 행은, 이번 커밋이 seed 코드만 고쳤을 뿐 DB의 기존 행을 지우는 로직이 전혀 없으므로 **배포된 DB에 이미 있었다면 그대로 남아있다.** 안전하게 자동 식별/삭제할 수 없다고 결론 — 이유와 절차는 아래 별도 섹션 참고.
- **영향 범위 재확인**: 이 잔존 행은 `projectQueries.ts`의 `getLatestDataFreshness()`(랜딩 페이지 "마지막 동기화" 표시)에만 영향을 준다. `NormalizedMetric.provenance`(Evidence·축 상태 판정의 실제 근거)는 Phase 1-C/1-D로 이미 정확해졌고 `DataSnapshot`을 참조하지 않으므로 **DNA 점수/축 상태/LIVE 5/5 판정에는 영향이 없다.**

## 기존 가짜 DataSnapshot 잔존 조사(자동 정리 보류)

- **구분할 수 없는 이유**: `TOU_RES_DEM`/`VISITOR_CNT`는 단일 API 호출 구조라, 실제 동기화가 저장하는 `rawPayload`(`res.raw`를 그대로 저장)와 과거 seed의 가짜 envelope가 **완전히 같은 최상위 모양**(`{response:{header:{resultCode,resultMsg},body:{items,...}}}`)이 될 수 있다 — 구조로 구분 불가. `resultMsg="NORMAL SERVICE."`도 data.go.kr류 공공API가 실제 성공 시 흔히 쓰는 표준 문구일 가능성이 있어(이 세션에서 실제 성공 응답의 정확한 resultMsg 문자열을 재확인하지 않음), 값 자체도 신뢰할 수 있는 구분 기준이 아니다. (참고로 `TAR_SVC_DEM`/`TOU_DIV_IX`는 실제 동기화가 `{stay,spend}`/`{tou,exp,intl}` 같은 래퍼 키로 저장하므로 그 래퍼 키가 없으면 가짜라고 비교적 안전하게 볼 수 있지만, 4개 소스 전부에 동일하게 적용 가능한 규칙은 아니라서 "확실히 구분 가능"으로 결론짓지 않았다.)
- **삭제 시 위험**: 만약 이 세션이 모르는 사이 실제 배포 환경에서 라이브 동기화가 한 번이라도 성공적으로 실행됐다면(Phase 1-B 코드 배포 이후), 그 진짜 성공 스냅샷까지 함께 지울 위험이 있다.
- **배포 전 사람이 직접 확인해야 할 조회 조건**:
  1. `SyncLog` 테이블이 비어있는지 확인 — 비어있다면 실제 라이브 동기화가 한 번도 실행된 적이 없다는 뜻이므로, 그 시점까지의 모든 `DataSnapshot`은 seed 기원일 수밖에 없다.
  2. `DataSnapshot`을 `dataSourceId`(TAR_SVC_DEM/TOU_DIV_IX/TOU_RES_DEM/VISITOR_CNT) + `regionId`(대전/제천/양양/경주/강릉/제주/통영) + `baseYm`(202508/202509/202605/202606)로 필터링.
  3. `TAR_SVC_DEM`/`TOU_DIV_IX` 행은 `rawPayload`에 `stay`/`spend` 또는 `tou`/`exp`/`intl` 최상위 키가 있는지 확인(없으면 가짜로 사실상 확정).
  4. `TOU_RES_DEM`/`VISITOR_CNT` 행은 `SyncLog.startedAt` 이전에 `fetchedAt`이 찍혀 있는지 사람이 직접 대조.
- **안전한 백업 및 수동 정리 절차(제안, 미실행)**: ① `pg_dump`로 `DataSnapshot` 테이블만 백업 → ② `SyncLog`가 비어있으면 위 필터 조건에 해당하는 `DataSnapshot` 행 전체를 안전하게 삭제 가능(실제 동기화가 없었으므로) → ③ `SyncLog`에 기록이 있다면, 그 최초 성공 로그 시각 이전 `fetchedAt`을 가진 행만 골라 사람이 한 번 더 확인 후 삭제.
- **정리하지 않았을 때 영향**: 랜딩 페이지의 "마지막 동기화" 표시가 실제로는 없었던 동기화 시각을 계속 보여줄 수 있다(사용자 오해 소지, 기존에도 있던 부정확함이 유지되는 수준). DNA 점수·축 상태·Evidence provenance·`LIVE 5/5` 판정에는 영향이 없다(전부 `NormalizedMetric`/`Evidence` 기반이며 이미 Phase 1-C/1-D로 정확함).

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
| 1. Provenance 모델 + 실제 snapshot 저장 | IN_PROGRESS(1-A/1-B/1-C/1-D DONE, 1-E만 남음) | **P0-1** |
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
