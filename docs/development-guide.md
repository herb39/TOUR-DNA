# 개발·기술·운영 가이드

이 문서는 TOUR-DNA를 로컬에서 실행하고, 데이터 파이프라인과 테스트·배포 구조를 이해하기 위한 개발자용 안내입니다.
서비스 소개와 사용자 사용법은 [README.md](../README.md), 구현 완료·부분 완료·미구현의 현재 판단은
[implementation-status.md](implementation-status.md)를 기준으로 합니다.

## 1. 기술 스택

- `Next.js 16` App Router, Server Component, Client Component, Server Actions
- `React 19`, `TypeScript`, `Tailwind CSS`
- `Prisma 7`과 `PostgreSQL`
- 로컬 PostgreSQL 데이터베이스 `tour_dna_local`
- `Vitest` 단위·컴포넌트 테스트, `Playwright` 브라우저 시나리오 테스트
- `Vercel` 웹 배포, `Neon PostgreSQL` 운영 DB
- Kakao Map·Mobility와 한국관광공사 공공데이터 API

Node.js는 `20.x`, 패키지 관리자는 `npm@10.9.2` 기준입니다. 이 프로젝트의 Next.js 버전은 일반적인 예전
Next.js 사용법과 다른 규약이 있을 수 있으므로, 코드 변경 전 설치된 `node_modules/next/dist/docs/`의 관련
가이드를 먼저 확인합니다.

## 2. 디렉터리 구조

```text
src/app/                       화면, Server Action, Route Handler
src/components/                화면 컴포넌트
src/lib/domain/                DB·Next.js를 모르는 순수 계산 로직
src/lib/services/              DB 조회·조립과 트랜잭션 경계
src/lib/public-data/           공공 API 어댑터와 응답 정규화
src/lib/fixtures/               로컬 데모·fixture 데이터
prisma/schema.prisma           Prisma 모델
prisma/migrations/             커밋된 DB migration
scripts/                       로컬 데이터 동기화·감사·dataset 명령
tests/unit/                    Vitest 테스트
e2e/                           Playwright 테스트
docs/                          기술·운영·구현 문서
```

점수·순위·코스 계산은 `src/lib/domain/`에 한 곳만 둡니다. 화면과 스크립트가 별도의 계산식을 만들지 않고
동일한 domain/service 함수를 호출해야 분석·실행안·인쇄 화면의 결과가 어긋나지 않습니다.

## 3. 로컬 실행

### 준비

1. Node.js `20.x`와 로컬 PostgreSQL을 준비합니다.
2. 데이터베이스 `tour_dna_local`을 만들고 로컬 연결 문자열을 준비합니다.
3. `.env.example`을 `.env.local`로 복사합니다.
4. `DATABASE_URL`은 로컬 PostgreSQL을 가리키도록 설정합니다.
5. 지도·공공데이터·홍보자료 생성이 필요한 경우 해당 키를 입력합니다.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

브라우저에서 `http://localhost:3000`을 열어 데모 프로젝트 또는 새 관광상품 기획을 확인합니다.

`.env.local`과 API 키·DB 연결 문자열은 커밋하지 않습니다. 로컬 개발·테스트·동기화·seed의 DB 대상은 항상
`tour_dna_local`이어야 합니다.

### 환경변수

| 변수 | 용도 |
|---|---|
| `DATABASE_URL` | Prisma와 애플리케이션이 연결할 PostgreSQL 주소 |
| `TOUR_API_SERVICE_KEY` | 한국관광공사 공공데이터 서비스키. 없으면 snapshot·fixture 경로 사용 |
| `TOUR_DATA_BASE_YM` | 동기화 시 사용할 기준월 보조 설정. 분석은 검증된 `ACTIVE Dataset`을 기준으로 함 |
| `OPENROUTER_API_KEY` | 선택적 홍보 문구 생성 API 키. 없으면 결정론적 rule 생성기를 사용 |
| `OPENROUTER_PROMO_MODEL` | 선택적 홍보 문구 모델 지정 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao Map JavaScript SDK 키 |
| `NEXT_PUBLIC_APP_URL` | 애플리케이션 기준 URL |
| `DATA_MODE` | `live`, `hybrid`, `snapshot` 데이터 모드 |
| `CRON_SECRET` | cron·admin 동기화 Route Handler 인증 |
| `SITE_ACCESS_PASSWORD` | 선택적 사이트 접근 게이트 비밀번호 |

운영 환경변수는 Vercel에서 관리합니다. 실제 값은 문서·소스·로그에 기록하지 않습니다.

## 4. 실제 `package.json` 명령어

아래 목록은 현재 `package.json`에 존재하는 명령만 정리한 것입니다.

### 개발·검증

| 명령 | 용도 |
|---|---|
| `npm run dev` | 로컬 개발 서버 |
| `npm run build` | Next.js production build |
| `npm run start` | build 결과 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm test` | Vitest 전체 실행 |
| `npm run test:watch` | Vitest watch 모드 |
| `npm run test:e2e` | Playwright E2E 실행 |

### Prisma·로컬 DB

| 명령 | 용도 |
|---|---|
| `npm run db:generate` | Prisma Client 생성 |
| `npm run db:migrate` | 커밋된 migration 적용 |
| `npm run db:migrate:dev` | 로컬 개발 migration 생성·적용 |
| `npm run db:seed` | fixture 기반 로컬 seed |
| `npm run db:seed-poi-curation` | 선택적 POI 보조 데이터 seed. 사용자 운영 화면이 아님 |

### 데이터 수집·감사

| 명령 | 용도 |
|---|---|
| `npm run db:sync-data-sources` | DataSource 기준정보 동기화 |
| `npm run sync:tourism-data` | 관광 데이터 수집·재개형 동기화 |
| `npm run sync:visitor` | 방문자 수 데이터 동기화 |
| `npm run check:base-ym` | 최신 공통 기준월 확인 |
| `npm run verify:region` | 지역 코드 검증 |
| `npm run verify:visitor-api` | 방문자 API 검증 |
| `npm run audit:region-codes` | 지역 코드 감사 |
| `npm run audit:tourism-data` | 관광 데이터 품질 감사 |
| `npm run enrich:tour-info-detail` | TOUR_INFO 상세 운영정보 보강 |

### Dataset 관리

| 명령 | 용도 |
|---|---|
| `npm run dataset:discover` | ACTIVE보다 최신인 후보 기준월 탐색 |
| `npm run dataset:status` | STAGING·ACTIVE 진행 상태 조회 |
| `npm run dataset:drift` | ACTIVE와 후보 dataset의 drift 사전 확인 |
| `npm run dataset:activate` | completeness·audit·drift gate를 통과한 dataset 승격 |

데이터 수집·dataset 명령은 API 호출량과 DB 쓰기를 발생시킵니다. 필요한 지역·기준월·범위만 명시하고, 운영 DB에서
실행하지 않습니다.

## 5. 데이터 파이프라인

공공데이터는 어댑터에서 원본 응답을 검증·정규화한 뒤 지역별로 저장됩니다.

```text
한국관광공사 API
  → public-data adapter
  → DataSnapshot / Poi
  → NormalizedMetric
  → 검증된 Dataset
  → TOUR-DNA 분석·전략·코스
```

주요 source는 다음과 같습니다.

- `TAR_SVC_DEM`: 체류·소비 관광 수요
- `TOU_RES_DEM`: 관광 서비스·자원 수요
- `TOU_DIV_IX`: 관광 다양성
- `VISITOR_CNT`: 방문자 수와 전월 대비 흐름
- `TOUR_INFO`: 관광지·음식·숙박·체험 POI
- `TOUR_INFO_DETAIL`: 운영시간·휴무일 등 상세 보강
- `searchFestival2`: 지역·월 행사 기간이 있는 축제 후보

`DataSnapshot.status`는 `SUCCESS`, `EMPTY`, `ERROR`로 구분합니다. 정상 응답이지만 해당 지역 데이터가 없는
경우는 `EMPTY`이며, 오류와 동일하게 취급하지 않습니다. 원본 사실과 계산된 지표를 분리하고, 분석 결과의
`Evidence`에 출처·기준월·provenance를 남깁니다.

### Dataset 상태

- `STAGING`: 수집 중이거나 검증 전인 후보 dataset
- `ACTIVE`: completeness·품질 감사·DNA drift gate를 통과해 분석에 사용할 수 있는 dataset
- `ARCHIVED`: 과거 ACTIVE dataset

새 기준월을 발견했다고 즉시 분석에 사용하지 않습니다. STAGING 수집을 끝낸 뒤 `dataset:status`와 감사·drift
결과를 확인하고 사람이 명시적으로 승격합니다. 분석 서비스는 `ACTIVE`가 없으면 임의로 최신 부분 데이터를 대신
사용하지 않습니다.

`TOUR_INFO`는 기준월에 종속되지 않는 정적 데이터이므로 최근 성공·빈 응답이 TTL 안이면 재사용할 수 있습니다.
이 재사용도 품질 게이트에서 제외되는 것은 아닙니다.

## 6. Prisma·DB 운영 원칙

### 로컬과 Production 분리

- 개발·테스트·seed·동기화·dataset 승격은 로컬 `tour_dna_local`에서만 수행합니다.
- Production Neon에 개발용 write, 대량 sync, seed, 재분석, dataset 승격을 하지 않습니다.
- Production migration은 코드 배포와 별개이며, 사용자의 명시적 승인과 사전 점검 뒤 최소 범위로 적용합니다.
- `main` push는 Vercel Production 자동 배포를 일으킬 수 있으므로, push 전 로컬 검증을 끝냅니다.

특히 `DATABASE_URL`이 `localhost`가 아닌 상태에서 동기화·seed·migration을 실행하지 않습니다. 대상 DB를 먼저
확인할 수 없으면 작업을 중단하고 연결 설정부터 검토합니다.

### Migration 절차

1. Prisma schema와 영향 범위를 확인합니다.
2. 로컬 DB에서 `npm run db:migrate:dev` 또는 필요한 migration을 적용합니다.
3. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`를 실행합니다.
4. 기능이 사용하는 기존 데이터·레거시 데이터·migration 미적용 fallback을 확인합니다.
5. Production 적용이 필요한 경우 대상과 변경 내용을 별도로 승인받습니다.
6. 승인 뒤 `npm run db:migrate`로 커밋된 migration만 적용하고, 서비스 smoke test를 실행합니다.

`ProjectAnchor`처럼 배포 DB에 migration이 아직 없는 기능은 전체 화면을 500으로 만들지 않고, 가능한 읽기·확인
범위와 저장 불가 상태를 구분해 안내해야 합니다.

## 7. 테스트와 대표 QA

### 자동 테스트

- `npm test`: `tests/unit/**/*.test.ts`, `tests/unit/**/*.test.tsx`의 domain·service·component 테스트
- `npm run test:e2e`: `e2e/`의 실제 브라우저 시나리오
- `npm run typecheck`: 타입 계약과 Server Action 경계 확인
- `npm run lint`: Next.js·TypeScript 코드 규칙 확인
- `npm run build`: production build와 Next.js export 규칙 확인

### 대표 사용자 시나리오

1. 홈에서 새 프로젝트를 만들고 지역·여행월·역할·목표·테마·여행 조건을 입력합니다.
2. 분석 화면에서 DNA 상대지수, 근거, 기준월, 전략 3안을 확인합니다.
3. 축제 후보가 있을 때 공식 기간을 확인하고 Anchor 날짜·일차·시간을 확정합니다.
4. 전략을 선택해 실행안을 만들고 후보 풀에서 장소를 추가합니다.
5. Drag & Drop, 날짜 이동, 시간·체류시간 수정 후 지도 동선을 확인합니다.
6. 코스 품질검증에서 중복·장거리 이동·식사·숙박·운영정보와 확인 필요 항목을 확인합니다.
7. 저장 후 새로고침·재접속하고, 인쇄/PDF 화면에 저장 내용이 반영되는지 확인합니다.
8. 조건 수정 시 기존 실행안 삭제 안내와 재분석 동의가 제대로 작동하는지 확인합니다.

상세 절차와 기대 결과는 [test-scenarios.md](test-scenarios.md)를 따릅니다.

## 8. 배포

- `main` 브랜치: Vercel Production 자동 배포
- 다른 브랜치: Vercel Preview 배포
- 운영 URL: `https://tour-dna.lib.lc`
- 운영 DB: Neon PostgreSQL

코드 배포와 DB migration은 분리되어 있습니다. `main`에 코드가 배포됐다고 Production schema가 자동으로 바뀌는
것은 아닙니다. migration이 필요한 기능은 배포 전후로 적용 여부를 확인하고, 적용 전에는 코드가 미적용 schema를
안전하게 처리하는지 검증합니다.

운영 배포 확인 순서는 다음과 같습니다.

1. 로컬 `typecheck`·`lint`·unit·build를 통과시킵니다.
2. 변경 범위와 migration 필요 여부를 확인합니다.
3. Production DB를 변경하지 않는 코드라면 push 후 Preview·Production smoke test를 진행합니다.
4. migration이 필요하면 별도 승인 후 적용하고, 화면에서 저장·조회·재접속을 확인합니다.
5. 운영 로그에 Prisma 오류·4xx·5xx가 없는지 확인합니다.

Vercel Function과 Neon DB의 리전이 다르면 DB 왕복 지연이 커질 수 있습니다. 현재 운영 구성은 한국 사용자 기준
Singapore 리전 정렬을 전제로 하며, 인프라를 변경할 때 리전 일치 여부를 먼저 확인합니다.

## 9. Git 운영

- 작업 전 `git status`, 현재 브랜치, `HEAD`, upstream을 확인합니다.
- 보호 대상 파일이나 사용자 변경을 임의로 삭제·reset·stage하지 않습니다.
- 하나의 작업 단위가 끝나면 관련 파일만 확인해 커밋합니다.
- 커밋 전 자동 검증을 실행하고, 커밋 메시지는 변경 목적을 짧게 드러냅니다.
- `main`에 push하면 Production 자동 배포가 될 수 있으므로 문서·코드·migration 범위를 확인합니다.
- destructive command는 명시적 요청 없이 사용하지 않습니다.

문서 변경도 현재 상태를 실제 코드·schema·script와 대조한 뒤 커밋합니다. 과거 구현 로그는 README에 복사하지
않고 [implementation-status.md](implementation-status.md)에 날짜와 검증 범위를 남깁니다.

## 10. 관련 문서

- [서비스 소개와 사용자 매뉴얼](../README.md)
- [현재 구현 현황](implementation-status.md)
- [구현 계획·제품 로드맵](implementation-plan.md)
- [아키텍처](architecture.md)
- [점수 산정 모델](scoring-model.md)
- [데이터 사전](data-dictionary.md)
- [배포 세부 가이드](deployment.md)
- [API 상태 기록](public-api-status.md)
- [수동 테스트 시나리오](test-scenarios.md)
