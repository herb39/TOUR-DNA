# 공모전 지정과제 7번 기능 매핑 (2026-07-23 작성, 2026-07-26 Phase 4 반영 갱신)

> 최초 기준 커밋: `5e16dec`. 2026-07-26 갱신 시점 로컬 HEAD는 Phase 5-A~5-C+보완, 문서 갱신, Phase 4
> 순으로 이어진 최신 커밋이며, 그 시점에는 `origin/main`(당시 `a13e98d`)에 미반영이었다. 이 문서는
> `TOUR-DNA-Claude-Code-Implementation-Prompt.md`의 최초 검토용 프롬프트 4번 항목 산출물로 시작했다.
> 아래는 **현재 저장소를 직접 읽어 재검증한 사실**이다. "구현됨"은 로컬 코드 기준이며, 배포 URL
> (https://tour-dna.lib.lc)에 아직 반영되지 않은 항목은 별도로 표시한다.
>
> **2026-07-30 갱신**: `git log`/`git status`로 재확인한 결과, 위에서 미반영이라고 적었던 커밋들을
> 포함해 이 문서가 작성된 이후의 모든 로컬 커밋이 현재는 `origin/main`에 push되어 있다. 이 문서
> 본문(아래 표·항목별 설명)에 남아 있는 "아직 origin/main에 push되지 않았다"류 서술은 GitHub push
> 여부만 가리키며, 이제는 최신 사실과 다르다 — 실제 운영 배포(Vercel)·DB migration 적용 여부는 이
> 갱신에서 별도로 조회하지 않았으므로 각 항목의 관련 서술은 그대로 두었다(GitHub 반영과 운영 배포는
> 서로 다른 확인이다).
>
> **2026-08-01 갱신**: 남아 있던 "DB migration 미적용/배포 미반영" 서술을 실제로 해소했다 — Neon
> Production DB에 관련 migration을 전부 적용하고, Vercel Production(`tour-dna.lib.lc`)에서 Playwright
> 실 브라우저로 홍보자료·역할별 채별화·대표 시나리오 3개까지 검증을 완료했다. 아래 표의 "다채널
> 마케팅 콘텐츠"·"여행사·지자체 실무자 대상" 행을 이 사실대로 갱신했다. 상세는
> [docs/implementation-status.md](implementation-status.md)의 "Production 실사용 검증 및 대표
> 시나리오 완성(2026-08-01)" 절 참고.
>
> **2026-08-07 갱신**: 지원지역을 7개에서 **27개**로 확대했다(20개 신규 추가, Batch 3 추가 10곳은
> API 일일 호출 한도로 보류 — 미검증·미반영). 실제 공공데이터 API로 관광지·핵심 지표를 수집하는
> 방식은 그대로이며, 지역 유형(해양·역사·산악·도심·휴양·미식 등)이 다양해졌다. 유사지역 비교는
> 대상 지역 제외 최대 26곳까지 가능해졌다(기존 6곳) — 다만 이는 여전히 "전국 226개 시/군/구 전체
> 비교"가 아니라 "현재 지원하는 27곳 내 비교"다. 상세는
> [docs/data-dictionary.md](data-dictionary.md)와
> [docs/implementation-status.md](implementation-status.md)의 "지원지역 확대 Batch 1+2(2026-08-07)"
> 절 참고. 아래 표의 "7개 지역" 관련 서술은 이 갱신으로 지역 수만 27개로 바뀐 것이며, 그 외
> 설명(입력 항목 구성, `isSnapshotFallback` 관련 서술 등)은 이번 지역 확대와 무관해 별도로
> 재검증하지 않았다.

## 1. 지정과제 문구 → 화면/기능 → 사용 API → 테스트 → 시연 시나리오

| 지정과제 요구 | 현재 화면/기능 | 사용 API/데이터 | 테스트 | 시연 시나리오 | 상태 |
|---|---|---|---|---|---|
| 여행사·지자체·축제 기획자 실무자 대상 | `/projects/new`의 `role`(TRAVEL_AGENCY\|LOCAL_GOV\|FESTIVAL_PLANNER) 입력, 저장·표시, 분석 화면 요약에도 노출, 대표 시나리오 카드 3개로 역할별 입력 재현 가능 | 없음(입력값 + 기획 규칙) | `audienceContext.test.ts`(27), `strategy.test.ts` 역할 관련 3건, `contestScenarios.test.ts`(24), `roleDifferentiation.test.ts`(7, 2026-08-07) | 강릉(여행사)/경주(지자체) 대표 시나리오 카드 — 2026-08-01 Production 브라우저(Playwright)로 실제 재현·검증 완료 | **구현됨 + 배포 완료(2026-08-01 Production 검증, 2026-08-07 위험 목록 보완)** — DNA 5축 원시 점수와 예산 금액은 역할과 무관하게 그대로 유지되고, 전략 적합도(`roleFit`)·추천 근거·KPI·체크리스트·위험 목록·일부 예산 협력 대상 설명이 역할별로 달라진다. 상세 표와 검증 근거는 아래 "1-A. 역할별 맞춤 기획" 절 참고 |
| 타깃·지역·기간·콘셉트 조건 입력 | `/projects/new` 폼 27개 지역(2026-08-07 기준, 최초 작성 시점은 7개), 여행월, 연령/동반유형/목적/기간/예산/이동수단/그룹규모/선호·제외테마/메모, 상단 대표 시나리오 카드 3개(강릉/경주/제천)로 원클릭 프리셋 | `ProjectInput` 테이블 | `project-input-schema.test.ts`(6), `ProjectInputForm.test.tsx`(6), `audienceContext.test.ts`(27), `contestScenarios.test.ts`(24) | 입력→분석 E2E 1건(대표 시나리오 카드 자체는 단위 테스트로 검증, E2E 미확장) | **구현됨(2026-07-26 Phase 4로 국적·테마 반영 추가, 2026-07-27 대표 시나리오 카드 추가)** — `nationality`(FOREIGN/DOMESTIC)는 `feasibilityFit`(운영 적합도)에 템플릿별 CURATED 서비스 준비도로 반영, `preferredThemes`/`excludedThemes`는 내부 카테고리 분류([strategy.ts](../src/lib/domain/strategy.ts) `targetFit`)로 반영된다. `memo`는 여전히 저장만 되고 산출물에 미반영(자유 서술 메모라 구조화 반영 대상이 아님) |
| 데이터 기반 관광 수요·관광지 분석 | `/projects/[id]/analysis` DNA 5축 레이더, 근거 보기 패널 | `AreaTarDemDsService`(체류/소비), `AreaTarResDemService`(서비스수요), `AreaTarDivService`(다양성), `KorService2`(POI) — [public-api-status.md](public-api-status.md) | `dna.test.ts`(9), `strategy.test.ts`(12) | 데모 프로젝트 열람 E2E | **핵심 구현됨, 신뢰성 결함 있음** — `isSnapshotFallback: false`가 [metricCohort.ts:23](../src/lib/services/metricCohort.ts#L23)과 [buildDnaEngineInput.ts:45](../src/lib/services/buildDnaEngineInput.ts#L45)에 하드코딩되어, fixture/추정값도 `LIVE`로 표시될 수 있음(provenance 필드 자체가 schema에 없음) |
| 맞춤형 상품 운영 초안 | `/projects/[id]/plan` 코스/체류시간/체크리스트/위험/KPI 편집, 카카오맵 동선 | POI(TourAPI), 카카오맵 JS SDK | `planBuilder.test.ts`(11), `PlanEditor.test.tsx`(10), `CourseMap.test.tsx`(5) | 전략선택→실행안 편집→인쇄 E2E | **구현됨** — 이동시간은 Haversine 직선거리 추정(도로 경로 아님), 실행 가능성 경고 포함 |
| 다채널 마케팅 콘텐츠 | `/projects/[id]/plan`의 "홍보자료" 섹션 — 상단 포스터형·카드뉴스형 시각 미리보기(Phase 1) + 하단 채널별 텍스트 편집(제안서 요약/랜딩/Instagram/블로그/카드뉴스/역할별 자료 생성·편집·복사, 채널 우선순위 역할별 정렬), 인쇄 화면 출력 | 없음(저장된 실행안/Evidence만 재사용, LLM·외부 API·이미지 미사용) | `promoContent.test.ts`(29 — Phase 2 공통 채널 역할 반영 7건 포함), `promoContentAdapter.test.ts`(14), `promoContentService.test.ts`(16), `PromoContentEditor.test.tsx`(16+11), `promoPreview.test.ts`(13), `PromoPreviewPanel.test.tsx`(4), `PrintPage.test.tsx`(6), `promoContentFormat.test.ts`, `promoContentSchema.test.ts` | 2026-08-01 Production 브라우저(Playwright)로 홍보자료 생성→역할별 채널 순서→전체 복사→새로고침/재접속 유지까지 검증 완료. 2026-08-07 포스터·카드뉴스 미리보기와 공통 채널 역할별 관점 반영을 기존 Production 프로젝트(여행사/DMC·지자체/관광재단)의 실제 실행안 데이터로 재검증 | **구현·배포·검증 완료(2026-08-01, 2026-08-07 미리보기 UI 및 역할별 관점 반영 추가)** — 관련 커밋이 `origin/main`에 push되어 있고, `SelectedPlan.promoContent`·`StrategyResult` 차별화 필드 migration 모두 원격 Production Neon DB에 적용 완료. **배포 URL(`tour-dna.lib.lc`)에서 실제로 확인 가능.** 제안서 요약·랜딩·Instagram·블로그·카드뉴스 5개 공통 채널도 이제 역할(여행사/DMC·지자체/관광재단·축제 기획자)에 따라 강조점과 문장 구성이 실제로 달라진다 — DNA 5축 원시 점수와 대표 코스·근거 데이터 같은 사실 값은 역할과 무관하게 동일하게 유지된다. LLM은 아직 쓰지 않는다(다음 Phase 후보). 상세: [docs/implementation-status.md](implementation-status.md)의 "Production 실사용 검증 및 대표 시나리오 완성(2026-08-01)" 절, "홍보자료 포스터·카드뉴스 미리보기 Phase 1(2026-08-07)" 절, "홍보자료 공통 채널 역할별 관점 반영 Phase 2(2026-08-07)" 절 |
| 빠른 상품화 | 입력→분석→전략선택→실행안→인쇄 흐름 + 조건 수정 후 안전한 재분석(`/projects/[id]/edit`) | — | E2E 1건(전체 흐름) + `updateProjectAndReanalyzeAction.test.ts`(11) | 전체 흐름 E2E | **구현됨(2026-08-02 Phase 6 완료)** — 조건이 틀렸을 때 새 프로젝트를 만들지 않고 같은 프로젝트에서 조건을 고쳐 재분석할 수 있다(재분석 성공 시 기존 실행안·홍보자료는 삭제되고 새 결과로 교체됨을 명확히 경고) |
| 사업 사전검증 | `/projects/[id]/plan`·`print` "사업 사전검증 리포트" 섹션 — 추진 권고(권장/조건부 권장/보완 후 재검토), 데이터 신뢰도·POI 공급 충분성·이동 현실성·지역 차별성 4개 신호, 주요 위험, 필수 보완사항 | 없음(DNA·POI 공급 부족 판정·이동 경고·유사지역 비교·위험·대응안 등 이미 계산된 값만 재사용) | `preLaunchValidation.test.ts`(15), `contestScenarios.test.ts` 강릉/경주/제천 차별화 4건 | 전략선택→실행안 화면에서 사전검증 리포트 확인, 인쇄 화면 요약 대조 | **구현됨(로컬+테스트, 2026-08-03, push 전)** — 단일 평균 점수로 결론 내지 않고, 4개 신호 중 하나라도 치명적(BLOCKER)이면 나머지가 좋아도 "보완 후 재검토"로 판정한다(`preLaunchValidation.ts`) |

## 1-A. 역할별 맞춤 기획 — 하나의 데이터 진단, 세 가지 실무 관점(2026-08-07 정리)

기존 관광 데이터 서비스가 하나의 분석 결과를 제공하는 데 그친다면, TOUR-DNA는 동일한 지역 데이터를
각 실무자의 업무 목적에 맞는 전략과 실행안으로 변환한다. 같은 지역이라도 여행사/DMC는 판매 가능한
관광상품 관점, 지자체/관광재단은 지역 활성화 사업 관점, 축제 기획자는 프로그램 운영 관점으로 결과를
활용할 수 있다.

핵심 설계는 다음 순서로 이어진다.

1. 지역 공공데이터 수집·정규화
2. 관광 DNA 5축 진단(체류·소비·다양성·서비스 수요·네트워크)
3. 동일 지역·동일 기준월이면 위 진단 결과를 역할과 무관하게 그대로 유지
4. 사용자가 입력한 역할을 전략 후보의 우선순위 계산에 반영
5. 역할별 실행 관점(KPI·체크리스트·위험·일부 예산 협력 대상 설명)을 생성

| 영역 | 공통/역할별 | 설명 |
| --- | --- | --- |
| DNA 5축 점수 | 공통 | 동일 지역·동일 기준월이면 역할에 관계없이 동일 |
| 유사지역 비교 | 공통 | 데이터 기반 비교 결과 유지, 역할이 비교 대상이나 산식을 바꾸지 않음 |
| 전략 적합도(roleFit) | 역할별 | 역할별 목표 우선순위를 전략 점수의 한 요소(10% 가중치)로 반영 |
| 전략 순위 | 역할별 가능 | roleFit 반영으로 상위 후보 구성이 역할마다 달라질 수 있음 |
| 추천 근거 문구 | 역할별 | 역할 라벨과 실제 계산된 점수·이유가 함께 달라짐(단순 치환 아님) |
| KPI | 역할별 | 판매 전환율·정책 성과 보고 지표·프로그램 운영 지표 등 |
| 운영 체크리스트 | 역할별 | 각 주체의 실무 관점을 반영한 항목 추가 |
| 위험요소 | 역할별 | 예약 취소·노쇼(여행사), 정책 보고 시점 불일치(지자체), 혼잡·안전(축제)(2026-08-07 보완) |
| 예산·협력 대상 설명 | 일부 역할별 | 6개 항목 중 2개가 역할별로 다른 서술을 쓴다(금액 자체는 역할과 무관) |
| 홍보 문구(제안서 요약·랜딩·Instagram·블로그·카드뉴스) | 역할별(Phase 2, 2026-08-07) | 대표 코스·근거 데이터는 동일하게 두고, 목적·강조점·마무리 문구만 여행사(판매)·지자체(사업 추진)·축제 기획자(프로그램 운영) 관점으로 달라짐 |

이 기능의 차별점은 다음과 같이 요약한다.

- 하나의 관광 데이터를 세 역할이 서로 다른 실무 목적으로 활용할 수 있다.
- 사용자의 역할에 맞춰 같은 데이터 진단 결과를 재해석한다 — 데이터 자체를 역할에 맞게 왜곡하지 않는다.
- 역할별로 완전히 분리된 알고리즘을 복제하지 않고, 공통 결과 엔진(`strategy.ts`/`planBuilder.ts`) 위에
  역할 우선순위 테이블(`audienceContext.ts`)을 적용하는 구조다.
- 동일한 데이터 기반이므로 세 역할의 결과를 서로 비교하고 근거를 설명할 수 있다.

검증은 동일 지역·동일 기준월·동일 여행월·동일 타깃·동일 목표·동일 테마로 조건을 고정하고 역할만
바꿔 비교하는 방식으로 수행했다(Production에 새 임시 프로젝트를 만들지 않고 순수 함수 직접 호출과
`tests/unit/roleDifferentiation.test.ts`로 검증). DNA 원시 축 점수는 역할과 무관하게 동일했고,
roleFit·KPI·체크리스트·위험 목록은 역할마다 실질적으로 달랐다. 상세 내용은
[docs/implementation-status.md](implementation-status.md)의 "역할별 맞춤 기획 차별화 검증·보완
(2026-08-07)" 절 참고.

이 기능이 "AI가 알아서 역할별로 완전히 다른 분석을 수행한다"는 뜻은 아니다 — DNA 진단·정규화 공식은
역할과 무관하게 하나이며, 역할은 그 진단 이후 전략·실행 단계의 우선순위와 관점에만 반영된다.

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
  2. 다채널 홍보 카피 생성 기능(Phase 5)과 역할·국적·테마·여행월 조건별 반영(Phase 4)은 로컬에는
     구현·테스트가 끝났지만(위 표 참고) **아직 이 배포 URL에는 반영되지 않았다** — 원격 push·(Phase 5는)
     DB migration 적용·재배포가 끝나야 지정과제 7번의 "다채널 마케팅 콘텐츠"와 "여행사·지자체 실무자
     대상" 요구가 실제 시연 화면에서도 충족된다.
  3. 사이트 전체 비밀번호 하나로 모든 프로젝트가 열리거나 막혀, 프로젝트별 소유권 개념이 없음(공개 심사 시연에는 문제 없으나 실 서비스 신뢰성 항목에서 지적 가능).
  4. 대전 DNA는 유성구 지표, 추천 POI는 대전 전체라는 행정범위 불일치가 화면에 라벨 하나로만 표시됨(`"대전광역시 (DNA 지표는 유성구 기준)"`, [regionQueries.ts]) — 근거 패널에 코호트 수(N)나 정규화 범위는 표시되지 않음.

## 5. 다음 단계

Phase 1, Phase 5, Phase 4, 대표 시나리오 3개(P0-2)가 로컬 구현이 끝났다(위 표,
[docs/implementation-status.md](implementation-status.md) 참고). 다음 순서는 P0-3(DB migration 적용 +
통합 검증, 강릉·경주·제천 시나리오의 실제 브라우저 확인 포함) → P0-4(원격 반영 + 배포)이며, 근거와
세부 항목은 `docs/implementation-status.md`의 "다음 작업 순서" 절과 `docs/implementation-plan.md`
Part 2를 함께 읽는다.
