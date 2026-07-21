# 아키텍처 개요

## 계층 구조

```
UI (App Router pages, Server/Client Components)
   ↓ Server Actions / Route Handlers
Service 계층 (src/lib/services/*)         — DB 조회·조립, 트랜잭션 경계
   ↓
Domain 계층 (src/lib/domain/*)            — 순수 함수. DNA/전략 계산, 코스 생성, 해시.
   ↓                                         DB/Next.js/외부 API를 전혀 알지 못한다.
Data 계층
   ├─ Prisma (schema.prisma, generated client) — 정규화 모델
   ├─ Public-data adapters (src/lib/public-data/*) — 원본 API 어댑터
   └─ Fixtures (src/lib/fixtures/*)         — 대전/제천/양양 시연용 정적 데이터
```

핵심 원칙: **점수/순위/코스를 계산하는 코드는 도메인 계층에 단 한 곳만 존재한다.** UI, 시드 스크립트,
API 라우트, CLI는 모두 같은 도메인 함수와 서비스 함수를 호출한다(예: `ensureSelectedPlan`은 seed.ts와
`/projects/[id]/plan` 페이지가 동일하게 사용).

## 요청 흐름

### 0) 접근 제어 (2026-07-21)

```
모든 요청 → src/proxy.ts (Next.js 16의 middleware 후속 파일 규약)
  → SITE_ACCESS_PASSWORD 미설정 → 그대로 통과(로컬 개발/E2E)
  → 유효한 서명 쿠키(tour_dna_site_access) 있음 → 통과
  → 없거나 만료 → /login으로 리다이렉트(?next=원래 경로)
/api/*, /login, 정적 자산은 matcher에서 제외 — CRON/ADMIN sync 라우트는 각자의 CRON_SECRET
Bearer 인증을 그대로 쓴다(쿠키 게이트와 무관).
```

계정/로그인/프로젝트별 소유권 분리는 없다 — 비밀번호 하나로 사이트 전체를 외부에서 못 보게만 막는
최소 구현이다(`src/lib/services/siteAuth.ts`). 헤더의 "잠금" 버튼(`logoutAction`)으로 쿠키를 지울 수 있다.

### 1) 프로젝트 생성 → 분석

```
/projects/new (폼) → Server Action(createProjectAction)
  → projectInputSchema.safeParse (서버 재검증)
  → prisma.project.create (+ProjectInput)
  → runAnalysisForProject(projectId)
      → buildDnaEngineInput(regionCode, baseYm)   [DB에서 NormalizedMetric/Poi 조회]
      → computeDna(input)                          [순수 함수]
      → computeDataVersion(input)                  [순수 함수, 해시]
      → fetchPoisByCategory(regionCode)
      → computeStrategies(dna, projectInput, pois, modelVersion)  [순수 함수]
      → computeAnalysisKey({input, dataVersion, modelVersion})    [순수 함수, 해시]
      → prisma로 AnalysisResult/StrategyResult/Evidence 저장(재실행 시 delete+recreate)
  → redirect(/projects/[id]/analysis)
```

### 2) 전략 선택 → 실행안

```
/projects/[id]/analysis → selectStrategyAction(projectId, strategyResultId)
  → project.selectedStrategyResultId 갱신 → redirect(/plan)

/projects/[id]/plan → ensureSelectedPlan(projectId)
  → 이미 선택된 전략과 일치하는 SelectedPlan이 있으면 그대로 사용(사용자 편집 보존)
  → 없거나 전략이 바뀌었으면 buildDraftCourse/buildOperationChecklist/buildKpis/buildRisks로 재생성
  → 사용자가 상품명/콘셉트/메모/코스 순서/KPI 메모를 편집 → savePlanAction으로 저장
```

### 3) 공공데이터 동기화

```
CRON route / ADMIN route / CLI (scripts/sync-tourism-data.ts)
  → 모두 runTourismDataSync({baseYm, triggeredBy}) 하나만 호출
  → DATA_MODE=snapshot 또는 서비스키 없음 → 라이브 호출 생략, 기존 데이터 유지, SyncLog만 기록
  → 그 외 → 지역별로 4개 지표 API 호출 → 성공한 지표만 NormalizedMetric upsert
            (실패한 지표는 기존 값을 그대로 둔다 — 부분 실패가 전체 롤백을 일으키지 않는다)
  → SyncLog에 API별 성공/실패/건수 기록
```

## 디렉터리 구조

```
prisma/
  schema.prisma        모든 모델(Region~SelectedPlan)
  migrations/           커밋된 migration (prisma migrate deploy로 적용)
  seed.ts                idempotent seed — fixtures + 데모 프로젝트

src/lib/domain/          순수 함수, DB/Next 의존 없음, 유닛테스트 대상
  types.ts               DNA 관련 공유 타입/METRIC_CODES
  normalize.ts           min-max 정규화, 반올림 규칙
  dna.ts                 computeDna — 5축 계산
  strategyTemplates.ts   7개 전략 템플릿 정의
  strategy.ts            computeStrategies — 점수식/정렬/근거 수집
  planBuilder.ts         코스/체크리스트/KPI/위험 결정론적 생성
  analysisKey.ts         analysisKey 해시
  dataVersion.ts         dataVersion 해시
  constants.ts           MODEL_VERSION

src/lib/services/        DB 조회·조립 (Prisma 사용)
  db.ts                  PrismaClient 싱글턴(driver adapter 사용, Prisma 7)
  buildDnaEngineInput.ts  DB → DnaEngineInput 변환
  fetchPoisByCategory.ts
  poiDetails.ts
  analyzeProject.ts       runAnalysisForProject — 분석 실행+저장
  planService.ts          ensureSelectedPlan
  projectQueries.ts       목록/상세 조회 (읽기 전용 페이지용)
  regionQueries.ts        시도/시군구 드롭다운 옵션
  syncService.ts          runTourismDataSync
  cronAuth.ts             CRON_SECRET 검증
  baseYm.ts               기준월 계산 유틸
  siteAuth.ts             SITE_ACCESS_PASSWORD 서명 쿠키 생성/검증(계정 없는 사이트 전체 게이트)

src/lib/public-data/      공공데이터 API 어댑터
  types.ts                공통 응답 envelope 파싱(빈 문자열/객체/배열 모두 처리)
  client.ts               timeout/retry fetch 래퍼(키/URL 로그 미노출)
  adapters/*.ts           API 6종 (docs/public-api-status.md에 검증 상태 기록)

src/lib/fixtures/         대전/제천/양양 시연 데이터
  regions.ts, dataSources.ts, metrics.ts, pois.ts

src/lib/validation/       Zod 스키마 + 코드값-라벨 매핑
  codes.ts, project-input.schema.ts

src/proxy.ts              사이트 전체 접근 게이트(middleware 후속 규약, 2026-07-21)
src/app/                  App Router 페이지 + Server Actions + Route Handlers
  login/                  비밀번호 입력 페이지 + loginAction/logoutAction
src/components/           재사용 UI 컴포넌트(차트/전략카드/근거테이블/지도/폼/실행안 편집기)

tests/unit/                Vitest 단위테스트 (도메인 로직 + 컴포넌트)
e2e/                       Playwright E2E
scripts/                   CLI (sync-tourism-data.ts)
```

## 데이터 모드와 상태 표시

- `DataSnapshot`: API 원본 응답 그대로 보관(정규화 이전 레이어). `status`는 `SUCCESS`/`EMPTY`/`ERROR`.
- `NormalizedMetric`: 정규화 계층의 단일 출처. `rawValue`만 저장하고, 정규화(min-max)는 분석 요청 시점의
  코호트를 기준으로 매번 계산한다(코호트가 늘어나면 값도 갱신될 수 있음 — 결정론은 `dataVersion` 해시로 보장).
- `AnalysisResult`의 축별 `xxxStatus`(`LIVE`/`SNAPSHOT`/`MISSING`)와 `overallDataMode`/`liveAxisCount`가
  UI의 `LIVE 5/5` 배지로 이어진다. **모든 축이 이번 동기화의 라이브 데이터로 계산됐을 때만 `LIVE 5/5`.**
