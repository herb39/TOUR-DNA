# TOUR DNA 구현 계획

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
