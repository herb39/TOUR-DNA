# 공모전 지정과제 7번 기능 매핑 (REVIEW_ONLY, 2026-07-23 작성)

> 기준 커밋: `5e16dec`(2026-07-23 fast-forward pull 이후, 마스터 프롬프트 기준 커밋 `9e509ce`에서 1커밋 진행).
> 이 문서는 `TOUR-DNA-Claude-Code-Implementation-Prompt.md`의 최초 검토용 프롬프트 4번 항목 산출물이다.
> 코드는 수정하지 않았다 — 아래는 **현재 저장소를 직접 읽어 재검증한 사실**이다.

## 1. 지정과제 문구 → 화면/기능 → 사용 API → 테스트 → 시연 시나리오

| 지정과제 요구 | 현재 화면/기능 | 사용 API/데이터 | 테스트 | 시연 시나리오 | 상태 |
|---|---|---|---|---|---|
| 여행사·지자체 실무자 대상 | `/projects/new`의 `role`(TRAVEL_AGENCY\|LOCAL_GOV) 입력, 저장·표시 | 없음(입력값만) | 없음(role 분기 로직 자체가 없음) | 없음 | **미구현** — `role`은 DB에 저장·표시만 되고 domain 계층(`src/lib/domain/*`)에는 전혀 등장하지 않음(`role` 리터럴 검색 결과 domain 폴더 0건, [buildDnaEngineInput.ts](../src/lib/services/buildDnaEngineInput.ts)/[analyzeProject.ts](../src/lib/services/analyzeProject.ts)의 `scoringInput`에도 없음) |
| 타깃·지역·기간·콘셉트 조건 입력 | `/projects/new` 폼 7개 지역, 여행월, 연령/동반유형/목적/기간/예산/이동수단/그룹규모/선호·제외테마/메모 | `ProjectInput` 테이블 | `project-input-schema.test.ts`(6), `ProjectInputForm.test.tsx`(3) | 입력→분석 E2E 1건 | **부분 구현** — 대부분 필드는 `targetFit`/`feasibilityFit`에 실제 반영([scoring-model.md](scoring-model.md) §3). 단 `nationality`(FOREIGN/DOMESTIC)와 `memo`는 저장만 되고 산출물에 미반영, `preferredThemes`/`excludedThemes`는 템플릿명/콘셉트 문자열 포함 검사 수준([strategy.ts](../src/lib/domain/strategy.ts)) |
| 데이터 기반 관광 수요·관광지 분석 | `/projects/[id]/analysis` DNA 5축 레이더, 근거 보기 패널 | `AreaTarDemDsService`(체류/소비), `AreaTarResDemService`(서비스수요), `AreaTarDivService`(다양성), `KorService2`(POI) — [public-api-status.md](public-api-status.md) | `dna.test.ts`(9), `strategy.test.ts`(12) | 데모 프로젝트 열람 E2E | **핵심 구현됨, 신뢰성 결함 있음** — `isSnapshotFallback: false`가 [metricCohort.ts:23](../src/lib/services/metricCohort.ts#L23)과 [buildDnaEngineInput.ts:45](../src/lib/services/buildDnaEngineInput.ts#L45)에 하드코딩되어, fixture/추정값도 `LIVE`로 표시될 수 있음(provenance 필드 자체가 schema에 없음) |
| 맞춤형 상품 운영 초안 | `/projects/[id]/plan` 코스/체류시간/체크리스트/위험/KPI 편집, 카카오맵 동선 | POI(TourAPI), 카카오맵 JS SDK | `planBuilder.test.ts`(11), `PlanEditor.test.tsx`(10), `CourseMap.test.tsx`(5) | 전략선택→실행안 편집→인쇄 E2E | **구현됨** — 이동시간은 Haversine 직선거리 추정(도로 경로 아님), 실행 가능성 경고 포함 |
| 다채널 마케팅 콘텐츠 | 없음 | — | 없음 | — | **미구현(Phase 5)** — SNS/블로그/랜딩 카피 생성 기능 자체가 코드에 없음(검색 결과 KPI 항목 문구 "SNS 언급량"만 존재, [strategyTemplates.ts:145,189](../src/lib/domain/strategyTemplates.ts)) |
| 빠른 상품화 | 입력→분석→전략선택→실행안→인쇄 흐름 | — | E2E 1건(전체 흐름) | 전체 흐름 E2E | **구현됨** — 단, "조건 수정 후 안전한 재분석"(Phase 6)이 없어 조건이 틀렸을 때 새 프로젝트를 다시 만들어야 함 |

## 2. LIVE/CACHED/CURATED/ESTIMATED/MISSING 구분과 화면 표시

- **현재 스키마의 실제 상태 값**: `AxisStatus`는 `LIVE | SNAPSHOT | MISSING` 3종뿐([schema.prisma:67-71](../prisma/schema.prisma#L67-L71)). 마스터 프롬프트가 요구하는 `LIVE_API/CACHED_API/CURATED/ESTIMATED/MISSING` 5종 provenance는 **schema에 존재하지 않는다.**
- `NormalizedMetric`, `Evidence`, `Poi`, `PoiRelation` 어느 모델에도 provenance/snapshotId 컬럼이 없다([schema.prisma:166-223](../prisma/schema.prisma#L166-L223)).
- `overallDataMode`(`LIVE|HYBRID|SNAPSHOT`)와 `liveAxisCount`가 UI의 `LIVE 5/5` 배지로 이어지는데, 축 상태 계산이 `isSnapshotFallback: false` 하드코딩에 의존하므로 **fixture/추정값이 섞여도 `LIVE 5/5`가 나올 수 있다** — Phase 1의 핵심 문제가 현재도 그대로 존재함을 코드로 확인.
- Network 축은 `sourceCode: "POI_RELATION"` 하나로만 표시되고([buildDnaEngineInput.ts:43](../src/lib/services/buildDnaEngineInput.ts#L43)), POI 수(TourAPI 실제 데이터 가능)와 연관관광지 관계 수(현재 `poiRelation.ts` 어댑터 — 실제 API 여부 미확인, [public-api-status.md](public-api-status.md) 6번 항목 "정식 서비스명 미확인")를 구분하지 않는다.

## 3. 공공데이터 장애·결측 시 기능 유지 방식

- `DATA_MODE` 환경변수(`live|hybrid|snapshot`)로 라이브 호출 여부를 제어([.env.example](../.env.example)).
- 축 단위로 `MISSING`(score=null) 처리되며 전체 분석이 실패하지 않는다 — [dna.ts:52](../src/lib/domain/dna.ts#L52) `entries.length === 0 → MISSING`.
- 다만 **API 실패 시 기존 성공값을 유지하는 "CACHED_API" 재사용 경로는 없다** — `DataSnapshot.rawPayload`가 실제 동기화 과정에서 저장되지 않고([syncService.ts] 확인 필요, Phase 1-4 대상) seed에서만 채워지므로, 장애 복구 시 최근 성공 스냅샷을 재사용하는 흐름이 실질적으로 비어 있다.

## 4. MVP 완료 여부와 시연 가능한 URL

- 배포 URL: https://tour-dna.lib.lc (사이트 전체 비밀번호 게이트 `SITE_ACCESS_PASSWORD` 적용 중, [proxy.ts](../src/proxy.ts))
- 핵심 흐름(입력→분석→전략선택→실행안 편집→카카오맵→인쇄)은 E2E 8건으로 매 커밋 검증되고 있어 **시연 가능한 상태**.
- 다만 아래는 심사 시 바로 드러날 수 있는 리스크:
  1. `LIVE 5/5` 표시가 실제로는 추정값 포함 여부와 무관하게 뜰 수 있음(데이터 신뢰성 항목에서 감점 가능성).
  2. 다채널 홍보 카피가 아예 없어 지정과제 7번의 "다채널 마케팅 콘텐츠" 요구를 직접 충족하지 못함.
  3. 사이트 전체 비밀번호 하나로 모든 프로젝트가 열리거나 막혀, 프로젝트별 소유권 개념이 없음(공개 심사 시연에는 문제 없으나 실 서비스 신뢰성 항목에서 지적 가능).
  4. 대전 DNA는 유성구 지표, 추천 POI는 대전 전체라는 행정범위 불일치가 화면에 라벨 하나로만 표시됨(`"대전광역시 (DNA 지표는 유성구 기준)"`, [regionQueries.ts]) — 근거 패널에 코호트 수(N)나 정규화 범위는 표시되지 않음.

## 5. 다음 단계

이 매핑은 `docs/implementation-plan.md`의 Phase 8→10→1→2→…→12 순서 계획과 함께 읽는다. Phase별 상세 완료 조건은 `docs/implementation-status.md` 참고.
