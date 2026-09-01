# 배포 가이드 (Vercel + Neon)

목표 구성: 웹은 Vercel, DB는 Neon PostgreSQL, 지도 SDK는 카카오맵, 운영 도메인은 `tour-dna.lib.lc`.

이 문서는 Claude Code가 준비한 코드/설정을 기준으로, **실제 계정 접근이 필요한 단계는 사용자가 직접
수행**하도록 안내한다. Claude Code는 대신 수행하지 않았다.

## 현재 Production Promo LLM 기준 — 2026-09-01

- Promo rule generator: **READY**
- Promo LLM overlay: **OPTIONAL READY**
- Production 설정: `OPENROUTER_PROMO_MODEL=liquid/lfm-2.5-2.6b:free`
- QA 결과: `[PROD QA] 경주 자연·웰니스 체류형 상품`에서 Promo 재생성 1회, `AI_SUCCESS`, 7개 채널 저장,
  재진입 유지 확인
- `generatedBy = ai`는 `AI 생성`, `generatedBy = rule`은 `기본 생성`으로 표시한다. 무료 provider의 429·
  지연 가능성 때문에 핵심 시연은 저장된 AI 결과를 우선 사용하고 실시간 재생성에 의존하지 않는다.
- 공모전 전까지 모델 탐색·자동 순회·retry·timeout 조정·prompt 대규모 변경·Production 추가 재생성을
  동결한다. LLM context에 개인정보·민감정보를 넣지 않는다.

## 1. Neon 프로젝트 준비 (사용자 수행)

1. https://neon.tech 에서 프로젝트 생성
2. 콘솔에서 두 개의 연결 문자열을 복사한다
   - 풀링(pooled) 연결 → `DATABASE_URL`
   - non-pooled(direct) 연결(호스트에서 `-pooler` 제거) → `DIRECT_URL`
3. 로컬 `.env.local`과 Vercel 환경변수 양쪽에 동일하게 설정

## 2. 마이그레이션 적용

```bash
npm run db:migrate   # prisma migrate deploy — shadow DB 불필요, 커밋된 migration만 적용
npm run db:seed       # 최초 1회. 이후 재실행해도 idempotent
```

⚠️ `npm run build` 등 production 빌드 파이프라인에서 **seed를 자동 실행하지 않는다**(스펙 요구사항).
seed는 항상 별도 명령으로 수동/CI 스텝에서 실행한다.

## 3. 한국관광공사 공공데이터 서비스키 (사용자 수행)

1. data.go.kr에서 아래 6개 데이터셋에 활용신청
   - 지역별 관광 수요 강도(15151868), 지역별 관광 다양성(15151365), 지역별 관광 자원 수요(15152138),
     지역별 방문자수(15101972), 국문 관광정보 서비스(15101578), 기초지자체 중심 관광지 및 연관 관광지(미확인)
2. 발급된 `TOUR_API_SERVICE_KEY`를 환경변수에 설정
3. **중요**: 실 키 발급 후 Swagger UI로 각 API의 실제 파라미터명/응답 스키마를 확인하고
   `src/lib/public-data/adapters/*.ts`의 필드명·엔드포인트를 재검증한다(docs/public-api-status.md).
   `TOUR_API_SERVICE_KEY`가 비어 있으면 앱은 자동으로 스냅샷 모드로 동작하므로, 키 없이도 배포/시연은
   가능하다.

## 4. 카카오맵 (사용자 수행)

1. https://developers.kakao.com 에서 애플리케이션 생성
2. "플랫폼 > Web"에 배포 도메인(`https://tour-dna.lib.lc`, 로컬 테스트용 `http://localhost:3000`) 등록
3. JavaScript 키를 `NEXT_PUBLIC_KAKAO_MAP_KEY`에 설정 (없으면 좌표/주소 목록 fallback으로 자동 전환)

## 5. Vercel 배포 (사용자 수행 + Claude Code 준비 완료)

1. Vercel에서 이 저장소를 Import
2. 환경변수 등록: `DATABASE_URL`, `DIRECT_URL`, `TOUR_API_SERVICE_KEY`, `TOUR_DATA_BASE_YM`(동기화
   대상월 지정용 — 2026-08-11부터 실제 분석 baseYm에는 쓰이지 않는다, 아래 "검증된 데이터셋(ACTIVE
   Dataset)" 참고), `NEXT_PUBLIC_KAKAO_MAP_KEY`, `NEXT_PUBLIC_APP_URL`(운영 URL로), `DATA_MODE`,
   `CRON_SECRET`, `SITE_ACCESS_PASSWORD`(사이트 전체 접근 게이트 — 비워두면 로그인 없이 전체 공개
   상태가 되니 운영 배포에서는 반드시 강한 값으로 설정할 것), `OPENROUTER_API_KEY`(선택 — 홍보
   콘텐츠 LLM 생성용, 비어 있으면 rule 생성기만 동작), `OPENROUTER_PROMO_MODEL`(선택 — 코드 기본값은
   `google/gemma-4-26b-a4b-it:free`, 현재 Production override는 `liquid/lfm-2.5-2.6b:free`, `:free`로
   끝나지 않는 모델은 비용 보호를 위해 호출 전에 차단)
3. Build Command는 기본값(`next build`, `npm run build`) 그대로 사용 — seed를 build 훅에 넣지 않는다
4. 배포 후 `DNS` 탭에서 안내하는 값으로 `tour-dna.lib.lc`의 CNAME을 등록(사용자의 DNS 관리 콘솔에서)

## 6. Vercel Cron

저장소 루트의 `vercel.json`에 매월 1일 UTC 00:00(KST 09:00)에 동기화하도록 이미 등록해두었다:

```json
{
  "crons": [
    { "path": "/api/cron/sync-tourism-data", "schedule": "0 0 1 * *" }
  ]
}
```

Vercel Cron은 프로젝트에 `CRON_SECRET` 환경변수가 설정되어 있으면 요청에
`Authorization: Bearer $CRON_SECRET` 헤더를 **자동으로** 붙여서 호출한다(별도 외부 스케줄러 불필요).
단, Vercel 무료(Hobby) 플랜은 Cron Job 실행 시각이 정확히 맞지 않고 다소 지연될 수 있다.
스케줄을 바꾸려면 `vercel.json`의 `schedule` 값(표준 5필드 cron 문법, UTC 기준)을 수정 후 재배포한다.

> **현재 운영 정책**: `vercel.json`에 Cron 설정이 존재하더라도 Production Neon에서 전국 batch sync를
> 실행하지 않는다. 현재 Production의 원격 DB 대상은 `runTourismDataSync`의
> `DATA_SYNC_TARGET_GUARD`에 의해 기본 차단되며, `ALLOW_REMOTE_DATA_SYNC=true`가 없으면 API 호출과
> DB 조회를 시작하지 않고 실패 상태로 종료한다. 정기적인 전국 수집은 local PostgreSQL에서만 수행하고,
> 검증된 결과만 별도 승인된 promotion/import 절차로 Production에 반영한다.

## 7. 배포 후 확인

- `/` 접속 → 데모 프로젝트가 보이는지 확인(`SITE_ACCESS_PASSWORD`를 설정했다면 먼저 `/login`으로
  리다이렉트되는지, 비밀번호 입력 후 정상 진입하는지 확인)
- `curl -I https://<도메인>/api/cron/sync-tourism-data` → 인증 없이 401인지 확인(사이트 게이트와 무관하게
  항상 401이어야 한다)
- `npm run build`가 로컬에서 통과했는지, Vercel 빌드 로그에 오류가 없는지 확인

## 8. Phase 5(홍보자료) 배포 — 완료(2026-08-01)

> 아래는 배포 당시(2026-07-26) 작성한 원래 절차이며, 참고용으로 그대로 남긴다. **2026-08-01 기준
> 이 절차는 전부 완료됐다**: `20260726000000_add_selected_plan_promo_content`를 포함한 9개 migration
> 전부가 Production Neon DB에 적용되어 있고(`prisma migrate status`로 확인, pending 없음), Vercel
> Production(`tour-dna.lib.lc`)에도 관련 커밋이 반영되어 있다. 실제 브라우저(Playwright Chromium)로
> 홍보자료 생성 → 편집(역할별 채널) → 저장 → 새로고침 → 재생성(확인 다이얼로그 포함) → 전체 복사
> (클립보드) → 재접속까지 전부 검증했고, Vercel Runtime 로그로 4xx/5xx·Prisma 오류가 없음을 함께
> 확인했다. 상세 검증 내역은 [docs/implementation-status.md](implementation-status.md)의 "Production
> 실사용 검증 및 대표 시나리오 완성(2026-08-01)" 절 참고.

로컬 `main`에는 홍보자료 생성·편집·저장 기능(Phase 5-A~5-C + 보완, 커밋 `5b8d872`/`fc5e8f8`/`7460365`/
`a264db6`)이 구현·테스트되어 있었고(원본 작성 시점 아직 push/DB 적용 전), 이후 다음 절차로 배포했다
(additive migration이므로 순서만 지키면 안전):

1. 대상 Neon DB가 개발용인지 운영용인지 먼저 확인한다.
2. `npm run db:migrate`(`prisma migrate deploy`)로 `20260726000000_add_selected_plan_promo_content`를
   포함한 누적 migration을 적용한다 — 컬럼 추가(nullable JSONB)만 있고 기존 데이터를 변경하지 않는다.
3. migration 적용을 확인한 뒤에 해당 커밋이 반영된 배포가 나가도록 한다(반대 순서로 배포부터 하면,
   새 코드가 아직 없는 컬럼을 조회/저장하려다 런타임에 실패한다 — Phase 1 배포 점검과 동일한 위험 패턴).
4. 배포 후 실제 브라우저에서 홍보자료 생성 → 편집 → 저장 → 새로고침 → 재생성 → 복사 → 인쇄까지
   한 번은 수동으로 확인한다.

같은 원칙으로 이후 `20260731000000_add_strategy_differentiation_fields`(Phase 4-보완, 전략 3안
차별화 필드 5종)도 2026-08-01에 동일 절차로 적용·검증했다.

**참고(자동화 도구 사용 시 주의)**: 이 배포 검증 과정에서, 무인 브라우저 자동화 도구의 탭이
`document.hidden === true`(배경/비활성) 상태이면 React가 페이지를 hydration하지 못해 "홍보자료 생성"
버튼 등 `onClick` 기반 기능이 전혀 반응하지 않는 것처럼 보이는 현상을 발견했다 — 실제 앱 결함이
아니라 도구 쪽 문제였다(독립된 Playwright로 `document.hidden === false`인 상태에서 열자 정상 동작).
향후 자동화 검증 시 이 값을 먼저 확인할 것.

## 9. 검증된 데이터셋(ACTIVE Dataset) — Phase 2-A (2026-08-11)

> **과거 기록(2026-08-11 작성 당시)**: 이 절차는 local PostgreSQL(`tour_dna_local`)에서만 실행·검증했고,
> 당시 Production Neon DB에는 migration을 적용하지도, ACTIVE Dataset을 설정하지도 않았다. 이 기록은
> 당시 상태를 보존한 것이며, 현재 Production 상태는 아래 최신 요약을 우선한다.

현재 Production은 migration **17/17 적용 완료**, ACTIVE Dataset **`202606`** 상태다. 공식 최신 확인월은
`202607`이며 `202607`·`202608`은 아직 Production에 반영하지 않았다.

### 표준 데이터 workflow

`공식 API → local cache/raw snapshot → local PostgreSQL → Dataset STAGING → completeness/audit/drift
검증 → local promotion/검증 → 최종 검증 결과만 Production promotion/import` 순서로 운영한다.
Production에서 `공식 API → 전국 batch → 계산`을 수행하는 흐름은 사용하지 않는다.

`Dataset`(baseYm+status: STAGING/ACTIVE/ARCHIVED) 모델이 추가되면서(`20260811060333_add_dataset_registry`),
분석은 더 이상 `TOUR_DATA_BASE_YM`/`DEFAULT_BASE_YM` 같은 정적값이 아니라 이 테이블의 ACTIVE 행만
기준으로 삼는다. 새 Dataset을 Production에 반영하려면 local에서 완전성·drift 검증을 먼저 끝낸 뒤,
검증된 결과만 별도 promotion/import한다. 아래 절차는 Production에서 직접 실행하지 않는다.

1. schema 변경이 있을 때만 필요한 누적 migration을 확인·적용한다. 현재 Production은 **17/17 적용
   완료**이며, 월별 Dataset을 추가할 때마다 migration을 반복하지 않는다.
2. 해당 baseYm의 전국 데이터를 local에서 완성하고(`npm run audit:tourism-data -- --base-ym=YYYYMM`
   PASS), local `npm run dataset:activate -- --base-ym=YYYYMM`으로 ACTIVE 승격을 검증한다.
3. local `npm run dataset:status`로 정확히 1개의 ACTIVE와 후보 Dataset의 상태를 확인한다.
4. 최종 검증된 Dataset만 Production promotion/import 대상으로 확정하고, Production runtime에서 대표
   row와 Dataset 상태를 최소 범위로 확인한다.

> **2026-08-12 갱신 — Production 최초 ACTIVE 설정 시 알아야 할 것**: 아래 "Phase 2-C" 절 도입 이후
> `npm run dataset:activate`는 항상 **기존 ACTIVE와의 DNA drift 비교**를 거친다(`evaluateDatasetPromotion`이
> "ACTIVE 존재" 자체를 사전조건으로 요구). 즉 Production처럼 **ACTIVE가 한 번도 설정된 적 없는
> 상태에서는 이 명령이 비교 기준이 없다는 이유로 항상 BLOCKED된다** — 위 2번 절차는 로컬에서
> 202606을 최초로 ACTIVE로 설정했을 때(그 시점엔 아직 drift gate가 없었다)는 그대로 통했지만,
> Production 최초 도입 시점에는 그대로 통하지 않는다. Production 최초 ACTIVE 설정은 아직 정식
> 절차가 없다 — 별도 운영자 비상절차(예: `activateDataset()`을 drift gate 없이 직접 1회 호출하는
> 스크립트를 그때 가서 작성)로 처리해야 하며, 이 문서가 그 절차를 먼저 확정하기 전까지는 시도하지
> 않는다.

**Phase 2-B(source별 최신월 저비용 탐지 + STAGING 생성 + 증분 sync)는 local에서 구현·검증된 절차다.**
현재 운영 정책상 이 절차의 전국 batch는 Production에서 실행하지 않는다. 새 월을 반영하려면 local에서
위 schema 계약을 확인한 뒤:

5. `npm run dataset:discover`로 ACTIVE보다 최신인 공통월이 있는지 저비용으로 확인한다(전국 지역을
   조회하지 않는다 — 대표 지역 1곳·2개 소스만 확인). 새 월을 발견하면 STAGING dataset만 생성한다
   (ACTIVE는 바뀌지 않는다).
6. `npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=N`을 local에서 API 일일 호출
   한도를 고려한 `N`으로 여러 회차에 나눠 실행해 STAGING baseYm의 전국 데이터를 채운다(이미 성공한
   지역×소스는 자동으로 건너뛰고, 429가 감지되면 그 시점까지 결과를 보존한 채 안전하게 종료한다).
7. `npm run dataset:status`로 local STAGING 진행률(완료 지역/255, ERROR, source별 현황)과 promotion
   readiness(`READY_FOR_DRIFT_CHECK`)를 확인한다. `READY_FOR_DRIFT_CHECK`면 읽기 전용
   `npm run dataset:drift -- --base-ym=YYYYMM`으로 DNA drift 결과를 먼저 확인한 뒤, 위 2번
   (`npm run dataset:activate`)을 실행해 승격을 시도한다.

**Phase 2-C(completeness/audit + DNA drift gate 통과 시에만 승격 — `evaluateDatasetPromotion`/
`promoteDataset`, `src/lib/services/datasetPromotion.ts`)도 로컬에서 구현·검증 완료했다**
(2026-08-12) — 위 2번(`npm run dataset:activate`)이 이제 자동으로 이 gate를 거친다. `--force`/
`--skip-drift` 같은 우회 옵션은 없다. threshold는 실제 두 번째 전국 dataset의 월간 drift를 관측하기
전이라 잠정치다(`src/lib/domain/datasetDriftGate.ts`의 `DRIFT_GATE_THRESHOLDS`). 이 절차도 아직
Production에는 적용하지 않았고(2026-08-12 당시 기록), 위 "Production 최초 ACTIVE 설정 시 알아야 할 것" 캡션에서 설명한
대로 **Production의 최초(첫) ACTIVE 설정에는 이 새 gate가 그대로 적용되지 않는다**(비교할 기존
ACTIVE가 없기 때문) — 완전 자동(사람 개입 없는) 승격 스케줄링도 아직 없다.

**Phase 2-D(TOUR_INFO Freshness TTL + POI Reuse)도 로컬에서 구현·검증 완료했다**(2026-08-12) — 새
환경변수는 필요 없다(TTL=60일은 `src/lib/domain/tourInfoFreshness.ts`의 코드 상수, 새 schema/컬럼도
없음). 위 6번(`npm run sync:tourism-data -- --dataset=staging ...`)을 Production에서 실행할 때부터
자동으로 적용된다 — region의 최근 TOUR_INFO SUCCESS/EMPTY가 TTL 이내면 그 지역은 API를 호출하지
않는다. **주의**: Production Neon에는 아직 TOUR_INFO를 포함한 전국 데이터 자체가 이 세션에서
동기화된 적이 없으므로, Production에 처음 적용할 때는 모든 지역이 NEVER_FETCHED로 시작해 이
재사용 효과가 즉시 나타나지 않는다(첫 회차는 그대로 전량 호출됨 — 두 번째 STAGING baseYm부터
절감 효과가 생긴다). 이 절차도 아직 Production에는 적용하지 않았다.

## 10. 로컬 전용 개발 정책 & Vercel 배포 이력(2026-08-13)

새 Neon 프로젝트로 DB 이관을 마쳤지만(스키마 13/13 migration, 전국 데이터, ACTIVE=202606, audit
PASS 전부 확인됨 — `docs/implementation-status.md` 참고), 2026-08-13 초 한동안은 **최종 제출판을
준비하는 기간 동안 Production Neon/Vercel을 건드리지 않고 로컬에서만 개발을 이어가기 위해** Vercel
Git 자동 배포를 `vercel git disconnect`로 의도적으로 중단했었다. **같은 날 안에 Vercel 사용량에
충분한 여유가 있음을 확인해 `vercel git connect`로 자동 배포를 다시 활성화했다** — 아래는 그 사이에
있었던 일시 중단 이력과, 재활성화 이후에도 계속 유지되는 DB 정책을 함께 기록한다.

### 현재 상태(2026-08-13 재활성화 이후)

- **Vercel Git 연동이 다시 활성화되어 있다** — provider GitHub, repository `herb39/TOUR-DNA`,
  Production branch `main`. `main` push → Production 자동 배포, 다른 branch push → Preview 자동
  배포가 정상 동작한다(실제 push → 자동 build → `tour-dna.lib.lc` alias 갱신까지 확인 완료).
- 기존 Vercel project(`tour-dna`)·custom domain(`tour-dna.lib.lc`)·Production 환경변수는 재연결
  과정에서 전혀 변경되지 않았다(`vercel git connect`는 저장소 연결만 추가할 뿐, 프로젝트/도메인/env를
  건드리지 않는다).
- 필요하면 언제든 `vercel git disconnect`로 다시 자동 배포만 끌 수 있고, `vercel --prod` 수동 배포도
  계속 가능하다.

### 일시 중단됐던 기간의 기록(2026-08-13, 자동 배포 재활성화 전)

- `.env.local`의 `DATABASE_URL`은 `localhost:5432/tour_dna_local` 그대로 유지(로컬 PostgreSQL) —
  이 부분은 재활성화 이후에도 변함없다.
- `.env.local`의 `DIRECT_URL`(옛 Neon 값)은 제거했다 — `prisma.config.ts`가 `DATABASE_URL` 하나만
  `datasource.url`에 연결하고 `DIRECT_URL`은 스키마·설정 어디에서도 참조되지 않는 완전 미사용
  변수였음을 코드로 확인한 뒤 정리한 것이다(혼동 방지 목적, 기능 영향 없음).
- 새 Neon pooled 연결 문자열은 `.env.local` 최상단에 **주석으로만** 남겨뒀다 — 아직 활성 `DATABASE_URL`로
  쓰지 않는다.

### 개발 기간 원칙(자동 배포 활성화 여부와 무관하게 계속 유지)

- 개발/QA DB는 항상 local PostgreSQL(`tour_dna_local`)만 쓴다.
- 공공데이터 API sync, Dataset STAGING/ACTIVE 작업, 대표 프로젝트 재분석은 전부 local에서만 수행한다.
- Production Neon에는 개발용 write 작업을 하지 않는다(seed·개발용 migration·dataset activate·sync·개발용
  reanalysis·테스트 데이터 생성·대량 보정 스크립트 전부 금지) — 정상 사용자 기능의 runtime read/write와
  별도 승인된 검증 결과 promotion/import만 허용한다.
- 전국 API sync, 전국 대량 read, Dataset build·normalization·drift 검증, bulk PET/ACCESSIBILITY
  enrichment는 Production에서 실행하지 않는다.
- Vercel Git 자동 배포가 켜져 있어도 이 원칙은 그대로다 — 자동 배포는 "코드가 자동으로 Production에
  올라간다"는 뜻일 뿐, "Production DB에 개발 작업을 해도 된다"는 뜻이 아니다.
- 새 기능의 "완료" 조건에 Production deploy를 반드시 포함할 필요는 없다 — 로컬 검증(테스트/typecheck/
  lint/build/audit)까지만으로 완료로 볼 수 있다. 다만 자동 배포가 켜져 있으므로 `main` push 자체가
  곧 Production 배포로 이어진다는 점은 항상 인지한다.

### 최종 제출 전 cutover 절차(데이터 최신화 후 별도 승인으로 수행)

1. local DB 최종 검증: `npm run audit:tourism-data -- --base-ym=YYYYMM` PASS, 전체 테스트/typecheck/
   lint/build 통과.
2. `pg_dump`로 로컬 `tour_dna_local` 최종 백업.
3. 최종 검증된 Dataset만 새 Neon 프로젝트 또는 Production으로 restore/import(이미 1차 이관은 완료돼 있으므로 차분만 재이관하거나 전체
   재이관 중 택1 — cutover 시점에 결정).
4. 새 Neon 대상으로 Dataset/row count/`audit:tourism-data` 재검증.
5. Vercel 대시보드 → Settings → Environment Variables → Production에서 `DATABASE_URL`을 검증된 Neon
   pooled 연결 문자열로 교체(이미 스키마/데이터가 준비돼 있으므로 이 시점에는 migration/seed/
   dataset activate를 다시 실행할 필요가 없다 — 이미 맞는 상태를 불필요하게 덮어쓰지 않는다).
6. Git 자동 배포는 이미 켜져 있으므로 별도 조치가 필요 없다 — env 교체 후 다음 `main` push(또는
   Vercel 대시보드의 Redeploy)로 새 `DATABASE_URL`이 반영된 배포가 자동 생성된다.
7. 배포된 Production URL에서 브라우저 smoke test(대표 프로젝트 열람 등).

### Dataset 월별 보존과 9월 최신화 순서

- `Dataset`은 `baseYm`별로 별도 보존하며, 새 월을 ACTIVE로 승격할 때 이전 ACTIVE는 ARCHIVED가 된다.
- `DataSnapshot`과 `NormalizedMetric`도 `baseYm`을 포함한 키로 저장되어 과거 월의 Snapshot·Metric을
  덮어쓰지 않는다.
- 운영 단순성을 위해 동시에 허용하는 STAGING Dataset은 하나다. 따라서 `202607`을 local에서 구축·
  검증·승격하거나 정리한 뒤 `202608`을 다음 STAGING으로 만든다.
- 권장 순서는 `202607 local 구축 → completeness/audit/drift 검증 → 필요 시 promotion/import →
  202608 공개 후 local 구축·검증 → 최신 검증월만 Production promotion/import`이다.

### Claude Code 공통 안전 원칙

- `DATABASE_URL`이 `localhost`가 아니면(즉 원격 Neon을 가리키면) 개발 중 DB write 작업(sync/seed/
  dataset activate/analysis 등)을 수행하지 않는다.
- 원격 Neon에서 전국 공공데이터 API 대량 sync를 실행하지 않는다.
- Production Neon에서 seed/재분석/dataset promotion을 개발 과정 중 실행하지 않는다 — Production
  관련 검증은 위 cutover 절차에서만, 사용자가 명시적으로 요청한 별도 작업으로만 수행한다.
- Git 자동 배포가 켜져 있으므로, `main`에 push하는 모든 커밋은 자동으로 Production에 배포된다는
  점을 항상 염두에 둔다 — 커밋 전 로컬 검증(테스트/typecheck/lint/build)을 반드시 마친다.

## 11. Vercel Function ↔ Neon DB region 정렬(2026-08-13)

운영 최초 Document 응답이 평균 약 4~6초로 매우 느린 문제가 있었다(위 성능 조사 절 참고 — 코드 레벨
`Promise.all` 병렬화로는 해소되지 않았다). 이후 확인 결과 **Neon Production DB region은 Singapore**,
그 시점 **Vercel Function region은 North America**였다 — 대륙을 가로지르는 요청마다 DB 왕복 지연이
누적된 것이 실제 핵심 원인이었다. **Vercel Function region을 Singapore로 변경해 Neon과 동일 리전으로
맞춘 뒤 체감 로딩 문제가 해결됐다**(정확한 재측정 ms는 확보하지 않아 숫자로 단정하지 않는다).

**결론**: 이번 성능 문제는 애플리케이션 코드 자체보다 **Vercel Function ↔ Neon DB의 region
불일치로 인한 네트워크 왕복 지연 누적**이 핵심 원인이었다.

**한국 사용자 대상 현재 권장 운영 위치**: Vercel Function = Singapore, Neon = Singapore(둘 다 일치).

**향후 체크 항목** — 다음 중 하나라도 할 때는 Function region과 DB region이 일치하는지 먼저 확인한다:
- DB provider 변경
- DB migration/이관
- Vercel project 재생성
- Vercel Function region 변경

region 불일치는 코드 최적화로 해소되지 않는 종류의 지연이므로, 매번 새 인프라를 구성하기 전에 이
확인이 최우선이다.
