# TOUR DNA — 데이터 기반 지역 관광상품 기획 엔진

지역, 여행 시기, 타깃, 목표와 운영 조건을 입력하면 한국관광공사 공공데이터로 지역의 관광 DNA(5축)를
진단하고, 데이터 근거가 연결된 관광상품 전략 3안과 선택안의 코스·지역 업종 연계·운영 체크리스트·KPI를
자동 구성하는 B2B 웹 서비스입니다.

> 2026 관광데이터 활용 공모전(웹·앱 구현 부문, 지정과제 7번) 대응 MVP.

## 목차

- [빠른 시작](#빠른-시작)
- [환경변수](#환경변수)
- [데이터베이스 준비](#데이터베이스-준비)
- [스냅샷 모드 실행](#스냅샷-모드-실행-키-없이-전체-데모)
- [라이브 API 동기화](#라이브-api-동기화)
- [테스트와 빌드](#테스트와-빌드)
- [브랜치 구조](#브랜치-구조)
- [배포 전 사용자 수동 작업](#배포-전-사용자-수동-작업)
- [3분 시연 순서](#3분-시연-순서)
- [알려진 제한사항](#알려진-제한사항)
- [문서 목록](#문서-목록)

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 "환경변수" 참고)
npm run db:migrate           # prisma migrate deploy
npm run db:seed              # fixture 기반 대전/제천/양양 데이터 + 데모 프로젝트 생성
npm run dev
```

http://localhost:3000 접속 → "데모 프로젝트 열기"로 대전 9월 시나리오를 바로 확인할 수 있습니다.

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 채웁니다. `.env.local`은 절대 커밋하지 않습니다(.gitignore 처리됨).

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열(Neon 권장, 풀링 연결) |
| `DIRECT_URL` | 마이그레이션용 direct(non-pooled) 연결 문자열 |
| `TOUR_API_SERVICE_KEY` | 한국관광공사 공공데이터포털 서비스키. 비어 있으면 자동으로 스냅샷 모드로 동작 |
| `TOUR_DATA_BASE_YM` | 분석에 사용할 기준월(YYYYMM). 기본값 `202509` |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오맵 키. 비어 있으면 좌표/주소 목록 fallback 사용 |
| `NEXT_PUBLIC_APP_URL` | 배포 URL(로컬은 `http://localhost:3000`) |
| `DATA_MODE` | `live` \| `hybrid` \| `snapshot`. `snapshot`이면 라이브 호출을 완전히 생략 |
| `CRON_SECRET` | `/api/cron`, `/api/admin` 동기화 엔드포인트 인증용 비밀값(필수 설정, 비어있으면 모든 요청 401) |

## 데이터베이스 준비

PostgreSQL이 필요합니다. 로컬에 Postgres가 없다면 다음 중 하나를 선택하세요.

- **Neon(권장)**: neon.tech에서 무료 프로젝트를 만들고 `DATABASE_URL`/`DIRECT_URL`을 그대로 사용합니다. 이 프로젝트의 개발/시연 환경도 Neon을 사용했습니다.
- **Prisma 로컬 개발 DB**: `npx prisma dev`로 로컬에 임시 Postgres를 띄울 수 있습니다(단, `migrate dev`는 shadow DB 생성 제약으로 이 로컬 서버에서 실패할 수 있습니다 — 대신 `npx prisma db push`로 스키마만 반영하거나, 커밋된 migration을 `prisma migrate deploy`로 적용하세요).

마이그레이션 적용과 seed:

```bash
npm run db:migrate   # prisma migrate deploy — 커밋된 migration만 적용, shadow DB 불필요
npm run db:seed      # idempotent — 여러 번 실행해도 안전
```

## 스냅샷 모드 실행 (키 없이 전체 데모)

`TOUR_API_SERVICE_KEY`를 비워두거나 `DATA_MODE=snapshot`으로 두면, 실제 공공데이터 API를 전혀 호출하지
않고 `npm run db:seed`로 적재한 fixture 데이터만으로 프로젝트 생성 → DNA 진단 → 전략 비교 → 실행안 →
인쇄까지 전체 흐름을 시연할 수 있습니다. 이 저장소는 기본적으로 이 모드로 동작하도록 구성되어 있습니다.

## 라이브 API 동기화

```bash
npm run sync:tourism-data           # CLI (기본 baseYm = TOUR_DATA_BASE_YM)
npm run sync:tourism-data 202510    # 특정 기준월 지정
```

또는 배포 환경에서:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/cron/sync-tourism-data
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<도메인>/api/admin/sync-tourism-data
```

⚠️ 실제 서비스키로 처음 동기화하기 전에 반드시 [docs/public-api-status.md](docs/public-api-status.md)를
읽어주세요 — 스펙에서 후보로 제시된 필드명(`tarSvcDemIxVal` 등)과 지역코드 체계는 아직 실 API 응답으로
검증되지 않았습니다. 어댑터(`src/lib/public-data/adapters/*`)의 응답 스키마와 요청 파라미터를 실제
Swagger 문서로 재확인한 뒤 조정해야 합니다.

## 테스트와 빌드

```bash
npm run lint
npm run typecheck
npm test              # vitest — 도메인 로직 + 컴포넌트 단위테스트
npm run test:e2e      # playwright — 대표 시나리오 E2E (개발 서버 필요)
npm run build
```

## 브랜치 구조

이번 구현 작업은 지시받은 원본 지침서가 가정한 `claude-rebuild` 브랜치/원격 저장소가 실제로는 준비되어
있지 않아(빈 로컬 폴더, git 미초기화, 원격 저장소 미연결), 사용자 확인 하에 로컬 `master` 브랜치에서
직접 진행했습니다. 원격 저장소를 연결하려면:

```bash
git remote add origin <원격 저장소 URL>
git push -u origin master
```

## 배포 전 사용자 수동 작업

Claude Code가 코드/설정/마이그레이션/문서까지는 준비했지만, 아래는 실제 계정 접근이 필요해 사용자가
직접 수행해야 합니다. 자세한 순서는 [docs/deployment.md](docs/deployment.md)와
[docs/operator-checklist.md](docs/operator-checklist.md)를 참고하세요.

- Neon 프로젝트 생성 및 `DATABASE_URL`/`DIRECT_URL` 발급
- 한국관광공사 공공데이터포털 활용신청 및 `TOUR_API_SERVICE_KEY` 발급, Swagger로 실제 스키마 재검증
- 카카오 개발자 콘솔에서 애플리케이션 등록, `NEXT_PUBLIC_KAKAO_MAP_KEY` 발급, 허용 도메인 등록
- Vercel 프로젝트 연결, 환경변수 등록, 배포
- `tourdna.lib.lc` DNS CNAME을 Vercel로 연결
- Vercel Cron(또는 외부 스케줄러)에 `/api/cron/sync-tourism-data` 등록, `CRON_SECRET` 설정

## 3분 시연 순서

1. `/` 접속 → 가치 제안, 3단계 설명, 데이터 기준월/동기화 시각 확인
2. "데모 프로젝트 열기" → 대전 9월 시나리오 분석 대시보드 확인 (DNA 5축, 강점/기회/주의, 전략 3안)
3. 전략 카드의 "근거 보기" 클릭 → 원값/정규화값/출처/기준월/반영규칙 확인
4. 아무 전략이나 "이 전략 선택" → 실행안 페이지에서 코스/체크리스트/KPI 확인
5. 상품명 수정 후 "저장" → 새로고침으로 유지되는지 확인
6. "인쇄/PDF 보기" → 화면 조작 UI 없이 A4 1~2페이지 분량 인쇄 미리보기 확인
7. (선택) "새 관광상품 기획"으로 새 프로젝트를 만들어 다른 지역/시기 결과가 달라짐을 확인

## 알려진 제한사항

- 실제 `TOUR_API_SERVICE_KEY`가 없어 6개 공공데이터 API는 라이브 호출로 검증되지 않았다. 어댑터는
  spec이 제시한 필드명/코드값을 후보로 구현했으며, 정확한 스키마는 실 키 발급 후 재검증이 필요하다
  (docs/public-api-status.md).
- `Region.apiAreaCode`/`apiSigunguCode`는 아직 null이다 — 실 지역코드 체계 확인 전까지 라이브 동기화는
  해당 지역을 건너뛴다(fixture 기반 스냅샷 모드는 영향 없음).
- 카카오맵 키가 없어 실제 지도 렌더링은 검증되지 않았다(좌표/주소 fallback UI는 검증됨).
- 실행안 코스 순서 편집은 같은 날짜 안에서의 위/아래 이동만 지원한다(날짜 간 이동, 드래그 앤 드롭 미지원).
- "저장하지 않은 변경 이탈 경고"는 브라우저 새로고침/닫기(`beforeunload`)만 감지하며, 앱 내부 라우트
  이동(Link 클릭) 시에는 경고하지 않는다.
- 전략 재선택 시 실행안은 새 전략 기준으로 재생성되며, 이전에 사용자가 편집한 상품명/메모는 초기화된다.
- LLM 기반 문장 다듬기(P2)는 구현하지 않았다 — 모든 문구는 결정론적 템플릿으로 생성된다.
- 프로젝트 비교, 관리자 동기화 UI, 공유 링크(P2)는 구현하지 않았다.

## 문서 목록

- [docs/implementation-plan.md](docs/implementation-plan.md) — 구현 계획과 단계별 진행 로그
- [docs/architecture.md](docs/architecture.md) — 아키텍처 개요
- [docs/data-dictionary.md](docs/data-dictionary.md) — 데이터 모델/코드값 사전
- [docs/scoring-model.md](docs/scoring-model.md) — DNA/전략 점수 공식
- [docs/public-api-status.md](docs/public-api-status.md) — 공공데이터 API 연동 현황과 미확인 항목
- [docs/deployment.md](docs/deployment.md) — 배포 가이드
- [docs/operator-checklist.md](docs/operator-checklist.md) — 운영자 체크리스트
