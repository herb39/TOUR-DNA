# TOUR DNA — 데이터 기반 지역 관광상품 기획 엔진

지역, 여행 시기, 타깃, 목표와 운영 조건을 입력하면 한국관광공사 공공데이터로 지역의 관광 DNA(5축)를
진단하고, 데이터 근거가 연결된 관광상품 전략 3안과 선택안의 코스·지역 업종 연계·운영 체크리스트·KPI를
자동 구성하는 B2B 웹 서비스입니다.

> 2026 관광데이터 활용 공모전(웹·앱 구현 부문, 지정과제 7번) 대응 MVP.

**운영 배포**: https://tour-dna.lib.lc (Vercel + Neon PostgreSQL)
**저장소**: https://github.com/herb39/TOUR-DNA (`main` 브랜치)

## 목차

- [빠른 시작](#빠른-시작)
- [환경변수](#환경변수)
- [데이터베이스 준비](#데이터베이스-준비)
- [스냅샷 모드 실행](#스냅샷-모드-실행-키-없이-전체-데모)
- [라이브 API 동기화](#라이브-api-동기화)
- [테스트와 빌드](#테스트와-빌드)
- [배포 현황](#배포-현황)
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
(운영 배포는 https://tour-dna.lib.lc 에서 바로 확인 가능합니다.)

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 채웁니다. `.env.local`은 절대 커밋하지 않습니다(.gitignore 처리됨).

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열(Neon 권장, 풀링 연결) |
| `DIRECT_URL` | 마이그레이션용 direct(non-pooled) 연결 문자열 |
| `TOUR_API_SERVICE_KEY` | 한국관광공사 공공데이터포털 서비스키. 비어 있으면 자동으로 스냅샷 모드로 동작 |
| `TOUR_DATA_BASE_YM` | 분석에 사용할 기준월(YYYYMM). 기본값 `202509` |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오맵 JavaScript 키. 비어 있으면 좌표/주소 목록 fallback 사용 |
| `NEXT_PUBLIC_APP_URL` | 배포 URL(운영 `https://tour-dna.lib.lc`, 로컬 `http://localhost:3000`) |
| `DATA_MODE` | `live` \| `hybrid` \| `snapshot`. `snapshot`이면 라이브 호출을 완전히 생략 |
| `CRON_SECRET` | `/api/cron`, `/api/admin` 동기화 엔드포인트 인증용 비밀값(필수 설정, 비어있으면 모든 요청 401) |

카카오맵 키는 [카카오 개발자 콘솔](https://developers.kakao.com) → 내 애플리케이션 → 앱 선택 →
**"플랫폼 키 > JavaScript 키" 안의 "JavaScript SDK 도메인"**에 배포 도메인을 등록해야 실제로
동작합니다("제품 링크 관리 > 웹 도메인"은 카카오톡 공유 링크용으로 별개 설정입니다). ⚠️
`NEXT_PUBLIC_KAKAO_MAP_KEY`에는 반드시 이 화면에 표시된 **"JavaScript 키" 값 그대로**를 넣어야 한다 —
REST API 키 등 다른 키를 잘못 넣으면 지도가 로드되지 않고 좌표/주소 fallback으로만 표시된다
(2026-07-21 실제로 이 실수로 지도가 안 뜨던 사고가 있었다).

## 데이터베이스 준비

PostgreSQL이 필요합니다. 로컬에 Postgres가 없다면 다음 중 하나를 선택하세요.

- **Neon(권장, 실제 운영 환경)**: neon.tech에서 무료 프로젝트를 만들고 `DATABASE_URL`/`DIRECT_URL`을 그대로 사용합니다.
- **Prisma 로컬 개발 DB**: `npx prisma dev`로 로컬에 임시 Postgres를 띄울 수 있습니다(단, `migrate dev`는 shadow DB 생성 제약으로 이 로컬 서버에서 실패할 수 있습니다 — 대신 `npx prisma db push`로 스키마만 반영하거나, 커밋된 migration을 `prisma migrate deploy`로 적용하세요).

마이그레이션 적용과 seed:

```bash
npm run db:migrate   # prisma migrate deploy — 커밋된 migration만 적용, shadow DB 불필요
npm run db:seed      # idempotent — 여러 번 실행해도 안전
```

## 스냅샷 모드 실행 (키 없이 전체 데모)

`TOUR_API_SERVICE_KEY`를 비워두거나 `DATA_MODE=snapshot`으로 두면, 실제 공공데이터 API를 전혀 호출하지
않고 `npm run db:seed`로 적재한 fixture 데이터만으로 프로젝트 생성 → DNA 진단 → 전략 비교 → 실행안 →
인쇄까지 전체 흐름을 시연할 수 있습니다.

## 라이브 API 동기화

```bash
npm run sync:tourism-data           # CLI (기본 baseYm = TOUR_DATA_BASE_YM)
npm run sync:tourism-data 202510    # 특정 기준월 지정
```

또는 배포 환경에서:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tour-dna.lib.lc/api/cron/sync-tourism-data
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://tour-dna.lib.lc/api/admin/sync-tourism-data
```

운영 배포에는 `vercel.json`에 등록된 **Vercel Cron이 매월 1일(UTC 00:00 = KST 09:00) 자동으로** 위
CRON 엔드포인트를 호출합니다. Vercel은 `CRON_SECRET` 환경변수가 설정되어 있으면 요청에
`Authorization: Bearer $CRON_SECRET` 헤더를 자동으로 붙여주므로 별도 외부 스케줄러가 필요 없습니다.

**2026-07-21 실 서비스키로 검증한 현황** (자세한 내용은 [docs/public-api-status.md](docs/public-api-status.md)):

| API | 상태 |
|---|---|
| 지역별 관광 다양성 | ✅ 실제 데이터 확인(`/areaTouDivList`) |
| 국문 관광정보 서비스 | ✅ 실제 데이터 확인(`KorService2/areaBasedList2`), POI 파이프라인 연결은 미완 |
| 지역별 관광 수요 강도(체류·소비) | ✅ 실제 데이터 확인(체류 `tarSjrnDsIxCd=2103`, 소비 `tarExpDsIxCd=2201`) |
| 지역별 관광 수요 강도(수요 지수) | ✅ Swagger UI로 확인 — 별도 오퍼레이션 자체가 존재하지 않음(체류/소비 2개뿐) |
| 지역별 관광 자원 수요 / 방문자수 / 연관관광지 | 여전히 base URL·오퍼레이션명 미확인 |

⚠️ **다양성 지표 재계산 로직 미구현**: 확인된 단일 코드(`touDivIxCd=3103`, "30대 방문객수")는 종합
다양성 점수가 아니라서, 재계산 로직이 준비되기 전까지는 라이브 동기화가 이 값을 저장하지 않도록 막아뒀습니다
(SyncLog에는 `SKIPPED`로 계속 기록됨). 그래서 Cron/CLI를 돌려도 데모의 다양성 점수는 더 이상 바뀌지
않습니다 — 자세한 내용은 [docs/operator-checklist.md](docs/operator-checklist.md) 참고.

## 테스트와 빌드

```bash
npm run lint
npm run typecheck
npm test              # vitest — 도메인 로직 + 컴포넌트 단위테스트
npm run test:e2e      # playwright — 대표 시나리오 E2E (개발 서버 필요)
npm run build
```

## 배포 현황

- **Vercel 프로젝트**: `tour-dna`, GitHub `main` 브랜치 push 시 자동 배포
- **커스텀 도메인**: `tour-dna.lib.lc` (Cloudflare DNS, CNAME → Vercel, "DNS only" 모드)
- **DB**: Neon PostgreSQL, 마이그레이션은 배포 파이프라인에서 자동 실행되지 않으며 `npm run db:migrate`로 수동 적용
- **Cron**: `vercel.json`에 매월 1일 동기화 등록
- 자세한 신규 배포 순서는 [docs/deployment.md](docs/deployment.md) 참고

## 3분 시연 순서

1. https://tour-dna.lib.lc 접속 → 가치 제안, 3단계 설명, 데이터 기준월/동기화 시각 확인
2. "데모 프로젝트 열기" → 대전 9월 시나리오 분석 대시보드 확인 (DNA 5축, 강점/기회/주의, 전략 3안)
3. 전략 카드의 "근거 보기" 클릭 → 원값/정규화값/출처/기준월/반영규칙 확인
4. 아무 전략이나 "이 전략 선택" → 실행안 페이지에서 코스/체크리스트/KPI 확인
5. 상품명 수정 후 "저장" → 새로고침으로 유지되는지 확인
6. "인쇄/PDF 보기" → 화면 조작 UI 없이 A4 1~2페이지 분량 인쇄 미리보기 확인
7. (선택) "새 관광상품 기획"으로 새 프로젝트를 만들어 다른 지역/시기 결과가 달라짐을 확인

## 알려진 제한사항

- 지역별 관광 자원수요·방문자수·연관관광지 API는 base URL·오퍼레이션명이 아직 미확인이다. 다양성·체류·
  소비·국문관광정보는 실제 데이터로 확인됐고, 수요(Demand) 지수는 Swagger UI 확인 결과 별도 오퍼레이션
  자체가 존재하지 않는 것으로 결론 내렸다(docs/public-api-status.md).
- 다양성 지표의 실 동기화 결과는 종합 점수가 아닌 단일 세부 지표값이라, 재계산 로직 구현 전까지 Cron/CLI
  동기화 시 데모 점수가 바뀔 수 있다(위 "라이브 API 동기화" 절 참고).
- `Region.apiSigunguCode`는 대전은 유성구(30200) 하나만 대표로 사용한다 — 다른 자치구 세분화는 P2.
- 카카오맵 JavaScript SDK 도메인 등록 여부에 따라 실제 지도 렌더링 결과가 달라진다(좌표/주소 fallback UI는 검증됨).
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
- [docs/public-api-status.md](docs/public-api-status.md) — 공공데이터 API 연동 현황(2026-07-21 실키 검증 결과 포함)
- [docs/deployment.md](docs/deployment.md) — 배포 가이드
- [docs/operator-checklist.md](docs/operator-checklist.md) — 운영자 체크리스트
