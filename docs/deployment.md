# 배포 가이드 (Vercel + Neon)

목표 구성: 웹은 Vercel, DB는 Neon PostgreSQL, 지도 SDK는 카카오맵, 운영 도메인은 `tour-dna.lib.lc`.

이 문서는 Claude Code가 준비한 코드/설정을 기준으로, **실제 계정 접근이 필요한 단계는 사용자가 직접
수행**하도록 안내한다. Claude Code는 대신 수행하지 않았다.

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
   콘텐츠 LLM 생성용, 비어 있으면 rule 생성기만 동작), `OPENROUTER_PROMO_MODEL`(선택 — 기본값
   `google/gemma-4-26b-a4b-it:free`)
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

> **이 절차는 로컬 PostgreSQL(`tour_dna_local`)에서만 실행·검증했다. Production Neon DB에는 아직
> migration을 적용하지도, ACTIVE dataset을 설정하지도 않았다** — GitHub `main` 반영과 Production
> DB 상태는 서로 다른 사실이라는 점을 이 문서의 다른 절과 동일한 원칙으로 명시한다.

`Dataset`(baseYm+status: STAGING/ACTIVE/ARCHIVED) 모델이 추가되면서(`20260811060333_add_dataset_registry`),
분석은 더 이상 `TOUR_DATA_BASE_YM`/`DEFAULT_BASE_YM` 같은 정적값이 아니라 이 테이블의 ACTIVE 행만
기준으로 삼는다. Production에 실제로 이 기능을 반영하려면:

1. `npm run db:migrate`로 `20260811060333_add_dataset_registry`를 포함한 누적 migration을 적용한다
   (additive — 신규 테이블 하나만 생성, 기존 데이터 변경 없음).
2. 해당 baseYm의 전국 데이터가 이미 완전하다면(`npm run audit:tourism-data -- --base-ym=YYYYMM`
   PASS) `npm run dataset:activate -- --base-ym=YYYYMM`으로 ACTIVE 설정한다.
3. `npm run dataset:status`로 정확히 1개의 ACTIVE만 있는지 확인한다.
4. ACTIVE가 설정되지 않은 상태에서는 신규 프로젝트 분석이 명확한 오류로 안전하게 실패한다(다른
   baseYm으로 조용히 대체하지 않음) — Production에 처음 도입할 때는 배포 직후 반드시 1단계를 먼저
   수행해야 한다.

> **2026-08-12 갱신 — Production 최초 ACTIVE 설정 시 알아야 할 것**: 아래 "Phase 2-C" 절 도입 이후
> `npm run dataset:activate`는 항상 **기존 ACTIVE와의 DNA drift 비교**를 거친다(`evaluateDatasetPromotion`이
> "ACTIVE 존재" 자체를 사전조건으로 요구). 즉 Production처럼 **ACTIVE가 한 번도 설정된 적 없는
> 상태에서는 이 명령이 비교 기준이 없다는 이유로 항상 BLOCKED된다** — 위 2번 절차는 로컬에서
> 202606을 최초로 ACTIVE로 설정했을 때(그 시점엔 아직 drift gate가 없었다)는 그대로 통했지만,
> Production 최초 도입 시점에는 그대로 통하지 않는다. Production 최초 ACTIVE 설정은 아직 정식
> 절차가 없다 — 별도 운영자 비상절차(예: `activateDataset()`을 drift gate 없이 직접 1회 호출하는
> 스크립트를 그때 가서 작성)로 처리해야 하며, 이 문서가 그 절차를 먼저 확정하기 전까지는 시도하지
> 않는다.

**Phase 2-B(source별 최신월 저비용 탐지 + STAGING 생성 + 증분 sync)는 로컬에서 구현·검증 완료했지만
(2026-08-11), 이 절차도 아직 Production에는 적용하지 않았다.** Production에 반영하려면 위 1번
migration 적용 후:

5. `npm run dataset:discover`로 ACTIVE보다 최신인 공통월이 있는지 저비용으로 확인한다(전국 지역을
   조회하지 않는다 — 대표 지역 1곳·2개 소스만 확인). 새 월을 발견하면 STAGING dataset만 생성한다
   (ACTIVE는 바뀌지 않는다).
6. `npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=N`을 API 일일 호출
   한도를 고려한 `N`으로 여러 회차에 나눠 실행해 STAGING baseYm의 전국 데이터를 채운다(이미 성공한
   지역×소스는 자동으로 건너뛰고, 429가 감지되면 그 시점까지 결과를 보존한 채 안전하게 종료한다).
7. `npm run dataset:status`로 STAGING 진행률(완료 지역/255, ERROR, source별 현황)과 promotion
   readiness(`READY_FOR_DRIFT_CHECK`)를 확인한다. `READY_FOR_DRIFT_CHECK`면 읽기 전용
   `npm run dataset:drift -- --base-ym=YYYYMM`으로 DNA drift 결과를 먼저 확인한 뒤, 위 2번
   (`npm run dataset:activate`)을 실행해 승격을 시도한다.

**Phase 2-C(completeness/audit + DNA drift gate 통과 시에만 승격 — `evaluateDatasetPromotion`/
`promoteDataset`, `src/lib/services/datasetPromotion.ts`)도 로컬에서 구현·검증 완료했다**
(2026-08-12) — 위 2번(`npm run dataset:activate`)이 이제 자동으로 이 gate를 거친다. `--force`/
`--skip-drift` 같은 우회 옵션은 없다. threshold는 실제 두 번째 전국 dataset의 월간 drift를 관측하기
전이라 잠정치다(`src/lib/domain/datasetDriftGate.ts`의 `DRIFT_GATE_THRESHOLDS`). 이 절차도 아직
Production에는 적용하지 않았고, 위 "Production 최초 ACTIVE 설정 시 알아야 할 것" 캡션에서 설명한
대로 **Production의 최초(첫) ACTIVE 설정에는 이 새 gate가 그대로 적용되지 않는다**(비교할 기존
ACTIVE가 없기 때문) — 완전 자동(사람 개입 없는) 승격 스케줄링도 아직 없다.
