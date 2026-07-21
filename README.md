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
- [다음 과제 (로드맵)](#다음-과제-로드맵)
- [문서 목록](#문서-목록)

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 "환경변수" 참고)
npm run db:migrate           # prisma migrate deploy
npm run db:seed              # fixture 기반 7개 지역 데이터 + 데모 프로젝트 생성
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
| `TOUR_DATA_BASE_YM` | 분석에 사용할 기준월(YYYYMM). 기본값 `202606`. API가 최신월을 알려주지 않으므로 수동 유지보수 필요(운영자 체크리스트 참고) |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오맵 JavaScript 키. 비어 있으면 좌표/주소 목록 fallback 사용 |
| `NEXT_PUBLIC_APP_URL` | 배포 URL(운영 `https://tour-dna.lib.lc`, 로컬 `http://localhost:3000`) |
| `DATA_MODE` | `live` \| `hybrid` \| `snapshot`. `snapshot`이면 라이브 호출을 완전히 생략 |
| `CRON_SECRET` | `/api/cron`, `/api/admin` 동기화 엔드포인트 인증용 비밀값(필수 설정, 비어있으면 모든 요청 401) |
| `SITE_ACCESS_PASSWORD` | 사이트 전체 접근 비밀번호(계정/로그인 없음, `src/proxy.ts`). 비어 있으면 게이트가 꺼진다 — 로컬 개발/E2E는 이 값을 설정하지 않는다. 운영 배포에서는 반드시 설정할 것 |

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
| 지역별 관광 다양성 | ✅ 전체 코드 체계 확인 + 변동계수 기반 종합 점수 재계산 로직 구현 완료 |
| 국문 관광정보 서비스 | ✅ 실제 데이터 확인, POI 라이브 동기화 파이프라인 연결 완료(큐레이션 데이터 보호) |
| 지역별 관광 수요 강도(체류·소비) | ✅ 실제 데이터 확인(체류 `tarSjrnDsIxCd=2103`, 소비 `tarExpDsIxCd=2201`) |
| 지역별 관광 자원 수요(관광서비스수요) | ✅ 실제 데이터 확인(`AreaTarResDemService/areaTarSvcDemList`, tarSvcDemIxCd=1101) |
| 지역별 관광 자원 수요(문화자원수요) | 파라미터명만 확인, 유효 코드값 미확인 |
| 지역별 방문자수 / 연관관광지 | 여전히 base URL·오퍼레이션명 미확인 |

다양성 지표는 이제 연령대별 방문객/소비 지수 6종씩 + 국적 다양성 지수를 조합해 종합 점수를 계산하고
정상 저장합니다(더 이상 저장을 보류하지 않습니다) — 산식은 [docs/scoring-model.md](docs/scoring-model.md)
참고.

### 새 지역 추가

지역(Region)은 `src/lib/fixtures/regions.ts`의 `REGION_SEED` 배열에 코드로 등록하고 `npm run db:seed`로
DB에 반영합니다(런타임 화면은 이 fixture가 아니라 DB에서 지역 목록을 읽으므로, 반영 후 재배포 없이 바로
드롭다운에 나타납니다). 후보 코드(통계청 행정표준코드 areaCd/signguCd, TourAPI 구코드)가 실제로 그
지역을 가리키는지는 아래로 먼저 확인하세요 — 사람이 curl로 확인하던 걸 자동화한 스크립트입니다:

```bash
# 예시: 이미 등록된 대전(유성구)로 실행하면 PASS가 나온다(스크립트 동작 확인용)
npm run verify:region -- --name 대전_유성구 --area-cd 30 --signgu-cd 30200 --tour-api-area-code 3
```

절차는 [docs/operator-checklist.md](docs/operator-checklist.md)의 "새 지역 추가 절차" 참고.

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

- 문화자원수요(`AreaTarResDemService/areaCulResDemList`)·방문자수·연관관광지 API는 base URL·오퍼레이션명
  또는 유효 코드값이 아직 미확인이다. 그 외(다양성·체류·소비·관광서비스수요·국문관광정보)는 실제 데이터로
  확인됐다(docs/public-api-status.md).
- `TOUR_DATA_BASE_YM`은 API가 자동으로 최신월을 알려주지 않아 수동으로 유지보수해야 한다 — 방치하면
  실제로는 더 최신 데이터가 있는데도 오래된 기준월을 계속 쓰게 된다(2026-07-21에 9개월 밀려 있던 것을
  발견해 202606으로 갱신함).
- `Region.apiSigunguCode`는 대전은 유성구(30200) 하나만 대표로 사용한다 — 다른 자치구 세분화는 P2.
  다만 `Region.name` 자체는 "대전광역시"라(제품명 등에 그대로 노출하기 위함), 시/군/구 드롭다운에서
  시/도와 완전히 같은 이름이 또 나와 오류처럼 보이는 문제가 있었다(2026-07-21). 드롭다운 라벨만
  "대전광역시 (DNA 지표는 유성구 기준)"으로 구분해 표시하도록 고쳤다(`regionQueries.ts`의
  `SIGUNGU_DISPLAY_LABEL_OVERRIDE`) — 실제 지역 데이터/제품명 등은 변경되지 않았다. **"유성구 기준"은
  DNA 5축 점수(통계청 지표)에만 해당**한다 — 한때 POI 후보도 유성구로만 좁혀뒀었는데, 그 결과 성심당
  본점(중구)처럼 대전 하면 바로 떠오르는 다른 구 명소가 실제 검색에도 코스에 못 들어가는 부작용이
  있어(2026-07-22 발견) POI 풀은 대전 전체로 되돌렸다(`syncService.ts`의
  `TOUR_INFO_ADDRESS_FILTER_OVERRIDE`).
- POI 라이브 동기화는 이름이 겹치는 경우 큐레이션된 fixture 데이터(`sourceType=FIXTURE`)는 절대
  덮어쓰지 않는다. 다만 더 이상 API에 나타나지 않는 장소(폐업 등)를 자동으로 삭제하는 로직은 없다 —
  한 번 반영된 라이브 POI는 계속 남아있는다.
- 카카오맵 JavaScript SDK 도메인 등록 여부에 따라 실제 지도 렌더링 결과가 달라진다(좌표/주소 fallback UI는 검증됨).
- 실행안 코스는 같은 날짜 안 위/아래 이동에 더해(2026-07-21) 다른 날짜로 이동, 삭제, 같은 지역 POI
  검색 후 추가, 시간 직접 수정까지 지원한다(드래그 앤 드롭은 미지원). 하루에 담을 수 있는 장소 수는
  제한이 없다 — 대신 각 장소의 시간·체류시간·예상 이동시간(haversine 추정치)을 비교해 물리적으로
  불가능한 일정(이동 시간이 실제 여유보다 긴 경우)이면 해당 장소에 빨간 경고를 표시한다. 검색은 등록된
  POI 중에서만 가능하고, 완전히 새로운 장소(DB에 없는 곳)를 직접 입력해 추가하는 기능은 없다 — 필요하면
  먼저 공공데이터 동기화나 fixture로 POI를 등록해야 한다. 실행안 화면에 코스를 카카오맵으로 시각화하는
  기능은 2026-07-22에 추가했다(`CourseMap.tsx`) — 일자별 탭으로 전환하며 방문 순서대로 마커+동선
  (Polyline)을 그린다(좌표 없는 항목은 건너뛴다). 다만 **지도에서 장소를 검색해 코스에 바로 추가하는
  기능은 아직 없다** — 지금 검색은 DB에 이미 등록된 POI 안에서만 가능하다(위 문단 참고).
- 체류시간(`stayMinutes`)도 2026-07-22부터 직접 수정 가능하다. 공공데이터 API에 장소별 권장 체류시간
  필드가 없어 초기값은 그대로 60분 고정이다.
- 실행안의 운영 체크리스트/위험과 대응안/KPI도 2026-07-22부터 자유롭게 추가·삭제할 수 있다(KPI 메모/
  메모 입력란은 그대로 유지). 인쇄 화면도 개수 제한 없이 전부 보여주도록 맞췄다.
- "저장하지 않은 변경 이탈 경고"는 브라우저 새로고침/닫기(`beforeunload`)만 감지하며, 앱 내부 라우트
  이동(Link 클릭) 시에는 경고하지 않는다.
- 전략 재선택 시 실행안은 새 전략 기준으로 재생성되며, 이전에 사용자가 편집한 상품명/메모는 초기화된다.
- DNA 5축 점수는 같은 행정단위 코호트 안에서 min-max 정규화한다(scoring-model.md). SIGUNGU 코호트가
  작을수록 최댓값/최솟값 지역이 정확히 100점/0점으로 나올 확률이 높아진다 — 2026-07-21에 강릉·경주·
  제주·통영 4개 지역을 추가해 코호트를 3개→7개로 늘려 이 현상을 완화했다(완전히 없어지지는 않는다 —
  7개 중 최댓값/최솟값은 여전히 100/0이 되는 게 정상이다). 지역을 더 늘리면 더 완화된다.
- LLM 기반 문장 다듬기(P2)는 구현하지 않았다 — 모든 문구는 결정론적 템플릿으로 생성된다.
- 프로젝트 비교, 관리자 동기화 UI, 공유 링크(P2)는 구현하지 않았다.
- 실행안 코스는 POI 좌표를 최근접 이웃(그리디) 순서로 재정렬해 하루 동선을 구성한다(2026-07-21,
  `src/lib/domain/geo.ts`). 이동 시간·거리는 haversine 직선거리와 이동 수단별 평균 속도 가정으로 계산한
  추정치이며, 실제 도로/대중교통 경로 API를 쓰지 않는다 — 최적해가 아닌 근사해임에 유의.

## 다음 과제 (로드맵)

우선순위 순. 앞부분일수록 임팩트가 크거나 지금 당장 필요하다고 판단한 것.

1. **동기화 실패 알림 부재** — `SyncLog`에 `PARTIAL`/`FAILED`가 쌓여도 아무에게도 알림이 안 간다. Slack/이메일
   웹훅 하나만 붙여도 baseYm 방치 같은 사고를 훨씬 빨리 발견할 수 있다.
2. **프로덕션 에러 트래킹 부재** — `console.error`만 있고 Sentry 등이 없어, 배포 후 예외는 Vercel 로그를
   직접 뒤져야만 보인다.
3. **실행 가능성 검사가 직선거리 기반** — `checkFeasibility`/`estimateTravel`은 haversine 직선거리 +
   교통수단별 평균속도 가정이라 실제 도로·대중교통 소요시간과 다를 수 있고, 영업시간(`operatingHours`)·
   휴무일(`closedDays`) 필드가 있는데도 검증에 안 쓰인다. 카카오 모빌리티 등 실제 경로 API 연동, 영업시간
   기반 경고 추가가 다음 단계.
4. **완전히 새로운(미등록) 장소를 실행안에 직접 추가하는 기능 없음** — 지금은 DB에 등록된 POI 검색만
   가능하다. 주소/좌표를 직접 입력해 만드는 플로우는 지오코딩 등이 필요해 범위가 있다.
5. **문화자원수요·방문자수·연관관광지 API 미확인** — base URL/오퍼레이션명 또는 유효 코드값을 여전히 못
   찾았다(Swagger UI 필요). `docs/public-api-status.md` 참고.
6. **관리자 대시보드 없음** — `SyncLog`/`DataSnapshot` 상태를 보려면 DB를 직접 조회해야 한다. 간단한
   `/admin` 페이지만 있어도 운영 편의성이 크게 오른다.
7. **동시 편집 시 낙관적 락 없음** — 지금은 단일 운영자 가정이라 급하지 않지만, 여러 사람이 같은 실행안을
   동시에 열어 저장하면 나중 저장이 이전 걸 덮어쓴다.
8. **대전 자치구 세분화(P2)** — 통계청 API가 자치구 단위로만 데이터를 줘서 유성구 하나로 대전 전체를
   대표한다. 다른 4개 구(동/중/서/대덕)로 나누려면 그만큼 API 호출·정규화 로직이 늘어난다.
9. **계정/소유권 분리는 보류 상태** — 지금은 공유 비밀번호 하나로 사이트 전체를 잠그는 정도다(`SITE_ACCESS_PASSWORD`).
   여러 조직이 서로 다른 프로젝트를 완전히 분리해서 써야 하는 상황이 오면, User 모델과 프로젝트별 소유권
   분리가 필요해진다 — 개발 범위가 꽤 커서 필요해질 때 다시 논의하는 게 낫다.
10. **E2E가 실행안 편집기의 세부 상호작용까지는 다루지 않음** — 코스 추가/삭제/날짜이동/시간수정/실행
    가능성 경고는 지금 단위테스트(jsdom)로만 검증되어 있다. 실제 브라우저(Playwright)로 이 상호작용까지
    타는 E2E가 추가되면 회귀를 더 일찍 잡을 수 있다.
11. **카카오맵 검색으로 코스에 장소 추가(P1)** — 동선 표시(위 완료)와 달리 이건 ① Kakao Places 검색
    연동 ② 검색된 곳이 DB에 없으면 새 POI로 저장하는 쓰기 경로 ③ `Poi.sourceType`에 새 값 추가(Prisma
    마이그레이션 필요)까지 묶여 있어 별도 작업으로 분리했다. 대략 2~3일.
12. **전국 지역 확대 — 일괄 사전 동기화 대신 온디맨드 캐싱으로 방향 정함(2026-07-22)** — 조회 시점에
    DB에 해당 지역 데이터가 없으면 그때 공공데이터 API를 호출해 저장하고, 이후 같은 지역·같은 기준월
    조회는 DB에서 바로 서빙하는 방식(현재 `DataSnapshot`/`NormalizedMetric`이 이미 지역+기준월+지표
    키로 upsert되는 구조라 이 캐시 자체는 이미 있다 — 지금은 그걸 채우는 트리거가 cron/수동뿐이라는
    점만 다르다). 이 방식이면:
    - 전국 229개 시/군/구의 **행정표준코드 매핑표는 여전히 사전에 확보해야** 한다(실제 조회 자체는
      코드가 있어야 가능하므로) — 다만 코드만 미리 넣어두고 지표/POI 데이터는 안 채워도 되니 준비
      작업량은 크게 줄어든다.
    - data.go.kr 할당량은 "상세기능(오퍼레이션)당 일 1,000건" 기준으로 재계산하면, 지역당 호출이 가장
      많은 다양성 API(`areaTouDivList`/`areaExpDivList`, 지역당 6건씩)만 229개 지역 전체를 하루에 다
      돌리면 1,380건으로 초과한다 — 온디맨드라면 애초에 한 지역씩 스며들듯 호출되니 사실상 문제가 안
      되고, 그래도 전체 일괄 재동기화를 하고 싶다면 이틀에 나눠 돌리면 그만이다.
    - 남은 진짜 리스크는 **첫 조회 지연**이다: 지역 하나를 처음 채울 때 지표 API 4종 + POI 페이지네이션
      호출이 필요한데, 지금 `runTourismDataSync`는 이 4종을 순차로(await 하나씩) 호출한다 — 온디맨드로
      쓰려면 `Promise.all`로 병렬화해서 지연을 줄이고, 그래도 오래 걸리면 로딩 문구를 보여주거나 Vercel
      요금제의 함수 실행시간 제한(Hobby 10초 등)을 검토해야 한다.
13. **DNA 코호트 재설계(전국 확대 시 필요)** — 시/군/구를 229개로 늘리면 지금처럼 전국 단일 코호트로
    min-max 정규화하면 "양양군과 부산"처럼 성격이 다른 지역이 직접 비교된다. 후보:
    - (a) 같은 시/도 안에서만 비교 — 지리적으로는 맞지만 시/도별 시/군/구 수가 들쭉날쭉해(세종·제주 등)
      작은 코호트 문제가 다시 생길 수 있음
    - (b) 시/군/구 행정 유형(시/군/구 — 이름 끝 글자로 이미 구분됨, 추가 데이터 불필요)별 비교 — "군"은
      "군"끼리, "시"는 "시"끼리
    - (c) 전국 고정 코호트를 유지하되 min-max 대신 percentile rank 사용 — N이 커지면(229) 통계적으로
      더 안정적이고, "전국 대비 상위 X%"로 표현하면 이질적 비교라는 위화감도 줄어듦
    - 추천안: (a)를 기본으로 하되 코호트가 너무 작으면(예: 5개 미만) (b)로 넓히는 하이브리드. 다만 이건
      순수 개발 작업이 아니라 상품 설계 결정이라 실제 착수 전에 다시 확인 필요.

## 문서 목록

- [docs/implementation-plan.md](docs/implementation-plan.md) — 구현 계획과 단계별 진행 로그
- [docs/architecture.md](docs/architecture.md) — 아키텍처 개요
- [docs/data-dictionary.md](docs/data-dictionary.md) — 데이터 모델/코드값 사전
- [docs/scoring-model.md](docs/scoring-model.md) — DNA/전략 점수 공식
- [docs/public-api-status.md](docs/public-api-status.md) — 공공데이터 API 연동 현황(2026-07-21 실키 검증 결과 포함)
- [docs/deployment.md](docs/deployment.md) — 배포 가이드
- [docs/operator-checklist.md](docs/operator-checklist.md) — 운영자 체크리스트
- [docs/test-scenarios.md](docs/test-scenarios.md) — 수동 테스트 시나리오(직접 눌러보며 확인하는 체크리스트)
