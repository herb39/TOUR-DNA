# TOUR DNA 구현 계획

이 문서는 두 부분으로 구성된다. **Part 1**은 최초 MVP 구축 당시(2026-07-20) 작성된 원본 기록으로
그대로 보존한다. **Part 2**는 2026-07-23 `TOUR-DNA-Claude-Code-Implementation-Prompt.md`(공모전 제출판
개선 마스터 프롬프트) 검토에 따른 새 구현 계획이며, REVIEW_ONLY 산출물이다(코드/migration/배포 미변경).

---

# Part 1. 최초 MVP 구현 기록 (2026-07-20, 완료 — 원본 보존)

> 작성일: 2026-07-20
> 브랜치: `master` (원격 Git 저장소 없음 — 로컬 전용, 사용자 확인 하에 main 진행)

## 0. 환경 확인 결과

- 작업 경로: `C:\tour_dna` (일치)
- Git: 최초 확인 시 `.git` 없음 → 사용자 승인 하에 `git init` 수행, `master` 브랜치에서 직접 작업
- 원격: `https://github.com/herb39/TOUR-DNA` 미확인/미연결. 사용자가 추후 원격을 연결하면 그때 push 여부를 다시 확인한다.
- 로컬 DB: Docker/psql 없음 → 사용자 결정에 따라 **Neon(dev/prod 공통)** 사용. 사용자가 Neon 프로젝트 생성 후 `DATABASE_URL`/`DIRECT_URL`을 `.env.local`에 전달할 예정. 그 전까지는 스키마/로직/단위테스트를 우선 진행하고, DB 연결이 오면 migrate/seed/통합테스트를 마저 수행한다.

## 1. 스택 확정

- Next.js (App Router, TypeScript strict), Tailwind CSS v4
- Prisma + PostgreSQL(Neon)
- Zod (클라/서버 공통 스키마)
- Recharts (레이더 차트)
- Kakao Maps JS SDK + 좌표/주소 목록 fallback
- Vitest (단위테스트), Playwright (E2E)

## 2. 디렉터리 구조 (계획)

```
src/
  app/
    page.tsx                        # 랜딩 + 프로젝트 목록
    projects/new/page.tsx           # 조건 입력
    projects/[id]/analysis/page.tsx
    projects/[id]/plan/page.tsx
    projects/[id]/print/page.tsx
    api/
      projects/route.ts             # 목록/생성
      projects/[id]/route.ts
      projects/[id]/analysis/route.ts
      projects/[id]/plan/route.ts
      cron/sync-tourism-data/route.ts
      admin/sync-tourism-data/route.ts
  lib/
    domain/
      dna.ts                       # DNA 정규화/점수 계산 (순수함수)
      strategy.ts                  # 전략 템플릿/점수/정렬
      analysisKey.ts               # 해시 계산
      poi-course.ts                # 코스 슬롯 생성
    public-data/
      adapters/
        tarSvcDem.ts, tarSjrnDs.ts, tarExpDs.ts, touDivIx.ts,
        tourInfo.ts, poiRelation.ts
      client.ts                    # timeout/retry 공통 fetch
      types.ts                     # Zod 스키마 (요청/응답)
    fixtures/
      daejeon-202508.json, daejeon-202509.json
      jecheon-202508.json, jecheon-202509.json
      yangyang-202508.json, yangyang-202509.json
    validation/
      project-input.schema.ts      # 공통 Zod 스키마
    db.ts                          # Prisma client singleton
  components/
    charts/RadarChart.tsx
    strategy/StrategyCard.tsx
    evidence/EvidencePanel.tsx
    map/KakaoMap.tsx, map/MapFallback.tsx
    ui/...
prisma/
  schema.prisma
  migrations/
  seed.ts
scripts/
  sync-tourism-data.ts             # CLI (동일 로직 route에서 재사용)
tests/
  unit/*.test.ts
e2e/*.spec.ts
docs/
  implementation-plan.md (본 문서)
  architecture.md
  data-dictionary.md
  scoring-model.md
  public-api-status.md
  deployment.md
  operator-checklist.md
```

## 3. P0 체크리스트

- [x] Next.js/TS/Tailwind/Prisma/Zod/Vitest/Playwright 설치 및 스크립트 구성
- [x] Prisma 스키마 전체 모델 정의 + migration (Neon에 적용 완료)
- [x] 대전/제천/양양 fixture (각 2개월치, 지표 6종 + POI 23건 + 연관관광지 8건)
- [x] ProjectInput Zod 스키마 (공통, 클라/서버 동일 스키마 재사용)
- [x] DNA 계산 엔진 + 단위테스트 (9 tests)
- [x] 전략 엔진(7템플릿, 점수식, 동점처리) + 단위테스트 (11 tests)
- [x] analysisKey/modelVersion/dataVersion 버전 관리 (4 tests)
- [x] `/` 랜딩 + 프로젝트 목록 (빈/로딩/오류)
- [x] `/projects/new` 입력 폼 (클라/서버 검증, 6 tests)
- [x] `/projects/[id]/analysis` 대시보드(레이더, 강점/기회/주의, 전략3안, 근거패널, 지도 fallback)
- [x] 프로젝트 저장 → 새로고침 후 복원 (E2E로 검증)
- [x] production build 통과

## 4. P1 체크리스트

- [x] `/projects/[id]/plan` 실행안 (코스/업종연결/체크리스트/KPI/편집/저장)
- [x] `/projects/[id]/print` A4 인쇄 CSS
- [x] 공공데이터 어댑터 6종 + Zod 검증 + timeout/retry (envelope parser 5 tests)
- [x] `/api/cron/sync-tourism-data`, `/api/admin/sync-tourism-data`, CLI (동일 syncService 재사용, 401 검증)
- [x] Playwright E2E 대표 시나리오 (8 tests: 데모 조회/근거패널/지도fallback/Cron401/신규제출→선택→편집→저장→새로고침→인쇄/검증오류/지역별결과차이/결정론)
- [x] 배포 문서(Vercel/Neon/Kakao)

## 5. P2 (미구현, 범위 밖으로 명시)

- [ ] 프로젝트 비교, 관리자 동기화 UI, LLM 문장 다듬기(옵션), 공유 링크 — README "알려진 제한사항" 참고

## 6. 진행 로그

- 2026-07-20 오전: 환경 확인(빈 폴더, git 미초기화) → 사용자 승인 하에 git init, master 브랜치로 진행.
  Neon DB 사용 결정. Next.js 16(Turbopack)/Prisma 7 스캐폴딩. Prisma 7의 아키텍처 변화(driver adapter
  필수, `prisma-client` generator가 `@/generated/prisma/client` 하위 경로 필요, `migrate dev`가 로컬
  임시 DB에서 shadow DB 생성 실패 — `migrate deploy` + 수동 diff로 우회) 대응.
- 2026-07-20 오후: 공공데이터 API 스펙 조사(배경 에이전트, 세션 한도로 일부 중단되었으나 핵심 결론 확보 —
  후보 필드명 전부 미검증, 데이터셋 자체는 실재 확인). DNA/전략 도메인 엔진과 단위테스트 작성.
  Zod 스키마/코드값 정의. fixture(대전/제천/양양) + idempotent seed 작성, 실 Neon DB에 end-to-end 검증.
  핵심 페이지 5종(랜딩/입력/분석/실행안/인쇄) 구현 — 브라우저 자동화 도구의 렌더링 파이프라인이 이
  세션에서 일시적으로 응답 없음 상태(스크린샷 타임아웃, 무관한 외부 사이트에서도 재현)가 되어, 서버
  액션 직접 호출 테스트 + jsdom 컴포넌트 테스트로 상호작용(연쇄 select, 실시간 요약 갱신)을 대체 검증함
  (실제 앱 버그 아님을 확인). 공공데이터 어댑터 6종 + sync 서비스(CRON/ADMIN/CLI 공용) + 401 인증 구현.
  Playwright E2E 8종 작성 및 통과(별도 브라우저 드라이버라 위 렌더링 이슈와 무관하게 정상 동작 확인).
  production build 통과. 문서 6종 작성 완료.
- 남은 항목: 실 `TOUR_API_SERVICE_KEY` 발급 후 어댑터 재검증(사용자 수행), Kakao Map 키 발급 후 실제
  지도 렌더링 확인(사용자 수행), 원격 저장소 연결 후 push(사용자 확인 필요).

---

# Part 2. 공모전 개선 마스터 프롬프트 구현 계획 (2026-07-23, REVIEW_ONLY)

> 기준 커밋: `5e16dec`. 참조 문서: `docs/contest-feature-map.md`, `docs/implementation-status.md`,
> `docs/api-verification-request.md`, `docs/route-api-status.md`. 이 Part는 코드를 전혀 수정하지 않고
> 작성한 계획이며, 실제 구현은 Phase 하나 또는 원자적 하위 Phase 하나씩 별도 대화에서 진행한다.

## 0. 원칙 (2026-07-23 재조정)

- 우선순위 기준을 마스터 문서의 권장 순서(보안 최우선)에서 **지정과제 7번 직접 요구사항과 심사
  노출도**로 전환한다(사용자 지시). Phase 8(보안)의 중요성 자체는 그대로지만, 지정과제 채점표에
  등장하지 않고 시연 시 단일 접근으로도 충분히 넘어갈 수 있어 P1로 내렸다.
- Phase 9(무료 운영비 가드)는 특정 순서를 갖지 않고, **새로 외부 API를 호출하는 모든 구현 단위**
  (Phase 1의 실제 snapshot 저장, Phase 2, Phase 12)에 상시 적용한다.
- 각 Phase 구현 세션은 이 문서, 마스터 프롬프트, `implementation-status.md`만 읽고 해당 Phase만
  작업한 뒤 상태 문서를 갱신하고 멈춘다(마스터 문서 "Claude Code 실행 방식" 절 그대로).
- 스키마 변경은 계속 expand(추가)만 사용하고 컬럼 삭제는 포함하지 않는다.

## 1. 우선순위 (P0/P1/P2, 재조정)

> **2026-07-26 갱신**: Phase 5(다채널 홍보 초안)의 5-A~5-D에 해당하는 구현(도메인 생성 함수, 저장/조회/
> 서버 액션, 편집기 UI, 인쇄 출력)이 로컬에서 전부 끝나고 자동 테스트도 통과했다(커밋 `5b8d872`/
> `fc5e8f8`/`7460365`/`a264db6`, 상세는 `docs/implementation-status.md`의 Phase 5 절). 이어서 Phase 4
> (role/nationality/theme/travel month 실질 반영)도 로컬 구현·테스트를 마쳤다(DB 스키마 변경 없이
> 완료 — 아래 "3. Phase별 원자적 구현 단위"의 P0-3 절 참고). 다만 이 커밋들은 아직 `origin/main`에
> push되지 않았고, `SelectedPlan.promoContent` migration도 원격 DB에 미적용이다. 원래 2026-07-23
> 계획 표는 그대로 두고, 실제 다음 순서는 `docs/implementation-status.md` 상단 "다음 작업 순서(P0)"
> 절을 따른다: P0-1 Phase 4(완료) → P0-2 대표 시나리오 3개 → P0-3 DB migration 적용 + 통합 검증 →
> P0-4 원격 반영 + 배포.

| 순위(2026-07-23 원안) | Phase | 재조정 근거 | 2026-07-26 현재 상태 |
|---|---|---|---|
| P0-1 | Phase 1 (provenance + 실제 raw snapshot 저장) | 지정과제 채점표 "데이터 활용 적절성"(20점) 직결, `LIVE 5/5` 오표시는 심사에서 가장 먼저 드러날 리스크 | 완료(로컬+배포) |
| P0-2 | Phase 5 (다채널 홍보 초안) | 지정과제 7번 원문이 "다채널 마케팅 콘텐츠"를 명시 — 현재 전혀 없어 요구사항 미충족이 가장 뚜렷한 항목 | **로컬 구현+테스트 완료, 원격 반영·DB 적용·배포 대기(새 P0-3/P0-4)** |
| P0-3 | Phase 4 (role/nationality/theme/travel month 실질 반영) | "여행사·지자체 실무자 대상", "타깃·지역·기간·콘셉트 조건 입력" 두 지정과제 문구에 직결. `analysisKey`에 role/nationality를 포함시키는 부분은 이번에 같이 해결했으나, `dataVersion`의 나머지 두 결함(휘발성 `collectedAt`, 코호트 미반영)은 별도로 남아 있음 | **로컬 구현+테스트 완료(새 P0-1로 승격, 완료) — 원격 반영·배포 대기** |
| P0-4 | 대표 시나리오 3개(제천/강릉/경주) 결과 차별화 + E2E | 마스터 문서 2-3절이 요구하는 "입력 차이 → 결과 차이" 심사 시연의 직접 증거. P0-1~3이 실제로 동작하는지 검증하는 마지막 단계이자 발표력(15점) 대비 자료 | **미착수 — 새 P0-2로 승격, 이제 진행 가능(Phase 4 완료로 조건별 차이가 실제로 나타남)** |
| P1-5 | Phase 8 (사이트 잠금 제거 + 프로젝트별 비밀번호, 축소 구현) | 보안상 여전히 중요하나 채점표에 직접 항목 없음. 현재 사이트 전체 비밀번호로도 시연 자체는 가능 |
| P1-6 | Phase 2 (최소 갱신 구조) | 7개 지역 규모에서는 리스크가 낮음(현재도 수동 baseYm 갱신으로 시연 가능) |
| P1-7 | Phase 11 (CI) | 심사 노출 없음, 팀 운영 편의 |
| P2-8 | Phase 10 (`/admin/ops`) | 채점표에 없음, 공개 화면만으로 시연 완결 |
| P2-9 | Phase 12 (실제 경로 API) | `docs/route-api-status.md` 일부 미확인 항목 + 무료쿼터 확정 전까지 BLOCKED, 지정과제 문구에 "실제 도로 경로"를 명시하지 않음 |
| (횡단) | Phase 9 (무료 운영비 가드) | P0-1(실제 동기화 활성화), P1-6(Phase 2), P2-9(경로 API)처럼 새 외부 API 호출이 생기는 모든 단위에 동시 적용 |
| (보류) | Phase 6(조건 수정/재분석), Phase 7(코호트 설명 마무리) | P0~P1 완료 후 재검토. Phase 7은 표시만 남은 낮은 리스크 작업이라 여유 있을 때 아무 단위에나 끼워넣기 가능 |

## 2. Phase 1 실제 호출 경로 추적 결과 (P0-1의 근거)

`src/lib/services/syncService.ts`의 `runTourismDataSync()`를 처음부터 끝까지 추적했다.

- 지표 5종(`fetchTarSvcDem`/`fetchTouDivIx`/`fetchTouResDem`/`fetchVisitorCnt`)과 POI(`fetchTourInfo`)
  응답은 각각 `upsertMetric()`(→ `prisma.normalizedMetric.upsert`, [syncService.ts:41-55](../src/lib/services/syncService.ts#L41-L55))과
  `prisma.poi.upsert()`([syncService.ts:228-251](../src/lib/services/syncService.ts#L228-L251))로만 저장된다.
- **`prisma.dataSnapshot.*` 호출이 이 파일에 단 한 번도 없다.** 즉 실제 라이브 동기화는 `DataSnapshot.rawPayload`를
  전혀 채우지 않는다.
- `rawPayload`를 실제로 쓰는 유일한 코드는 `prisma/seed.ts`의 `upsertSnapshotAndMetric()`
  ([seed.ts:86-120](../prisma/seed.ts#L86-L120))이며, 여기서 `resultCode: "0000"`/`resultMsg: "NORMAL SERVICE."`를
  **직접 하드코딩**해 실제 API가 준 적 없는 성공 envelope를 흉내 낸다.
- `src/lib/services/projectQueries.ts:19`가 `prisma.dataSnapshot.findFirst`로 이 값을 읽어 화면에 쓰므로,
  운영 동기화가 아무리 성공해도 화면에는 seed 시점 fixture만 계속 보인다.

**P0-1 구현 시 Phase 1-4는 반드시 다음을 포함해야 한다**: `syncService.ts`의 각 지표/POI 호출 지점에
`prisma.dataSnapshot.upsert()`를 추가해 실제 응답(status/resultCode/resultMsg/itemCount/rawPayload)을
저장하고, `seed.ts`의 가짜 envelope는 `provenance=ESTIMATED` 또는 별도 플래그로 실제 API 성공과
구분되게 표시한다.

## 3. Phase별 원자적 구현 단위 (재조정 순서대로)

### P0-1. Phase 1

| 단위 | 내용 | 배포 안전성 |
|---|---|---|
| 1-A | Migration만 추가: provenance enum(`LIVE_API/CACHED_API/CURATED/ESTIMATED/MISSING`) + `NormalizedMetric.provenance`/`Evidence.provenance` 컬럼(nullable). 앱 로직 미변경 | 안전(additive) |
| 1-B | `syncService.ts`의 5개 지표+POI 호출 지점에 `prisma.dataSnapshot.upsert()` 추가(2절 추적 결과 직접 반영) — 실제 라이브 동기화가 처음으로 snapshot을 남기게 됨 | 안전(새 쓰기 경로 추가, 기존 읽기 무변화) |
| 1-C | `isSnapshotFallback: false` 하드코딩 3곳(`metricCohort.ts:23`, `buildDnaEngineInput.ts:45`, `dna.ts:105`) 제거 → 1-A의 provenance 필드 기반 실제 계산으로 교체 | 이 커밋부터 `LIVE 5/5` 표시가 실제로 바뀜 — 배포 전 데모 프로젝트로 축별 상태 수동 확인 |
| 1-D | `seed.ts`의 가짜 `NORMAL SERVICE` envelope에 `provenance=ESTIMATED/CURATED` 표시, fixture와 실 API 성공을 구분 | 안전 |
| 1-E | Network evidence를 POI 근거/관계 근거로 분리(`sourceCode` 이원화) | 안전(표시 방식 변경) |

### P0-2. Phase 5 — 로컬 구현·테스트 완료(2026-07-26), 원격 반영·DB 적용·배포는 P0-3/P0-4에서 진행

실제로는 계획한 4단위(5-A~5-D)가 아니라 5-A(도메인 생성 함수) → 5-B(저장/조회/서버 액션, migration
포함) → 5-C(편집기 UI + 인쇄 출력) + 보완(재생성 확인 버그 수정) 순서로 구현했다 — migration은 계획과
달리 5-A가 아니라 5-B에서 추가했다(순수 도메인 함수 단계에서는 Prisma를 아예 참조하지 않기 위함).

| 단위 | 내용 | 상태 |
|---|---|---|
| 5-A | 순수 함수 `buildPromoContent()`(제안서 3문장/랜딩 제목·본문/Instagram 캡션·해시태그/블로그 제목·본문/역할별 discriminated union) — 기존 SelectedPlan·Evidence만 사용, Prisma 미의존 | **DONE**(`5b8d872`, 테스트 21개) |
| 5-B | Migration `SelectedPlan.promoContent`(Json, nullable) + Prisma↔도메인 변환 경계 + 생성/조회/저장 서비스 + 덮어쓰기 보호 + 서버 액션 | **DONE(로컬)**(`fc5e8f8`, 테스트 30개) — migration은 원격 DB 미적용 |
| 5-C | 실행안 편집기에 "홍보자료" 섹션 + 개별/전체 복사 + 인쇄 화면 출력 | **DONE(로컬)**(`7460365`, 테스트 27개) |
| 보완 | 재생성 확인 없이 덮어쓰기가 발생하던 두 경로(최초 생성의 `alreadyExists`, 손상 콘텐츠 복구) 수정 | **DONE(로컬)**(`a264db6`, 테스트 11개) |

### P0-1(신규). Phase 4 — 로컬 구현·테스트 완료(2026-07-26)

실제로는 계획했던 "Phase 3 결함까지 전부 동시 해결"이 아니라, `analysisKey`에 role/nationality를
포함시키는 결함 하나만 이번 범위에서 함께 해소했다 — `dataVersion.ts`의 나머지 두 결함(휘발성
`collectedAt` 포함, 코호트 변경 미반영)은 지역 객관적 데이터 계산 자체를 건드리는 별도 작업이라
의도적으로 범위 밖에 두었다(DB schema 변경도 필요 없어 P0-3 자리에 미리 당겨 하지 않고 이 순서 그대로
진행). 새 정책 모듈 `audienceContext.ts` 하나에 역할/국적/테마/월 규칙을 전부 모아 흩어진 `if`문을
피했다.

| 단위 | 내용 | 상태 |
|---|---|---|
| 4-A | 역할별 목표 우선순위 테이블(`ROLE_GOAL_PRIORITY`) + `computeRoleFit()` → `strategy.ts`에 `roleFit`(신규 breakdown 키) 추가, 총점 공식 재조정(`demandFit*0.35+supplyFit*0.25+seasonFit*0.20+targetFit*0.05+feasibilityFit*0.05+roleFit*0.10`) | **DONE(로컬)** |
| 4-B | `analyzeProject.ts`의 `scoringInput`/`analysisKey` 입력에 `role`/`nationality` 추가(정규화 함수로 레거시 값 안전 처리) — Phase 3의 "analysisKey에 role/nationality 없음" 결함 해소 | **DONE(로컬)** |
| 4-C | role별(`TRAVEL_AGENCY`/`LOCAL_GOV`) 실행 체크리스트 문구 분기(`planBuilder.ts` `computeRoleChecklistNotes`), 추천 근거 문구에 역할 관점 반영 | **DONE(로컬)** — 계획 당시 예상한 "제목/배경 템플릿 분기"까지는 하지 않음(기존 제목·배경 문구 구조를 유지하는 편이 하위 호환에 더 안전하다고 판단, 대신 체크리스트·근거·점수로 반영) |
| 4-D | `nationality=FOREIGN`일 때 템플릿별 서비스 준비도 조정치(`foreignReadinessAdjustment`, `strategyTemplates.ts`)를 `feasibilityFit`에 반영 + 다국어 안내 체크리스트 1건 추가. 내국인/실측 데이터는 건드리지 않음(CURATED로 명시) | **DONE(로컬)** — 계획한 "국제결제/문화설명" 항목까지는 세분화하지 않고 서비스 준비도 하나로 통합(과도한 세분화보다 명확한 CURATED 근거 하나가 낫다고 판단) |
| 4-E | 자유 텍스트 테마를 7개 내부 카테고리로 분류(`classifyThemes`) 후 템플릿별 가산점 반영(`targetFit`, 최대 15점) + 월별 계절 위험요인(`computeSeasonalRiskNotes`, 장마철/혹서기/혹한기) | **DONE(로컬)** — "선택, 작업량 크면 P1로 이관" 옵션이었으나 이번 범위에 포함해 완료 |

### P0-4. 대표 시나리오 3개 차별화 + E2E

| 단위 | 내용 |
|---|---|
| S-A | 제천(여행사/미식·시장)·강릉(지자체/가족 체류소비)·경주(외국인/역사문화 다국어) 데모 시드를 P0-3 반영 후 재생성 — 강릉·경주 Region은 이미 존재(2026-07-21 추가), 신규 지역 확보 불필요 |
| S-B | E2E에 "3개 시나리오의 role/nationality/전략명/홍보문구가 서로 다르다" assertion 추가(`e2e/core-flow.spec.ts` 확장) |
| S-C | `docs/test-scenarios.md` 갱신 |

### P1-5. Phase 8 (축소 구현 — `ProjectOwnerRecovery` 제외, `ProjectAccessAttempt`는 8-C에 필수 포함)

| 단위 | 내용 | 배포 안전성 |
|---|---|---|
| 8-A | Migration: `OwnerSession`, `ProjectAccessSession`, `ProjectAccessAttempt`, `Project.publicId/passwordHash/passwordSalt/passwordVersion`(**`ProjectOwnerRecovery`는 이번 범위에서 제외**) | 안전(additive) |
| 8-B | 서버 전용 권한 검증 함수 배선(기존 `SITE_ACCESS_PASSWORD` 게이트는 유지) | 안전 |
| 8-C | 비밀번호 설정/변경/해제 UI + `scrypt` 해시 **+ `ProjectAccessAttempt` rate limit을 같은 커밋에서 함께 구현**(분리 배포 금지 — 브루트포스 노출 중간상태 방지) | 안전(사이트 게이트 뒤) |
| 8-D | 공개 프로젝트 목록 + 안전한 DTO + 비밀번호 입력 화면 | 안전(사이트 게이트 뒤) |
| 8-E | **컷오버**: `SITE_ACCESS_PASSWORD`/`src/proxy.ts` 게이트 제거 | 이 커밋부터 사이트가 열림 — 8-B~8-D 스테이징 검증 후에만 배포 |
| (보류) | `ProjectOwnerRecovery` — P1 이후 별도 단위로 추가. UI에는 "쿠키 삭제 시 복구 불가" 안내만 우선 표시 | — |

### P1-6. Phase 2 (축소 구현)

| 단위 | 내용 | 배포 안전성 |
|---|---|---|
| 2-A | 신규 모델 대신 **기존 `DataSource`에 `latestAvailableBaseYm`/`lastAttemptAt`/`lastSuccessAt` 필드 추가**(`SourceWatermark` 등 신규 모델 미생성) | 안전(additive) |
| 2-B | 최신 기준월 probe 순수 함수(1개 검증된 지표 API로 후보월 확인, 최대 6개월 역탐색) — 아직 스케줄러 미연결 | 안전 |
| 2-C | Cron 경로에 probe 연결, 새 월 발견 시에만 전체 동기화 트리거, 결과는 기존 `SyncLog`에 기록(`SyncJob`/`DatasetVersion`/advisory lock 미도입 — 4절 근거 참고) | 배포 시 Cron 동작 변경, 기존 수동 `TOUR_DATA_BASE_YM` override는 비상용으로 유지 |

**`SyncJob`/`DatasetVersion`/advisory lock 보류 근거**: 현재 트리거 경로가 Cron(1일1회)+관리자 수동+CLI
3개뿐이고 실제 동시 충돌 사례가 없으며, 지표 upsert가 이미 idempotent라 중복 실행의 실제 피해가
낮다(API 호출 낭비 정도). 전국 확대로 트리거가 늘거나 중복 실행이 실제로 문제를 일으키면 그때 도입한다.

### P1-7. Phase 11

기존 계획과 동일: Node 버전 고정(`.nvmrc`/`engines`) → lockfile 재생성 → `prisma` devDependency 이동
검토 → GitHub Actions(lint/typecheck/test/build) → 지역별 배치 동기화.

### P2-8. Phase 10

기존 계획(10-A~10-D) 유지하되 착수 시점만 P2로 이동. Phase 1 완료 후에는 표시할 provenance/freshness
상태가 이미 존재하므로 구현 비용이 줄어든다.

### P2-9. Phase 12

`docs/route-api-status.md` 잔여 미확인 항목(실제 쿼터 수치/서버 REST 키/이용약관) 해소 전까지 착수하지
않는다.

## 4. Migration 순서 (제안, 미적용, 재조정 반영)

1. `20260723000000_add_data_provenance` — P0-1(Phase 1-A): provenance enum + `NormalizedMetric`/`Evidence` 컬럼(적용 완료, 배포 반영됨)
2. `20260726000000_add_selected_plan_promo_content` — P0-2(Phase 5-B): `SelectedPlan.promoContent`(작성 완료, **원격 DB 미적용** — 실제 파일명은 계획 당시 예상한 `add_promo_content`와 다르며, 5-A가 아니라 5-B에서 추가했다)
3. `add_project_access_control` — P1-5(Phase 8-A): `OwnerSession`/`ProjectAccessSession`/`ProjectAccessAttempt`/`Project.publicId` 등(`ProjectOwnerRecovery` 제외)
4. `extend_data_source_watermark` — P1-6(Phase 2-A): `DataSource`에 필드 3개만 추가(신규 테이블 아님)
5. (P2 진입 후) `add_operational_event` — Phase 10-A

Phase 4(2026-07-26 로컬 구현 완료)는 실제로 스키마 변경이 필요하지 않았다 — role/nationality/
travelMonth/preferredThemes 모두 이미 저장돼 있던 기존 컬럼만 읽어 도메인 로직(`audienceContext.ts`)에서
해석했다. 대표 시나리오(P0-2, 신 번호) 작업도 스키마 변경이 필수는 아니다. 모든 migration은 컬럼/테이블
추가만 사용한다.

## 5. 테스트·배포 검증 계획

- Phase별 표적 테스트 먼저 실행 후, 영향 범위에 비례해 전체 게이트 실행:
  `npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e && npm audit --omit=dev`
- P0-1의 1-C(하드코딩 제거)와 Phase 4의 4-B(analysisKey 변경)는 배포 전 데모 프로젝트로 축 상태·
  `LIVE 5/5` 배지·기존 분석 유지 여부를 수동으로도 1회 확인한다.
- Phase 8-E(컷오버)는 스테이징에서 비밀번호 없는 프로젝트 열람/보호 프로젝트 잠금/OWNER 편집/VIEWER
  mutation 차단을 수동으로도 1회 확인한 뒤 production 배포한다.
- P0-4의 시나리오 E2E는 3개 프로젝트의 role/nationality/전략명/홍보문구 텍스트가 서로 다름을 assertion으로
  고정해, 이후 회귀가 생기면 즉시 잡히게 한다.

## 6. 위험 및 확인 필요 질문 (남은 것만, 재조정 후 축소)

1. **기존 프로젝트 공개 전환 방식(Phase 8, P1-5)**: 여전히 미결정 — 일괄 공개 전환 vs 소유자 개별 안내 후 전환.
2. **role/nationality 반영 시 기존 분석 결과 처리(Phase 4)**: 여전히 미결정 — `analysisKey`가 role/
   nationality를 포함하도록 바뀌어(2026-07-26 구현 완료) 기존 저장된 프로젝트는 새 키 기준 "최신"이
   아니게 된다. 일괄 재분석 vs 열람 시 안내만 — 실제 DB 데이터가 있는 P0-3(DB migration 적용) 단계에서
   함께 결정해야 한다.
3. ~~Phase 5 홍보 문구 템플릿 방향~~ — **해소됨(2026-07-26)**: 완전 신규 템플릿이 아니라 저장된
   `SelectedPlan`(sellingPoints/targetSummary/course 등)과 `Evidence`를 결정론적 템플릿으로 재조합하는
   방식을 채택해 구현했다(`src/lib/domain/promoContent.ts`). LLM은 사용하지 않는다.
4. **Phase 12 착수 시점(P2-9)**: `route-api-status.md` 잔여 항목 확인 후 재논의.

(재분석 정책 질문과 `ProjectOwnerRecovery` 여부는 이번 재조정으로 해소됨 — 재분석은 P1 이후로 보류,
복구코드는 P1 이후로 명시적으로 미룸.)
