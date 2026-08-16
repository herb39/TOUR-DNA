# 구현 상태 (2026-08-13 갱신 — Network DNA 재설계(Phase 3) 반영, 전국 255/255 동기화·DNA normalization·ACTIVE Dataset·Phase 2-B/2-C/2-D·홍보 LLM 반영)

> **2026-08-13 최신 요약**: Network DNA 산식을 attraction+PoiRelation(연관관광지)+coverage(50/20/30)에서
> attraction+음식/숙박/체험 조합 가능성(B/H1, 50/50)으로 재설계했다(Phase 3) — PoiRelation이 대전/
> 제천/양양 3곳에만 존재하는 seed 잔재라 그 3곳만 부당하게 최상위권을 점유하던 문제를 해소했다.
> `MODEL_VERSION`을 `tour-dna-v1.1.0`으로 증가시켰다. 상세는 맨 아래 "## 2026-08-13 갱신 — Phase 3"
> 절 참고.
>
> **2026-08-12 최신 요약(2)**: TOUR_INFO(POI 목록 API)는 baseYm에 종속되지 않는 정적 데이터인데도
> 새 STAGING baseYm마다 전국 255개 지역을 무조건 재호출하던 낭비를 없앴다(Phase 2-D) — region의
> 최근 TOUR_INFO가 TTL(60일) 이내면 API를 다시 호출하지 않고 기존 POI를 그대로 재사용한다. 상세는
> 맨 아래 "## 2026-08-12 갱신 — Phase 2-D" 절 참고.
>
> **2026-08-12 최신 요약(1)**: completeness/audit(Phase 2-A)만 통과하면 바로 승격되던 것과 달리,
> **STAGING dataset이 ACTIVE로 승격되려면 이제 DNA drift gate까지 통과해야 한다(Phase 2-C)** —
> `npm run dataset:activate`가 내부적으로 completeness → audit → DNA drift → 판정 순으로 확인하고
> PASS일 때만 실제로 승격한다. 상세는 맨 아래 "## 2026-08-12 갱신 — Phase 2-C" 절 참고.
>
> **2026-08-11 최신 요약**: 이 문서는 2026-08-07 이후 갱신이 멈춰 있었다. 그 사이(2026-08-08~11)
> 진행된 핵심 변경 — 전국 SIGUNGU 255/255 동기화 완료, Demand/Spend DNA normalization을 log1p로
> 개선, 검증된 데이터셋(ACTIVE Dataset, Phase 2-A) 도입, 최신 데이터 발견 + 증분/재개형 전국
> 동기화(Phase 2-B) 도입, OpenRouter 무료 LLM(Gemma) 기반 홍보 콘텐츠 생성 도입 — 은 "## 2026-08-11
> 종합 갱신" 절에 정리했다. 그 사이 시점의 기존 섹션(Batch 1/2/3 지역 확대 등)은 그대로 보존한다.

> 최초 작성 2026-07-23(REVIEW_ONLY 재검증), 2026-07-26 Phase 5-A~5-C+보완·문서 갱신·Phase 4, 2026-07-27
> P0-2(대표 시나리오 3개), 2026-07-29 사용자 화면 데이터 신뢰도 1차 개선, 2026-07-29~30 역할 적합도·
> 관광 지표 요약 2차 개선, 2026-07-31 전략 3안 구조적 차별화(Phase 4-보완), **2026-08-01 Production
> DB migration 적용 + Vercel 배포 실사용 검증(P0-3/P0-4 완료)**, **2026-08-07 지원지역 7→27개 확대
> (Batch 1+2, Batch 3은 API 일일 호출 한도로 보류)** 순으로 갱신. 맨 아래 새 섹션
> "지원지역 확대 Batch 1+2(2026-08-07)"에 이번 라운드의 상세 내역이 있다.
> **2026-08-01 기준 실제 확인한 결과, 이 문서가 다루는 커밋은 모두 `origin/main`에 push되어 있고,
> 원격 Neon production DB에도 모든 migration이 적용되어 있으며, Vercel Production
> (`https://tour-dna.lib.lc`, 커밋 `afba7e93`)에서 홍보자료 생성을 포함한 전체 사용자 흐름이 실제
> Chromium(Playwright)으로 검증됐다** — 과거 버전이 "DB 적용·배포·브라우저 검증 미완료"로 적어뒀던
> 항목들은 이 갱신으로 해소됐다(각 항목에서 구분 표기).
> 상태값: `NOT_STARTED` / `BLOCKED` / `IN_PROGRESS` / `DONE(로컬)` / `DONE(배포)`.
> 각 항목은 실제 코드/스키마/커밋 이력을 읽고 확인한 결과이며, 마스터 프롬프트(`TOUR-DNA-Claude-Code-Implementation-Prompt.md`)가
> "확인된 핵심 문제"로 지목한 항목이 지금도 재현되는지 파일·라인 단위로 표시한다.

## 사용자 화면 데이터 신뢰도 1차 개선 (2026-07-29)

배포된 웹에서 확인된, 사용자 신뢰도를 해치는 표시 문제 4건을 코드 수정으로 바로잡았다(신규 기능
추가 아님, 테스트/검증은 별도 진행 — 이 문서 갱신 시점 기준 타입체크/린트/테스트를 재실행하지
않았다).

1. **기준월 화면별 불일치**: 메인 화면은 `getLatestDataFreshness()`(DB의 최신 `DataSnapshot.baseYm`)를
   쓰는데, 새 기획/분석/인쇄 화면은 `process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM`(코드 상수)을
   따로 써서 서로 다른 달이 보였다. 분석/인쇄 화면은 이제 그 프로젝트의 `Evidence.baseYm`(실제 분석에
   쓰인 값)을 우선 표시하고, 지표마다 기준월이 다르면 그 사실을 그대로 안내한다
   (`summarizeEvidenceBaseYms`, `src/lib/format.ts`). 새 기획 화면은 실제 분석에 쓰이는 값(env 상수)은
   그대로 두되, 메인과 같은 DB 조회 결과("사용 가능 최신 데이터")를 값이 다를 때만 함께 보여준다.
2. **"LIVE 5/5"인데 "데이터 근거 없음" 모순**: 홍보자료 생성(`promoContentService.ts`)이 `AnalysisResult`
   전체가 아니라 `StrategyResult.evidences`(전략 전용 근거, 비어 있을 수 있음)만 보고 "근거 없음"
   문구를 넣고 있었다. 전략 전용 근거가 비어 있으면 같은 분석의 축(axis) 근거로 대체하도록 fallback을
   추가했다(스키마 변경 없음, 같은 Evidence 모델 재사용). 단, **이미 저장된 과거 홍보자료 텍스트는
   재생성 전까지 그대로 남는다** — 이번 수정은 이후 (재)생성분부터 적용된다.
3. **비어 있는 역할 적합도 표시**: `roleFit` 도입 이전에 생성된 `StrategyResult.scoreBreakdown`(JSON)에는
   그 키 자체가 없어 화면에 빈 값으로 보였다. `StrategyCard.tsx`가 값이 없으면 "재분석 필요"로 명시
   표시하도록 고쳤고, 각 적합도 항목에 짧은 설명(title 툴팁)을 추가했다.
4. **지표·출처 코드 미한글화**: `EvidenceTable`과 인쇄 화면의 "데이터 근거" 표가 `metricCode`/
   `sourceCode`를 영문 그대로 보여주고 있었다(홍보자료 문구는 이미 한글화돼 있었음). 기존에
   `promoContent.ts`에만 있던 한글 라벨 매핑을 `src/lib/format.ts`로 공용화(`metricLabel`)하고, 출처는
   새 매핑을 만들지 않고 기존 `DATA_SOURCE_SEED`의 한글명을 재사용하는 `sourceLabel`을 추가해 두 화면
   모두에 적용했다.

이번 라운드에서 제외한 항목(별도 작업): 테스트 프로젝트 숨김/삭제, 최근 프로젝트 목록 제한, 방문자
요약 카드, 방문자수-전략 연결, POI 테마 필터링, 외부 API 실패 로그 개선, 신규 API 연동, 데이터
동기화, Prisma schema 변경.

## 역할 적합도·관광 지표 요약 2차 개선 (2026-07-29)

### 1) 역할 적합도 "재분석 필요" 근본 원인 조사 결과

코드를 직접 추적한 결과 **신규 분석 경로 자체에는 버그가 없다**: `computeRoleFit()`
(`src/lib/domain/audienceContext.ts`)은 role이 없어도 항상 `{score: number, adjustment}`를
반환하고(중립값 50, undefined/NaN 없음), `computeStrategies()`(`src/lib/domain/strategy.ts`)는 이
값을 항상 `scoreBreakdown.roleFit`에 포함해 저장한다(`analyzeProject.ts`). "재분석 필요"가 보이는
유일한 경우는 `roleFit` 필드 도입 **이전**에 생성된 레거시 `StrategyResult.scoreBreakdown`(JSON)에
그 키 자체가 없는 경우이며, 이는 1차 개선에서 이미 올바르게 처리되어 있었다. 따라서 이번 라운드는
"버그 수정"이 아니라 **이미 계산되고 있던 근거를 화면에 실제로 노출**하는 작업이다:

- `computeRoleFit()`이 매번 계산하는 `adjustment.reason`(예: "여행사 직원 관점의 목표 우선순위(기획
  규칙) 반영")을 그동안 버려왔다(`computeStrategies()`에서 `score`만 구조분해). 이제
  `StrategyScoreBreakdown.roleFitReason?: string`(신규, optional — Prisma는 `Json` 타입이라 마이그레이션
  불필요)에 그대로 보존해 `StrategyCard.tsx`의 "역할 적합도" 항목 아래와 인쇄 화면 "선택 전략"
  섹션에 노출한다. role이 없던 분석(중립값 50)은 `adjustment`가 `null`이라 `roleFitReason`도 없음 —
  화면은 이 경우 이유 문구를 그냥 생략한다(허위 문구 없음).
- `buildReasons()`의 역할 관련 문장도 하드코딩 텍스트 대신 같은 `roleFitReason`을 재사용하도록 바꿨다.
- `prisma/schema.prisma`의 `StrategyResult.scoreBreakdown` 주석이 `roleFit` 필드를 누락하고 있던
  문서 드리프트를 주석만 수정했다(스키마/컬럼 변경 없음, 마이그레이션 없음).
- 레거시 데이터 정책은 변경하지 않았다 — `roleFit` 자체가 없는 과거 `StrategyResult`는 여전히
  "재분석 필요"로 표시된다(분석 화면·인쇄 화면 동일 정책).

### 2) 핵심 관광 지표 요약카드

- 방문자수(`METRIC_CODES.VISITOR_CNT`, 단위 "명" — `prisma/seed.ts` 실제 저장 단위로 확인)와 화면
  표시용 증감률(`METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY`, 신규)을 `computeDemandAxis()`
  (`src/lib/domain/dna.ts`)에서 **축 점수 계산이 끝난 뒤에만** `evidence` 배열에 추가한다 — 기존
  `DEMAND_VISITOR_GROWTH`(전월 대비, 수요 점수 반영)는 그대로 두어 DNA 5축 공식은 전혀 바뀌지 않았다.
- 증감률 비교 기준은 **전년 동월 우선, 없으면 직전 확인월로 대체**한다
  (`previousYearSameMonth()`/`previousBaseYm()`, `src/lib/services/buildDnaEngineInput.ts`). 비교월
  방문자수가 0이면(나눗셈 불가) 증감률을 계산하지 않고 카드 자체를 만들지 않는다(허위 0% 금지). 실제
  0%(비교값과 동일)는 "변화 없음(0%)"으로 명시해 "데이터 없음"과 구분한다(`formatSignedPercent`,
  `src/lib/format.ts`).
- 체류(`STAY`)/소비(`SPEND`) 지표의 실제 저장 단위는 **"지수"**다(`prisma/seed.ts` 확인 — 시간·원이
  아니다). 과제 예시가 든 "6.2시간"/"84.3억 원" 같은 단위는 실제 데이터에 존재하지 않아 **임의로
  환산하지 않았고**, "체류 강도 X.X 지수" 형태로 원래 단위 그대로 표시한다(`formatIndexValue`).
- 카드 구성은 `src/lib/domain/tourismMetricSummary.ts`(신규, 순수 함수) 하나로 중앙화했고 분석
  화면(`analysis/page.tsx`)과 인쇄 화면(`print/page.tsx`)이 이 함수를 그대로 공유한다 — 값 자체가
  없는 지표는 카드를 만들지 않는다(0으로 지어내지 않음). 각 카드는 실제 저장된 `baseYm`/`sourceCode`를
  그대로 노출해 지표별 기준월이 달라도 뭉개지 않는다.

### 3) 관광 지표 → 전략 추천 근거 연결

- `buildReasons()`(`src/lib/domain/strategy.ts`)에 `buildMetricGroundedReason()`을 추가해 기존
  근거 생성 함수를 확장했다(별도 로직 신설 아님). 화면 표시용 증감률 근거(`dna.demand.evidence`에서
  `DEMAND_VISITOR_GROWTH_DISPLAY` 검색)가 없으면 문장을 만들지 않는다.
- 근거가 있으면: 방문자↑ + 체류 지수(`dna.stay.score`) 비교군 내 상대적으로 낮음(<50) + 전략이 숙박
  접점을 포함 → 체류형·숙박 연계 우선 추천 문구. 방문자↑ + 소비 지수 낮음 + 음식/체험 접점 포함 →
  유료 체험·로컬 상품 연계 문구. 방문자↓ + 수요 적합도(`dna.demand.score`) 상대적으로 높음(≥60) →
  강점 테마 중심 타깃 상품 문구. 위 조건에 모두 해당하지 않으면(뚜렷한 패턴 없음) "현재 확보된 방문자
  및 관광 지표를 바탕으로 이 전략을 추천합니다" 같은 제한된 일반 문구로 대체한다(Section 5가 명시
  허용한 폴백 — 존재하지 않는 지역 평균/전국 평균은 어디에서도 사용하지 않았다).
- 이 문장은 전략별 `consumptionTouchpoints`(숙박/음식/체험 포함 여부)에 따라 갈리므로, 같은 분석
  안에서도 전략마다 다른 문구가 나올 수 있다. 다만 세 전략 모두 위 패턴에 해당하지 않으면 동일한
  일반 폴백 문구가 나올 수 있다 — 이는 실제로 뚜렷한 데이터 근거가 없을 때의 정직한 표시이지, 하드
  코딩된 고정 문구가 아니다.

### 4) 알려진 제약(정직하게 남겨둔 것)

- 인쇄 화면의 "데이터 근거 요약" 표(`evidenceSummary = analysisResult.evidences.slice(0, 6)`)는
  이번에 demand 축에 근거 2건(방문자수, 증감률)이 늘어난 만큼, 앞쪽 6건 안에 다른 축(diversity/network
  등) 근거가 덜 보일 수 있다. 슬라이스 로직 자체는 이번 범위 밖이라 건드리지 않았다.
- 홍보자료(`promoContent`)는 이번 라운드에서 자동 재생성하지 않는다 — 사용자가 이미 생성/편집한
  홍보자료 텍스트는 그대로 남고, 새 지표 요약·역할 적합 이유는 (재)생성해야 반영된다(1차 개선 문서의
  정책과 동일).
- Prisma 스키마(컬럼/모델), DB 마이그레이션, POI/코스 추천 로직, DNA 5축 공식, 전략 순위 결정 로직은
  전혀 건드리지 않았다.

## 다음 작업 순서 (P0, 2026-08-01 갱신 — P0-3/P0-4 완료 반영)

Phase 4(P0-1)·대표 시나리오 3개(P0-2)에 이어 DB migration 적용(P0-3)·원격 배포 및 실사용 검증(P0-4)까지
모두 완료했다.

1. **P0-1. Phase 4 구현 — 완료(로컬+원격)** — 아래 "Phase 4" 절 참고. 역할·국적·테마·여행월을 전략 점수
   (`roleFit`/`targetFit`/`feasibilityFit`/`seasonFit`)·추천 근거·실행안 체크리스트·위험요인·KPI 관점에
   실제로 반영했다. 지역 객관적 DNA(`demandFit`/`supplyFit`)는 그대로 유지해 조건별 해석과 분리했다.
   `origin/main`에 이미 push됐다(`68f8ed9`/`9ca0084`).
2. **P0-2. 대표 시나리오 3개 완성 — 완료(로컬+원격+브라우저 검증)** — 아래 "대표 시나리오(P0-2)" 절
   참고. 강릉/경주/제천 3개 프리셋을 `/projects/new` 입력폼에 추가해, 카드를 고르면 지역·역할·국적·
   테마·여행월(및 나머지 필수 입력값)이 채워지고 기존 분석 파이프라인을 그대로 통과한다. 프리셋은
   입력값 묶음일 뿐 결과를 저장하거나 하드코딩하지 않는다 — 실제로 계산한 DNA·전략 점수·순위·근거·
   KPI·체크리스트·위험요인이 세 시나리오마다 다르다는 것을 `contestScenarios.test.ts`로,
   **2026-08-01에는 실제 Production(`https://tour-dna.lib.lc`)에서 Playwright 실 브라우저로도 세
   지역 결과가 실질적으로 차별화됨을 확인**했다(상세는 맨 아래 새 섹션 참고).
3. **P0-3. DB migration 적용 및 통합 검증 — 완료(2026-08-01)** — 대상 Neon DB(project "TOUR DNA",
   production 브랜치)가 Vercel Production이 실제로 쓰는 DB임을 `vercel link` + 환경변수 참조로 확인한
   뒤, 미적용 상태였던 `20260731000000_add_strategy_differentiation_fields`를 `npm run db:migrate`로
   적용했다(`prisma migrate status`로 적용 전/후 대조, 신규 컬럼 5종 `information_schema.columns`로
   존재 확인). `20260726000000_add_selected_plan_promo_content`를 포함한 나머지 8개 migration은 이미
   그 이전에 적용되어 있었음을 함께 확인했다 — **현재 `prisma migrate status` 기준 9개 migration 전부
   적용 완료(pending 없음)**. 적용 후 실제 Production 브라우저(Playwright Chromium)로 홍보자료
   생성·재생성·채널 순서/중복 방지·전체 복사·새로고침/재접속 유지·모바일 레이아웃·역할별(여행사/지자체)
   화면·강릉/경주/제천 대표 시나리오 3개·지도 렌더링까지 전부 검증했다(상세는 맨 아래 새 섹션).
4. **P0-4. 원격 반영 및 배포 — 완료** — 커밋 `afba7e9359f369102b5e741929fdbf22dd39cf2b`까지
   `origin/main`에 push 완료, Vercel이 해당 커밋으로 자동 배포해 Production(`tour-dna.lib.lc`)이
   Ready 상태임을 `vercel inspect`로 확인. 운영 환경변수(`DATABASE_URL`/`NEXT_PUBLIC_KAKAO_MAP_KEY`
   등)는 이미 정상 설정돼 있어 이번 라운드에서 변경하지 않았다. 배포 URL smoke test(프로젝트 생성→
   분석→전략 선택→실행안→홍보자료→전체 복사→새로고침→재접속)를 Playwright로 실행해 4xx/5xx·콘솔
   오류·Vercel Runtime 오류 없음을 확인했다.

아래 "요약 테이블"의 우선순위 열은 이 순서를 반영해 갱신했다.

## POI 선택·동선 거리 인식 개선 (2026-07-27, P0-2 push 이후 — 운영 경주 사례 87분·127분 이동 구간 보완)

운영 배포 후 신규 생성한 경주 실행안에서 87분·127분짜리 단일 이동 구간과, 강릉·경주 양쪽에서 FOOD
카테고리(식당/카페 구분 없이) 연속 배치가 확인됐다 — 이번 보완의 출발점이다. **로컬 구현·테스트
완료, 이후 `origin/main`에 push 완료(2026-07-30 `git log` 기준 확인).**

- **원인**: (1) `selectPois`(strategy.ts)가 POI *선택* 단계에서 좌표를 전혀 쓰지 않고 카테고리 회전
  순서로만 골랐다 — 실제로는 `fetchPoisByCategory.ts`가 DB의 `lat`/`lng`/`mealEligible`을 `PoiLike`에
  채우지도 않았다(선택 이후 단계인 `PoiDetail`에서만 좌표가 있었음). (2) 일정 배치(`planBuilder.ts`)는
  최근접 이웃 정렬 + 날짜별 목표 개수로만 나눠, 군집 경계에서 다른 지역 POI가 섞여도(예: 날짜별 목표
  개수 경계가 하필 지리적 군집 중간을 자르는 경우) 이동시간을 실제 시각에만 반영할 뿐 그 POI 자체를
  재검토하지 않았다. (3) FOOD 연속배치 회피(5단계, 기존)는 "실제 식사(lunch/dinner) 직전/직후"만
  판단해, 식사와 무관한 카페 두 곳이 연달아 오는 경우는 놓쳤다.
- **거리 기반 POI 선택(1단계)**: `PoiLike`(strategy.ts)에 옵셔널 `lat`/`lng`/`foodSubcategory` 추가.
  `fetchPoisByCategory.ts`가 DB row의 `lat`/`lng`와 `deriveMealEligible`/`deriveFoodSubcategory`
  (poiDetails.ts)를 그대로 채운다. `selectPois`의 카테고리별 다음 후보 선택(`pickNext`)은 이미 선택된
  POI들의 좌표 무게중심을 유지하다가, 두 번째 선택부터는 그 중심에 가장 가까운 후보를 우선한다(동률은
  기존 회전 순서로 결정론적으로 처리). 좌표가 하나도 없으면(레거시 데이터·기존 테스트) 기존 회전 순서
  그대로 fallback한다 — 회귀 없음. 전략 점수(`demandFit`/`supplyFit`/...)는 건드리지 않아 강릉·경주·
  제천의 기존 1위 전략 순위에 영향이 없다(분석 엔진과 선택 로직은 여전히 분리).
- **FOOD 세부 분류(4단계)**: `src/lib/domain/foodClassification.ts` 신규 — `FoodSubcategory =
  "MEAL"|"CAFE"|"UNKNOWN"`. TourAPI cat3(우선) → 이름 키워드(카페/커피/디저트/베이커리/빵/찻집 vs
  한식/중식/일식/양식/음식점, 보조) 순으로 판정하는 순수 함수 하나로 규칙을 통합했다(`tourInfo.ts`의
  cat3→명칭 매핑을 재사용, 중복 구현 없음). 기존 `mealEligible`(boolean)은 이 값에서 파생되도록
  재작성했지만 반환값은 그대로라 하위호환 100% 유지(`poiDetails.test.ts` 기존 테스트 변경 없이 통과).
- **장거리 구간 처리(2단계)**: `geo.ts`에 `CAUTION_TRAVEL_MINUTES=60`/`EXCESSIVE_TRAVEL_MINUTES=90`
  상수와 `classifyTravelMinutes()`를 추가(정책 단일 관리, strategy.ts·planBuilder.ts 공용). 60분
  초과라고 무조건 후보를 제거하지 않고, `planBuilder.ts`의 `repairExcessiveTravelSegments()`가
  날짜별 배치 직후(스케줄링 전) 그 날짜 안의 인접 구간(최근접 이웃 순서 기준) 중 EXCESSIVE(90분
  이상)인 것을 찾아 — 두 항목 중 "같은 날짜에 가까운 동료가 더 적은(고립된) 쪽"을 지목하고(단순
  인접 쌍 비교만 하면 정렬 시작점 근처에서 엉뚱한 항목이 지목될 수 있어, 각 항목의 "가까운 동료 수"를
  비교하도록 보완) — 그 POI가 실제로 다른 날짜의 기존 항목과 EXCESSIVE 없이 이어질 수 있으면 그 날짜로
  옮기고(요구사항의 "가까운 대체 후보 탐색"+"다음 날 배정"), 옮길 날짜가 전혀 없으면 코스에서 제외한다
  (부족해도 억지로 다시 채우지 않음 — 기존 "안전한 생략" 원칙과 동일). 최대 2패스만 반복해 무한 루프를
  방지한다.
- **FOOD 연속배치 방지 일반화(5단계 확장)**: `scheduleDayWithMeals`의 회피 로직 기준을 "방금 실제
  식사(lunch/dinner)를 마쳤는지"에서 "직전 장소가 FOOD 카테고리(식당·카페 구분 없이)인지"로 넓혔다 —
  카페→카페처럼 실제 식사와 무관한 FOOD 연속배치도 대체 가능한 비-FOOD 후보가 있으면 피한다. 대체
  후보가 전혀 없으면 기존처럼 그대로 배치한다(방문 생략 안 함).
- **후보 부족 안내(8단계)**: `CourseDay`에 옵셔널 `notices?: string[]` 필드 추가(레거시 실행안 호환,
  Prisma 스키마 변경 없음 — 기존 `course` Json 컬럼에 추가 필드로만 저장됨). 장거리 제외로 코스가
  축소되면 그 사유를 담아 실행안 편집기(`PlanEditor.tsx`)와 인쇄 화면(`print/page.tsx`)에 기존 카드
  스타일(숙박 안내 카드와 동일한 톤)을 재사용해 노출한다. 새 UI 컴포넌트를 만들지 않았다.
- **회귀 방지**: DNA 5축·Network 근거·provenance 표시·전략 3안 점수·결정성·KPI/체크리스트/위험요인·
  지도/Polyline·인쇄 화면·프로젝트 저장/재조회·기존 API 실패 fallback은 이번 변경 대상이 아니다(POI
  선택·일정 배치 로직만 수정, 분석 엔진은 그대로). 강릉·경주·제천 대표 전략 1위(`contestScenarios.test.ts`)
  회귀 테스트는 수정 없이 그대로 통과.
- **테스트**: 신규 `foodClassification.test.ts`(13), `geo.test.ts`에 `classifyTravelMinutes`/
  `estimateTravelMinutes` 6건 추가, `strategy.test.ts`에 거리 기반 선택 3건 추가, `poiDetails.test.ts`에
  `deriveFoodSubcategory`/키워드 보조판정 5건 추가, `planBuilder.test.ts`에 카페-카페 연속배치 방지
  2건 + 장거리 재배정/제외 회귀 2건 추가(경주 87분·127분 재현을 일반화한 fixture, 특정 프로젝트
  ID·장소명에 의존하지 않음). 기존 planBuilder 테스트 6개는 도보 기준 비현실적인 장거리(예: 20km 이상)를
  써서 "이동시간이 아무리 커도 시각만 뒤로 민다"는 **개선 전** 동작을 검증하던 것이라, 이번에 새로
  도입한 장거리 제외 정책과 정면으로 충돌해 실패했다 — 각 테스트의 원래 검증 의도(순서 재배열, 교통수단별
  소요시간 비교, 자정-랩 방어, 점심 도달 가능성 판단)는 그대로 유지한 채 좌표만 정상 이동 범위(또는
  장거리 제외가 실제로 작동하는 것을 검증하는 방향)로 조정했다 — 회귀가 아니라 의도된 동작 변경에 맞춘
  테스트 수정이다. 전체 439/439 통과, `npm run lint`/`npm run typecheck`/`npm run build` 전부 통과.
- **아직 운영에서 검증하지 못한 항목**: 이번 커밋은 로컬 전용이라 실제 배포·운영 DB 데이터로는 검증되지
  않았다. 배포 후 확인이 필요한 항목: (1) 경주 신규 프로젝트 생성 시 기존 87분·127분 구간이 실제로
  제거/재배정되는지, (2) 강릉·경주에서 FOOD 연속 배치가 실제로 사라지는지(대체 후보가 부족한 지역에서는
  여전히 발생할 수 있음 — 이는 정책상 허용된 예외), (3) 후보 부족 안내 문구가 실제 화면에 정상 노출되는지,
  (4) 이번 변경으로 인해 실제 DB의 좌표 분포에서 예상치 못하게 코스가 과도하게 축소되는 지역이 있는지.
- **알려진 한계(정직하게 기록)**: `repairExcessiveTravelSegments`는 하루 안의 "인접 구간"만 보므로,
  한 날짜에 서로 다른 두 지리적 군집이 섞이면서도 두 군집 각각은 내부적으로 가까운 동료가 있는 극단적인
  경계 케이스는 그 경계의 한쪽만 재배정하고 넘어간다(전수 재군집화는 이번 범위 밖). 또한 실제 도로/대중
  교통 경로가 아니라 직선거리(haversine) 추정치를 그대로 쓴다(Phase 12, 실제 경로 API 연동 전까지의
  기존 한계와 동일).

## 실행안 일정 품질 보완 (2026-07-26, 기준 커밋 `608a09a` 이후)

식사 누락 수정(`608a09a` "fix: ensure meal coverage in generated itineraries") 배포 후 운영
강릉 실행안에서 다음 품질 문제가 새로 확인됐다 — **`DONE`**.

- **확인된 문제**: (1) 카페(mealEligible=false FOOD)가 실제 점심 바로 앞에 배치됨(11:00 카페 →
  12:05 점심), (2) 오후 공백(14:25~17:30, 약 3시간) 방치, (3) 2일차가 점심 직후(13:11)에 조기 종료.
- **근본 원인**: (a) `scheduleDayWithMeals`의 일반 방문 큐가 카페와 일반 관광지를 동일하게 취급해
  식사 직전/직후 배치를 막는 규칙이 없었다. (b) 직전 턴에 추가한 식사 선점(`MEAL_RESERVE_TARGET_BY_
  DURATION`, strategy.ts)이 기존 비숙박 목표 밀도(`NON_LODGING_POI_TARGET_BY_DURATION`) **예산 안에서**
  이뤄져, 실제 일반 관광 후보 수가 그만큼 줄어들었다(하루 목표 4개 중 2개가 식사로 소진 → 실제 관광
  시간을 채울 후보가 2개뿐).
- **연속 FOOD 방지**: `src/lib/domain/planBuilder.ts`의 `scheduleDayWithMeals`에 회피 로직 추가 —
  식사가 아직 남아있거나(`mealPending`) 방금 실제 식사를 마쳤으면(`justHadMeal`), 대체 가능한(FOOD가
  아닌) 후보가 큐에 남아있는 동안은 그 후보를 먼저 시도한다. 대체 후보가 전혀 없으면(카페뿐이면) 그대로
  배치한다(방문 생략 안 함 — 데이터상 합리적 예외).
- **일반 방문 후보 보충**: `src/lib/services/poiDetails.ts`에 `fetchAdditionalGeneralPois`(FOOD 아닌
  ATTRACTION/EXPERIENCE/FESTIVAL/SHOPPING만 조회) 신규. `planService.ts`가 비숙박 POI 총량이
  `NON_LODGING_POI_TARGET_BY_DURATION[duration] + mealReserveTarget`(식사 선점이 갉아먹은 예산을
  복원하는 기준)에 못 미치면 같은 지역 DB에서 보충한다. `buildDraftCourse`의 기존 최근접 이웃 정렬 +
  날짜별 개수 분배(초과분 재배분 포함)를 그대로 재사용하므로 planBuilder.ts는 손대지 않았다.
- **2일차 종료 시각**: `DAY_TIME_SLOTS_BY_DURATION`(기존)에 이미 날짜별 슬롯이 정의돼 있고, 사용자가
  별도로 종료 시각을 입력하는 UI/필드는 없다 — 이 고정 슬롯이 시스템의 기본 종료 정책이다(변경 없음,
  문서화만 보완). 공급 부족으로 조기 종료되던 문제는 위 일반 방문 후보 보충으로 완화된다.
- **UI 목적 라벨**: `CourseItem`/`CourseItemInput`에 optional `mealPurpose?: "LUNCH"|"DINNER"|"GENERAL"`
  필드 추가(Prisma 변경 없음 — 기존 `course` Json 컬럼에 추가 필드로만 저장됨). `scheduleDayWithMeals`가
  배치 시점에 실제로 결정한 목적을 그대로 실어 나르고(장소명·시각으로 추정하지 않음), `describeCourseItemPurpose()`
  (planBuilder.ts, export)를 실행안 편집기(`PlanEditor.tsx`)와 인쇄 화면(`print/page.tsx`)이 공용으로
  사용해 "FOOD · 점심"/"FOOD · 저녁"/"FOOD · 카페/일반 방문"으로 표시한다. `mealPurpose`가 없는 legacy
  실행안은 카테고리만 표시되며 크래시하지 않는다.
- **Phase 5(다채널 홍보 초안)는 이번 작업 대상이 아니며 여전히 `NOT_STARTED`다** — 아래 요약 테이블
  참고, 이번 보완은 그 우선순위 조정과 무관하게 실행안 생성 버그 수정 작업으로 별도 처리했다.
- **테스트**: `tests/unit/planBuilder.test.ts`(강릉형 회귀 3건 + 2일차 회귀 1건 + 후보 부족 3건 +
  `describeCourseItemPurpose` 3건), `tests/unit/poiDetails.test.ts`(`fetchAdditionalGeneralPois` 3건),
  `tests/unit/planService.test.ts`(일반 방문 보충 회귀 1건 + 기존 2건 보완), `tests/unit/PlanEditor.test.tsx`
  (목적 라벨 4건). 기존 통영 식사 보장 회귀 테스트는 삭제·완화 없이 그대로 유지, 218/218 전체 통과.

## Phase 1 배포 전 마이그레이션 점검 (2026-07-23, 코드/설정 감사만 — DB 미접속)

- **현재 migration 실행 구조**: 저장소·문서 근거로 확인한 결과 **"C. 수동 migration 적용을 전제로 함"**이다.
  `package.json`의 `build`는 `next build`뿐이고(`prisma migrate deploy` 없음), `postinstall`은
  `prisma generate`만 실행한다. `docs/deployment.md` 5절("Build Command는 기본값... seed를 build 훅에
  넣지 않는다")과 `README.md`("마이그레이션은 배포 파이프라인에서 자동 실행되지 않으며 `npm run db:migrate`로
  수동 적용")가 이를 명시적으로 문서화하고 있다. `.github/workflows`는 존재하지 않아 별도 CI/CD 단계도 없다.
  단, Vercel 대시보드에서 Build Command가 저장소 기본값과 다르게 수동으로 덮어써졌을 가능성은 저장소만으로는
  배제할 수 없다(그 부분은 사람이 Vercel 대시보드에서 직접 확인 필요).
- **핵심 위험**: `main` push는 GitHub 연동으로 Vercel 자동 배포를 트리거한다(README "GitHub main 브랜치
  push 시 자동 배포"). Migration이 자동 적용되지 않으므로, **이 세션의 Phase 1 커밋을 push만 하고 `npm run
  db:migrate`를 실행하지 않으면**, 배포된 새 코드가 `NormalizedMetric`/`Evidence` 테이블에 없는
  `provenance` 컬럼을 조회·저장하려다 실행 시점(runtime)에 실패한다 — 프로젝트 생성/분석 실행, 기존
  프로젝트의 분석 결과 열람이 전부 영향을 받는다. 모든 주요 페이지가 `export const dynamic =
  "force-dynamic"`이라 `next build` 자체는 이 문제로 실패하지 않는다(런타임에서만 드러남).
- **안전한 배포 순서(권장)**: ① 이 세션의 커밋을 push하기 **전에** 또는 push 직후 배포가 완료되기 전에
  `npm run db:migrate`(=`prisma migrate deploy`)를 대상 Neon DB에 먼저 실행 → ② 그 다음에 Vercel 배포가
  해당 커밋을 반영하도록 한다. Migration은 전부 additive(컬럼/타입 추가)라 안전하게 먼저 적용해도 이전
  코드와 호환된다.
- **기존 가짜 DataSnapshot 정리와는 무관**: migration 4개(`init`/`add_kpi_memo`/`add_tour_api_area_code`/
  `add_data_provenance`) 중 어느 것도 DELETE/TRUNCATE를 포함하지 않는다 — 가짜 DataSnapshot 정리는 별도의
  수동 작업이며 migration 적용 여부와 독립적이다(정리하지 않아도 migration 자체는 그대로 적용 가능).
- 상세 근거(빌드 명령 경로, migration SQL 전문 검토, Preview/Production DB 분리 확인 불가 사유, Vercel
  대시보드에서 사람이 확인할 항목 등)는 이번 대화의 감사 보고 참고.

## Phase 1. 데이터 출처 및 상태 모델 정비 — `DONE` (1-A~1-E 전부 완료)

| 하위 항목 | 상태 | 근거 |
|---|---|---|
| **1-A provenance 컬럼 추가(스키마만)** | **DONE (2026-07-23)** | `DataProvenance` enum(`LIVE_API/CACHED_API/CURATED/ESTIMATED/MISSING`) 추가, `NormalizedMetric.provenance`/`Evidence.provenance` nullable 컬럼 추가. Migration `20260723000000_add_data_provenance`(미적용, additive). |
| **1-B 실제 raw snapshot 저장** | **DONE (2026-07-23, 보완 완료)** | `src/lib/services/syncService.ts`의 `runTourismDataSync()`에 5개 지표+POI 호출 지점마다 `upsertSnapshot()`을 추가해 실제 응답 객체를 `DataSnapshot`에 저장. 기존 SUCCESS/EMPTY 스냅샷 보존 정책 포함(보완 완료). |
| **1-C 실제 provenance/fallback 판정 연결** | **DONE (2026-07-23)** | 상세 내역 아래 참고 |
| **1-D seed 가짜 envelope 제거, provenance 명시** | **DONE (2026-07-23)** | 상세 내역 아래 참고 |
| **1-E Network 근거 분리(POI 수 vs 관계 수)** | **DONE (2026-07-23)** | 상세 내역 아래 참고 |

### Phase 1-C 상세

- **`isSnapshotFallback` 하드코딩 3곳 교체 완료**:
  - [metricCohort.ts](../src/lib/services/metricCohort.ts) — `NormalizedMetric.provenance`를 읽어 `isSnapshotFallback = provenance !== "LIVE_API"`로 계산(NULL 포함 모든 비-LIVE_API 값은 fallback).
  - [buildDnaEngineInput.ts](../src/lib/services/buildDnaEngineInput.ts) — Network 축은 POI `sourceType`(API/FIXTURE 혼입 여부)과 `PoiRelation`(현재 syncService가 절대 채우지 않아 존재하면 항상 CURATED) 기준으로 `LIVE_API`/`CURATED` 판정.
  - [dna.ts](../src/lib/domain/dna.ts) — 방문자수 증감률 Evidence는 current/previous 두 `VisitorCountPoint`의 provenance/isSnapshotFallback을 합성(둘 중 하나라도 fallback이면 전체 fallback, provenance는 current 우선·없으면 previous).
- **`syncService.ts`의 `upsertMetric()`**: `provenance` 파라미터 필수화. STAY/SPEND/DIVERSITY/DEMAND_SERVICE(전부 실키 검증됨) → `"LIVE_API"`. VISITOR_CNT(엔드포인트 자체 미확인, `docs/public-api-status.md`) → API 성공 여부와 무관하게 `"ESTIMATED"`.
- **CACHED_API 판정**: `upsertSnapshot()`이 "기존 SUCCESS/EMPTY 보존, 이번 ERROR는 기록 안 함"을 결정하는 바로 그 실행 컨텍스트에서 `markMetricsAsCached()`(신규)를 호출해, 같은 [regionId, baseYm]의 해당 metricCode 중 **provenance가 정확히 `"LIVE_API"`인 행만** `"CACHED_API"`로 낮춘다. NULL/기타 값은 건드리지 않는다(근거 없는 배정 금지).
- **`Evidence.provenance` 연결**: `EvidenceItem`에 `provenance` 필드 추가, `dna.ts`의 3개 evidence 생성 지점(`toEvidence`/growthEntry/network)과 `analyzeProject.ts`의 `toEvidenceCreateData()`를 통해 분석 시점 provenance가 그대로 `Evidence.provenance`에 저장된다.
- **NULL provenance 처리**: 일괄 backfill 없음. 기존 레코드는 NULL 그대로 남고, 읽기 시점(`metricCohort.ts`)에서 NULL은 항상 `isSnapshotFallback: true`로 계산되어 `LIVE_API`로 오인되지 않는다.
- **schema/migration 변경 없음**(이번 단위 전체가 기존 컬럼만 사용).

### Phase 1-D 상세

- **가짜 API 성공 envelope 완전 제거**: `prisma/seed.ts`의 `envelope()` 헬퍼(`resultCode:"0000"`/`resultMsg:"NORMAL SERVICE."`를 지어내던 함수)와 `upsertSnapshotAndMetric()`(seed 데이터로 가짜 `DataSnapshot` SUCCESS/EMPTY를 만들던 함수)을 삭제했다. **seed는 이제 `DataSnapshot`을 전혀 생성하지 않는다** — `DataSnapshot.status`(SUCCESS/EMPTY/ERROR)에는 "fixture/큐레이션" 상태값 자체가 없어, 실제 API 호출 없이 SUCCESS를 붙이면 정직하게 표현할 방법이 없기 때문(스키마 변경 없이는 fixture 전용 snapshot 상태를 새로 만들 수 없음 — 지시된 대로 스키마를 바꾸지 않고 "생성 자체를 제거"하는 방안을 택함).
- **의존 경로 확인**: `DataSnapshot`을 읽는 곳은 `projectQueries.ts`의 `getLatestDataFreshness()`(랜딩 페이지의 "마지막 동기화" 표시) 하나뿐. seed가 snapshot을 만들지 않아도 `formatDateTime(null)`이 이미 `"-"`를 반환하도록 구현돼 있어 안전하게 폴백된다(크래시 없음, 코드 미변경). 어떤 테스트도 seed가 만든 `DataSnapshot`에 의존하지 않음을 확인.
- **CURATED/ESTIMATED 판정 로직 분리**: `src/lib/services/seedMetrics.ts`(신규) — `classifyVerifiedMetricProvenance(baseYm)`가 순수 함수로 기준월별 판정을 노출(DB 없이 단위테스트 가능), `upsertSeedMetric()`이 `DataSnapshot` 없이 `NormalizedMetric`만 provenance와 함께 upsert. `prisma/seed.ts`는 이 함수들을 import해서 쓴다(로직 중복 없음).
- **seed metric provenance 규칙**: STAY/SPEND/DIVERSITY/DEMAND_SERVICE는 202605·202606(2026-07-21 실키로 사람이 직접 확인한 기준월) → `CURATED`, 그 이전 202508·202509(실키 발급 전 추정치, fixture 주석에 명시) → `ESTIMATED`. DEMAND_RESOURCE(문화자원수요)·VISITOR_CNT(방문자수)는 baseYm과 무관하게 항상 `ESTIMATED`(API 필드 의미 자체가 미확인 — Phase 1-C의 VISITOR_CNT 정책과 동일 원칙 적용). `LIVE_API`/`CACHED_API`는 `upsertSeedMetric()`의 파라미터 타입에서 아예 배제(`Extract<DataProvenance,"CURATED"|"ESTIMATED">`)해 실수로도 쓸 수 없게 했다.
- **MISSING 처리 유지**: 제천 202508의 DEMAND_RESOURCE는 여전히 "값 자체가 없는" 사례로 남기되, 가짜 EMPTY snapshot 대신 해당 `NormalizedMetric`을 아예 생성하지 않는다 — 기존 MISSING 축 처리가 그대로 적용됨.
- **seed POI/PoiRelation**: 코드 검토 결과 **이미 올바르게 구현돼 있었음**(변경 불필요) — POI는 항상 `sourceType:"FIXTURE"`, `PoiRelation`은 실제 API가 절대 채우지 않아 존재 자체가 CURATED 근거라는 점(Phase 1-C의 `buildDnaEngineInput.ts` 판정 규칙과 정확히 일치)을 명확히 하는 주석만 추가.
- **테스트**: `tests/unit/seedMetrics.test.ts`(신규 10개) — 기준월별 CURATED/ESTIMATED 분류, provenance 명시 저장, DataSnapshot 미호출, 재실행 dedup, `prisma/seed.ts` 소스에 가짜 envelope/함수가 남아있지 않은지 정적 검사.
- **공유 DB 미접속**: 이번 검증은 전부 `@/lib/db`를 mock으로 대체한 단위테스트로만 수행했다. 실제 `seed.ts` 전체 실행(운영/공유 Neon DB 접속 필요)은 하지 않았다 — 지시에 따름.

**완료 조건 충족 여부**: Phase 1의 핵심 완료 조건("추정값이 포함된 데모에서 LIVE 5/5가 나오지 않는다")이 이제 데이터 생성 경로 전체(실 동기화 + seed) 수준에서 충족된다. 다음 `npm run db:seed` 실행부터 새로 생성되는 seed metric은 CURATED/ESTIMATED가 명시되고, 실제 라이브 동기화 결과만 LIVE_API/CACHED_API로 구분된다. 기존에 이미 채워진 레코드(마이그레이션 이전)는 여전히 NULL로 남아 있으며(재실행 전까지), 이는 의도된 보수적 처리다.

### Phase 1-E 상세

- **문제였던 것**: `buildDnaEngineInput.ts`가 Network 축의 POI 근거와 관계(PoiRelation) 근거를 "non-API POI 존재 || 관계 존재"라는 단일 OR 조건으로 합쳐 하나의 provenance로 만들었다 — 그 결과 실제 API로 수집한 POI 근거까지 사람이 만든 관계 데이터 때문에 CURATED로 격하됐다.
- **분리된 최종 구조**: `NetworkRawInputs`(`src/lib/domain/types.ts`)를 `poi: {apiCount, fixtureCount, provenance, isSnapshotFallback}`와 `relation: {count, provenance, isSnapshotFallback} | null` 두 개로 재구성. `buildDnaEngineInput.ts`는 이제 POI 근거(`sourceType` 기준 API/FIXTURE 혼입 여부)와 관계 근거(`PoiRelation` 존재 여부)를 **완전히 독립적으로** 판정한다 — 관계가 CURATED라는 이유로 API POI 근거를 더 이상 격하하지 않는다.
- **Evidence 2종 분리**: `dna.ts`의 `computeNetworkAxis()`가 `metricCode: "networkPoiCount"`(출처 `TOUR_INFO`)와 `metricCode: "networkRelationCount"`(출처 `POI_RELATION`) 두 개의 독립된 `EvidenceItem`을 생성한다(마스터 문서 1-3절이 요구한 정확히 그 구조). `Evidence` 모델에 `metricCode` unique 제약이 없고 `analyzeProject.ts`가 `createMany`로 삽입하므로 두 근거가 서로 덮어쓸 위험이 없음을 스키마로 확인했다(추가 변경 불필요).
- **API/fixture 혼합 처리**: 단순히 "API가 하나라도 있으면 LIVE_API"로 처리하지 않는다 — fixture가 하나라도 섞이면 POI 근거 전체를 보수적으로 CURATED로 표시하되, `appliedRule` 텍스트에 `API 수집 N건, 큐레이션(FIXTURE) M건`을 노출해 혼합 상태를 투명하게 드러낸다(요청된 옵션 중 "합산 Evidence는 보수적으로 CURATED 처리하되 API/fixture 수를 별도로 노출" 채택 — POI를 3번째 Evidence로 추가 분리하는 것은 이번 범위를 넘어선다고 판단).
- **관계 0건 처리**: `relatedPoiCount === 0`일 때 "확인된 0건"과 "근거 자체가 없음"을 현재 스키마로 구분할 수 없다고 판단해, `relation`을 `null`로 두고 **관계 Evidence 자체를 생성하지 않는다**(기존 MISSING/미생성 정책 재사용, 0을 임의로 CURATED로 지어내지 않음).
- **축 상태/점수 계산식 미변경**: `rawScore` 산식(`attractionCount*4 + relatedPoiCount*3 + 커버리지 보너스`)은 그대로다. 축 상태는 "POI 근거 또는 관계 근거 중 하나라도 fallback이면 SNAPSHOT"으로, 이전의 단일 OR 판정과 최종 결과가 동일하다(단지 입력이 2개로 분리됐을 뿐).
- **CACHED_API 판정 불가 명시**: `Poi` 모델에는 `DataSnapshot` 같은 성공/실패 이력이 없어, "최신 API 실패 후 과거 POI를 재사용했다"는 사실을 판정할 근거가 전혀 없다 — POI 근거는 `LIVE_API` 또는 `CURATED`만 사용하고 `CACHED_API`는 추측하지 않는다(설계 한계로 문서화).
- **테스트**: `tests/unit/dna.test.ts`(+5, POI/관계 분리·혼합·관계없음 사례), `tests/unit/buildDnaEngineInput.test.ts`(재작성, 5개 — API전용/혼합/관계있어도POI유지/관계없음/POI자체없음). 기존 `strategy.test.ts` fixture도 새 구조로 갱신. **119/119 전체 통과**.
- **schema/migration/seed/env 변경 없음** — 전부 domain/service 계층 리팩터.

### Phase 1-D 이후 보완(2026-07-23, 같은 날 발견·수정)

- **DEMAND_SERVICE(tarSvcDemIxVal) seed sourceCode 정정**: `prisma/seed.ts`가 `"TAR_SVC_DEM"`으로 잘못 attribution하던 것을 실제 출처인 `"TOU_RES_DEM"`으로 고쳤다(`AreaTarDemDsService`엔 이 오퍼레이션 자체가 없음 — `docs/public-api-status.md`, 실제 `syncService.ts`가 이미 `TOU_RES_DEM` 블록에서 이 metricCode를 upsert하는 것과 대조해 확인). STAY/SPEND(`TAR_SVC_DEM`)·DIVERSITY(`TOU_DIV_IX`)는 원래 맞는 attribution이라 변경하지 않았다. `TOU_RES_DEM` DataSource는 이미 `DATA_SOURCE_SEED`에 존재하고 `upsertDataSources()`가 `seedMetrics()`보다 먼저 실행되므로 신규 DataSource 생성이나 순서 변경은 불필요했다. 정적 소스 검사 테스트 4개(`tests/unit/seedMetrics.test.ts`)로 이 attribution과 다른 3개 metricCode가 변경되지 않았음을 고정했다.
- **기존 가짜 DataSnapshot 잔존 여부(코드만으로 확인, DB 미접속)**: Phase 1-D 이전 `seed.ts` 실행으로 만들어졌을 수 있는 `resultCode="0000"`/`resultMsg="NORMAL SERVICE."`/`status=SUCCESS|EMPTY` 행은, 이번 커밋이 seed 코드만 고쳤을 뿐 DB의 기존 행을 지우는 로직이 전혀 없으므로 **배포된 DB에 이미 있었다면 그대로 남아있다.** 안전하게 자동 식별/삭제할 수 없다고 결론 — 이유와 절차는 아래 별도 섹션 참고.
- **영향 범위 재확인**: 이 잔존 행은 `projectQueries.ts`의 `getLatestDataFreshness()`(랜딩 페이지 "마지막 동기화" 표시)에만 영향을 준다. `NormalizedMetric.provenance`(Evidence·축 상태 판정의 실제 근거)는 Phase 1-C/1-D로 이미 정확해졌고 `DataSnapshot`을 참조하지 않으므로 **DNA 점수/축 상태/LIVE 5/5 판정에는 영향이 없다.**

## 기존 가짜 DataSnapshot 잔존 조사(자동 정리 보류)

- **구분할 수 없는 이유**: `TOU_RES_DEM`/`VISITOR_CNT`는 단일 API 호출 구조라, 실제 동기화가 저장하는 `rawPayload`(`res.raw`를 그대로 저장)와 과거 seed의 가짜 envelope가 **완전히 같은 최상위 모양**(`{response:{header:{resultCode,resultMsg},body:{items,...}}}`)이 될 수 있다 — 구조로 구분 불가. `resultMsg="NORMAL SERVICE."`도 data.go.kr류 공공API가 실제 성공 시 흔히 쓰는 표준 문구일 가능성이 있어(이 세션에서 실제 성공 응답의 정확한 resultMsg 문자열을 재확인하지 않음), 값 자체도 신뢰할 수 있는 구분 기준이 아니다. (참고로 `TAR_SVC_DEM`/`TOU_DIV_IX`는 실제 동기화가 `{stay,spend}`/`{tou,exp,intl}` 같은 래퍼 키로 저장하므로 그 래퍼 키가 없으면 가짜라고 비교적 안전하게 볼 수 있지만, 4개 소스 전부에 동일하게 적용 가능한 규칙은 아니라서 "확실히 구분 가능"으로 결론짓지 않았다.)
- **삭제 시 위험**: 만약 이 세션이 모르는 사이 실제 배포 환경에서 라이브 동기화가 한 번이라도 성공적으로 실행됐다면(Phase 1-B 코드 배포 이후), 그 진짜 성공 스냅샷까지 함께 지울 위험이 있다.
- **배포 전 사람이 직접 확인해야 할 조회 조건**:
  1. `SyncLog` 테이블이 비어있는지 확인 — 비어있다면 실제 라이브 동기화가 한 번도 실행된 적이 없다는 뜻이므로, 그 시점까지의 모든 `DataSnapshot`은 seed 기원일 수밖에 없다.
  2. `DataSnapshot`을 `dataSourceId`(TAR_SVC_DEM/TOU_DIV_IX/TOU_RES_DEM/VISITOR_CNT) + `regionId`(대전/제천/양양/경주/강릉/제주/통영) + `baseYm`(202508/202509/202605/202606)로 필터링.
  3. `TAR_SVC_DEM`/`TOU_DIV_IX` 행은 `rawPayload`에 `stay`/`spend` 또는 `tou`/`exp`/`intl` 최상위 키가 있는지 확인(없으면 가짜로 사실상 확정).
  4. `TOU_RES_DEM`/`VISITOR_CNT` 행은 `SyncLog.startedAt` 이전에 `fetchedAt`이 찍혀 있는지 사람이 직접 대조.
- **안전한 백업 및 수동 정리 절차(제안, 미실행)**: ① `pg_dump`로 `DataSnapshot` 테이블만 백업 → ② `SyncLog`가 비어있으면 위 필터 조건에 해당하는 `DataSnapshot` 행 전체를 안전하게 삭제 가능(실제 동기화가 없었으므로) → ③ `SyncLog`에 기록이 있다면, 그 최초 성공 로그 시각 이전 `fetchedAt`을 가진 행만 골라 사람이 한 번 더 확인 후 삭제.
- **정리하지 않았을 때 영향**: 랜딩 페이지의 "마지막 동기화" 표시가 실제로는 없었던 동기화 시각을 계속 보여줄 수 있다(사용자 오해 소지, 기존에도 있던 부정확함이 유지되는 수준). DNA 점수·축 상태·Evidence provenance·`LIVE 5/5` 판정에는 영향이 없다(전부 `NormalizedMetric`/`Evidence` 기반이며 이미 Phase 1-C/1-D로 정확함).

## Phase 2. 갱신형 DB 캐시와 최신 데이터 자동 반영 — `NOT_STARTED`

- `SyncJob`, `SourceWatermark`, `DataFreshness`, `DatasetVersion` 등 마스터 프롬프트가 요구하는 모델이 schema에 전혀 없다. 현재는 `SyncLog`(실행 로그)만 있고 이는 job 상태·재시도·TTL을 담지 못한다.
- `TOUR_DATA_BASE_YM`은 여전히 `.env`에 고정된 값(`202606`)이며, 최신 기준월 자동 탐색(probe) 로직이 없다 — [public-api-status.md](public-api-status.md) 서두에 "향후에도 이 값은 수동으로 유지보수해야 한다"고 스스로 명시.
- stale-while-revalidate, 중복 동기화 방지(advisory lock/jobKey), 원자적 `DatasetVersion` 발행, 관리자 관측 화면 — 전부 미착수.

**의존성**: Phase 1의 provenance 필드가 있어야 Phase 2의 freshness 상태 표시가 의미를 가지므로, Phase 1 이후 진행 권장(마스터 문서의 권장 순서와 일치).

## Phase 3. 결정론과 데이터 버전 정확성 — `IN_PROGRESS` (일부 구현, 핵심 결함 확인)

| 요구 | 상태 | 근거 |
|---|---|---|
| `dataVersion`에서 휘발성 값 제거 | **결함 확인** | [buildDnaEngineInput.ts:44](../src/lib/services/buildDnaEngineInput.ts#L44) `collectedAt: new Date().toISOString()`가 `networkInputs`에 포함되고, [dataVersion.ts:15](../src/lib/domain/dataVersion.ts#L15) `network: input.networkInputs` 전체가 해시 입력에 들어간다 — **동일 데이터로 재분석해도 매번 `dataVersion`이 달라진다.** 마스터 문서가 지목한 문제가 정확히 재현됨 |
| 코호트 변경 시 dataVersion 변경 | **결함 확인** | [dataVersion.ts:7-9](../src/lib/domain/dataVersion.ts#L7-L9) `ownMetrics`는 `cohort.find(c => c.regionCode === input.regionCode)`로 **대상 지역 값만** 뽑아 해시한다 — 다른 지역 값이 바뀌어 min-max 정규화 결과가 달라져도 dataVersion은 그대로 유지됨 |
| `analysisKey`에 role/nationality 포함 | **DONE(로컬, 2026-07-26 Phase 4에서 해소)** | [analyzeProject.ts](../src/lib/services/analyzeProject.ts)의 `scoringInput`(analysisKey 입력)에 `role`/`nationality`를 `normalizeRole`/`normalizeNationality`로 정규화해 포함시켰다 — 역할·국적이 바뀌면 analysisKey도 달라진다 |
| 배열 정렬 후 해시 | DONE | [analysisKey.ts:3-14](../src/lib/domain/analysisKey.ts#L3-L14) `sortDeep`이 객체 키를 정렬(단, 배열 요소 자체의 순서는 정렬하지 않음 — `preferredThemes` 등 배열의 원소 순서가 바뀌면 키가 달라질 수 있어 "의미상 순서 없는 배열은 정렬 후 해시"라는 요구를 완전히 충족하지 못함) |
| 같은 입력/데이터 → 같은 결과 테스트 | 부분 DONE | `analysisKey.test.ts`(4), `strategy.test.ts`(12)에 결정론 테스트 존재. 단 위 두 결함 때문에 "동일 데이터=동일 dataVersion" 전제 자체가 깨져 있어 테스트가 결함을 못 잡고 있을 가능성 있음(재검토 필요) |

## Phase 4-보완. 역할별 맞춤 분석·결과물 차별화 완성 — `DONE(로컬+원격+배포, migration 2026-08-01 적용 완료)`

Phase 4(역할·국적·테마·여행월의 점수/체크리스트 반영)는 이미 완료돼 있었다. 이번 보완은 "전략 3안이
제목·설명만 다르고 구조는 동일하다"는 남은 문제와, 공통 분석 컨텍스트 부재, 근거 수준 미표시, 홍보자료
채널 부족을 해소한다.

- **전략 3안 구조적 차별화**: [strategyTemplates.ts](../src/lib/domain/strategyTemplates.ts)에
  `coreProblem`(해결하려는 문제)/`coreResource`(활용 자원)/`stayStyle`(체류 방식)/
  `executionDifficulty`(실행 난이도)/`expectedEffect`(기대 효과) 5개 필드를 7개 템플릿 전부에 추가.
  `targetDescriptionTemplate`(핵심 대상)/`kpiTemplates`(핵심 KPI)/`riskTemplates`(주요 위험)는
  이미 있었으므로 요청한 8개 항목을 모두 충족. `StrategyResult`(Prisma)에 동일 5개 nullable 컬럼
  추가(`20260731000000_add_strategy_differentiation_fields` migration, **2026-08-01 Production
  Neon DB에 적용 완료** — `npm run db:migrate` 실행 후 `prisma migrate status`/컬럼 존재로 확인).
  이 migration 이전에 생성된 `StrategyResult` 레코드(예: 기존 데모 프로젝트 "충청북도 12월 소규모
  여행 기획", "경상북도 10월 소규모 여행 기획" 등)는 여전히 null이라 화면에서 "재분석 필요"로
  안내되며, 이 앱에는 **기존 프로젝트를 다시 분석하는 기능 자체가 없어**(Phase 6 참고) 해당 값을
  채우려면 동일 입력값으로 새 프로젝트를 만드는 것 외 방법이 없다 — 2026-08-01에 제천/경주 신규
  프로젝트를 만들어 이 5개 필드가 실제로 채워지는 것을 확인했다(맨 아래 새 섹션 참고).
- **공통 AnalysisContext**: [audienceContext.ts](../src/lib/domain/audienceContext.ts)에
  `AnalysisContext`/`buildAnalysisContext()` 도입, [analyzeProject.ts](../src/lib/services/analyzeProject.ts)가
  이를 통해 role/nationality/travelMonth/테마를 한 번만 정규화해 전략 계산에 넘긴다.
- **근거 수준 한글 표시**: `format.ts`의 `provenanceLabel()`이 `DataProvenance`를 한글 라벨로
  변환, `EvidenceTable.tsx`에 "근거 수준" 열 추가(값이 없는 기존 호출부는 열 자체를 생략).
- **홍보자료 카드뉴스 채널 + 역할별 채널 우선순위 + 외국인 번역 안내**:
  [promoContent.ts](../src/lib/domain/promoContent.ts)에 `cardNews`/`channelPriority`/
  `translationNotice` 추가. `PROMO_CONTENT_VERSION`은 그대로 두고 `promoContent.schema.ts`에서
  이 3개 필드를 optional로 받아 기본값을 채우는 방식으로 하위 호환을 유지했다(기존 저장 데이터가
  "형식 오류"로 막히지 않음).
- **미구현/후속 과제로 남긴 것**: 타깃 국적은 여전히 DOMESTIC/FOREIGN 2종뿐(신규 국가 추가 없음).
  실제 다국어 번역 기능은 만들지 않고 안내 문구만 제공. `promoContentAdapter.ts`/`planService.ts`는
  이번에 공통 컨텍스트로 교체하지 않음(회귀 위험 대비 최소 변경 원칙, 이미 각자 audienceContext.ts의
  같은 정규화 함수를 사용 중이라 결과 자체는 갈리지 않는다).

## Phase 4. 역할·국적·테마·여행월 반영 — `DONE(로컬)` — 원격/DB/배포는 별도 확인 필요

DB 스키마 변경 없이(role/nationality/travelMonth/preferredThemes는 이미 저장돼 있던 필드) 도메인 로직만
추가했다. 지역 객관적 데이터(`demandFit`/`supplyFit`)는 조건이 바뀌어도 값 자체가 바뀌지 않도록 분리를
유지했다(`docs/`가 지정한 4.1 원칙).

| 조건 | 반영 위치 | 반영 내용 | 근거(CURATED/실측) |
|---|---|---|---|
| 역할(`role`) | [strategy.ts](../src/lib/domain/strategy.ts) `roleFit`(신규 breakdown 키, 총점 가중치 0.10), 추천 근거 문구 | 지자체는 지역경제/계절분산/방문객증가를, 여행사는 체류소비/신규시장/재방문을 상대적으로 우선하는 목표 우선순위 테이블([audienceContext.ts](../src/lib/domain/audienceContext.ts) `ROLE_GOAL_PRIORITY`)로 템플릿별 점수가 갈린다(예: 축제형은 지자체 90 vs 여행사 60). `planBuilder.ts`의 실행 체크리스트에도 역할별 문구 1건씩 추가 | CURATED(기획 규칙, 실측 매출 아님 — 근거 문구에 항상 명시) |
| 국적(`nationality`) | [strategy.ts](../src/lib/domain/strategy.ts) `feasibilityFit`에 델타 반영, `planBuilder.ts` 체크리스트 | 내국인은 조정 없음(객관적 데이터 불변). 외국인은 템플릿별 "외국인 서비스 준비도" 조정치(`foreignReadinessAdjustment`, -8~+8, [strategyTemplates.ts](../src/lib/domain/strategyTemplates.ts))만 반영하고, 실제 방문객 수요 수치는 만들지 않음. 체크리스트에 "다국어 안내판 준비 확인" 1건 추가 | CURATED(서비스 준비도 추정 — 실측 방문객 데이터 아님을 근거 문구에 명시) |
| 테마(`preferredThemes`/`excludedThemes`) | [strategy.ts](../src/lib/domain/strategy.ts) `targetFit` 가산점, `planBuilder.ts` 체크리스트 | 자유 텍스트를 7개 내부 카테고리(미식/자연/문화역사/웰니스/축제/반려동물/레저)로 키워드 분류(`classifyThemes`) 후 템플릿별 가산점(최대 15점, 기존 substring +10 규칙과 합산)을 적용. 반려동물은 대응 템플릿이 없어 점수에는 반영하지 않고 체크리스트 안내만 추가(MISSING으로 명시) | CURATED(템플릿-카테고리 연관성 기획값) |
| 여행월(`travelMonth`) | 기존 `seasonFit`(가중치 0.20, 변경 없음) + [planBuilder.ts](../src/lib/domain/planBuilder.ts) `buildRisks` 신규 위험요인 | 장마철(6~7월)/혹서기(7~8월)/혹한기(12~2월)에 실외 비중이 큰 템플릿(ATTRACTION/EXPERIENCE/FESTIVAL 포함)에만 계절 위험요인을 추가. 실내 위주 템플릿이나 월 정보가 없으면(레거시) 추가하지 않음 | CURATED(통상적 계절 구간 규칙 — 실제 기상 API 미연동) |

전체 점수 공식은 `demandFit*0.35 + supplyFit*0.25 + seasonFit*0.20 + targetFit*0.05 + feasibilityFit*0.05
+ roleFit*0.10`(합계 1.0)으로 재조정했다 — `demandFit`/`supplyFit`/`seasonFit` 가중치는 Phase 1~3과
동일하게 유지해 기존 순위 안정성을 지키고, `targetFit`/`feasibilityFit`에서 줄인 만큼을 `roleFit`에
배정했다. 동점 처리(`totalScore` → `supplyFit` → `demandFit` → `templateId`)는 변경하지 않았다.

레거시 데이터(role/nationality/travelMonth/preferredThemes가 없거나 알 수 없는 값)는
`normalizeRole`/`normalizeNationality`/`normalizeMonth`/`normalizeThemeList`(모두
[audienceContext.ts](../src/lib/domain/audienceContext.ts))로 안전하게 처리해, 값이 없으면 해당 조건의
조정만 건너뛰고 런타임 오류 없이 기존 동작(중립값)을 유지한다.

신규 테스트: `audienceContext.test.ts`(27) + `strategy.test.ts`/`planBuilder.test.ts`/
`planService.test.ts`에 추가한 조건별 차이 검증(역할별 점수 역전, 국적별 feasibilityFit 변화, 테마별
targetFit 변화, 계절 위험요인, 서로 다른 3개 조합 결과 비교 및 재실행 결정론성 포함).

## 대표 시나리오 3개(P0-2) — `DONE(로컬)` — 원격 반영·실제 브라우저 검증은 별도 확인 필요 (2026-07-27)

`src/lib/domain/contestScenarios.ts`에 강릉/경주/제천 3개 대표 시나리오를 **입력값 묶음**(지역 코드,
역할, 국적, 선호 테마, 여행월, 그 외 필수 입력 필드 기본값)으로만 정의했다 — 점수·순위·근거·KPI·실행안
등 어떤 결과값도 여기 담지 않는다. `/projects/new`의 `ProjectInputForm.tsx`에 카드 3개를 추가해, 카드를
고르면 폼 상태만 채워지고(역할/국적/기간/예산/이동수단/그룹규모 라디오를 모두 controlled로 전환) 이후
기존 `createProjectAction`→`runAnalysisForProject`→`computeStrategies` 파이프라인을 그대로 통과한다.
시나리오 ID나 지역명으로 결과를 분기하는 코드는 어디에도 추가하지 않았다.

| 시나리오 | 지역 | 역할 | 국적 | 선호 테마 | 여행월 | 실제 계산된 1위 전략(총점) |
|---|---|---|---|---|---|---|
| 강릉 여름 미식·자연 | 강릉시(`SGG_GANGNEUNG`) | 여행사(`TRAVEL_AGENCY`) | 외국인(`FOREIGN`) | 미식, 자연 | 8월 | 야간·체류 확대형(76점) |
| 경주 가을 문화·역사 | 경주시(`SGG_GYEONGJU`) | 지자체(`LOCAL_GOV`) | 내국인(`DOMESTIC`) | 문화, 역사 | 10월 | 야간·체류 확대형(65점) |
| 제천 겨울 웰니스 | 제천시(`SGG_JECHEON`) | 여행사(`TRAVEL_AGENCY`) | 외국인(`FOREIGN`) | 웰니스 | 12월 | 가족 체험형(75점) |

(국적은 코드상 `DOMESTIC`/`FOREIGN` 두 값만 존재해 "외국 국적"은 곧 `FOREIGN`을 뜻한다 — 국가별 세부
코드는 실제로 없으므로 만들지 않았다.)

**1위 전략이 우연히 같은 경우(강릉·경주 모두 "야간·체류 확대형")를 억지로 갈라놓지 않았다** — 두
전략 템플릿의 `idealMonths`가 각각 8월/10월과 실제로 겹쳐 계절 적합도가 높게 나온 정직한 결과다. 대신
총점(76 vs 65)·`demandFit`/`supplyFit`(지역 원천 데이터, 각각 다름)·`roleFit`(88 vs 73, 역할별 목표
우선순위 차이)·추천 근거 문구(역할 라벨)가 이미 실제로 다르다. 다만 이번 검증 과정에서 **KPI 목록이
1위 템플릿이 같으면 완전히 동일하게 나오는 일반적인 결함**을 발견해, 대표 시나리오 전용 예외가 아니라
`buildKpis()`에 역할·국적 관점 KPI를 추가하는 일반 규칙(`computeRoleKpiNotes`/`computeNationalityKpiNotes`,
[audienceContext.ts](../src/lib/domain/audienceContext.ts))으로 보완했다 — 이 보완은 대표 시나리오뿐
아니라 같은 조건을 쓰는 다른 지역에도 동일하게 적용된다.

**로컬 데이터 한계(정직하게 기록)**: 강릉·경주는 `prisma/seed.ts`가 심는 POI fixture가 없다(제천만
있음) — 그 결과 로컬 환경에서는 두 지역 모두 Network 축이 0점(POI 근거 없음)으로 계산된다. 이는 실제
API 호출 성공 여부에 달려 있으며(`DATA_MODE=hybrid`), 임의 POI를 만들어 채우지 않았다. 방문객수/관광
자원수요(`touResDemIxVal`/`visitorCnt`)도 여전히 추정치(fixture 주석에 명시)다.

신규 파일: [contestScenarios.ts](../src/lib/domain/contestScenarios.ts). 신규 테스트:
`contestScenarios.test.ts`(24, 카탈로그 검증+정상 흐름+실제 차별화), `ProjectInputForm.test.tsx`에 추가한
3건(카드 표시, 프리셋 적용, 적용 후 재수정 가능), `planBuilder.test.ts`에 추가한 `buildKpis` 컨텍스트
1건.

## Phase 5. 다채널 홍보 초안 — `DONE(로컬+원격+DB+배포+브라우저 검증)` (2026-08-01 최종 확인)

4개 커밋으로 순차 구현했다. 상태를 아래처럼 명확히 구분한다.

| 구분 | 상태 |
|---|---|
| 로컬 코드 구현 | 완료 |
| 로컬 자동 테스트 | 완료(89개: 5-A 21 + 5-B 30 + 5-C 27 + 보완 11, 이후 채널 우선순위/카드뉴스 등 보완분 별도) |
| GitHub `origin/main` 반영 | **완료** — 4개 커밋 모두 `origin/main`에 push 확인 |
| DB migration 적용 | **완료** — `20260726000000_add_selected_plan_promo_content`가 `prisma migrate status` 기준 Production Neon DB에 이미 적용되어 있음을 2026-08-01에 확인(9개 migration 중 pending 없음) |
| 실제 브라우저 통합 검증 | **완료(2026-08-01)** — Production(`tour-dna.lib.lc`)에서 Playwright Chromium으로 홍보자료 생성·재생성·역할별(여행사/지자체) 채널 순서·중복 헤더 없음·전체 복사(클립보드)·새로고침/재접속 유지·모바일 레이아웃까지 실제 요청/응답과 DOM을 함께 확인 |
| 운영 배포 반영 | **완료** — Vercel Production이 해당 커밋들을 포함해 배포됨(`vercel inspect`로 Ready 상태 확인) |

- **5-A** (`5b8d872 feat: add deterministic promo content builder`) — `src/lib/domain/promoContent.ts`의
  `buildPromoContent()`: 저장된 Project/SelectedPlan/Evidence만 입력받는 결정론적 순수 함수. 제안서
  요약(정확히 3문장), 랜딩페이지(제목/본문), Instagram(캡션/해시태그), 블로그(제목/본문),
  역할별(`TRAVEL_AGENCY`/`LOCAL_GOV`) discriminated union 콘텐츠를 생성한다. `MISSING`/`provenance` 없음
  Evidence는 제외, `ESTIMATED`는 추정 표시, course 순서·`timeSlot`·`mealPurpose` 보존. LLM 미사용,
  임의 수치·장소 생성 없음. 테스트 21개(`tests/unit/promoContent.test.ts`).
- **5-B** (`fc5e8f8 feat: persist promo content`) — `SelectedPlan.promoContent Json?` 컬럼 추가
  (migration `20260726000000_add_selected_plan_promo_content`, 기존 행은 NULL 유지). Prisma 조회 결과
  → `BuildPromoContentInput` 매핑(`promoContentAdapter.ts`, Evidence의 `rawValue`/`provenance`/`axis`를
  명시적으로 변환, 이중 단언 없음), `PromoContent` → Prisma JSON 안전 직렬화(재귀 검증, Date/Map/Set/
  non-finite 거부), 저장된 JSON의 Zod 런타임 검증(`promoContentAdapter.ts`, `promoContent.schema.ts`),
  생성/조회/저장 서비스(`promoContentService.ts`)와 덮어쓰기 보호(`overwrite` 옵션, `Prisma.DbNull` 조건부
  `updateMany`로 동시성 재확인), 서버 액션 3종(`plan/actions.ts`). 테스트 30개.
- **5-C** (`7460365 feat: add promo content editor`) — 실행안 화면에 `PromoContentEditor` 섹션 추가,
  역할별 편집 UI(`ProposalSummaryEditor`/`LandingEditor`/`InstagramEditor`/`BlogEditor`/`RoleContentEditor`/
  `PromoContentSources`), 개별/전체 클립보드 복사(`promoContentFormat.ts`), 저장되지 않은 변경 상태 표시,
  인쇄 화면(`print/page.tsx`)에 검증된 홍보자료만 출력(잘못된 JSON은 조용히 미출력). 테스트 27개.
- **보완** (`a264db6 fix: require confirmation before overwriting existing promo content`) — 최초 생성
  호출이 `alreadyExists`를 반환하거나 손상된 콘텐츠(`invalidContent`)를 복구할 때도 사용자 확인 없이
  `overwrite:true`를 호출하지 않도록 수정(원래 계획대로 "재생성" 버튼만 사전 확인을 받고 있었음).
  `print/page.tsx` 홍보자료 출력에 대한 자동 테스트(`PrintPage.test.tsx`, 6개) 추가. 테스트 11개.
- **알려진 설계 트레이드오프**: `promoContent.ts`/`promoContentFormat.ts`가 `@/lib/format`,
  `@/lib/validation/codes`를 import한다 — 다른 domain 계층 파일은 domain 밖을 전혀 import하지 않는
  기존 관례에서 벗어난 의도적 예외(기존 라벨·포맷터 재사용 지시를 따르기 위함).
- **완료 확인**: 위 표의 4개 항목 모두 2026-08-01에 완료 확인됐다. 상세 근거는 이 문서 상단 "다음
  작업 순서(P0)"의 P0-3/P0-4와 맨 아래 "Production 실사용 검증" 섹션 참고.

## Phase 6. 조건 수정 및 안전한 재분석 — `DONE(로컬+원격+배포, 2026-08-02)`

- **진입점**: `src/app/projects/[id]/edit/page.tsx` + `ProjectEditForm.tsx` — `/projects/[id]/analysis`에
  "조건 수정" 링크 추가. `[id]/layout.tsx`가 이 라우트도 함께 감싸 비밀번호 보호 프로젝트는 잠금 화면만
  보이고 데이터 조회 자체가 실행되지 않는다(기존 분석/실행안/인쇄 화면과 동일한 접근 제어를 코드 추가
  없이 그대로 상속).
- **계산·저장 분리**(`analyzeProject.ts`): 기존 `runAnalysisForProject()`를 `computeProjectAnalysis()`
  (DB 쓰기 없는 순수 계산)와 `persistProjectAnalysis(client, ...)`(주입된 Prisma 클라이언트로만 쓰기)로
  분리했다. 재분석 액션(`edit/actions.ts`)은 먼저 계산만 수행해 실패하면 DB를 전혀 건드리지 않고,
  성공했을 때만 `prisma.$transaction`으로 `Project`/`ProjectInput` 갱신·`SelectedPlan` 삭제·기존
  `AnalysisResult`(cascade로 `StrategyResult`/`Evidence`까지) 교체를 원자적으로 실행한다.
- **정책(2026-08-02 단순화)**: 재분석에 성공하면 기존 분석·선택 전략·실행안·홍보자료를 전부 삭제하고
  새 결과로 교체한다(운영 DB가 전부 테스트 데이터라는 판단에 따라 "실행안은 남기고 다음 전략 선택 때만
  교체"하던 초기 설계를 단순화). `Project.selectedStrategyResultId`도 null로 초기화해, 사라진 전략을
  계속 가리키다 `/plan`에서 크래시하는 일이 없다(`/plan`이 `selectedStrategyResultId` null을 보고
  `/analysis`로 안전하게 리디렉션하는 기존 가드를 그대로 활용).
- **경고·명시적 동의**: 실행안(홍보자료 포함)이 있는 프로젝트는 편집 화면에 "삭제됩니다. 삭제된 내용은
  복구할 수 없습니다" 경고와 필수 체크박스(`acknowledgeOverwrite`)를 보여주고, 서버 액션도 동일 조건을
  다시 검사해 폼을 우회한 요청도 확인 없이 통과하지 못하게 한다.
- **중복 제출·동시 재분석 방지**: 폼 렌더 시점의 `Project.updatedAt`을 낙관적 동시성 토큰으로 트랜잭션의
  `updateMany` where 절에 포함시켜, 이미 처리된 요청의 재제출은 0건 갱신으로 안전하게 거부된다(신규
  Prisma 필드 추가 없이 기존 `@updatedAt` 컬럼만 사용).
- **테스트**: `tests/unit/analyzeProject.test.ts`(계산/저장 분리 회귀, 3개), `tests/unit/updateProjectAndReanalyzeAction.test.ts`(11개 — 실행안 없음/있음, 확인 체크 누락, 유효하지 않은 입력, 계산 실패,
  동시성 충돌, 비밀번호 보호 프로젝트).
- **검증**: 2026-08-02 Production(`tour-dna.lib.lc`)에서 Playwright로 조건 수정 화면 프리필·경고
  배너·재분석 성공·기존 실행안/홍보자료 삭제(재분석 후 `/print`·`/plan`이 `/analysis`로 리디렉션되는
  것으로 확인)·새 전략 3안 표시·새 전략 선택 후 실행안·홍보자료 재생성·새로고침/재접속 유지까지 전부
  확인. 콘솔 오류·4xx/5xx·Vercel Runtime 오류 없음.
- **마이그레이션 불필요**: 기존 스키마 필드만 사용(`Project.updatedAt`은 이미 존재).
- 커밋: `afa1b653d339faed966223a974a06283cac2b3b3`("feat: 프로젝트 조건 수정과 안전한 재분석 추가"),
  `origin/main`에 push 완료.
- **지역 변경도 이 화면에서 함께 지원한다**(별도 화면·별도 플래그 없음) — `ProjectEditForm.tsx`의
  시·도/시·군·구 select는 신규 생성 폼과 동일하게 지역을 바꿀 수 있고, `updateProjectAndReanalyzeAction`이
  새 `regionCode`로 `computeProjectAnalysis`를 그대로 다시 호출한다. 지역을 바꾸면 DNA 5축·유사지역
  비교·전략·POI·실행안까지 전부 새 지역 기준으로 재계산되며(사실상 새 분석), 이 경우에는 미리보기
  문구도 "지역을 변경했습니다 — 관광 DNA 5축부터 전략·실행안까지 새 지역 기준으로 전부 다시
  계산합니다"로 바뀐다(2026-08-13 명시적으로 구분해 안내하도록 보강).
- **DNA 불변성 원칙(2026-08-13 재확인 및 회귀 테스트 추가)**: 지역이 같다면 역할/국적/선호 테마/
  여행월을 바꿔도 관광 DNA 5축(raw score)은 절대 달라지지 않는다 — `computeProjectAnalysis`가
  `buildDnaEngineInput(regionCode, baseYm)` 두 값만으로 DNA를 계산하고, role/nationality/
  preferredThemes/travelMonth는 이후 전략(`computeStrategies`) 계산에만 쓰이는 구조이기 때문이다.
  `tests/unit/analyzeProject.test.ts`에 이 사실을 실측(호출 인자·결과 동일성)으로 고정하는 회귀
  테스트를 추가했다 — 문서나 기억이 아니라 실제 호출로 검증한다.

## Phase 4-보완2. 역할별 화면 노출 강화 — `DONE(로컬, 2026-08-13)`

역할별 점수·KPI·체크리스트·위험·예산·홍보자료(roleContent) 계산 로직은 Phase 4/4-보완에서 이미
정교하게 구현돼 있었다(`audienceContext.ts`의 `computeRoleFit`/`computeRoleChecklistNotes`/
`computeRoleKpiNotes`/`computeRoleRiskNotes`, `strategyResourcePlan.ts`의 역할별 예산·협력사,
`promoContent.ts`의 역할별 `roleContent`·채널 우선순위). 전수 조사 결과 **계산은 역할별로 갈리지만
화면 레이아웃·강조 순서는 세 역할 모두 거의 동일**했고, 특히 실행안(`/plan`) 화면은 `project.role`을
전혀 표시하지 않아 "다른 업무 도구"로 느껴지기 어려웠다. 이번에는 계산 로직·전략 점수식·KPI/체크리스트/
위험 산식은 전혀 바꾸지 않고, 다음만 최소로 추가했다.

- **`buildRoleDecisionSummary()`** ([roleDecisionSummary.ts](../src/lib/domain/roleDecisionSummary.ts),
  신규) — DNA 5축 중 가장 약한 축과 역할을 조합해 "지금 무엇을 먼저 검토해야 하는가"를 한 문장으로
  요약하는 CURATED 순수 함수(LLM 미사용). 예: 강릉/여행사 → "소비(Spend) 축이 상대적 약점으로 나타나
  ... 유료 체험·로컬 상품을 엮어 객단가를 높이는 구성이 우선입니다", 경주/지자체 → "... 소비 접점을
  늘리는 지역 상권 연계 사업이 우선입니다", 제천/축제기획자 → "... 현장 소비를 늘리는 로컬 부스·상품
  연계 구성이 적합합니다" — 같은 약점 축이라도 역할에 따라 문장이 실제로 달라진다. `/analysis`와
  `/plan` 화면 상단에 노출한다(`/plan`에는 이전에 없던 역할 표시 자체도 함께 추가).
- **`StrategyComparisonTable`에 `currentRole` 배지 추가** — 세 역할 전체 roleFit 순위는 기존처럼
  접힌 상세("더보기")에 남기고, 지금 이 프로젝트의 역할에 대한 적합도 점수만 기본 표(접지 않은 영역)에
  "내 역할 적합도 N점" 배지로 노출해 더보기를 펼치지 않아도 바로 확인할 수 있게 했다.
- 강릉(`TRAVEL_AGENCY`)/경주(`LOCAL_GOV`)/제천(`FESTIVAL_PLANNER`) 대표 프로젝트에서 실제 브라우저로
  확인 — 세 역할 모두 서로 다른 요약 문장이 나오고, DNA 5축 값은 그대로 유지됨을 확인했다.
- **남은 제한**: 홍보자료 화면(`PromoPreviewPanel`)의 역할별 콘텐츠(roleContent) 노출 수준, 실행안
  체크리스트/KPI/위험 항목의 시각적 역할 태그(현재는 평문 목록에 섞여 있음)는 이번 범위에서 다루지
  않았다 — 계산 로직 자체는 이미 역할별로 정확히 다르므로 우선순위가 낮은 후속 UI 개선으로 남긴다.

## Phase 4-보완3. 전략 추천 근거 설명 강화 — `DONE(로컬, 2026-08-13)`

전략 생성 domain(`strategy.ts`의 `reasons`)과 전략 템플릿 고유 필드(`coreProblem`/`coreResource`/
`stayStyle`, 2026-07-31 마이그레이션)는 이미 "왜 이 전략인가"에 필요한 근거를 전부 계산해 저장하고
있었다. 전수 조사 결과 문제는 계산이 아니라 **연결**이었다 — `StrategyCard`는 이 근거를 "차별화
포인트"라는 평평한 2줄 목록으로만 보여줬고(2026-08-06 결정으로 coreProblem은 화면에서 완전히 제외),
"공공데이터 근거 → 지역 진단 → 추천 이유 → 실행 방향"으로 이어지는 논리 구조가 없었다. 새 점수식·새
근거·LLM 생성기를 만들지 않고, 이미 저장된 값만 재배열하는 순수 함수 하나로 해결했다.

- **`buildStrategyRationale()`**([strategyRationale.ts](../src/lib/domain/strategyRationale.ts), 신규) —
  1순위 전략에만 4단계 근거를 만든다: ① 데이터 진단(reasons의 지표 기반 서술 재사용) → ② 해석
  (템플릿의 coreProblem 재사용) → ③ 추천 이유(coreResource + roleFitReason 재사용) → ④ 실행 방향
  (stayStyle + consumptionTouchpoints 재사용). `roleDecisionSummary.ts`(역할이 지금 우선 볼 것)와는
  책임을 분리해 문장이 겹치지 않는다. coreProblem/coreResource/stayStyle이 없는 레거시 분석(2026-07-31
  이전)은 `null`을 반환해 근거를 지어내지 않고, 기존 "차별화 포인트" 목록으로 안전하게 대체된다.
- **문법 안전성**: coreResource/stayStyle은 템플릿마다 받침 유무가 달라("...콘텐츠"는 받침 없음,
  "...맛집"은 받침 있음) 바로 뒤에 을/를을 붙이면 절반은 어색해진다 — "기반의"/"기반으로"처럼 받침과
  무관하게 항상 같은 형태인 연결어만 사용한다(`promoContent.ts`의 조사 처리 원칙과 동일, 실제 브라우저
  검증 중 "콘텐츠을"이 나오는 것을 발견해 수정).
- **StrategyCard**: 1순위 전략에만 "추천 근거" 4단계 블록을 보여주고(②에서 coreProblem을 다시
  노출하므로 2026-08-06 중복 제거 원칙은 2·3순위 카드에서만 유지), 2·3순위는 기존 "차별화 포인트"
  2줄을 그대로 유지한다(11절 방침 — 길이 제한).
- **`buildShortStrategyRationaleLine()`** — plan/print 화면용 축약형 한 줄("선택 전략 근거: coreProblem
  — coreResource 기반으로 보완하는 전략입니다"). analysis의 4단계 블록을 복제하지 않고, plan 화면에는
  이전에 없던 역할 표시도 함께 추가했다.
- **Evidence 연결**: 새 화면을 만들지 않고 카드에 이미 있던 "근거 보기" 접힌 상세(EvidenceTable)를
  그대로 재사용한다 — 추천 근거 블록 바로 아래에 있어 추가 링크가 필요 없었다.
- 강릉(여행사)/경주(지자체)/제천(축제기획자) 대표 프로젝트에서 실제 브라우저로 4단계 근거가 지역마다
  실질적으로 다름을 확인했고, 강릉에서 역할만 여행사→지자체로 바꿔 재분석해 ①②④(지역·전략 데이터
  기반)는 그대로, ③(추천 이유)만 역할에 따라 바뀌며 DNA 5축은 그대로임을 확인했다.
- **사실성 가드**: 이 함수는 어떤 통계·순위·경제효과·방문객/매출 증가율도 새로 계산하지 않는다 —
  100% 기존 저장값의 재배열이며, LLM을 쓰지 않아 OpenRouter와 완전히 독립적으로 동작한다.
- **남은 제한**: 유사지역 비교(`regionComparisonSnapshot`)는 추천 근거와 연결하지 않았다 — 모든 전략
  설명에 억지로 끼워 넣기보다, 이미 분석 화면에 독립 섹션으로 충분히 노출돼 있어 이번 범위에서는
  제외했다. 전략 비교표(`StrategyComparisonTable`)에도 "핵심 추천 근거" 열은 추가하지 않았다 — 표가
  이미 4개 행으로 채워져 있고 1순위 카드가 훨씬 상세한 근거를 보여주므로 중복이라고 판단했다.

## Phase 7-보완. 유사지역 벤치마킹 인사이트 — `DONE(로컬, 2026-08-13)`

유사지역 비교(`regionSimilarity.ts`, 2026-08-02)는 이미 top3 유사지역·DNA 5축 차이·10점 이상 격차만
제시하는 `benchmarkPoints`까지 계산해 저장하고 있었다. 부족했던 것은 "비슷한 지역을 보여주는 것"에서
"대상 지역의 약점 축을 어떤 유사지역이 보완할 수 있는지"로 이어지는 **선택**이었다 — 기존
`benchmarkPoints`는 비교 지역별로 앞서는 모든 축을 나열할 뿐, "이 지역의 최약축"과 연결돼 있지 않았고,
등록 POI 카테고리 비중 차이는 거리 계산에만 쓰이고 화면에는 집계 문구(건수)로만 남아 있었다.

- **`regionSimilarity.ts` 보강(순위·거리식은 그대로, 출력만 확장)**: `computePoiCompositionDistance`가
  이미 계산하던 카테고리별 비중을 버리지 않고 `ComparedRegion.poiCategoryShareDiffs`로 내보낸다(신규
  optional 필드, 레거시 snapshot에는 값이 없어 `null`로 안전하게 처리됨). 유사도 산식·순위 로직·
  `BENCHMARK_MARGIN` 임계값은 전혀 바꾸지 않았다.
- **`buildRegionBenchmarkInsight()`**([regionBenchmarkInsight.ts](../src/lib/domain/regionBenchmarkInsight.ts),
  신규) — 대상 지역의 최약축(최대 2개)마다, 이미 top3로 선정된 유사지역 중 그 축을 10점 이상(기존
  `BENCHMARK_MARGIN`과 동일 기준, 새 임계값 없음) 앞서는 지역을 찾아 격차가 가장 큰 곳을 선택한다.
  같은 지역을 중복 사용하지 않고, 조건을 만족하는 지역이 없으면 축을 건너뛴다. "①왜 비교하는가(이미
  top3로 선정된 사실만) ②무엇이 더 나은가(축 차이+상관 수준 해석, 인과 단정 없음) ③무엇을 참고할 수
  있는가(POI 카테고리 비중 차이가 있을 때만, 없으면 일반 안내로 대체)" 3단 구조로 문장을 만든다.
  역할은 마지막 클로징 구절("상품 구성/정책·사업 구조/프로그램 연계 구조를 검토할 때 참고할 가치가
  있습니다")만 가볍게 바꾼다 — role-specific 알고리즘은 만들지 않았다.
- **문구에는 항상 사용자 표시지수(displayDiff)만 사용**한다 — 축 선정·임계값 판정(어떤 지역이 후보가
  되는지)은 내부 원점수(raw)로 하고, 화면에 보여줄 숫자는 반드시 표시지수로 통일해 혼용하지 않는다.
- **empty state 허용**: 조건을 만족하는 유사지역이 없으면 "현재 유사지역 중 명확한 벤치마킹 우위가
  확인되는 지역이 없습니다"를 그대로 보여주고 억지로 하나를 추천하지 않는다.
- **재현성·성능**: `regionComparisonSnapshot`(이미 페이지가 조회한 값)만 입력으로 받는 순수 함수라
  전국 재계산·추가 DB 조회가 전혀 없다. 같은 snapshot이면 항상 같은 벤치마킹 결과가 나온다.
- **전국 샘플 검증(2026-08-13)**: local DB의 전국 255개 지역 중 32곳을 결정론적으로 샘플링해 확인한
  결과 — benchmark 없음 12곳(37.5%), 1개 18곳(56%), 2개 2곳(6%). 극단적으로 전부 없거나 전부 생성되는
  치우침이 없어, 새 임계값을 만들지 않고 기존 `BENCHMARK_MARGIN`(10점)을 그대로 재사용한 것이 타당함을
  확인했다.
- `/analysis`의 유사지역 비교 섹션 안(카드 아래)에 "벤치마킹 포인트" 블록을 추가했고, `/print`에는
  핵심 1~2개만 압축해서 넣었다. `/plan`에는 넣지 않았다(analysis/print에서 이미 충분, 중복 노출 방지).
- 강릉(여행사, 소비 축 약점 → 제주시 벤치마킹)/경주·제천(둘 다 empty state)에서 세 지역이 서로 다른
  결과를 보임을 실제 브라우저로 확인했다. 강릉을 재분석해 새 `regionComparisonSnapshot`이
  `poiCategoryShareDiffs`를 포함하자 "쇼핑·관광지 공급 비중도 상대적으로 높습니다"라는 POI 근거가
  실제로 반영됨을 확인했고(레거시 snapshot에서는 이 근거 없이 일반 안내로 안전하게 대체됨), 검증 후
  대표 프로젝트를 원래 조건으로 복원했다.
- **남은 제한**: 역할별 benchmark 알고리즘, 유사지역 자체의 순위/선정 기준(similarity ranking)은 이번
  범위에서 변경하지 않았다 — 이미 계산된 top3 후보 안에서만 선택한다(방식 A).

## Phase 3-보완. 사업 사전검증 리포트 실무 판단 강화 — `DONE(로컬, 2026-08-13)`

`preLaunchValidation.ts`(2026-08-03)는 이미 데이터 신뢰도·POI 공급 충분성·이동 현실성·지역 차별성
4가지 신호를 게이팅 원칙(치명적 조건 우선, 단일 평균 금지)으로 판정하고, provenance 기반 데이터
신뢰도 등급(TRUSTED/ESTIMATED/UNCLASSIFIED/MISSING)을 사업 준비도와 분리해 계산하며,
`kpiLinking.ts`로 위험·보완사항을 관련 KPI에 연결하고 있었다. 부족했던 것은 (1) `reason`이 신호
라벨만 나열해 "왜 조건부인가"를 구체적으로 설명하지 못했고, (2) "보완하면 무엇이 나아지는가"가
없었으며, (3) 이 리포트가 실행안(plan/print)에만 있어 전략을 아직 선택하지 않은 분석 단계에서는
"지금 추진해도 되는가?"를 전혀 알 수 없었다는 점이다.

- **`reason`에 구체적 근거 포함**: 판정을 좌우한 첫 신호의 `detail`(이미 계산된 문장)을 그대로
  이어붙인다 — 예: "데이터 신뢰도, POI 공급 충분성에 보완이 필요해(데이터 신뢰도: 다음 축은 신뢰도가
  낮은 근거를 포함합니다 — 수요(Demand)(추정값 근거 포함)) 조건부 권장으로 판단합니다." 새 문장을
  짓지 않고 재배열만 한다.
- **`expectedOutcomeIfImproved`(신규 필드)**: 판정 유형(권장/조건부/보완 후 재검토)별 정형 문구로
  "보완하면 무엇이 나아지는가"를 한 줄 더 보여준다(근거 없는 효과·수치 없음, 3개 유형별 고정 문구).
- **`/analysis` 화면에 사전검증 최초 노출(가장 큰 보강)**: 이전에는 plan/print에만 있어 전략을
  선택하기 전에는 "추진해도 되는가?"를 판단할 방법이 없었다. `computePreLaunchValidation()`을 코스가
  없는 상태(`totalCourseDays=0`)로 그대로 호출한다 — 이 함수는 원래부터 코스가 없으면 POI 공급·이동
  현실성을 안전하게 "확인 필요"(UNKNOWN)로 처리하도록 설계돼 있어(레거시 호환 경로를 그대로 재사용),
  새 분기·새 판정 로직을 전혀 추가하지 않았다. 데이터 신뢰도·지역 차별성 두 신호만으로도 최소
  "조건부 권장"까지는 항상 판단 가능하다.
- 기존 `PreLaunchValidationSection` 컴포넌트를 그대로 재사용한다(신규 UI 컴포넌트 없음) — 위험·KPI가
  없으면 해당 블록이 조용히 생략되도록 이미 설계돼 있어 no-plan 상태에서도 화면이 깨지지 않는다.
- **역할 차별화는 기존 구조에서 이미 흘러들어온다**: `SelectedPlan.risks`(주요 위험)에는
  `computeRoleRiskNotes()`가 만든 역할별 위험이 이미 포함돼 있어, 사전검증의 "주요 위험" 목록도 역할이
  바뀌면 함께 바뀐다 — 강릉을 여행사→지자체로 재분석하자 "예약 취소·노쇼로 인한 상품 운영 손실
  가능성"이 "정책 보고 시점과 실제 데이터 집계 시점이 어긋날 수 있음"으로 실제로 바뀜을 확인했다.
- **계절성**은 `computeSeasonalRiskNotes()`가 이미 위험 목록에 포함시키고 있어 별도 신호를 추가하지
  않았다. **유사지역 벤치마킹 연동**은 이번 범위에서 제외했다 — 판정 자체를 벤치마킹 결과에 종속시키면
  인과관계를 과장할 위험이 있고, 벤치마킹 포인트는 이미 분석 화면에 독립 섹션으로 충분히 노출돼 있다.
- 강릉/경주/제천 대표 프로젝트에서 분석 단계 사전검증 결과가 실제로 다름을 확인했다 — 강릉·경주는
  지역 차별성 "양호"(단, 서로 다른 축: 체류 vs 소비), 제천은 "보완 필요"(뚜렷한 차별 축 없음). 세 곳
  모두 데이터 신뢰도는 수요 축 추정값으로 "보완 필요"라 최종 판정은 공통으로 "조건부 권장"이지만, 그
  이유와 지역 차별성 근거는 서로 다르다.
- **재현성·성능**: 새 DB 조회·전국 재계산이 전혀 없다 — analysis 화면이 이미 조회한 `axisData`·
  `regionComparisonAnalysis`만 재사용한다. 위험·KPI 연결도 plan 화면과 동일한 함수를 그대로 재사용한다.

## Phase 7. 비교 코호트와 행정 범위 설명 — `DONE(사용자 표시지수 도입, 2026-08-07)`

- 대전 라벨("대전광역시 (DNA 지표는 유성구 기준)")은 이미 반영됨(직전 세션, `regionQueries.ts`).
- **DNA 점수 표현 개선 1단계(2026-08-07, 설명 문구 보완)**: 화천군 사례("수요 0, 다양성 100" 등이
  절대값처럼 보이는 문제)를 조사해, 0/100이 정확한 최저·최고인지 반올림 근사인지 구분해 안내하는
  방식을 우선 적용했다.
- **DNA 점수 표현 개선 2단계(2026-08-07, 표시지수 도입)**: 설명 문구만으로는 숫자 자체가 주는 절대적
  인상을 완전히 상쇄하기 어렵다고 판단해, **내부 분석점수와 사용자 표시지수를 분리**하는 계층을
  도입했다 — 1단계의 0/100 확정/근접 배지 로직은 이 계층으로 대체됐다. DNA 산식(`dna.ts`)·
  최소-최대 정규화 공식(`normalize.ts`)·전략 계산·`AnalysisResult` 저장 값은 전혀 바꾸지 않았다.
  - `src/lib/domain/dnaDisplayScore.ts`(신규, 순수 함수)가 내부 0~100 분석점수를 사용자 표시용
    10~90 지수로 균등 비율 압축한다(단순 선형 변환). 27개 지역 실제 분포로 시그모이드 계열(중앙권을
    오히려 확대해 왜곡)과 구간별 압축(경계에서 인위적 굴절, 상위 구간 변별력 손실)을 함께 비교한
    결과, 선형 압축이 "순위·비율 관계를 정확히 보존하면서 설명하기 가장 쉬운" 방식이었다.
  - 연계(Network) 축도 다른 4축과 동일한 규칙을 적용한다(축마다 다른 보정 공식을 쓰지 않는다는
    원칙) — 실제로는 이 축 값 범위가 73~84로 좁아 표시값 이동은 크지 않다.
  - 강점/개선 판정은 여전히 원본 내부 분석점수로 계산하고, 화면에 그리는 숫자(카드·레이더 차트·
    강점/개선 배지)만 표시지수로 통일했다 — 같은 화면에서 서로 다른 숫자가 보이지 않는다.
  - 라벨을 "상대점수"에서 "DNA 상대지수"로 정리했다.
  - 유사지역 비교·관광사업 기회·전략 3안 비교·사업 사전검증 리포트 배지에서 내부 규칙 버전
    문자열(`region-similarity-rules-v1` 등)을 화면에서 제거했다(1단계에서 반영, 유지).

## Phase 8. 프로젝트별 비밀번호 접근 보호 — `DONE(로컬+원격, 축소 구현)` (2026-07-30)

- 계정/로그인 시스템은 도입하지 않았다 — `OwnerSession`/계정 기반 소유권/역할별 권한(OWNER/VIEWER)은 이번 범위에서 의도적으로 제외했다. 대신 "비밀번호를 아는 사람은 해당 프로젝트에 한해 접근할 수 있다"는 수준의 보호만 구현했다.
- `Project.passwordHash`(nullable, null=공개) 컬럼 하나만 추가(`add_project_access_protection` migration). `publicId`는 도입하지 않음(기존 `Project.id`를 그대로 URL 식별자로 계속 사용 — 하위 호환).
- `ProjectAccessAttempt`(프로젝트당 1행, `failedCount`/`lockedUntil`)로 무차별 대입을 DB에 기록해 방어한다 — Vercel 서버리스 인스턴스는 상태를 공유하지 않으므로 메모리 카운터 대신 공유 DB 행을 사용한다. `ProjectOwnerRecovery`는 여전히 보류(계정이 없으므로 "복구" 개념 자체가 적용되지 않음).
- 서명은 `PROJECT_ACCESS_SECRET`(없으면 `SITE_ACCESS_PASSWORD`로 폴백) 기반 HMAC-SHA256 쿠키(`src/lib/services/projectAccess.ts`, 기존 `siteAuth.ts`와 같은 무-세션-테이블 방식). 서명 키가 전혀 없으면 항상 잠금 상태를 유지한다(폐쇄 실패).
- 공통 가드(`getProjectAccessStatus`/`assertProjectAccessible`)를 `src/app/projects/[id]/layout.tsx`(분석/실행안/인쇄 3개 화면 공통)와 모든 관련 Server Action(`analysis/actions.ts`, `plan/actions.ts`)에 배선했다 — 화면마다 다른 방식으로 판정하지 않는다.
- 기존 `SITE_ACCESS_PASSWORD` + `src/proxy.ts` 전역 게이트는 그대로 유지한다(컷오버 8-E는 이번 범위에서 진행하지 않음 — 사이트 전체 게이트와 프로젝트별 보호는 별개 계층으로 공존).
- 목록 화면(`listProjectSummaries`)은 `passwordHash`를 절대 응답에 포함하지 않고 `isProtected` boolean만 파생해 노출한다. `getProjectDetail`/`getDemoProject`는 `omit: {passwordHash: true}`로 조회한다.
- 비밀번호 변경/해제 UI, `publicId`, `ProjectOwnerRecovery`는 후속 과제로 명시적으로 남긴다.

## Phase 9. 무료 운영비 가드 — `NOT_STARTED`

- `COST_MODE`, `ALLOW_PAID_SERVICES` 환경변수가 코드/`.env.example` 어디에도 없음.
- `docs/free-cost-policy.md` 파일 없음.
- 현재 운영 방식(Vercel Hobby + Neon Free)은 문서상 유지되고 있는 것으로 보이나, 한도 접근 경고/자동 중단 로직은 없음.

## Phase 10. `/admin/ops` 읽기 전용 운영 페이지 — `NOT_STARTED`

- `src/app`에 `admin` 관련 경로는 `/api/admin/sync-tourism-data`(동기화 트리거, `CRON_SECRET` 인증) 하나뿐. 화면(`/admin/ops`)은 없음.
- `OperationalEvent` 모델 없음.

## Phase 11. 빌드·CI·동기화 정비 — `NOT_STARTED`

- `.github/workflows/` 디렉터리 없음(Glob 결과 0건).
- `.nvmrc` 없음, `package.json`에 `engines`/`packageManager` 필드 없음.
- 로컬 환경 `node v24.11.1` / `npm 11.6.2` 확인 — 마스터 문서가 지목한 "npm 11 환경에서 npm ci 실패" 문제를 이번 세션에서 직접 재현하지는 않았음(BLOCKED: 재현 여부는 Phase 11 착수 시 `npm ci` 실행으로 재확인 필요).
- `prisma`가 `dependencies`에 있음(devDependency 아님) — 마스터 문서 Phase 11-3 대상.

## Phase 12. 실제 경로(카카오모빌리티 자동차 길찾기 API) — `DONE(로컬+테스트, 2026-08-06, PRIVATE_VEHICLE만) / RouteCache는 BLOCKED`

- `src/lib/services/route/`(routeService/kakaoRouteProvider/haversineRouteProvider/routeCache/courseRouteEnrichment)를 신설해 PRIVATE_VEHICLE 실행안의 인접 구간 이동 거리·시간을 카카오 실제 도로 경로로 계산한다. 키 없음/timeout/401/403/429/5xx/잘못된 응답/좌표 누락/캐시 조회·저장 오류 등 모든 실패는 기존 haversine 추정치(estimateTravel과 동일 공식)로 안전하게 대체된다.
- `RouteCache` Prisma 모델(migration `20260806011802_add_route_cache`, additive-only, Production 적용됨)은 만들어뒀지만 **`ROUTE_CACHE_ENABLED = false`로 읽기·쓰기를 비활성화했다**(2026-08-06 재확인) — 카카오 측 커뮤니티 공개 답변이 "이런 재사용 캐시는 저장 미지원"에 가까워, 공식 확인 전까지 안전한 쪽으로 껐다. `SelectedPlan.course`에 그 프로젝트 자신의 결과로 저장하는 것은 유지했으나 이 구분도 공식 확인 대상이다 — **Production 정식 운영 전 카카오 측 확인 필요(BLOCKED)**. 상세: `docs/route-api-status.md`.
- `SelectedPlan.course` JSON의 각 인접 구간에 `travelDistanceKm/travelMinutes/travelSource/travelProvider/travelCalculatedAt`을 함께 저장 — 인쇄 화면은 이 저장값만 읽고 외부 API를 다시 호출하지 않는다.
- 실행안 편집 저장 시 이전 course와 인접 POI 쌍을 비교해 바뀐 구간만 재호출한다(순서 변경·추가·삭제만 재호출 대상, 시간·체류시간만 변경은 재호출 없음).
- **화면 미표시 버그 수정(2026-08-06)**: 저장은 매번 성공했지만 새로고침 전 화면에는 반영되지 않던 버그를 고쳤다 — `savePlanAction`이 실제 반영한 `course.days`를 응답에 실어 돌려주고, `PlanEditor`가 저장 성공 시 그 값으로 로컬 state를 덮어쓴다. 상세 원인·수정: `docs/route-api-status.md` 2절.
- `CourseMap.tsx`는 여전히 Haversine 직선거리 기반 Polyline만 그리며(실제 도로 Polyline 미반영, 이번 범위 제외), 그 사실을 화면에 안내 문구로 명시했다.
- WALK/PUBLIC_TRANSPORT/MIXED는 기존 haversine 추정치를 그대로 유지한다(이번 범위는 PRIVATE_VEHICLE 전용).
- 헤더의 "잠금"(로그아웃) 버튼 제거 — 접근 제어 자체(`SITE_ACCESS_PASSWORD`, 프로젝트별 비밀번호)는 서버에서 그대로 유지된다.
- 테스트 40개 신규/수정(`tests/unit/route/`, `PlanEditor.test.tsx` 회귀 3건, `SiteHeader.test.tsx` 3건), 실제 카카오 API로 4개 구간 라이브 검증 + 실제 Production DB 임시 프로젝트로 브라우저 검증 완료 — `docs/route-api-status.md`에 결과 기록.

## 요약 테이블 (2026-08-01 갱신 — P0-3/P0-4 완료, Production 실사용 검증 반영)

> 2026-07-23 버전은 지정과제 7번 직결 항목과 심사 노출도를 최우선 기준으로 삼아 Phase 5를 P0-2로
> 두었다. Phase 5, 이어서 Phase 4, 대표 시나리오 3개(P0-2), DB migration 적용(P0-3), 원격 배포(P0-4)
> 순으로 전부 완료했다. 우선순위 열의 "P0-1~P0-4"는 이 문서 상단 "다음 작업 순서" 절과 동일한
> 시퀀스를 가리킨다(Phase 번호와 P0 순번은 1:1 대응이 아니다 — 시나리오·DB 적용·배포는 특정 Phase
> 번호가 없는 작업이다).

| Phase | 상태 | 우선순위(재조정 2026-08-01) |
|---|---|---|
| 1. Provenance 모델 + 실제 snapshot 저장 | **DONE**(1-A~1-E 전부 완료, 배포 반영됨) | 완료 |
| 5. 다채널 홍보 초안 | **DONE(로컬+원격+DB+배포+브라우저 검증)** — 2026-08-01 전체 완료(위 Phase 5 절 참고) | 완료 |
| 4. role/nationality/테마/여행월 반영 | **DONE(로컬+원격+배포)** | 완료 |
| 4-보완. 전략 3안 구조적 차별화(coreProblem 등 5필드) | **DONE(로컬+원격+DB+배포)** — migration 2026-08-01 적용 완료 | 완료 |
| (신규) 대표 시나리오 3개 차별화 + Production 브라우저 검증 | **DONE** — 2026-08-01 Production에서 Playwright로 강릉/제천/경주 3개 지역 DNA·전략·홍보자료 차별화 실검증 완료(맨 아래 섹션 참고) | 완료 |
| (신규) DB migration 적용 + 통합 검증(Phase 5 포함) | **DONE(2026-08-01)** | 완료 |
| (신규) 원격 반영(push) + 배포 | **DONE** | 완료 |
| 6. 조건 수정 및 안전한 재분석 | **DONE(로컬+원격+배포)** — 2026-08-02 완료(아래 Phase 6 절 참고) | 완료 |
| (신규) 관광사업 기회 3안(기회발굴, DNA↔전략 3안 사이) | **DONE(로컬+테스트)** — 2026-08-02, `origin/main` push는 이 문서 갱신 시점 기준 아직 전(맨 아래 섹션 참고) | 로컬 완료, push·배포 대기 |
| 8. 프로젝트별 비밀번호 접근 보호(축소 구현, 사이트 게이트 컷오버 제외) | **DONE(로컬+원격)** | 완료 |
| 2. 최소 갱신 구조(축소 구현) | NOT_STARTED | P1-6 |
| 11. 빌드/CI 정비 | NOT_STARTED | P1-7 |
| 10. `/admin/ops` | NOT_STARTED | P2-8 |
| 12. 실제 경로 API | NOT_STARTED(BLOCKED — 쿼터/REST키/약관 일부 미확인) | P2-9 |
| 3. 결정론/dataVersion | IN_PROGRESS(1개 결함 해소, 2개 결함 잔존 — 위 Phase 3 절) | P1 이후(휘발성 `collectedAt`/코호트 미반영 결함은 별도 작업 필요) |
| 6. 조건 수정/안전 재분석 | NOT_STARTED | P1 이후(P0~P1 완료 후 재검토) |
| 7. 코호트/행정범위 설명 | IN_PROGRESS(부분) | P1 이후(표시만 남은 작업이라 낮은 리스크로 아무 때나 끼워넣기 가능) |
| 9. 무료 운영비 가드 | NOT_STARTED | 전 Phase 횡단 적용(외부 API를 새로 호출하는 모든 구현 단위에 동시 적용) |

단위 테스트는 2026-08-01 기준 `tests/unit/*` 46개 파일에 637개(이 문서 갱신 시점에 `npx vitest run`으로
직접 재실행해 확인). `npm run typecheck`/`npm run lint`/`npm run build`도 같은 시점에 통과를 확인했다.
E2E(`e2e/core-flow.spec.ts` 8개)는 이번 라운드에서 재실행하지 않았으나, 그 대신 **Production 배포
자체를 Playwright로 직접 조작하는 실사용 검증**(맨 아래 새 섹션)을 수행해 핵심 화면 흐름의 실제 동작을
확인했다 — 로컬 jsdom 기반 단위테스트로는 확인할 수 없는 hydration·Server Action 네트워크 호출·
카카오맵 SDK 로드까지 포함한다.

## Phase 2 축소 검토 결과

현재 규모(7개 지역 × 6개 지표, 트리거는 Vercel Cron 1일 1회 + 관리자 수동 + CLI 3개뿐)에서는
`SyncJob`/`DatasetVersion`/advisory lock의 필요성이 입증되지 않는다 — 동시 트리거 충돌이 실제로
보고된 적이 없고, 중복 동기화가 일어나도 `upsertMetric`/`prisma.poi.upsert`가 이미 upsert라 데이터
정합성이 깨지지 않는다(최악의 경우 API 호출 낭비 정도). 따라서:

- **채택**: 기존 `DataSource` 모델에 `latestAvailableBaseYm`/`lastAttemptAt`/`lastSuccessAt` 필드만
  추가(신규 `SourceWatermark` 모델 대신 확장) — 최신 기준월 자동 탐색(probe)의 최소 기반.
- **보류**: `SyncJob`(재시도/잠금 상태 머신), `DatasetVersion`(원자적 버전 발행), PostgreSQL advisory
  lock. 전국 확대로 지역 수가 늘거나 동시 트리거가 실제 문제를 일으키면 그때 재검토.

## Phase 8 축소 검토 결과

- **`ProjectOwnerRecovery`(소유자 복구 코드)**: P1 이후로 보류. 근거: 공모전 시연 범위에서는 작성자가
  같은 브라우저로 계속 접근하므로 쿠키 분실 시나리오의 발생 확률이 낮고, 이 기능이 빠져도 핵심 사용자
  흐름(공개 열람/비밀번호 보호/OWNER 편집)은 완전히 동작한다. UI에는 "쿠키 삭제 시 복구 불가" 안내만
  넣는다.
- **`ProjectAccessAttempt`(비밀번호 rate limit)**: 재검토 결과 **유지 필요**로 결론. Vercel 서버리스
  환경에서는 인스턴스 간 공유 메모리가 없어 in-memory 카운터로는 rate limit이 보장되지 않고, 대체할
  기존 모델도 없다. 다만 이 모델은 **비밀번호 검증 기능과 반드시 같은 커밋(8-C)에서 함께 구현**한다 —
  rate limit 없이 비밀번호 검증만 먼저 배포하면 그 사이 브루트포스에 노출되는 중간 상태가 생기기
  때문이다(마스터 문서 "첫 번째 실행 지시" 3번의 "중간 상태를 production에 배포하지 않는다" 원칙과 동일).

## Phase 10 하향 근거

지정과제 7번 채점표(1차: 구현성/기획성/데이터활용/성장성, 최종: 적절성/완성도/실용성/발표력) 어디에도
"운영자 전용 관리 화면"은 항목으로 없다. 심사 시연은 공개 화면(랜딩~인쇄)만으로 완결되고, 데이터
신뢰성 문제(Phase 1)가 이미 근거 패널에 직접 노출되므로 `/admin/ops`가 없어도 감점 요인이 되지 않는다.
따라서 P2로 내린다 — 단, Phase 1의 provenance 필드가 생기면 이후 `/admin/ops` 구현 비용은 오히려
줄어든다(표시할 상태값이 이미 존재하므로).

## Production 실사용 검증 및 대표 시나리오 완성 (2026-08-01)

이전 세션들이 "로컬 구현 완료, 원격/DB/배포 별도 확인 필요"로 남겨뒀던 항목들을 실제 Production
환경(`https://tour-dna.lib.lc`, Neon `TOUR DNA` production 브랜치)에서 순서대로 검증하고 마무리했다.
코드 변경은 최소한(테스트 파일 2건, 아래 참고)이었고 대부분은 **검증·조사** 작업이다.

### 1) 운영 DB migration 적용

- `vercel link`로 로컬 저장소를 실제 Vercel 프로젝트(`prj_Ly8P5hB1ab9FjnS29OrG8Zoc82Db`)에 연결해
  Production이 쓰는 DB가 Neon `TOUR DNA` 프로젝트의 production 브랜치(`neondb`)임을 확인(Sensitive
  환경변수라 `DATABASE_URL` 값 자체는 조회 불가 — 호스트/DB명 일치만으로 확인).
- `npx prisma migrate status`로 9개 migration 중 `20260731000000_add_strategy_differentiation_fields`
  1건만 미적용임을 확인 → SQL이 전부 nullable 컬럼 추가(파괴적 변경 없음)임을 검토한 뒤
  `npm run db:migrate`로 적용 → 재조회로 전체 적용 확인, `information_schema.columns`로 신규 컬럼
  5종(`coreProblem`/`coreResource`/`stayStyle`/`executionDifficulty`/`expectedEffect`) 존재를 직접
  확인했다. `seed`/`migrate reset`/`db push`는 실행하지 않았다.

### 2) 테스트 파일 2건 수정(제품 코드 변경 아님) — 커밋 `afba7e9`

- `tests/unit/promoContentSchema.test.ts`: `npm run typecheck` 오류 2건을, `PromoContent`에서 특정
  필드가 "없는" 레거시 입력을 표현하기 위해 타입 단언 대신 구조분해(`Omit<T,K>`) 헬퍼로 교체해 해결.
- `tests/unit/promoContentFormat.test.ts`: "채널 헤더가 정확히 한 번씩 등장" 테스트가 부분 문자열
  카운트 방식이라, LOCAL_GOV 역할의 보도자료 제목이 실제 언론 배포 관행대로 "[보도자료] ..."로
  시작하는 것(의도된 동작)을 오탐으로 잘못 판정하고 있었다 — 줄 단위 정확 일치 카운트로 교체하고
  회귀 테스트를 추가했다. **제품 코드(`promoContentFormat.ts` 등)는 결함이 아니었으므로 수정하지
  않았다.**

### 3) Production 대표 시나리오(강릉) 종단 검증

강릉 프로젝트(지자체/관광재단, 10월, 2박3일)를 신규 생성해 프로젝트 생성 → 분석 → DNA 5축/근거 →
전략 3안(차별화 필드 포함) → 전략 선택 → 실행안(POI/코스/식사·숙박 슬롯/체크리스트/KPI) → 새로고침·
재접속까지 전부 정상 동작을 확인했다. 다만 이 1차 검증(Browser pane 자동화 도구 사용)에서 "홍보자료
생성" 버튼 클릭 시 서버 요청이 전혀 발생하지 않고 카카오맵도 로드되지 않는 것처럼 보여 결함으로
잠정 보고했었다.

### 4) "홍보자료 생성 무반응" 재조사 — 오탐으로 최종 확정

후속 조사에서 이 증상을 로컬 production build(`next build && next start`)로도 그대로 재현했으나,
**독립적인 Playwright(실제 헤드리스 Chromium)로 같은 페이지를 열자 정상 동작**했다(React hydration
완료, 버튼 클릭 시 Server Action이 정확히 1회 호출, 카카오맵 SDK 정상 로드). 두 환경의 결정적 차이는
`document.hidden` 값 — 문제가 재현된 환경은 항상 `document.hidden === true`(배경/비활성 탭 상태)였고,
정상 동작한 Playwright 세션은 `document.hidden === false`였다. 탭이 화면에 표시되지 않는 상태에서는
React가 해당 서브트리를 hydration하지 못해 `onClick` 기반 기능(홍보자료 생성 버튼, 지도 로딩
`useEffect`)이 전혀 실행되지 않았던 것 — **애플리케이션 결함이 아니라 이번 세션에서 쓴 Browser
자동화 도구(Browser pane)의 탭 가시성 한계였다.** 이후 독립 Playwright로 Production URL을 직접 열어
홍보자료 생성(요청 1회)·역할별 채널 순서·전체 복사(중복 헤더 없음)·새로고침/재접속 유지·모바일
레이아웃까지 전부 정상임을 재확인했고, Vercel Runtime 로그로도 해당 시간대에 4xx/5xx·Prisma 오류가
전혀 없음을 교차 확인했다. **교훈**: 이 앱(또는 유사한 App Router + Suspense 스트리밍 앱)을 헤드리스
브라우저 자동화로 검증할 때는 `document.hidden`이 `false`인지 먼저 확인할 것 — 배경 탭 상태에서는
정상 기능도 무반응처럼 보일 수 있다.

### 5) 대표 시나리오 3개(강릉/제천/경주) 실질 차별화 검증

기존 시연 프로젝트("충청북도 12월 소규모 여행 기획", "경상북도 10월 소규모 여행 기획")로 비교한 결과,
DNA 5축·전략 제목/순위·입력 조건은 3개 지역 모두 뚜렷이 달랐으나, **두 프로젝트 모두 2026-07-31
migration 이전에 분석되어 전략 차별화 필드(coreProblem 등 5종)가 전부 null("재분석 필요")**임을
발견했다. 이 앱에는 기존 프로젝트를 재분석하는 기능이 전혀 없음을 코드 전수 검색으로 확인했고(Phase 6
참고), 동일 입력값으로 신규 프로젝트를 하나씩 생성해(원본은 그대로 둠) migration 적용 이후 분석
파이프라인을 태우자 5개 필드가 실제 값으로 채워지고, 홍보자료 채널 순서도 역할별로(여행사=
`roleContent→instagram→blog→landing→cardNews→proposalSummary`, 지자체=
`roleContent→proposalSummary→landing→blog→cardNews→instagram`) 정확히 `computeChannelPriority()`
규칙대로 나오는 것을 Production에서 실증했다.

### 6) 남은 항목(정직하게 기록)

- **Phase 6(조건 수정 및 안전한 재분석)은 이 조사 시점엔 `NOT_STARTED`였다** — 이후 2026-08-02에 구현·
  검증·배포를 완료했다(아래 "Phase 6" 절 참고). 이 문단은 그 부재가 실사용 시나리오에서 실제로 불편을
  야기했던 당시 상황을 그대로 남겨둔 기록이다.
- 기존 데모/시연 프로젝트(대전·양양·통영·제주 등 다수) 중 2026-07-31 이전에 분석된 것들은 여전히
  전략 차별화 필드가 비어 있다 — 실제로 그 값을 보여주는 시연을 원하면 위와 같이 신규 프로젝트를
  만들어야 한다.
- 원격 카카오맵·홍보자료 검증에 사용한 Playwright 스크립트는 1회성 조사 도구였으며 저장소에 커밋하지
  않고 검증 후 삭제했다(재현이 필요하면 이 섹션의 절차를 참고해 다시 작성할 것).

## 관광사업 기회 3안(기회발굴) — `DONE(로컬+테스트, 2026-08-02)`

README 로드맵("기회 발굴 — 계절·타깃·공급 격차 기반 사업 기회 3안")을 구현했다. DNA 진단과 전략 3안
사이에 표시되며, 저장하지 않고 매 렌더링 시점에 순수 함수로 계산한다(Prisma 스키마 변경 없음).

- **전략 3안과의 경계**: 전략(`strategy.ts`)은 7개 고정 템플릿 카탈로그를 점수화해 "실제 상품화 가능한
  코스 유형"을 고르고 실행안으로 이어진다. 기회(`businessOpportunity.ts`)는 그보다 한 단계 위에서
  "왜 지금 이 사업을 검토해야 하는가"를 취약축·계절·POI 공급·선호 테마라는, 전략 템플릿 카탈로그와
  전혀 무관한 4개 신호로 제시한다 — 선택·저장 개념이 없고 실행 가능한 코스·POI 배치까지 내려가지
  않는다. 단위테스트로 전략 이름과 기회 제목이 절대 겹치지 않음을 고정했다.
- **4개 기회 신호**(`src/lib/domain/businessOpportunity.ts`):
  1. `WEAKNESS_RECOVERY`(취약축 보완형) — DNA 5축 중 최저 점수 축을 보완하는 기회.
  2. `SEASONALITY_GAP`(계절 격차형) — 입력 여행월이 통상적 비수기/성수기인지(CURATED 규칙)에 따른 기회.
  3. `SUPPLY_GAP`(공급 격차형) — 지역 POI 카테고리 중 "균등 기준(1/6)" 대비 부족한 유형을 보완하는 기회.
  4. `TARGET_THEME_GAP`(타깃·테마 격차형) — 선호 테마 대비 관련 POI 공급이 부족한 기회.
  4개 후보를 계산해 근거가 있는 것만 스코어 정렬로 상위 3개를 채택한다 — 여행월/선호 테마 미입력,
  지역 POI 데이터 없음, 카테고리가 이미 균등한 경우 등은 해당 신호의 후보 자체를 만들지 않는다(임의로
  채우지 않음). 유효 후보가 3개 미만이면 있는 만큼만 반환하고 `note`에 사유를 남긴다.
- **역할·여행월·테마 반영**: 계절 격차형의 사업 방향·타깃은 역할별(지자체/여행사/축제기획자)로 다른
  CURATED 문구를 쓰고, 비수기/성수기 여부로 제목·문제·방향이 갈린다. 타깃·테마 격차형은 `classifyThemes`
  (기존 `audienceContext.ts` 재사용)로 자유 텍스트 테마를 7개 카테고리로 분류해 대응 POI 카테고리 공급을
  비교한다(반려동물 동반은 대응 카테고리가 없어 의도적으로 후보를 만들지 않음, MISSING 처리).
- **화면 반영**: `/projects/[id]/analysis`의 "강점/기회/주의" 섹션과 "전략 3안 비교" 섹션 사이에
  "관광사업 기회 3안" 섹션 추가(`OpportunityCard.tsx`). 인쇄 화면(`print/page.tsx`)에는 지면 제약상
  제목·문제·사업 방향만 요약해서 최소 범위로 반영했다(기존 "핵심 관광 지표" 섹션과 "선택 전략" 섹션
  사이).
- **테스트**: `tests/unit/businessOpportunity.test.ts`(15개 — 기본 동작, 근거 부족 시 미생성, 역할/
  여행월/테마 반영, 전략과 제목 미충돌), `tests/unit/contestScenarios.test.ts`에 강릉/경주/제천 실제
  fixture 기반 차별화 테스트 6개 추가(세 지역 기회 제목이 서로 다름, 전략과 기회 제목 미충돌, 여행월별
  계절 기회 제목 차이, 역할별 사업 방향 차이, POI fixture가 없는 지역은 공급 격차형을 지어내지 않음).
- **회귀 방지 중 발견한 결함(수정 완료)**: `PrintPage.test.tsx`의 기존 fixture(`project.input`에
  `preferredThemes` 필드 자체가 없음)로 실행했을 때 `classifyThemes`가 `undefined`를 순회하려다
  런타임 예외를 던졌다 — `analysis/page.tsx`·`print/page.tsx` 양쪽에서
  `(input.preferredThemes as string[] | undefined) ?? []`로 방어 처리해 해결(`planService.ts`가 이미
  쓰던 동일 패턴 재사용). `PrintPage.test.tsx`에는 `fetchPoisByCategory`도 함께 모킹해, DB 연결이
  필요한 이 신규 조회 경로가 기존 "DB 연결 없이 통과해야 하는" 테스트 전제를 깨지 않도록 했다.
- **검증**: 로컬 production build + 실 브라우저(Browser pane)로 기존 Production 프로젝트("운영검증-
  강릉-20260801", 강릉시/지자체·관광재단/문화·미식/10월)를 조회해 실제 데이터로 "축제/이벤트 공급 확충
  기회"(공급 격차, POI 1092건 중 13건)·"소비 접점 확대 기회"(취약축 보완, 소비 45점)·"성수기 수용력
  활용 기회"(계절 격차, 10월 성수기, 지자체 역할 반영)가 정확히 표시되는 것을 확인했다. 인쇄 화면
  요약도 동일 3건을 정상 표시. 콘솔 오류·서버 오류 없음.
- **전체 검증**: `npx vitest run` 672/672 통과(46→49개 파일), `npm run typecheck`/`npm run lint`/
  `npm run build` 전부 통과.
- **남은 한계**: 계절 비수기/성수기 구분과 POI 균등 기준(1/6) 임계값은 모두 CURATED 기획 규칙이며
  실제 방문자 통계·업종 기준 수요와 재검증이 필요하다(각 기회의 `limitations` 필드에 항상 명시).
  강릉·경주는 로컬 seed에 POI fixture가 없어(제천만 있음) 단위테스트에서 공급 격차형/타깃·테마
  격차형까지 실증하지 못했다 — Production 실 데이터로는 확인함(위 검증 항목 참고).
- **아직 하지 않은 것**: 이 문서 갱신 시점 기준 커밋·push·배포는 하지 않았다(별도 작업 지시 대기).

## 유사지역 비교 — `DONE(로컬+원격+배포, 2026-08-02~03)`

README 로드맵("유사지역 비교 — DNA 5축·POI 구성이 가장 비슷한 지원 지역과 비교")을 구현했다.
분석·인쇄 화면에서 DNA 5축 바로 다음에 표시되며, 저장하지 않고 매 렌더링 시점에 순수 함수로
계산한다(Prisma 스키마 변경 없음).

- **선정 기준 4가지**(`src/lib/domain/regionSimilarity.ts`): 행정단위(같은 SIGUNGU 레벨, 자기 자신
  제외) · DNA 5축 거리(공유 축 RMS 거리, DNA 점수 산식 자체는 불변) · 관광 자원 구성(POI 카테고리
  비중 벡터 거리, 두 지역 중 한 곳이라도 POI가 0건이면 반영하지 않음) · 데이터 완전성(공유 축이
  3개 미만이면 후보에서 제외).
- **결합 거리**: DNA 거리 60% + POI 구성 거리 40%(관광 자원 데이터가 없으면 DNA 거리만 사용),
  최대 3곳 채택.
- **기준월 투명성 보완(2026-08-02)**: `RegionComparisonAnalysis.comparisonBaseYm`을 항상 반환하고,
  비교 지역 중 하나라도 다른 기준월을 쓰면 `mixedBaseYm`/`baseYmNote`로 숨기지 않고 어떤 지역이
  어떤 기준월을 썼는지 전부 나열한다. `resolveAnalysisBaseYmMismatchNote()`가 프로젝트 자체의 분석
  기준월과 비교 기준월이 다르면(또는 분석에 기준월 정보 자체가 없으면) 안내 문구를 만들어 분석·인쇄
  화면이 동일하게 표시한다.
- **화면 반영**: `/projects/[id]/analysis`의 DNA 5축 섹션 바로 다음에 "유사지역 비교" 섹션
  (`RegionComparisonCard.tsx`, CURATED 규칙 배지 + "현재 지원 지역 데이터 기준 비교" 캡션 + 기준월
  표시). 인쇄 화면에는 지역명·상대 위치·강점/취약점 요약만 압축 반영.
- **테스트**: `tests/unit/regionSimilarity.test.ts`(20개 — 기본 동작/자기 자신 제외/데이터 부족 처리/
  벤치마킹·고유 강점 판정/기준월 동일·상이·혼합 3종), `tests/unit/contestScenarios.test.ts`에 강릉/
  경주/제천 실제 fixture 기반 차별화 테스트 5개 추가(세 지역 모두 유사지역 확보, 자기 자신 제외,
  세 지역의 유사지역 조합이 서로 다름, 결정론성, POI fixture 없는 지역의 관광 자원 구성 비교 생략).
- **검증**: `npx prisma migrate deploy`는 이 기능에서 실행하지 않음(Prisma 변경 없음). Production
  (`tour-dna.lib.lc`)에서 강릉/경주/제천 기존 프로젝트로 자기 자신 제외·지역별 조합 차별화(강릉→
  경주/대전/제주, 경주→강릉/대전/제주, 제천→경주/통영/양양)·분석·인쇄 화면 완전 일치(순서까지
  동일)·모바일 375px 가로 스크롤 없음·콘솔/4xx/5xx/런타임 오류 없음을 확인했다.
- **전체 검증**: `npx vitest run` 700/700 통과, `npm run typecheck`/`npm run lint`/`npm run build`
  전부 통과. 커밋 `c2cc0d7`, `git push origin main` 완료, Vercel Production 배포 Ready 확인.
- **남은 한계**: 현재 지원 지역이 7곳뿐이라 비교 폭이 제한적이다(전국 확장은 의도적으로 이번 범위에서
  제외). `fetchMetricCohort`가 baseYm을 정확히 일치시켜 조회하므로, 오늘 기준 실제로 지역마다 다른
  기준월이 나오는 경우는 없다 — `mixedBaseYm` 관련 로직은 방어적 코드이며 단위 테스트로만 검증됐다.
  **(2026-08-07 갱신: 이 절 이후 지원 지역이 27곳으로 확대돼 이 "7곳뿐" 한계는 더 이상 유효하지
  않다 — 아래 "지원지역 확대 Batch 1+2(2026-08-07)" 절 참고.)**

## 사업 사전검증 리포트 — `DONE(로컬+테스트, 2026-08-03)`

README 로드맵("사업 사전검증 — 추진 권고·보완사항·위험·데이터 신뢰도")을 구현했다. 실행안·인쇄
화면에 표시되며, 새 지표를 계산하지 않고 이미 계산·저장된 DNA 5축·POI 공급 부족 판정·이동 경고·
유사지역 비교·위험·대응안만 조합하는 결정론적 규칙(CURATED)이다(Prisma 스키마 변경 없음).

- **4가지 게이팅 신호**(`src/lib/domain/preLaunchValidation.ts`):
  1. 데이터 신뢰도 — **DNA 5축 각 축을 구성하는 Evidence의 provenance(LIVE_API/CACHED_API/CURATED/
     ESTIMATED/null)를 직접 본다**(2026-08-03 보완, 아래 "데이터 신뢰도 판정 정책 보완" 참고).
  2. POI 공급 충분성 — `poiFitService.ts`의 shortage 판정 재사용(지역 데이터 자체 부족이면 BLOCKER,
     적합 기준 미달로 일부만 제외됐으면 CAUTION).
  3. 이동 현실성 — `planBuilder.ts`가 이미 코스 생성 시 기록해 둔 `CourseDay.notices`(장거리 이동으로
     제외된 장소 안내) 개수(3건 이상이면 BLOCKER, 1~2건이면 CAUTION) — 재계산 없이 저장된 값만 읽는다.
  4. 지역 차별성 — 유사지역 비교의 `uniqueStrengthNote` 존재 여부(비교 지역이 0곳이면 UNKNOWN).
- **추진 권고 판정 원칙(단일 평균 점수를 쓰지 않음)**: 4개 신호 중 하나라도 BLOCKER면 나머지가
  전부 좋아도 무조건 "보완 후 재검토"다(치명적 조건 우선). BLOCKER는 없지만 CAUTION/UNKNOWN이
  하나라도 있으면 "조건부 권장". 4개 신호가 전부 OK일 때만 "권장".
- **근거 부족 처리**: 비교 지역이 0곳이거나 코스 자체가 비어 있으면(실행안 없는 프로젝트에 준하는
  상태) 해당 신호를 억지로 OK/CAUTION으로 만들지 않고 UNKNOWN("확인 필요")으로 남긴다 — UNKNOWN이
  있으면 전체 판정도 "권장"으로 지어내지 않고 최소 "조건부 권장"으로 낮춘다.
- **화면 반영**: `/projects/[id]/plan`에 "사업 사전검증 리포트" 섹션(`PreLaunchValidationSection.tsx`,
  선택 전략 섹션과 실행안 편집기 사이) 추가 — 추진 권고 배지, 4개 신호 카드, 주요 위험(SelectedPlan.
  risks 재사용), 필수 보완사항, 판정 기준·한계 문구. 인쇄 화면에는 지면 제약상 배지·판단 이유·4개
  신호 한 줄 요약·필수 보완사항만 압축 반영(관광사업 기회 3안 섹션과 선택 전략 섹션 사이).
- **테스트**: `tests/unit/preLaunchValidation.test.ts`(32개 — 기본 동작/치명적 조건 우선 원칙 3종/
  경미한 문제는 조건부 권장까지만 낮춤 4종/근거 부족은 확인 필요로 표시 3종/`classifyAxisProvenance`
  단위 테스트 9종/provenance 조합별 데이터 신뢰도 통합 테스트 8종), `tests/unit/contestScenarios.test.ts`에
  강릉/경주/제천 실제 fixture 기반 차별화 테스트 4개 추가(리포트 정상 생성, POI fixture 유무에 따른
  POI 공급 충분성 신호 차이, 종합 판단 이유 차별화, 결정론성).
- **전체 검증**: `npx vitest run` 736/736 통과, `npm run typecheck`/`npm run lint`/`npm run build`
  전부 통과.

### 데이터 신뢰도 판정 정책 보완 — `DONE(로컬+테스트, 2026-08-03)`

**기존 실제 판정과의 모순**: 최초 구현은 `AnalysisResult`의 축 상태(`AxisStatus`: LIVE/SNAPSHOT/
MISSING)만 보고 "SNAPSHOT이면 CAUTION"으로 뭉뚱그렸다. 그런데 `AxisStatus`는 `dna.ts`의
`combineAxisStatus()`가 "이 축의 Evidence 중 하나라도 `isSnapshotFallback`이면 SNAPSHOT"으로만
판정한 결과라, "사람이 검수한 CURATED 데이터라 SNAPSHOT"인 경우와 "근거가 아예 추정값(ESTIMATED)인
경우"를 구분하지 못했다. 실제로 강릉 Production 프로젝트가 "조건부 권장"으로 나온 원인을 근거
테이블(`EvidenceTable`)에서 직접 확인한 결과, 수요(Demand) 축의 지표 4개 중 3개(`관광 서비스 수요`,
`방문자수`, `방문자수 증감률`)는 `실시간 API`(LIVE_API)였고, 단 하나(`관광자원 수요`,
`touResDemIxVal`)만 `추정값`(ESTIMATED)이었다 — 그런데 최초 구현의 판정 이유 문구는
"1개 축은 최근 확보 데이터/추정값을 사용했습니다"라고만 표시해, 마치 그 축 전체가 부실한 것처럼
보이게 했다. 화면(`EvidenceTable.tsx`)은 이미 `isProvenanceCautionLevel()`로 "ESTIMATED/MISSING/null
만 주의 대상, LIVE_API/CACHED_API/CURATED는 확인된 실제 데이터"라는 더 정교한 기준을 쓰고 있었는데,
사전검증 리포트는 이 화면 기준과 다른(더 거친) 자체 기준을 썼다는 것이 근본 모순이었다.

**최종 provenance 정책**(`src/lib/domain/preLaunchValidation.ts`의 `classifyAxisProvenance()`) —
`EvidenceTable.tsx`의 `isProvenanceCautionLevel()`과 완전히 동일한 기준을 재사용한다:
- `LIVE_API`/`CACHED_API`/`CURATED` → **TRUSTED**(확인된 실제 데이터). `CACHED_API`(과거 성공 응답
  재사용)·`CURATED`(사람이 검수)는 "지금 이 순간 실시간"은 아니지만 근거 없는 추정값과 다르므로,
  단순히 "LIVE가 아니다"라는 이유만으로 캐턴션(CAUTION)으로 낮추지 않는다.
- `ESTIMATED` → **ESTIMATED**(추정값). 실측이 아니라 계산/추정으로 채운 값이라 CAUTION 대상이다.
- `null`(레거시 미분류) 또는 문자 그대로의 `"MISSING"` provenance 값 → **UNCLASSIFIED**(출처 판정
  정보 없음) — ESTIMATED와는 다른 사유이므로 판정 문구에서 별도로 구분한다.
- 이 축에 Evidence 자체가 없음(빈 배열) → **MISSING**(축 자체가 없음) — "값은 있지만 추정값"인
  ESTIMATED와 "값 자체가 없음"인 MISSING을 절대 같은 문구로 섞지 않는다.
- 축 하나에 여러 Evidence가 섞여 있으면 그중 가장 신뢰도가 낮은 근거가 그 축 전체의 등급을
  결정한다("약한 고리" 원칙, 기존 `combineAxisStatus`와 동일한 보수적 태도).
- `CACHED_API`가 포함된 축은 등급(OK/CAUTION/BLOCKER)은 낮추지 않되, "재사용된 이전 API 응답을
  포함한다"는 노후도 참고 문구를 판정 이유에 **별도로** 덧붙인다 — 게이팅에는 영향을 주지 않는
  순수 정보성 신호로 처리했다(요구사항의 "데이터 기준월 노후도에 따른 CAUTION"을, 이미 존재하는
  `CACHED_API` provenance 개념으로 구현했다).
- 판정 이유 문구는 항상 "어떤 축이 어떤 provenance 때문에" 그 등급이 됐는지 구체적으로 적는다(예:
  "수요(Demand)(추정값(ESTIMATED) 근거 포함)").
- **게이팅 임계값(MISSING 2개 이상 BLOCKER 등)과 다른 3개 신호(POI/이동/지역)는 전혀 건드리지
  않았다** — 데이터 신뢰도 신호의 "무엇을 근거로 등급을 매기는가"만 axis-status 기반에서
  provenance 기반으로 교체했다.

**강릉 Production 판정 변화 여부**: **변화 없음.** 데이터 신뢰도는 여전히 CAUTION(수요 축의
`touResDemIxVal` 지표가 ESTIMATED이기 때문), POI 공급 충분성도 여전히 CAUTION(적합 기준 미달로
일부 제외, 지역 데이터 자체는 충분)이라 종합 판정은 이전과 동일하게 "조건부 권장"이다 — 달라진
것은 판정 이유 문구가 "1개 축은 최근 확보 데이터/추정값을 사용했습니다"에서 "수요(Demand)
(추정값(ESTIMATED) 근거 포함)"로 더 정확해진 것뿐이다. 실행안·인쇄 화면 양쪽에서 동일하게 확인했다.
- **남은 한계**: 이 리포트는 "이동 현실성" 신호를 위해 실제 코스 빌더(`buildDraftCourse`)까지
  재현하는 통합 테스트는 만들지 않았다(단위 테스트에서 travelNoticeCount를 직접 주입해 로직만
  검증). "기회 3안"은 이 리포트의 게이팅 신호로 직접 쓰지 않는다(작업 지시의 8개 출력 항목에
  포함되지 않아 정보성 참고로만 남겨둠). 위험 판정(BLOCKER 임계값 3건, MISSING 2개 등)은 모두
  CURATED 기획 규칙이며 실제 운영 데이터로 재검증이 필요하다.
- **아직 하지 않은 것**: 이 문서 갱신 시점 기준 커밋·push·배포는 하지 않았다(별도 작업 지시 대기).

## KPI 연결 강화 — `DONE(로컬+테스트, 2026-08-03~04)`

README 로드맵("KPI 연결 강화 — 사업 목적과 취약지표에 연결된 측정 KPI")을 구현했다. 기존
`buildKpis()`가 만드는 전략별 KPI 생성 로직·목록은 전혀 바꾸지 않고, `src/lib/domain/kpiLinking.ts`의
`enrichKpis()`가 각 KPI에 측정 목적·연결된 DNA 축·연결된 사업 목표·권장 측정 시점·목표값 설정 근거를
덧붙이기만 한다(Prisma 스키마 변경 없음 — `SelectedPlan.kpis`는 이미 `Json` 컬럼이라 필드 추가에
마이그레이션이 필요 없었다).

- **KPI-축 연결 방식(CURATED 수작업 매핑, 자동 추론 아님)**: `KPI_AXIS_LINK`라는 `Record<string,
  DnaAxisKey|null>` 표에 `buildKpis()`가 실제로 생성하는 23개 KPI 이름(7개 전략 템플릿의
  kpiTemplates + 역할별/국적별 KPI 메모)을 전부 나열해 축을 미리 지정해 둔다. 이름 기반 텍스트
  분석이나 점수 기반 자동 추론은 전혀 하지 않는다 — 표에 없는 이름은 무조건 `linkedAxis: null`로
  안전하게 처리한다.
- **목표값은 절대 지어내지 않는다**: 연결된 축의 실제 점수(이미 계산된 analysisResult 값)를 "참고
  맥락"으로만 보여주고(예: "이 지역 체류(Stay) 축 점수는 비교군 내 100점입니다"), 구체적 목표
  수치는 축 유무·데이터 유무와 관계없이 항상 `KPI_TARGET_INSTITUTION_PLACEHOLDER`("기관 설정
  필요")로 귀결한다.
- **사전검증 리포트와의 연결**: `preLaunchValidation.ts`에 `dataReliabilityFlaggedAxes`(데이터
  신뢰도 신호가 CAUTION/BLOCKER로 지목한 축)와 `weakestAxis`(DNA 5축 중 최저 점수 축)를 추가했다.
  `kpiLinking.ts`의 `findRelatedKpiNames()`가 이 축들과 연결된 KPI 이름만 골라 "데이터 신뢰도 보완
  KPI"/"취약 축 연결 KPI"로 실행안·인쇄 화면에 표시한다. 어떤 KPI도 해당 축과 연결돼 있지 않으면
  빈 배열(억지로 연결을 만들지 않음).
- **사용자가 직접 추가하는 KPI에 대한 중요한 제한사항(반드시 지켜야 할 사항)**: `PlanEditor.tsx`의
  "새 KPI 이름"/"측정 방법" 입력으로 사용자가 직접 추가하는 KPI는 이 화면에 분석 결과
  (`analysisResult`)가 없으므로 **항상 `linkedAxis: null` + "기관 설정 필요"로 고정된다.** 이후
  프로젝트를 재분석(`/projects/[id]/edit`)해도 **이미 저장된 사용자 추가 KPI가 소급 적용되어 자동으로
  축과 연결되는 일은 없다** — 재분석은 전략이 다시 계산될 때만 `ensureSelectedPlan()`이 완전히 새로운
  KPI 목록(`buildKpis()` + `enrichKpis()`)으로 SelectedPlan 전체를 교체하는 것이지, 기존에 저장된
  개별 KPI 항목을 축소·보강하는 기능이 아니기 때문이다(Phase 6 재분석 정책 그대로: 재분석 성공 시
  기존 실행안이 통째로 새로 만들어진 것으로 교체됨). 사용자가 원하는 KPI에 축을 연결하고 싶다면
  `KPI_AXIS_LINK` 표에 있는 기존 KPI 이름과 똑같이 입력하는 수밖에 없다 — 이 표를 넘어서는 이름
  유사도 매칭이나 자동 추론은 의도적으로 구현하지 않았다(요구사항: "KPI 축 자동 추론 추가 금지").
- **화면 반영**: `/projects/[id]/plan`의 KPI 섹션에 각 KPI마다 측정 목적/연결된 DNA 축/연결된 사업
  목표/권장 측정 시점/목표값 설정 근거를 표시(`PlanEditor.tsx`). 인쇄 화면(`print/page.tsx`)에도
  같은 5개 필드를 압축 표시. 사전검증 리포트 섹션(`PreLaunchValidationSection.tsx`)에는 "데이터
  신뢰도 보완 KPI"/"취약 축 연결 KPI" 줄이 추가된다.
- **테스트**: `tests/unit/kpiLinking.test.ts`(22개 — 기본 연결/권장 시점 유추/목표값 지어내지 않음/
  알 수 없는 KPI 이름 안전 처리/`findRelatedKpiNames` 축-KPI 매칭), `tests/unit/preLaunchValidation.test.ts`에
  `weakestAxis`/`dataReliabilityFlaggedAxes` 테스트 5개 추가, `tests/unit/PlanEditor.test.tsx`에 사용자
  추가 KPI 자동 보강 렌더링 테스트 1개 추가, `tests/unit/contestScenarios.test.ts`에 강릉/경주/제천
  실제 fixture 기반 KPI 연결 차별화 테스트 5개 추가(연결 목표가 시나리오별 실제 `primaryGoal`을
  그대로 반영해 다름, 세 지역의 KPI 이름·목표값 근거 집합이 서로 다름, 결정론성 등).
- **검증**: Production(`tour-dna.lib.lc`)에서 강릉 실행안 프로젝트로 전략을 재선택해 KPI 연결
  보강이 실제로 반영되는지 확인 — "재방문 의사율"(수요 축, ESTIMATED 근거)이 사전검증의 "데이터
  신뢰도 보완 KPI"로 정확히 이어짐을 확인했고, 사용자가 KPI를 추가·저장·새로고침해도 "기관 설정
  필요" 문구와 함께 정상 유지됨을 확인했다. 실행안·인쇄 화면의 KPI 세부 내용(측정 목적/연결 축/연결
  목표/권장 시점/목표값 근거)이 완전히 일치함을 확인했다. 콘솔/서버 오류 없음.
- **전체 검증**: `npx vitest run` 769/769 통과, `npm run typecheck`/`npm run lint`/`npm run build`
  전부 통과.
- **남은 한계**: KPI-축 매핑 표(`KPI_AXIS_LINK`)는 23개 기존 KPI 이름에 대한 수작업 큐레이션이며,
  `strategyTemplates.ts`에 새 KPI 이름이 추가되면 이 표도 함께 갱신해야 한다(자동 동기화 없음).
  사용자가 직접 추가한 KPI는 위에서 설명한 대로 재분석해도 영구히 축과 연결되지 않는다 — 이는
  버그가 아니라 "이름 기반 수작업 매핑 표 밖의 임의 텍스트에 자동으로 의미를 추론해 붙이지 않는다"는
  의도된 설계다.
- **아직 하지 않은 것**: 이 문서 갱신 시점 기준 커밋·push·배포는 하지 않았다(별도 작업 지시 대기).

## 전략 3안 비교(예산·협력 대상 포함) — `DONE(로컬+테스트, 2026-08-04)`

README 로드맵("사업안 비교·예산·협력 대상")을 구현했다. 신규 `src/lib/domain/strategyResourcePlan.ts`가
전략 템플릿(`strategyTemplates.ts`)의 CURATED 속성과 역할(`UserRoleCode`)만으로 예산 항목 6종·협력
대상 6종을 생성하고, 기존 `StrategyResult`의 구조적 차별화 필드(coreProblem 등, 2026-07-31 도입)를
그대로 재사용해 분석 화면에 전략 3안 비교 표를, 인쇄 화면에 A4 압축형 비교 카드를 추가한다. 전략
점수 공식(`strategy.ts`)과 roleFit 공식(`audienceContext.ts`)은 전혀 바꾸지 않았다.

- **예산 항목(6종, 금액은 항상 "기관 산정 필요")**: 콘텐츠·프로그램 운영/장소·시설/인력/홍보/교통·
  안전/데이터·성과 측정. 설명 문구만 템플릿 속성(coreResource/poiCategories/requiresOvernight/
  executionDifficulty)과 역할에 따라 달라진다 — 금액은 절대 추정하지 않는다.
- **협력 대상(6종)**: 지자체 부서/관광재단/지역 상인·사업자/숙박·교통 업체/문화·축제 기관/데이터
  제공기관. 축제·문화 전용 템플릿(FESTIVAL_EVENT/CULTURE_HISTORY)만 실제 기관을 연결하고 나머지는
  "해당 없음(연계 비중 낮음)"으로 명시한다.
- **적합 역할**: 세 역할(지자체/여행사/축제 기획자) 각각에 대해 기존 `computeRoleFit()`을 그대로
  호출해 내림차순 랭킹으로 보여준다(새 점수 계산 없음, 참고 정보임을 화면에 명시).

### "재분석 필요"가 모든 항목에 표시되는 문제 — 원인 조사 및 해결(2026-08-04)

비교 표를 처음 붙인 직후, 강릉 외 지역(경주·제천)의 기존 테스트 프로젝트에서 해결 문제·활용 자원·
체류 방식·실행 난이도·기대 효과 5개 항목이 전부 "재분석 필요"로 보인다는 문제가 보고됐다. 강릉·경주·
제천 프로젝트 전체를 DB에서 직접 조회(읽기 전용)해 원인을 확인한 결과:

- **코드 버그가 아니라 실제 레거시 데이터였다.** `coreProblem`/`coreResource`/`stayStyle`/
  `executionDifficulty`/`expectedEffect` 5개 필드는 `20260731000000_add_strategy_differentiation_fields`
  마이그레이션 이후에만 채워진다(`analyzeProject.ts`가 재분석 때마다 5개를 항상 동시에 저장). 조회
  결과, 강릉의 최신 실행안 프로젝트 1건(2026-08-02 재분석)만 5개 필드가 전부 채워져 있었고, 그 외
  경주·제천의 모든 프로젝트(대부분 2026-07-20~30 생성, 마이그레이션 이전)는 5개 필드가 **전부**
  `null`이었다 — 비교 표가 실제 DB 상태를 정확히 반영한 것이지, 값 전달·필드 참조·빈 값 판정 오류가
  아니었다.
- **판정 로직 추가**: `classifyStrategyDifferentiationAvailability()`가 5개 필드를 검사해
  `COMPLETE`(전부 있음)/`LEGACY`(전부 없음 = 마이그레이션 이전 레거시)/`PARTIAL_MISSING`(일부만 없음
  = 정상 경로에서 나올 수 없는 이상 상태)로 구분한다. `LEGACY`면 "이 비교 항목은 이전 분석 결과라
  재분석이 필요합니다"라고 구체적으로 안내하고, `PARTIAL_MISSING`(실제로는 발생한 적 없음, 안전망)
  이면 기존처럼 일반 "재분석 필요"로 남겨 이상 상태임을 숨기지 않는다. 판정은 전략(행) 단위로
  독립적이라 한 전략이 레거시여도 다른 전략·다른 필드(주요 위험·적합 역할은 항상 값이 있음)를 함께
  가리지 않는다.
- **분석·인쇄 공용 로직**: `buildStrategyComparisonRows()` 하나를 분석 화면(`analysis/page.tsx`)과
  인쇄 화면(`print/page.tsx`)이 그대로 재사용해, roleFit 랭킹과 레거시 판정이 두 화면에서 항상
  일치한다.
- **재분석으로 실제 해소되는지 검증**: 경주·제천의 레거시 테스트 프로젝트를 각각 1건씩 실제
  `/projects/[id]/edit` 화면(재분석 확인 체크박스 포함)으로 재분석해, 재분석 직후 5개 필드가 전부
  실제 값으로 채워지고 "재분석 필요"/"이전 분석 결과" 안내가 완전히 사라짐을 확인했다.

- **테스트**: `tests/unit/strategyResourcePlan.test.ts`(29개) — 예산 항목 6종/협력 대상 6종 중복·
  누락 없음(전체 템플릿×역할 조합), 역할·템플릿별 차별화, `classifyStrategyDifferentiationAvailability`의
  COMPLETE/LEGACY/PARTIAL_MISSING 판정, `buildStrategyComparisonRows`가 레거시·최신을 행 단위로
  독립적으로 반환함(표 전체를 덮지 않음), `formatRoleFitRanking`/`buildRoleFitRanking` 공식 재사용
  검증.
- **검증(로컬 dev 서버, Neon Production DB 대상)**:
  - 강릉 최신 실행안 프로젝트(`cms95htgc000004jtg04it589`): 분석 화면 비교 표에 3개 전략 모두 실제
    값(문화·역사 체험형/자연·웰니스형/로컬미식·시장 연계형) 표시, 인쇄 화면에도 동일 데이터 +
    "선택됨" 배지가 일치. 예산 항목 6종·협력 대상 6종 중복·누락 없음. 모바일 375px·데스크톱 모두
    가로 스크롤 없음.
  - 경주 프로젝트(`cms6aglye000004l14oqvkl15`, "경상북도 10월 소규모 여행 기획", 재분석 전 5개
    필드 전부 null): `/projects/[id]/edit`에서 실제 재분석 실행 → 재분석 후 문화·역사 체험형/축제·
    이벤트 연계형/로컬미식·시장 연계형 3개 전략 모두 실제 값으로 정상 표시됨을 확인.
  - 제천 프로젝트(`cms22pquj000004i5mdivyqps`, "충청북도 12월 소규모 여행 기획", 재분석 전 5개
    필드 전부 null이고 기존 실행안·홍보자료 보유): 재분석 확인 체크 후 재분석 실행 → 자연·웰니스형/
    가족 체험형/문화·역사 체험형 3개 전략 모두 실제 값으로 정상 표시됨을 확인. 이후 "이 전략 선택"으로
    실행안을 새로 만들고, 인쇄 화면의 서버 응답(HTML/RSC 페이로드)을 직접 확인해 분석 화면과 완전히
    동일한 비교 데이터·"선택됨" 표시가 나옴을 확인.
- **전체 검증**: `npx vitest run` 789/789 통과, `npm run typecheck`/`npm run lint`/`npm run build`
  전부 통과.
- **남은 한계**:
  - 예산 항목 금액·협력 대상은 CURATED 기획 규칙이며 실제 사업비·실존 기관 데이터가 아니다(화면에
    항상 그 취지를 명시).
  - 레거시 분석 결과(2026-07-31 마이그레이션 이전 생성, 이후 재분석한 적 없는 프로젝트)는 여전히
    해결 문제·활용 자원·체류 방식·실행 난이도·기대 효과 5개 항목에 "이 비교 항목은 이전 분석 결과라
    재분석이 필요합니다"가 표시된다 — 이는 버그가 아니라 실제 데이터 상태를 정직하게 보여주는
    것이며, 재분석하면 해소된다.
  - **최신 분석 결과(2026-07-31 이후 재분석한 프로젝트)에는 위 5개 항목이 항상 실제 비교 데이터로
    표시되어야 한다** — 만약 최신 분석인데도 "재분석 필요"/"이전 분석 결과" 안내가 보인다면 그것은
    이 조사에서 다루지 않은 새로운 회귀이므로 별도로 다시 조사해야 한다.
  - 인쇄 화면은 지면 제약상 전략 3안 비교(압축형)와 선택 전략 상세(예산·협력 대상)를 함께 표시하며,
    분석 화면의 개별 전략 카드(근거 보기 등)까지는 인쇄하지 않는다(기존 인쇄 화면 설계 원칙 유지).
- **아직 하지 않은 것**: 이 문서 갱신 시점 기준 커밋·push·배포는 하지 않았다(별도 작업 지시 대기).

## 지원지역 확대 Batch 1+2 (2026-08-07)

기존 7개 지역(대전 유성구·제천·양양·강릉·경주·제주·통영)에 20개 지역을 실 API 동기화로 추가해
지원 SIGUNGU를 **27개**로 늘렸다. 상세 지역 목록·데이터 품질·발견된 버그는
`docs/data-dictionary.md`("2026-08-07 지역 확장" 절), 운영 절차·사고 사례는
`docs/operator-checklist.md`("새 지역 추가 절차"/"알려진 사고 사례" 절)에 정리했다 — 이 문서는
전체 흐름과 최종 상태만 요약한다.

- **진행 방식**: 10곳씩 2개 배치(Batch 1, Batch 2)로 나눠 등록→동기화→검증했다. 각 배치 모두
  정지 조건(오코드·핵심 지표 결측·POI 오염·기존 지역 손상) 없이 통과했다.
- **Batch 3(추가 10곳)**: 시작하지 않았다. 후보 코드는 TourAPI `ldongCode2`로 확인해 뒀으나,
  `AreaTarDivService`(관광 다양성) API의 일일 호출 한도 소진(429)으로 통계청 API 교차검증을
  완료하지 못해 사용자 판단으로 이번 확장 범위(Batch 1+2, 총 27개)에서 종료했다. `REGION_SEED`에
  등록되지 않았고 Production 데이터도 없다 — **미검증·미반영** 상태다.
- **발견·수정한 버그 2건**: (1) `tourInfo.ts`의 POI 좌표(`mapx`/`mapy`)가 문자열 `"null"`일 때
  페이지 전체 파싱이 실패해 정상 POI까지 함께 버려지던 문제 — 개별 좌표만 방어적으로 `undefined`
  처리하도록 수정, 회귀 테스트 추가. (2) 대구 중구의 표시명이 실제 주소 문자열과 달라 POI 주소
  필터에 전부 걸러지던 문제 — `TOUR_INFO_ADDRESS_FILTER_OVERRIDE`에 예외 등록, 회귀 테스트 추가.
- **정규화·유사지역 비교 영향**: min-max 정규화 코호트가 7→27개로 확대되면서 기존 지역의 상대
  점수도 재분석 시 달라질 수 있음을 확인했다(데이터 오류가 아니라 상대평가 모집단 변화). 유사지역
  비교 후보도 6곳→26곳으로 늘어 `isSmallCandidatePool` 경고가 더 이상 뜨지 않는다. 저장된 과거
  `AnalysisResult`는 자동 재계산되지 않는다.
- **provenance 재검증**: 신규 20개 지역은 `overallDataMode=LIVE`, `liveAxisCount=5`가 나오지만,
  이는 "존재하는 근거가 전부 LIVE_API"라는 뜻이지 모든 보조 지표가 채워졌다는 뜻이 아니다 — 관광
  자원수요(`touResDemIxVal`, 기존 7곳은 ESTIMATED)와 `PoiRelation`(연계 관광지, 기존 일부 지역은
  CURATED)이 신규 지역에는 아예 존재하지 않는다(결측이 아니라 구조적으로 없음). 3개 지역(해운대구·
  안동시·울릉군)의 `Evidence` 레코드를 직접 조회해 확인했다.
- **플랜 생성 스모크테스트**: 해양(해운대구)·역사(안동)·산악(정선)·도심(대구 중구)·휴양(화천)·
  미식(공주) 6개 유형에서 프로젝트 생성→분석→전략 3안→실행안까지 전부 성공(POI 9~11개, 좌표
  전부 유효). 실제 브라우저로 해운대구 1건의 분석/실행안 화면 렌더링과 콘솔 에러 없음을 확인했다.
  이 검증에 쓴 임시 Production 프로젝트 6건은 삭제 대기 중이다(`scripts/delete-region-expansion-verification-projects.mts`,
  사용자 직접 실행 필요).
- **검증**: 유닛 테스트 891개 통과, typecheck/lint/build 통과.
- **Git/배포**: `7df89f7`(Batch 1) → `9fcb784`(Batch 2) → `83ab4e1`(문서) 순으로 `origin/main`에
  push 완료, Vercel Production 배포 Ready 확인.

## 역할별 맞춤 기획 차별화 검증·보완 (2026-08-07) — `DONE(로컬+원격+배포)`

세 사용자 역할(여행사/DMC, 지자체/관광재단, 축제 기획자)이 실제로 "역할명만 문장에 삽입"하는 수준이
아니라 전략·실행안 결과 자체를 의미 있게 다르게 만드는지 재검증하고, 발견된 유일한 공백(위험 목록)을
최소 범위로 보완했다.

### 구현 완료 상태

- 세 사용자 역할을 프로젝트 생성 시 입력받아 저장한다(`Project.role`, `UserRole` enum).
- role 값은 단순 저장에 그치지 않고 전략·실행안 생성 흐름 전체에 전달된다 —
  [audienceContext.ts](../src/lib/domain/audienceContext.ts)의 역할별 목표 우선순위 테이블 →
  [strategy.ts](../src/lib/domain/strategy.ts)의 `roleFit`(전략 점수 10% 가중치)·추천 근거 문구 →
  [planBuilder.ts](../src/lib/domain/planBuilder.ts)의 KPI·운영 체크리스트·**위험 목록**(이번 보완) →
  [strategyResourcePlan.ts](../src/lib/domain/strategyResourcePlan.ts)의 일부 예산·협력 대상 설명까지
  이어진다.
- DNA 5축 원시 점수(`demandFit`/`supplyFit` 등)와 정규화 공식, 유사지역 비교 결과는 역할과 무관하게
  동일하게 유지된다 — 역할은 데이터 진단이 아니라 그 이후의 전략·운영 해석 단계에만 반영된다.

### 검증 완료

동일 지역·동일 기준월·동일 여행월·동일 타깃·동일 목표·동일 테마로 조건을 전부 고정하고 역할만
(여행사/DMC → 지자체/관광재단 → 축제 기획자 순으로) 바꿔 비교했다. Production에 새 임시 프로젝트를
만들지 않고, 순수 함수 직접 호출과 단위 테스트로 검증했다(`tests/unit/roleDifferentiation.test.ts`).

결과:

- DNA 원시 축 점수(`demandFit`/`supplyFit`)는 역할과 무관하게 완전히 동일했다(회귀 방지 테스트로
  고정).
- `roleFit` 점수는 같은 전략 템플릿이라도 역할마다 달랐고, 이 차이가 상위 3개 전략 후보 구성 자체를
  바꾸는 경우도 있었다(단순 점수 차이가 아니라 어떤 전략이 추천되는지 자체가 달라짐).
- KPI·운영 체크리스트는 역할마다 실질적으로 다른 항목이 추가됐다(예: KPI 이름이 여행사="상품 판매
  전환율", 지자체="정책 성과 보고 지표", 축제 기획자="프로그램 운영 지표"로 서로 다름).
- 예산·협력 대상 설명 중 일부(6개 항목 중 2개)가 역할별로 다르게 표현됐다(금액 자체는 역할과 무관).
- **위험 목록만 유일하게 세 역할 모두 완전히 동일**했다 — 이 문서의 이전 버전들이 "역할별로 위험까지
  반영된다"고 서술하지 않았던 것과 일치하는, 실제로 존재하던 공백이었다.

### 보완 내용

발견된 공백(위험 목록의 역할 무관 문제)에 한해 최소 범위로 수정했다. 기존 `computeRoleChecklistNotes`/
`computeRoleKpiNotes`와 동일한 구조를 그대로 따라 `computeRoleRiskNotes(role)`를
[audienceContext.ts](../src/lib/domain/audienceContext.ts)에 추가하고 `planBuilder.ts`의 `buildRisks`에
연결했다 — 역할별 알고리즘을 새로 만들거나 DNA 점수에 관여하지 않고, 공통 결과 엔진 위에 역할 우선순위
항목 하나를 얹는 기존 패턴을 그대로 재사용했다.

- 여행사/DMC: 예약 취소·노쇼로 인한 상품 운영 손실 위험
- 지자체/관광재단: 정책 보고 시점과 데이터 집계 시점이 어긋날 위험
- 축제 기획자: 행사 당일 집중 방문에 따른 혼잡·안전 관리 위험

### 검증·배포

유닛 테스트 32개 추가(역할 차별화 7개, 그 외 목록 페이지네이션 관련 25개 — 같은 세션에서 함께
작업됨), 전체 965개 통과, typecheck/lint/build 통과. 커밋 `54aa7ed`로 `origin/main`에 push,
Vercel Production 배포 Ready 확인.

## 홍보자료 포스터·카드뉴스 미리보기 Phase 1 (2026-08-07) — `DONE(로컬+원격+배포)`

기존 홍보자료 화면이 채널별 텍스트 편집기만 연속 나열되는 구조라 "완성된 산출물"처럼 보이지 않는다는
문제를 조사한 뒤(홍보자료 LLM 도입 설계 검토, 같은 세션 이전 절), LLM 없이 기존 데이터만으로 시각적
완성도를 높이는 Phase 1을 구현했다. 결정론적 홍보자료 생성 로직(`buildPromoContent`)과 저장 구조
(`SelectedPlan.promoContent`)는 전혀 바꾸지 않았다.

### 구현 내용

- `src/lib/domain/promoPreview.ts`(신규) — 이미 저장된 `PromoContent`(6개 채널)와 프로젝트 요약
  (지역·여행월·전략명)만 재조합하는 순수 view model 함수. 새 문구를 생성하지 않고, 긴 문구는 단어/구두점
  경계에서만 잘라 의미가 사라지지 않게 한다(`truncateAtBoundary`).
  - `buildPromoPosterViewModel`: 헤드라인은 `landing.title`, 한 줄 카피는 `instagram.caption`의 첫
    문장, 타깃은 `cardNews.slides[0].body`(모든 역할에 공통으로 존재하는 targetSummary), 대표 코스는
    `courseHighlights` 최대 3곳(순서 유지), 마무리 문구는 역할별 roleContent의 기존 필드
    (TRAVEL_AGENCY.itineraryHighlight/LOCAL_GOV.lead/FESTIVAL_PLANNER.retentionTip)를 그대로 재사용한다.
  - `buildPromoCardNewsViewModel`: 저장된 `cardNews.slides` 순서·개수를 그대로 따르고, 위치(첫/마지막/
    중간)로만 표지·마무리·코스 슬라이드를 구분한다(새 슬라이드를 추가·삭제하지 않음).
- `src/components/plan/promo/PromoPosterPreview.tsx`(신규) — 이미지 없이 타이포그래피·숫자 배지·도형만
  으로 구성한 포스터. 정보 위계 Level 1(지역/제목/한 줄 카피) → Level 2(여행월/타깃/대표 코스) →
  Level 3(핵심 전략/마무리 문구)를 그대로 따르고, KPI·위험·체크리스트·provenance는 넣지 않는다.
- `src/components/plan/promo/PromoCardNewsPreview.tsx`(신규) — 저장된 슬라이드를 순서대로 렌더링,
  데스크톱은 grid(최대 4열), 모바일은 1열로 쌓는다(가로 스크롤 없음). 슬라이드 번호·표지/코스/마무리
  구분 배지로 시각 구조를 만든다.
- `src/components/plan/promo/PromoPreviewPanel.tsx`(신규) — 포스터/카드뉴스 탭 전환 + 역할 배지("여행사
  /DMC 관점" 등)를 상단 한 곳에만 표시. `PromoContentEditor`의 기존 `content` state를 그대로 props로
  받아 렌더링하므로 별도 state가 없다 — 편집·저장·재생성 후에도 항상 최신 값을 보여준다(source of
  truth 단일화).
- `PromoContentEditor.tsx`에 미리보기 패널을 기존 편집 UI 위에 추가하고, 편집 영역 앞에 "문구 편집"
  구분 제목을 넣었다 — 기존 편집·복사·저장·재생성 로직은 한 줄도 바꾸지 않았다.
- `PlanPage`(`src/app/projects/[id]/plan/page.tsx`)가 이미 조회해 둔 `project.region.name`/
  `travelYear`/`travelMonth`/선택 전략명을 `PromoContentEditor`에 `projectSummary`로 추가 전달한다
  (새 DB 조회 없음 — 기존에 로드된 값을 그대로 넘기는 최소 배선).

### 역할 표시(Phase 1 한정)

미리보기 상단에 현재 프로젝트 역할 배지를 한 번만 표시한다("여행사/DMC 관점"/"지자체/관광재단
관점"/"축제 기획자 관점"). 역할별 생성 로직(roleContent 제외 5개 공통 채널)은 이번 Phase에서
변경하지 않았다 — 그 작업은 다음 Phase(공통 채널 역할 반영) 대상이다.

### 검증

`tests/unit/promoPreview.test.ts`(13개 — 경계값 자르기, 대표 코스 3곳 제한, course 빈 배열, 긴
지역명/전략명, 3역할 roleLabel/closingNote), `tests/unit/PromoPreviewPanel.test.tsx`(4개 — 탭 전환,
content prop 변경 시 최신값 반영, 역할 배지 중복 표시 안 함), 기존 `PromoContentEditor.test.tsx`에
`projectSummary` prop 추가 반영. 전체 유닛 테스트 965→**985개** 통과, typecheck/lint/build 통과.
Production 기존 프로젝트 2건(여행사/DMC: "[데모] 대전 9월 소규모 여행 기획", 지자체/관광재단: "운영
검증-강릉-20260801")에서 SSR 렌더 결과(accessibility tree)로 포스터 미리보기가 실제 데이터로 정확히
렌더되는지 확인했다 — 새 임시 Production 프로젝트는 만들지 않았다. 이 세션의 브라우저 미리보기
창(pane)이 컴포지팅되지 않는 환경 제약으로 실제 클릭 상호작용(탭 전환) 검증은 RTL
`fireEvent.click`(jsdom) 단위 테스트로 대체했다.

### 미구현(다음 Phase 후보)

LLM 카피 생성, 공통 5개 채널의 역할 관점 반영, 이미지 수집/표시, PNG/PDF export, 공유 링크는 이번
Phase 1 범위에 포함하지 않았다.

## 홍보자료 공통 채널 역할별 관점 반영 Phase 2 (2026-08-07) — `DONE(로컬+원격+배포)`

Phase 1(포스터·카드뉴스 미리보기)에서 남겨둔 공백 — 역할별 콘텐츠(roleContent)만 역할에 따라 구조가
다르고, 제안서 요약·랜딩·Instagram·블로그·카드뉴스 5개 공통 채널은 역할과 거의 무관하게 같은 문장
구조였던 문제 — 를 이번 Phase에서 보완했다. `buildPromoContent()`의 기존 구조와 저장 방식은 그대로
유지했다.

### 역할 정의 중복 조사 결과

역할 관련 로직이 [audienceContext.ts](../src/lib/domain/audienceContext.ts)와
[promoContent.ts](../src/lib/domain/promoContent.ts) 두 곳에 있었다. 실제로는 두 파일이 서로
모순되지는 않았지만(둘 다 여행사=판매·체류소비, 지자체=지역경제·정책, 축제 기획자=집객·계절분산·현장
운영 방향을 공유), 역할 코드 타입(`PromoUserRole`)이 `audienceContext.ts`의 `UserRoleCode`와 문자열
값만 같고 별도로 정의돼 있었다. 대규모 리팩터링 없이 `PromoUserRole`을 `UserRoleCode`의 별칭으로
바꿔 타입 중복만 제거했다 — 함수 구조(각 역할 분기 헬퍼)는 `computeRoleChecklistNotes`/
`computeRoleKpiNotes`/`computeRoleRiskNotes`와 동일한 "역할이면 분기, 아니면 기본값" 패턴을 그대로
따랐다.

### 적용한 역할별 생성 원칙

공통 결과 데이터(지역·기준월·전략·대표 코스·근거 데이터)는 그대로 두고, 각 채널에 역할별 관점 문장을
하나씩 추가하는 방식으로 최소 변경했다 — 역할별 생성기를 3개 복제하지 않았다.

- **제안서 요약**: sentence1 끝에 목적 절(판매 가능한 상품 구성/지역 관광 활성화 사업 추진/축제·행사
  프로그램 운영), sentence2 끝에 강조 포인트 절을 추가했다.
- **랜딩**: 본문 맨 앞에 역할별 도입 문장, 맨 끝에 마무리 안내 문장을 추가했다.
- **Instagram**: 캡션 맨 앞에 역할별 짧은 후킹/안내 문구를 추가했다(해시태그는 사실 데이터만으로
  만들어지므로 역할과 무관하게 그대로 유지).
- **블로그**: 도입부에 역할별 관점 문장을 추가했다.
- **카드뉴스**: 마지막(마무리) 슬라이드의 제목과 도입 어구만 역할별로 바꿨다(내용 자체인 판매
  포인트/KPI 값은 이미 저장된 실행안 데이터를 그대로 재사용).

### 세 역할별 실제 차이(동일 조건 비교, 실제 Production 데이터 기준)

대전 프로젝트(여행사/DMC)의 실제 저장된 실행안 데이터(지역·기준월·전략·코스·KPI 전부 고정)를 그대로
읽어 역할만 바꿔 비교했다(신규 임시 프로젝트를 만들지 않고, 저장된 실행안을 순수 함수에 직접 대입해
확인). 결과:

- 제안서 요약: "판매 가능한 여행 상품 구성을 목표로 합니다."(여행사) / "지역 관광 활성화 사업 추진을
  목표로 합니다."(지자체) / "축제·행사 프로그램 운영을 목표로 합니다."(축제 기획자)로 서로 다른 목적
  어휘가 등장했다.
- 랜딩 본문 도입/마무리 문장, Instagram 캡션 첫 문장, 블로그 도입 문장, 카드뉴스 마무리 슬라이드
  제목·내용이 모두 세 역할에서 서로 달랐다.
- 반면 대표 코스 목록(대전엑스포과학공원 등)과 근거 데이터("다양성 축 점수(56)가 반영되어 수요
  적합도 47점" 등)는 세 역할 모두 완전히 동일했다 — 사실 데이터는 바꾸지 않았다는 원칙을 그대로
  지켰다.

### 단순 역할명 치환이 아님을 검증한 결과

세 역할의 결과 문자열을 직접 비교해 완전히 다름을 확인했고("여행사 담당자를 위한 ~"처럼 역할명만
바뀐 문장이 아니라 판매/사업/운영이라는 서로 다른 목적 어휘가 등장), 생성된 문구에 `TRAVEL_AGENCY`/
`LOCAL_GOV`/`FESTIVAL_PLANNER` 같은 내부 역할 코드 원문이 노출되지 않는 것도 함께 확인했다.

### Phase 1 미리보기 연계

포스터·카드뉴스 미리보기(`PromoPreviewPanel`)는 별도 상태 없이 `PromoContentEditor`의 `content`를
그대로 읽으므로, 공통 채널 문구가 바뀌면(재생성 시) 미리보기도 추가 구현 없이 자동으로 반영된다 —
Phase 1에서 만든 view model(`promoPreview.ts`)과 미리보기 컴포넌트는 이번 Phase에서 전혀 손대지
않았다.

### 검증·배포

`tests/unit/promoContent.test.ts`에 "공통 5개 채널의 역할별 관점 반영" describe 블록 7개 추가(동일
조건·역할만 변경 비교, 역할별 목적 어휘 확인, 내부 역할 코드 미노출 확인, 사실 데이터 동일성 확인,
환각 방지 확인) — 기존 29개(19+새로 추가된 7개, 결정론·구조·근거·환각 방지 등)까지 전부 회귀 없이
통과. 전체 유닛 테스트 985→**993개** 통과, typecheck/lint/build 통과.

## 2026-08-11 종합 갱신 — 전국 255/255 동기화, DNA normalization(log1p), ACTIVE Dataset(Phase 2-A), 최신 데이터 발견+증분 sync(Phase 2-B), 홍보 LLM(OpenRouter Gemma)

> 이 절은 2026-08-08~11 사이 여러 세션에 걸쳐 진행된 작업을 시간순으로 정리한다. 모두 로컬
> PostgreSQL(`tour_dna_local`) 기준으로 검증했고, GitHub `main`에는 push했지만 **Production Neon
> DB/Vercel 배포에는 반영·검증하지 않았다.**

### 1. 전국 SIGUNGU 255/255 동기화 완료

Batch 3(2026-08-08)까지 37개였던 지원 SIGUNGU를, 재개 가능한 배치 동기화
(`runResumableLocalBatchSync`, `--max-regions` 청크 단위, SUCCESS/EMPTY는 재요청하지 않고 429 시
안전 중단)로 이어서 전국 255개 전체까지 완료했다.

- 필수 source(`TAR_SVC_DEM`/`TOU_DIV_IX`/`TOU_RES_DEM`/`TOUR_INFO`) 전부 SUCCESS 또는 EMPTY, ERROR 0.
- `npm run audit:tourism-data -- --base-ym=202606` 최종 판정 **PASS**(미완료 지역 0, ERROR 0).
- DNA 분석 가능 지역 255/255, POI 미수집 지역 0.
- `VISITOR_CNT`는 SIGUNGU 255 + SIDO 15 = 270건(기초·광역 원자적 게이트로 별도 관리, 이미 완전한
  달은 재요청하지 않아 이번 배치 동안 관련 HTTP 요청 0건).
- Region master: SIDO 16 + SIGUNGU 255 = 총 271.
- 인천 2026 행정구역 개편으로 신설된 자치구 4곳(제물포구·영종구·서해구·검단구)은 필수 4개 source
  전부 EMPTY로 정상 기록됐다(상위 공공 API가 아직 신설 코드에 데이터를 제공하지 않음 — ERROR 아님).

### 2. 전국 DNA 품질 감사 및 Demand/Spend normalization(log1p) 적용

전국 255개 지역이 갖춰진 뒤 DNA 5축 분포·유사지역·전략 결과의 실질적 품질을 감사했다.

**발견한 문제**: Demand(`tarSvcDemIxVal`)와 Spend(`tarExpDsIxVal`)가 강한 우편향 분포를 보였고,
극단값(서울 중구급 초고소비 상권 등)이 코호트에 새로 들어오는 것만으로 나머지 지역의 정규화 점수가
leave-3-out 기준 최대 58.86점까지 흔들리는 것을 실측으로 확인했다(같은 세션에 서울 주요 상권
데이터가 새로 채워지며 실제로 재현됨).

**검토한 대안과 최종 선택**:
- **percentile rank**: 안정성은 가장 좋았지만(민감도 약 98% 감소), 20개 표본 지역 중 strength/
  weakness 라벨이 18곳(90%)에서 바뀌고, 유사지역 Top3가 일부 지역(울릉군 등)에서 완전히
  교체되며(0/3 overlap), 대표 시나리오(경주) 1위 전략까지 바뀌는 downstream 영향이 확인돼 채택하지
  않았다.
- **log1p + min-max**(채택): `tarSvcDemIxVal`/`touResDemIxVal`(Demand), `tarExpDsIxVal`(Spend)에만
  적용. 순위 상관은 그대로 유지하면서 극단값 민감도를 약 24~35% 낮췄고, strength/weakness 변경률
  40%(20개 중 8곳), 유사지역 Top3는 대부분 2/3~3/3 유지, 강릉/경주/제천 1위 전략은 전부 유지됨을
  확인했다.
- Stay(`tarSjrnDsIxVal`)·Diversity(`touDivIxVal`)는 QA에서 극단값 문제가 확인되지 않아 기존 선형
  min-max 그대로 유지했다. Network는 산식 자체를 건드리지 않았다. 방문자수 증감률은 부호가 있는
  값이라 log1p 적용 대상에서 원천적으로 제외했다(별도 clamp 공식 유지).

**구현**: `src/lib/domain/normalize.ts`에 `NormalizationTransform`("LINEAR_MIN_MAX"|"LOG1P_MIN_MAX")과
`normalizeByTransform()`을 추가하고, `dna.ts`의 `lookupMetric()`이 metricCode별로 transform을
선택하도록 최소 수정했다(`LOG1P_METRIC_CODES` Set 기반). 사용자 표시(`toDisplayDnaScore`, 10~90
변환)와 내부 raw(0~100) 정책은 변경하지 않았다. 신규 테스트 13건 추가(정상/edge case/회귀 확인),
전체 unit test 1261/1261, typecheck/lint/build 통과.

**부수 발견**: 정수 반올림(`roundForDisplay`) 단계에서 log1p 압축이 고유 점수 개수를 크게 줄이는
부작용이 확인됐다(Demand 237→56/251, Spend 224→45/251, 순위 자체는 완전히 보존). 정밀도 정책 자체를
바꾸는 추가 작업은 하지 않았다 — 향후 검토 과제로 남긴다.

### 3. 검증된 데이터셋(ACTIVE Dataset) 기반 — Phase 2-A

전국 데이터가 완전해진 뒤에도, 서비스 분석이 "DB에 있는 가장 최신 baseYm"이 아니라 명시적으로
검증·승격된 baseYm만 쓰도록 하는 기반을 추가했다. 기존에는 `computeProjectAnalysis`가
`process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM`(정적값)을 그대로 썼다 — 새 baseYm이 DB에 일부만
채워져도(STAGING) 이 값을 사람이 수동으로 바꾸지 않는 한 반영되지 않았고, 반대로 검증되지 않은
값을 넣어도 막을 방법이 없었다.

- 신규 `Dataset`(baseYm+status: STAGING/ACTIVE/ARCHIVED) 테이블 하나만 추가
  (`20260811060333_add_dataset_registry`, 기존 DataSnapshot/NormalizedMetric 재설계 없음).
- `src/lib/services/activeDataset.ts`: `getActiveDatasetBaseYm()`(분석의 유일한 baseYm 출처),
  `checkDatasetCompleteness(baseYm)`(기존 `auditTourismDataQuality` 재사용, 중복 구현 없음),
  `activateDataset(baseYm)`(incomplete 거부, ACTIVE 최대 1개 유지, 승격 시 이전 ACTIVE는 ARCHIVED).
- `computeProjectAnalysis`(analyzeProject.ts)와 레거시 유사지역 재계산(`resolveRegionComparisonAnalysis.ts`)이
  이 함수만 신뢰하도록 교체 — ACTIVE가 없으면 다른 baseYm으로 조용히 대체하지 않고 명확한 한국어
  에러로 즉시 실패한다.
- 홈페이지·새 프로젝트 화면의 "데이터 기준월" 표시도 ACTIVE 기준으로 일치시켰다.
- 실제 로컬 DB에 202607 가짜 STAGING 데이터(강릉시 하나만, 극단값 포함)를 주입한 뒤 실제 프로젝트로
  분석을 실행해 **혼입되지 않음을 실증 확인**했다(evidence의 baseYm 전체가 202606으로만 유지됨).
- 로컬 ACTIVE는 `npm run dataset:activate -- --base-ym=202606`으로 승격 완료(`npm run dataset:status`
  로 확인 가능).
- 신규 테스트 22건 추가, 전체 unit test 1273/1273, typecheck/lint/build 통과.
- **Phase 2-B**(source별 최신월 자동 탐지 + 증분 sync)와 **Phase 2-C**(감사 PASS + DNA drift gate
  통과 후 자동 ACTIVE 승격)는 아직 구현하지 않았다 — 지금은 사람이 CLI로 수동 승격해야 한다.

### 4. 홍보 콘텐츠 LLM — OpenRouter 무료 Gemma 전환 및 안정성 검증

홍보 콘텐츠 채널 문구 생성에 LLM 오버레이가 도입됐다(정량 계산 — DNA/전략/POI/실행안/유사지역 —
에는 LLM을 전혀 관여시키지 않는다).

- **Provider/모델**: OpenRouter, 기본 모델 `google/gemma-4-26b-a4b-it:free`
  (`OPENROUTER_API_KEY`/`OPENROUTER_PROMO_MODEL`). Anthropic 연동은 완전히 제거됐다. 이전에 무료
  Qwen 계열 모델(`qwen/qwen3-next-80b-a3b-instruct:free`)을 시도했으나 404로 사용할 수 없어 Gemma로
  교체했다(코드 주석에 이력만 남김).
- **구조**: 7개 채널(제안서 요약/랜딩/Instagram/블로그/카드뉴스/숏폼/역할별 콘텐츠)을 JSON Schema
  structured output으로 한 번에 생성한 뒤 Zod로 재검증. 실패(timeout/429/구조화 출력 미지원/응답
  형식 오류 등) 시 예외 없이 기존 결정론적 rule 생성기로 자동 대체된다(`generatedBy: "ai" | "rule"`
  로 결과 구분 저장) — LLM 장애가 사용자 흐름을 끊지 않는다는 원칙을 그대로 지켰다.
- **timeout 버그 수정**: `promoLlmClient.ts`에서 `clearTimeout`이 `fetch()` 응답 헤더 수신 직후
  호출돼, 응답 본문(`res.json()`)을 읽는 동안 20초 timeout 보호가 전혀 적용되지 않는 구조적 버그를
  코드 리딩으로 확인해 수정했다(`finally`로 이동, 헤더 수신~본문 파싱 전체를 보호). 회귀 테스트 추가.
- **실 QA 결과**: 실제 OpenRouter 호출에서 한국어 품질·역할별/채널별 차별화·hallucination 없음을
  확인했다. 다만 무료 endpoint의 운영 안정성은 낮았다 — 반복된 실 호출에서 긴 응답 시간(수십 초),
  HTTP 429, timeout이 모두 관찰됐다. **결론: 기능은 유지하되(비용 0원 목표 유지, 실패 시 rule
  fallback), 공모전 라이브 시연에서 실시간 생성 버튼을 핵심 시연 동선의 필수 의존성으로 쓰지 않을
  것을 권장한다.**
- **대표 프로젝트(강릉/경주/제천)**: 이번 라운드의 log1p normalization + 전국 202606 cohort로
  재분석했다. 홍보 콘텐츠는 무료 LLM을 호출하지 않고(스크립트 프로세스 안에서만 API 키를 제거해
  rule 경로만 타도록 강제) rule 생성기로 재생성해, 현재 세 프로젝트 전부 `generatedBy: "rule"`로
  저장돼 있다 — "AI가 생성한 홍보자료"라고 서술하면 안 된다.

### 5. Phase 2-B — 최신 데이터 발견 + 증분/재개형 전국 동기화

Phase 2-A(ACTIVE Dataset)에 이어, "공공 API에 더 최신 기준월이 등장했는지 저비용으로 탐지하고, 새
기준월을 STAGING Dataset으로만 등록한 뒤, API quota를 넘기지 않도록 여러 실행에 나눠 전국 데이터를
resumable하게 수집하는" 운영 기반을 추가했다. **STAGING → ACTIVE 자동 승격은 이번에도 구현하지
않았다** — 그건 Phase 2-C다.

- **저비용 최신월 탐지**: `src/lib/services/datasetDiscovery.ts`의 `discoverLatestDataset()`가
  기존 `findLatestCommonBaseYm`(대표 지역 1곳·TAR_SVC_DEM/TOU_RES_DEM 2개 소스만 확인, 확인한 개월
  수 x 2회 HTTP 요청)을 그대로 재사용한다 — 새 탐지 로직을 따로 만들지 않았다. TOU_DIV_IX는 기존
  코드가 이미 의도적으로 제외한 이유(일일 호출 한도 소진 이력)를 그대로 따르고, TOUR_INFO는 baseYm에
  종속되지 않는 정적 API라 탐색 대상이 아니며, VISITOR_CNT는 전용 탐색기(`visitorBaseYmFinder.ts`)가
  이미 있어 중복 호출하지 않는다 — 이 탐지가 확인하는 것은 "새 월이 있는가"뿐이고, "필수 4개 소스
  전부가 그 달에 존재하는가"는 STAGING을 실제로 sync한 뒤 기존 `checkDatasetCompleteness`가
  판정한다. 실제 API로 확인한 결과(2026-08-11), ACTIVE(202606)보다 최신인 공통월은 아직 없다(정상
  — 새 baseYm이 실제로 있다고 가정하지 않았다).
- **STAGING dataset 생성**: `activeDataset.ts`에 추가한 `ensureStagingDataset(baseYm)`이 새로
  발견된 baseYm을 STAGING으로만 등록한다. 같은 baseYm이 이미 있으면(어떤 상태든) 중복 생성하지
  않고, **이미 다른 baseYm이 STAGING이면 새 STAGING을 만들지 않는다**(정책 — 여러 STAGING을 동시에
  허용하면 제한된 일일 API 호출 한도가 여러 baseYm에 분산돼 어느 쪽도 완료되지 못한다). 다른 배치
  진입점(syncService.ts)과 동일하게 `checkDataSyncTarget`(로컬 DB 전용 가드)을 통과해야만 실제로
  쓴다. `getStagingDatasetBaseYm()`으로 현재 STAGING baseYm을 조회할 수 있다.
- **증분 sync CLI 통합**: 기존 CLI에 `--dataset=staging` 옵션을 추가했다(`--base-ym`과는 함께 쓸 수
  없음). `npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=20`처럼 쓰면
  현재 STAGING baseYm을 DB에서 자동으로 조회해 대상으로 삼는다 — **새 sync 로직을 만들지 않고**,
  기존 `runResumableLocalBatchSync`를 그대로 재사용한다(regionCode ascending 결정적 순서,
  SUCCESS/EMPTY skip, missing/ERROR만 처리, `--max-regions`만큼만 처리, HTTP 429 즉시 안전 중단,
  VISITOR_CNT 전국 1회 재사용 최적화 — 전부 기존 동작 그대로 STAGING baseYm에도 적용된다). ACTIVE
  dataset의 DataSnapshot/NormalizedMetric은 baseYm이 다르므로 이 sync로 전혀 건드리지 않는다(실 DB
  기준으로 STAGING sync 스모크 테스트 후 `getActiveDatasetBaseYm()`이 여전히 기존 ACTIVE를 반환함을
  확인).
- **운영자 상태 조회 확장**: `npm run dataset:status`가 STAGING dataset에 대해서는 진행률(완료
  지역/전국 SIGUNGU 수, ERROR 수, source별 SUCCESS/EMPTY/ERROR/미수집 현황, 판정)까지 함께
  보여준다 — 이 진행률은 Dataset 테이블에 별도 컬럼(`syncedRegions` 등)으로 저장하지 않고, 기존
  `checkDatasetCompleteness`/`auditTourismDataQuality`의 DataSnapshot 집계를 그대로 다시 계산한다
  (derived 상태 중복 저장 금지). 신규 CLI `npm run dataset:discover`는 발견 결과와 STAGING 생성
  여부만 보고하며, 그 스크립트 안에서 전국 batch sync를 실행하지 않는다.
- **TOUR_INFO 조사 결과(구현하지 않음)**: `fetchTourInfo`는 baseYm에 종속되지 않는 정적 API이고
  `Poi` 모델에도 baseYm 필드가 없는데, `DataSnapshot`은 baseYm별로 기록되므로 새 STAGING baseYm마다
  TOUR_INFO를 전국 재수집하게 된다(POI 내용이 바뀌지 않아도 quota를 쓴다). 별도 TTL 정책이 더
  적합해 보이지만, 이번 라운드에서는 구현하지 않고 Phase 2-D 후보로 남겼다 — `checkDatasetCompleteness`
  도 TOUR_INFO를 여전히 필수 source로 취급한다(임의로 제외하지 않았다).
- **DB schema 변경**: 없음. `Dataset` 모델(baseYm+status)은 Phase 2-A에서 이미 추가돼 있었고, 진행률
  같은 파생 상태를 저장할 컬럼을 새로 추가하지 않았다.
- **검증**: 신규 단위 테스트(`tests/unit/datasetDiscovery.test.ts` 6개 — 새 월 없음/발견/RATE_LIMITED/
  ACTIVE 없음 케이스, HTTP 요청 수 검증 포함) + `activeDataset.test.ts`에 `ensureStagingDataset`/
  `getStagingDatasetBaseYm` 8개 추가 + `syncCliArgs.test.ts`에 `--dataset=staging` 6개 추가 — 전체
  1290개 테스트 통과, typecheck/lint/build 통과. 실제 API로 `npm run dataset:discover`를 1회
  실행해 ACTIVE(202606)와 동일한 공통월이 재확인됨(새 baseYm 없음, HTTP 요청 4회, STAGING 생성 없음,
  전국 batch 미실행)을 확인했고, `--dataset=staging` 스모크 테스트(STAGING 없는 상태)가 API/DB 쓰기
  없이 안전하게 실패함과 ACTIVE가 그대로 `202606`으로 유지됨을 실제 로컬 DB로 확인했다.

### 6. Production 배포 상태

이 절이 다루는 모든 항목(전국 255/255 동기화, log1p normalization, Dataset/ACTIVE 레지스트리,
LLM 통합, timeout 버그 수정, **Phase 2-B 증분 sync 기반**)은 GitHub `main`에는 push됐지만,
**Production Neon DB에 migration을 적용하지도, Vercel에 재배포하지도 않았다.** Production에
반영하려면 `docs/deployment.md`의 "검증된 데이터셋(ACTIVE Dataset)" 절 절차를 따라야 한다.

## 2026-08-12 갱신 — Phase 2-C(Dataset Validation + DNA Drift Gate + Safe Promotion)

> 이 절도 로컬 PostgreSQL(`tour_dna_local`) 기준으로만 검증했다. GitHub `main`에는 push했지만
> **Production Neon DB/Vercel 배포에는 반영·검증하지 않았다.**

Phase 2-B(발견 + STAGING 증분 sync)에 이어, "STAGING dataset이 수집 완료됐다는 이유만으로 바로
ACTIVE가 되지 않고, completeness·품질 감사·DNA 변화 안정성까지 검증한 뒤 안전한 dataset만 ACTIVE로
승격할 수 있는 단일 promotion 경로"를 추가했다. **실제 월간 historical drift를 관측할 수 있는
전국 규모 dataset이 아직 202606 하나뿐이라, 이번 라운드에서는 정교한 threshold를 확정하지 않고
"명백한 위험을 막는 fail-safe gate + 상세 report + 단일 promotion 경로"에 집중했다.**

1. **기존 activation 우회 위험 제거**: Phase 2-A의 `npm run dataset:activate`는 completeness만
   통과하면 즉시 ACTIVE로 승격했다 — drift 크기와 무관하게 항상 우회 가능한 경로였다. 이제
   `scripts/activate-dataset.ts`는 `activateDataset()`을 직접 호출하지 않고, 새 단일 경로
   `src/lib/services/datasetPromotion.ts`의 `promoteDataset()`을 거친다. `--force`/`--skip-drift`
   같은 우회 옵션은 의도적으로 추가하지 않았다.
2. **Promotion 판정 구조(PASS/REVIEW_REQUIRED/BLOCKED)**: 새 DB 상태(enum)를 추가하지 않고
   함수 반환값으로만 관리한다(`src/lib/domain/datasetDriftGate.ts`의 `PromotionVerdict`).
   - `BLOCKED`: dataset 미존재, STAGING 아님, ACTIVE 없음, target baseYm이 ACTIVE보다 최신이
     아님, completeness/audit 미통과, 비교 가능 지역 수 심각히 부족(<50), DNA 계산 결과에
     NaN/Infinity 포함 — 명백한 문제만 여기 해당한다.
   - `REVIEW_REQUIRED`: 위 문제는 없지만 drift가 임계값을 넘어 사람의 확인이 필요한 경우.
   - `PASS`: 위 둘 다 아님 — 이때만 실제로 ACTIVE 승격이 진행된다.
3. **Promotion 사전조건 순서(`evaluateDatasetPromotion`, `src/lib/services/datasetPromotion.ts`)**:
   (1) dataset 존재 → (2) status===STAGING → (3) ACTIVE 존재 → (4) target baseYm > ACTIVE baseYm →
   (5) `checkDatasetCompleteness`(Phase 2-A 그대로 재사용, completeness+audit 동시 판정) → (6) DNA
   drift report 계산(`computeDatasetDriftReport`, `src/lib/services/datasetDriftReport.ts`) → (7)
   `decideDriftGateVerdict`로 최종 판정. 앞 단계에서 BLOCKED가 나오면 그 뒤(특히 무거운 DNA 재계산)는
   시작하지 않는다 — 실제 DB 기반 테스트로 "dataset 미존재/STAGING 아님/ACTIVE 없음" 케이스에서
   `computeDatasetDriftReport`가 전혀 호출되지 않음을 확인했다.
4. **DNA drift 계산은 기존 production 함수만 재사용**: `buildDnaEngineInput`/`computeDna`/
   `fetchRegionComparisonProfiles`/`computeRegionSimilarityComparisons`/`computeStrategies`를 ACTIVE
   baseYm과 candidate baseYm 양쪽에 대해 각각 호출해서 비교만 한다 — DNA/정규화/유사도/전략 산식은
   전혀 새로 만들지 않았다. `fetchRegionComparisonProfiles`가 이미 매 프로젝트 분석마다 전국 255개
   지역 규모로 실행되고 있어, drift report가 이를 baseYm 2개에 대해 두 번 호출하는 것은 신규 성능
   문제가 아니다.
5. **축별 drift 지표(`computeAxisDriftReport`)**: 5축(Demand/Stay/Spend/Diversity/Network) 각각에
   대해 comparable region count, median/p90/p95(선형보간 percentile, 양쪽 baseYm) 및 delta, 지역별
   절대차의 mean/median/p90/max, tie를 평균 순위로 보정한 Spearman rank correlation, top/bottom
   decile 유지율·신규 진입·이탈, cohort 변화(신규 편입/이탈 지역, active/candidate max, candidate
   p95, candidate p95를 뚜렷하게 초과하는 신규 편입 지역=신규 극단값 경보)를 계산한다.
6. **strength/weakness drift**: 문자열 파싱 대신 5축 원점수를 직접 비교해 "가장 강한/가장 약한 축"을
   결정적으로 판정하고(`deriveStrongestWeakestAxis`, 동점은 축 정의 순서로 고정 tie-break), 두
   baseYm 사이에 이 두 축이 바뀐 지역의 비율을 집계한다.
7. **similarity/전략 drift는 대표 seed·시나리오로 검증**: 전국 255×255 규모 유사도 재계산은 비용이
   커서, 유형별로 명시 선정한 seed 10곳(강릉·경주·제천·서울 중구·강남구·제주시·해운대구·평창군·
   남해군·충주시 — `SIMILARITY_DRIFT_SEED_REGION_CODES`)에서만 `computeRegionSimilarityComparisons`의
   Top3 변화(overlap, Top1 유지 여부)를 확인한다. 전략은 역할 3종(TRAVEL_AGENCY/LOCAL_GOV/
   FESTIVAL_PLANNER)을 모두 겪어보도록 QA 전용 대표 시나리오 3개(`DRIFT_QA_SCENARIOS`,
   `datasetDriftReport.ts`)를 새로 정의해 `computeStrategies`를 그대로 호출하고 1위 전략 변경 여부를
   비교한다 — 기존 `contestScenarios.ts`(강릉/경주/제천 대표 시나리오)는 역할이 TRAVEL_AGENCY/
   LOCAL_GOV뿐이라 FESTIVAL_PLANNER 커버리지를 위해 별도로 만들었다(둘 다 seed/시나리오 목록은
   랜덤이 아니라 코드에 고정 배열로 명시).
8. **적용한 threshold와 근거(잠정치, `DRIFT_GATE_THRESHOLDS`, `datasetDriftGate.ts`에 중앙화)**:
   실제 두 번째 전국 dataset(예: 202607)이 완성돼 진짜 월간 drift 분포를 관측하기 전까지는
   "확정된 통계적 기준"이 아니라 "이 정도면 사람이 한 번 더 보는 게 안전하다"는 보수적 안전장치임을
   문서와 코드 양쪽에 명시했다 — 축별 median absolute delta 15점 초과, Spearman 0.85 미만,
   strength/weakness 변화율 25% 초과, 유사지역 평균 Top3 overlap 2.0 미만, 0/3 overlap 1건 초과,
   대표 시나리오 전략 1위 변경 비율 50% 초과 중 하나라도 해당하면 REVIEW_REQUIRED. 비교 가능 지역
   수 50 미만이거나 계산 결과에 NaN/Infinity가 섞이면 BLOCKED. **다음 전국 dataset이 실제로
   완성되면 이 문서의 이 항목부터 재검토해야 한다.**
9. **CLI**: 신규 읽기 전용 `npm run dataset:drift -- --base-ym=YYYYMM`(어떤 DB 쓰기도 하지 않음,
   completeness/축별 drift/strength·weakness/similarity/전략 전체를 출력). `npm run dataset:activate`
   는 이제 내부적으로 `promoteDataset()`을 호출해 REVIEW_REQUIRED/BLOCKED면 거부 사유를 출력하고
   기존 ACTIVE를 그대로 유지한다. `npm run dataset:status`는 STAGING dataset에 대해
   `INCOMPLETE`/`READY_FOR_DRIFT_CHECK` promotion readiness를 보여주되, 무거운 drift 계산 자체는
   자동으로 수행하지 않는다(별도로 `dataset:drift`를 실행해야 함).
10. **알려진 한계**: 이 promotion 경로는 항상 기존 ACTIVE와 비교하므로, ACTIVE가 한 번도 설정된 적
    없는 완전히 새로운 환경을 처음 부트스트랩하는 경우는 다루지 않는다(지금 로컬 DB는 이미
    ACTIVE=202606이라 해당 사항 없음) — 필요해지면 별도 운영자 비상절차로 검토해야 한다.
11. **검증**: 신규 단위 테스트 3개 파일 — `tests/unit/datasetDriftGate.test.ts`(27개, percentile·
    tie 보정 Spearman·decile churn·cohort 변화·strength/weakness·similarity/전략 요약·gate 판정
    전부), `tests/unit/datasetDriftReport.test.ts`(4개, 실제 computeDna/computeStrategies/
    computeRegionSimilarityComparisons 조합 검증), `tests/unit/datasetPromotion.test.ts`(12개,
    BLOCKED 사전조건·PASS/REVIEW_REQUIRED·promoteDataset이 PASS일 때만 activateDataset을 호출하는지)
    — 전체 1333개 테스트 통과, typecheck/lint/build 통과. **실제 로컬 DB로 end-to-end 스모크 테스트도
    수행했다**: 202606 DataSnapshot/NormalizedMetric을 임시 baseYm(209912)으로 복사해 (a) 완전히
    동일한 데이터는 PASS(모든 축 delta=0, Spearman≈0.99)로 판정됨을 확인, (b) 60개 지역의 소비
    지표를 크게 왜곡하자 REVIEW_REQUIRED로 정확히 전환됨(spend 축 Spearman 0.586, strength/weakness
    변화율 48.6%, 유사지역 평균 overlap 1.60/3)을 확인, (c) 이 상태에서 `promoteDataset`을 실행해도
    ACTIVE가 바뀌지 않음을 확인, (d) 검증 후 임시 baseYm 관련 데이터를 전부 삭제하고 ACTIVE가
    `202606`으로 그대로 유지됨을 최종 확인했다. 이 스모크 테스트 스크립트는 검증 후 삭제했다(임시
    파일이라 커밋 대상 아님).

## 2026-08-12 갱신 — Phase 2-D(TOUR_INFO Freshness TTL + POI Reuse)

> 이 절도 로컬 PostgreSQL(`tour_dna_local`) 기준으로만 검증했다. GitHub `main`에는 push했지만
> **Production Neon DB/Vercel 배포에는 반영·검증하지 않았다.**

Phase 2-A/B/C까지는 "월별 통계 데이터"만 다뤘지만, TOUR_INFO(POI 목록 API)는 성격이 다르다 —
baseYm에 종속되지 않는 정적 API인데도 기존 completeness 게이트가 "이번 baseYm에 새로 호출했는가"만
봤기 때문에, 새 STAGING baseYm마다 전국 255개 지역의 POI를 무조건 재호출하고 있었다(POI 내용이 지난
달과 똑같아도). 이번 라운드는 "월별 dataset freshness"와 "POI freshness"를 분리했다.

1. **기존 lifecycle 실제 확인(추정 없이 코드로 검증)**: `fetchTourInfo`(`src/lib/public-data/
   adapters/tourInfo.ts`)는 baseYm 파라미터 자체를 받지 않고, `areaBasedList2`(현재 시점 POI 목록
   스냅샷 API, 시계열 통계가 아님)를 호출한다. `Poi` 모델(schema.prisma)에는 baseYm 필드가 없고,
   freshness를 판단할 수 있는 값은 `createdAt`/`updatedAt`과 `DataSnapshot(TOUR_INFO).fetchedAt`뿐이다.
   `syncTourInfoForRegion`은 Poi를 `(regionId, name)` 복합 unique key로 upsert만 하고 **삭제 로직이
   없다**(폐업 POI가 API 응답에 더 이상 안 나와도 DB에 그대로 남는다). 그런데도 `runResumableLocalBatchSync`
   의 스킵 판정은 TOUR_INFO를 다른 3개 통계 소스와 완전히 동일하게 `DataSnapshot(dataSourceId,
   regionId, baseYm)`(baseYm별 unique key)로 처리해, 새 baseYm에서는 항상 재호출 대상이 됐다.
2. **TTL=60일 채택**: `src/lib/domain/tourInfoFreshness.ts`의 `TOUR_INFO_FRESHNESS_TTL_DAYS`. 관광
   POI(등록 시설 목록)는 월별 통계 지표보다 훨씬 느리게 바뀐다는 전제 하에, 30일은 매월 sync
   주기와 거의 같아 절감 효과가 없고 90일 이상은 최대 3회 sync 주기 동안 폐업 정보가 반영되지
   않을 위험이 있어, "최소 한 sync 주기는 재호출을 건너뛰면서도 두 달을 넘겨 뒤처지지 않는" 중간값
   60일을 택했다 — 실제 폐업률 데이터가 쌓이면 재조정 대상이다(코드 주석에도 명시).
3. **freshness 판정과 재사용 방식**: 새 테이블/컬럼을 추가하지 않고 기존 `DataSnapshot.fetchedAt`만
   재사용한다(`src/lib/services/tourInfoFreshnessLookup.ts`의 `fetchTourInfoLastFreshFetchByRegion()`
   — `dataSnapshot.groupBy`로 region별 가장 최근 SUCCESS/EMPTY의 fetchedAt을 한 번의 쿼리로 조회).
   `classifyTourInfoFreshness()`가 이 값과 TTL을 비교해 FRESH/STALE/NEVER_FETCHED를 판정한다.
   **가짜 SUCCESS/LIVE_API snapshot을 만들지 않는다** — FRESH로 재사용하는 지역은 이번 baseYm에
   대한 `DataSnapshot` row 자체를 생성하지 않고 그냥 SKIPPED로만 기록한다(설계 후보 A안 채택,
   `docs/implementation-plan.md` Part 3 근거).
4. **provenance는 변경하지 않음**: `Poi` 모델에는 원래 provenance 컬럼이 없다(스키마 확인 결과) —
   LIVE_API/CACHED_API/CURATED 구분은 `buildDnaEngineInput.ts`가 분석 시점에 `Poi.sourceType`
   분포를 즉석 집계해서만 만드는 값이라 DB에 저장되지 않는다. TTL 재사용은 `Poi` 테이블 자체를
   전혀 건드리지 않으므로(그냥 API를 안 부르고 SKIPPED만 기록) 이 계산 로직도 그대로다 — provenance
   계약을 변경하지 않았다.
5. **completeness/audit 변경**: `auditTourismDataQuality`(`tourismDataQualityAudit.ts`)에
   `tourInfoFreshnessByRegion`/`now`를 선택적 파라미터로 추가했다 — 생략하면(기존 호출부 호환)
   모든 지역이 NEVER_FETCHED로 취급돼 이전 동작(이번 baseYm SUCCESS/EMPTY만 인정)과 정확히
   동일하다. 지정하면 지역별로 "이번 baseYm SUCCESS/EMPTY" 또는 "TTL 이내 재사용 가능"이면
   완전한 것으로 인정한다 — **TOUR_INFO를 게이트에서 제외하지 않았다**: POI 데이터 자체가 없거나
   stale이면 여전히 incomplete/미완료로 판정되어 Phase 2-C의 drift gate 앞단(completeness)에서
   막힌다. `checkDatasetCompleteness`(`activeDataset.ts`)와 `scripts/audit-tourism-data.ts`
   양쪽 다 이 freshness를 조회해 넘기도록 갱신했다(중복 조회 로직 없이 같은
   `fetchTourInfoLastFreshFetchByRegion()`을 공유).
6. **sync 통합 범위**: `runResumableLocalBatchSync`(Phase 2-B STAGING 증분 sync 경로)에만 TTL
   재사용을 연결했다 — cron/admin이 쓰는 `runTourismDataSync`(단일/정기 sync)는 이번 범위에서
   손대지 않았다(작업 지시 원문의 "최소 범위로 연결" 원칙, quota가 가장 민감한 경로부터 우선
   적용). region별 freshness는 배치 시작 시 한 번만 조회해 두고 지역 루프에서는 조회만 한다.
   운영 중 특정 지역 POI를 TTL과 무관하게 즉시 갱신해야 하면
   `npm run sync:tourism-data -- --all-regions --max-regions=N --force-tour-info`를 쓴다
   (`--all-regions` 없이는 쓸 수 없어 실수로 전국을 강제 재호출하는 기본값이 없다).
7. **검증(실 로컬 DB 포함)**: 신규 단위 테스트 3개 파일(`tourInfoFreshness.test.ts` 6개,
   `tourInfoFreshnessLookup.test.ts` 3개) + `tourismDataQualityAudit.test.ts`/`syncService.test.ts`/
   `syncCliArgs.test.ts`/`activeDataset.test.ts` 확장 — 전체 **1357개 테스트 통과**, typecheck/
   lint/build 통과. 실제 로컬 DB로 202606의 TOUR_INFO 최근 fetchedAt을 읽기 전용으로 감사해
   현재 255개 지역 전부 FRESH임을 확인했다(임시 스크립트, 검증 후 삭제) — 즉 지금 202607 같은 새
   STAGING이 생기면 TOUR_INFO 재호출이 0건이 될 것으로 예상된다는 근거다. `npm run
   audit:tourism-data -- --base-ym=202606`도 실행해 `tourInfoFreshReuseRegions` 필드가 정상
   출력됨을 확인했다(현재는 0 — 이번 baseYm 자체가 이미 SUCCESS라 재사용이 필요 없는 상태이므로
   정상).
8. **남은 위험/후속 과제**: (a) POI 폐업/삭제 반영 체계가 없다(upsert만, delete 없음) — TTL이
   길어질수록(60일) 반영이 늦어질 수 있다. 이번 라운드에서 해결하지 않았고, "stale POI" 표시 같은
   후속 Phase 후보로만 남긴다. (b) `SelectedPlan.course`는 `poiId` 참조만 저장하고 좌표/이름을
   복제하지 않는다 — Poi가 delete 없이 upsert만 되는 구조라 참조 무결성 자체는 안전하지만, 과거
   실행안을 다시 열면 그 사이 API 재조회로 바뀐(TTL 재사용이 아니라 실제 재수집이 일어난 경우)
   최신 좌표/주소가 보인다는 재현성 이슈가 있다 — 이번 라운드에서 대규모 스키마 변경 없이 사실만
   기록해 둔다.

## 2026-08-13 갱신 — Phase 3(Network DNA 재설계: "관광 접점 조합 가능성형 B/H1")

1. **문제 진단**: 기존 Network 산식(attraction 50% + `PoiRelation` 기반 relation 20% + 음식/숙박/
   체험 존재여부 coverage 30%)을 조사한 결과, `PoiRelation`은 대전/제천/양양 3개 지역에만 존재하는
   초기 seed fixture 8건이 전부였고(전국 API 수집 경로 없음 — 정식 서비스명·URL 자체가 미확인),
   그 3곳만 relation 보너스로 전국 Network 순위 1~3위를 부당하게 점유하고 있었다(relation 없다고
   가정 시 각각 24~128위로 하락). coverage도 전국 88.6%(224/255)가 만점이라 변별력이 거의 없었다.
2. **새 산식**: `attractionScore*0.5 + serviceCombinationScore*0.5`, `serviceCombinationScore =
   (foodScore+lodgingScore+experienceScore)/3`, 각 요소는 `diminishingReturnsScore(count, half) =
   100*count/(count+half)`. half-saturation(attraction=53, food=34, lodging=5, experience=7)은
   전국 202606 SIGUNGU 255곳 실제 count 분포의 median으로 QA를 거쳐 고정한 이 모델 version의
   parameter다(`src/lib/domain/dna.ts`). 후보 A(단순 평균)/B(attraction 중심 조합)/C(entropy 기반
   diversity)를 비교한 결과 B가 기존 산식과의 순위 상관(Spearman ρ=0.91)이 가장 높고 relation
   보너스를 합리적으로 제거해 최종 채택했다.
3. **PoiRelation 완전 제외**: `NetworkRawInputs` 타입에서 `relatedPoiCount`/`relation` 필드 자체를
   제거했고, `buildDnaEngineInput.ts`는 더 이상 `prisma.poiRelation.count()`를 호출하지 않는다 —
   타입 레벨에서 relation이 점수에 영향을 줄 수 없는 구조다. DB의 `PoiRelation` 8건과 seed는
   삭제하지 않고 historical/reference로 보존했다(migration 없음).
4. **Evidence 재구성**: `networkPoiCount`(중심 관광지 수)/`networkFoodCount`/`networkLodgingCount`/
   `networkExperienceCount` 4개 metricCode만 생성한다(전부 출처 TOUR_INFO). `networkRelationCount`
   evidence는 더 이상 만들지 않는다. 사용자 노출 문구에서 "연관관광지 수"/"POI_RELATION"/"실제
   관광지 간 관계망"/"방문 흐름" 표현을 전부 제거하고, "중심 관광지와 음식·숙박·체험 공급이 함께
   갖춰져 하나의 여행 동선으로 조합하기 쉬운 정도"로 재정의했다. `axisSourceSummary.ts`의 출처
   배지 로직도 relation 분기를 제거했다.
5. **MODEL_VERSION**: `tour-dna-v1.0.0` → `tour-dna-v1.1.0`(`src/lib/domain/constants.ts`). 이
   변경은 `Dataset.ACTIVE`(202606)를 바꾸는 dataset drift가 아니라 산식 자체를 바꾸는 model
   change이므로 `DRIFT_GATE_THRESHOLDS`는 손대지 않았고, 이번 변화를 월간 drift로 기록하지 않는다.
6. **전국 202606 QA(실제 production 함수로 재계산)**: 255개 SIGUNGU 기준 mean 49.09, stddev 15.89,
   0/100 saturation 없음(직전 별도 QA의 예측과 정확히 일치). 대전 3위→55위, 제천 2위→19위, 양양
   1위→18위로 하락해 relation 보너스가 해소됐음을 확인했다.
7. **downstream 회귀(old 산식 vs new 산식, 실제 production 함수로 비교)**: similarity seed 10곳
   평균 Top3 overlap 2.40/3, Top1 변경 3/10(경주·제주·충주), zero-overlap 1건(충주) — 직전 QA
   예측과 일치. strength/weakness 30개 표본 중 변경 3곳(10%). 대표 전략 3개 시나리오(강릉/경주/
   제천) 전부 Top3 순서·1위 템플릿 유지, 점수만 ±1~3점 이동.
8. **대표 프로젝트(강릉/경주/제천) 로컬 재분석**: `runAnalysisForProject`는 신규 프로젝트 전용이라
   기존 프로젝트에 쓰면 `Project.selectedStrategyResultId`가 삭제된 옛 `StrategyResult`를 계속
   가리키는 버그가 있음을 발견했다 — 실제 production 재분석 정책(`edit/actions.ts`
   `updateProjectAndReanalyzeAction`)과 동일하게 SelectedPlan 삭제 → selectedStrategyResultId
   null화 → 새 분석 결과의 1위 전략 재선택 → `ensureSelectedPlan` → rule 기반(LLM 미호출)
   `generatePromoContentForProject`로 정상 복구했다. 재분석 후 Network 점수: 강릉 78→85, 경주
   78→85, 제천 82→71(전부 직전 QA 예측과 일치). 3개 프로젝트 모두 전략 1위 템플릿이 유지돼
   `ensureSelectedPlan`이 SelectedPlan을 재생성하지 않았지만(코스 자체는 동일), promoContent는
   rule 생성기로 재생성해 옛 Network 점수(78/82) 참조가 남지 않도록 정리했다. 화면 표시용
   `toDisplayDnaScore(10~90)` 변환은 전혀 손대지 않았다(예: 경주 raw 85 → display 78 — 강점 판정은
   raw 85, 축 카드는 display 78로 원래부터 의도된 분리다).
9. **검증**: 신규/수정 단위 테스트(`dna.test.ts`/`buildDnaEngineInput.test.ts`/`axisSourceSummary.test.ts`
   등) 포함 전체 **1361개 테스트 통과**, typecheck/lint/build 전부 통과. Production Neon/Vercel은
   전혀 접근하지 않았다(로컬 전용 개발 정책 유지).
10. **남은 기술부채**: (a) `docs/scoring-model.md`의 Network 산식 설명이 이번 갱신 이전에도 실제
    코드와 다른 더 오래된 버전(단순 가중합)으로 남아 있었다 — 이번에 함께 바로잡았다. (b) 향후
    PoiRelation을 실제로 전국 API에서 수집할 방법이 생기면, 이번에 폐기한 20% 가중치 재도입 여부를
    별도로 재검토할 수 있다(이번 세션에서는 시도하지 않음).

## 2026-08-13 갱신 — 강릉 대표 코스 밀도 버그 수정(POI 적합도 판정)

운영 웹(당시 배포 `136025a`, 이번 Network 재설계 이전)에서 확인된 "강릉 1박2일 코스가 식당 3곳뿐"
문제를 로컬 최신 main에서 재현·수정했다. 근본 원인은 `poiFit.ts`의 `computePoiFit`이 카테고리가
전략의 CORE(핵심)여도, 선호 테마(예: "미식")와 무관한 카테고리(ATTRACTION 등)에까지 무조건 이름
키워드 일치를 요구해 `BELOW_MINIMUM_FIT`으로 코스에서 통째로 제외한 것이었다 — 실제 강릉 프로젝트의
사천해변·사천진항(둘 다 ATTRACTION, CORE 카테고리)이 "이름에 미식 키워드가 없다"는 이유만으로
제외돼 관광/체험 보완 POI가 0개가 됐다. 선호 테마가 **"미식(FOOD) 단독"**일 때만 FOOD가 아닌
카테고리는 테마 평가를 적용하지 않도록(선호 테마 미입력과 동일하게 "평가 제외") 최소 범위로
고쳤다(`src/lib/domain/poiFit.ts`) — 2026-07-30에 고친 "워터파크가 CULTURE_HISTORY로 오인되는" 회귀는
테마가 여러 개 섞이거나 FOOD가 아닌 경우 그대로 유지되도록 조건을 좁혀 재현하지 않는다(경주 캠핑장
테스트로 회귀 확인). 코스 생성 로직(`planBuilder.ts`)·템플릿 정의는 손대지 않았다 — POI 후보 풀에
대한 fit 판정 하나만 고쳐 강릉 프로젝트가 1일차 5곳(관광지-점심-관광지-체험-저녁)+숙박, 2일차
4곳(관광지-관광지-점심-관광지)으로 정상화됐다(재분석·브라우저 확인 완료). 홍보 재생성도 실제
`OPENROUTER_API_KEY`로 1회 시도했으나 기본 무료 모델이 20초 timeout으로 실패해 rule fallback으로
저장됐다(정상 동작 — `generatedBy="rule"`) — 재생성 성공/실패와 무관하게 사용자에게 실패 사실을
부드럽게 알리도록 `PromoContentEditor.tsx`의 재생성 성공 토스트에 "AI 생성이 지연되어 기본 생성
결과를 사용했습니다" 안내를 추가했다(내부 실패 사유는 서버 로그에만 남기고 노출하지 않음). 경주/
제천은 이 조건("미식 단독" 테마)에 해당하지 않아 코드 경로 자체가 바뀌지 않았으므로 회귀 없음(두
프로젝트가 현재도 FOOD-only 코스를 보이는 것은 각자의 테마(문화·역사/웰니스)에서 독립적으로 이미
존재하던 별개 현상이며, 이번 수정 범위 밖이다 — 필요하면 후속 작업으로 별도 조사).

## 2026-08-13 갱신 — 경주/제천 FOOD-only 코스의 일반적 근본 원인 수정(CORE 최소 보존)

위 강릉 수정 직후 경주(CULTURE_HISTORY)·제천(NATURE_WELLNESS)도 같은 계열의 근본 원인으로 FOOD-only
코스가 나오고 있음을 재확인했다: FOOD/LODGING은 `REQUIRED_SLOT`이라 등급과 무관하게 항상 살아남지만,
ATTRACTION/EXPERIENCE는 전략의 CORE 카테고리여도 테마 키워드(예: "문화"/"역사"/"웰니스")가 실제
POI 이름에 없으면 `BELOW_MINIMUM_FIT`으로 전부 탈락한다 — 실제 한국 관광지 이름은 이런 일반 테마
단어를 거의 포함하지 않으므로, 이 REQUIRED_SLOT/CORE 비대칭이 강릉뿐 아니라 경주·제천에서도 동일하게
관광/체험 POI를 0개로 만들고 있었다(파이프라인 감사로 확인: 경주는 전략 후보 ATTRACTION 2·
EXPERIENCE 2가 전부 fit 탈락, 제천은 ATTRACTION 3·EXPERIENCE 2가 전부 fit 탈락).

개별 POI의 판정 기준(`computePoiFit`)을 완화하는 대신(2026-07-30 워터파크/캠핑장 오인 방지 회귀
재발 위험), `filterRecommendablePois`에 **CORE 최소 보존 정책**을 추가했다 — 전략의 테마 핵심
카테고리(FOOD/LODGING 제외)에 이미 확인된(키워드가 실제로 일치하는) CORE POI가 하나라도 있으면
그대로 두고, 하나도 없을 때만 테마 근거 불확실로 탈락했던 CORE 후보를 새 `recommendationStatus`
값 `CORE_MINIMUM_RESERVE`로 재분류해 복귀시킨다(`applyCoreMinimumReserve`, `src/lib/domain/
poiFit.ts`). 워터파크/캠핑장처럼 이미 좋은 후보가 있는 경우는 그대로 보수적으로 유지된다(테스트로
회귀 확인).

이 정책 적용 후 실제 재분석 결과: 경주는 화산숯불&손두부(FOOD)·경주시 자전거공원(ATTRACTION)·
보문골프클럽(EXPERIENCE)·한화리조트 경주(ATTRACTION) 등으로 FOOD 5·ATTRACTION 6·EXPERIENCE 3·
LODGING 2가 자연스럽게 섞인 3일 코스가 됐고, 제천도 FOOD 5·ATTRACTION 5·EXPERIENCE 5·LODGING 2로
정상화됐다. 강릉은 영향받지 않음(이미 확인된 CORE 후보가 있어 이 정책이 발동하지 않음, 회귀 없음).

**알려진 한계(투명하게 공개)**: CORE 최소 보존이 발동하면, 테마 키워드가 없는 CORE 후보 전부가
동일하게(우열을 가릴 근거가 없으므로) 복귀 대상이 된다 — 실제로 경주 재분석 결과에 "강동 워터파크"
(지역 실제 후보 데이터에 존재하는 ATTRACTION)도 함께 포함됐다. 이는 "관광지 0개"라는 더 심각한 실패
모드를 피하기 위해 받아들인 의도적 트레이드오프이며, 카테고리·키워드만으로는 이 워터파크가 실제로
부적절한지 판단할 근거가 없다(복잡한 점수화는 만들지 않기로 했다 — 작업 지시 원칙). 후속 개선이
필요하면 거리·인기도 등 별도 신호를 도입하는 방향을 검토할 수 있다.

**(2026-08-14 갱신)** 위 한계는 TourAPI 공식 분류체계(`lclsSystm1/2`) 기반 구조 신호 도입으로
상당 부분 완화됐다 — "강동 워터파크"(`lclsSystm2="VE02"` 테마공원)는 이제 이름 키워드와 무관하게
공식 분류상 문화·역사가 아님이 확인돼 최소 보존 대상에서 제외된다. 자세한 내용은 아래 "2026-08-14
갱신 — POI 추천 품질 2차 고도화" 절 참고(다만 구조 신호가 없는 나머지 후보는 여전히 이름 키워드에
의존하므로 한계 자체가 완전히 사라진 것은 아니다).

화면 표시 일관성도 함께 고쳤다: `poiFitService.ts`(`buildStrategyPoiFitSummary`)가 실제 코스에 포함된
POI에 대해 raw `computePoiFit`만 다시 계산해 CORE_MINIMUM_RESERVE로 복귀된 POI에도 "전략 적합
기준에 미달해 제외되었습니다"라는 문구가 남아 실제 코스 상태와 어긋나는 문제를 발견해, 같은
`applyCoreMinimumReserve`를 여기서도 적용하도록 고쳤다(코스 생성과 화면 표시가 항상 같은 결론을
공유). `PlanEditor.tsx`의 fit 배지도 CORE_MINIMUM_RESERVE 전용 라벨("후보 부족으로 보완 추천")을
추가했다.

## 2026-08-13 갱신 — 대전 지역 선택 정합성 수정 + 주요 페이지 로딩 성능 개선

**대전 지역 선택 정합성**: `SGG_DAEJEON`은 대전 전국 확장(2026-08-09, 동구/중구/서구/대덕구 4개
SIGUNGU 추가) 이전에 만들어진 대전의 유일한 SIGUNGU 레코드였다. 실제 DB를 직접 조사한 결과
(NormalizedMetric·Poi·API 파라미터 전부 확인), code/apiSigunguCode(30200)/tourApiLdongSignguCd(200)
등은 처음부터 유성구 데이터였는데 `Region.name`만 "대전광역시"로 잘못 남아 있었다 — 4개 자치구가
나중에 추가되며 시/군/구 드롭다운에 legacy "대전광역시" 항목이 실제 유성구와 뒤섞여 노출되는 문제가
생겼다. 화면 표시만 덮어씌우는 override 대신 `Region.name` 자체를 "유성구"로 바로잡았다(code/FK는
불변 — 기존 Project 호환, 단발성 스크립트로 실행 후 삭제, `regions.ts` seed도 동기화). POI 388/396건
(98%)은 API 수집이라 유성구로 정확히 좁혀졌고, FIXTURE 8건 중 4건(대전 전체 대표 명소로 큐레이션된
한밭수목원 등)만 실제로는 다른 구 주소 — 삭제하지 않고 알려진 한계로 기록만 남겼다(자세한 내용은
`regionQueries.ts` 주석 참고). 전국 255개 SIGUNGU 개수·다른 SIDO 옵션에는 영향 없음.

**페이지 로딩 성능**: 강릉/경주/제천 대표 프로젝트로 분석/실행안/인쇄 페이지의 실제 병목을 측정한
결과, `resolveRegionComparisonAnalysis`가 저장된 스냅샷을 재사용해 정상 분석에서는 전국 재계산이
이미 일어나지 않고 있었다(우려했던 것과 달리). 실제 병목은 (1) `analysis`/`plan`/`print` 세 페이지가
서로 독립적인 비동기 작업(유사지역 비교, POI 조회, 홍보자료/적합도 계산 등)을 순차 await로 처리하던
것, (2) PRIVATE_VEHICLE 실행안에서 구간(변)마다 카카오 경로 API를 순차 호출하던 것(`courseRouteEnrichment.ts`)
두 가지였다. 둘 다 서로 의존하지 않는 작업이라 `Promise.all`로 병렬화했다(계산 로직·산식은 전혀
변경하지 않음, 새 캐시 도입 없음). 실측: 강릉/경주/제천처럼 이미 분석·실행안이 완료돼 값을 재사용하는
경우 체감 차이는 크지 않았다(순차 체인 자체가 이미 짧았기 때문, analysis 약 140~150ms·plan 약
75~90ms로 전후 동일) — 반면 실제 병목이 드러나는 시나리오(제천의 PRIVATE_VEHICLE 코스 14개 구간을
`previousDays=null`로 강제 전체 재계산)에서는 1212ms → 234ms로 약 5.2배 단축(결과값은 완전히 동일하게
확인). 즉 이번 개선은 최초 실행안 생성·전략 재선택처럼 캐시된 값을 재사용할 수 없는 시점에 실질적으로
체감된다.

## 2026-08-13 갱신 — Vercel 자동배포 재활성화 + Production 최초 Document ~6초 병목 조사

Vercel 사용량 여유를 확인한 뒤 `vercel git connect`로 GitHub → Vercel 자동배포를 다시 켰다(project API의
`link` 필드로 GitHub/`herb39/TOUR-DNA`/Production branch `main` 연결을 확인, `main` push 후 실제
Production 자동 배포·`tour-dna.lib.lc` alias 갱신까지 end-to-end 확인 완료). 개발 DB 정책은 그대로
유지 — local PostgreSQL만 개발/QA에 쓰고 Production Neon에는 개발용 write를 하지 않는다.

**Production 최초 Document ~6초 병목**: 홈(`/`) 서버 렌더 단계에 임시 계측(ms만 기록, 값은 로그에 남기지
않음)을 추가해 Vercel 런타임 로그로 실측했다. 뚜렷한 두 패턴이 확인됐다:
- **Cold**(해당 요청에서 Prisma client가 새로 생성됨 — `src/lib/db.ts`의 singleton은 `NODE_ENV !==
  "production"`일 때만 `globalThis`에 캐시되므로, warm하지 않은 서버리스 인스턴스에서는 매번 새
  PrismaClient/커넥션을 맺는다): 병렬 쿼리 그룹만 2900~4200ms, 프로젝트 목록 조회 900~2300ms.
- **Warm**(같은 인스턴스가 재사용돼 Prisma client가 이미 있음): 병렬 쿼리 그룹 1050~1400ms, 프로젝트
  목록 조회 880~2150ms — **커넥션을 새로 안 맺어도 쿼리 자체가 여전히 900ms~2s대**로, 코드 병렬화만으로는
  해소되지 않는 수준이다. 이는 Vercel Function(iad1, 워싱턴 D.C. 확인됨) ↔ Neon DB 사이 네트워크
  왕복 지연이 실제 지배적 요인일 가능성을 시사한다(Neon 쪽 정확한 리전은 `DATABASE_URL` 복호화가
  필요해 이번 세션에서는 안전장치에 의해 확인하지 못했다 — 사용자가 Vercel 대시보드에서 직접 확인
  필요).
- `src/proxy.ts`(사이트 접근 게이트)는 순수 HMAC-SHA256 서명 검증만 하며 DB/외부 호출이 전혀 없음을
  코드로 확인 — 게이트 자체는 병목이 아니다.
- 실제로 안전하게 고칠 수 있었던 것은 `getLatestDataFreshness()`의 두 독립 조회(`dataSnapshot.findFirst`,
  `syncLog.findFirst`)를 `Promise.all`로 병렬화한 것 하나뿐이다(반환값 불변, 회귀 없음, 기존 테스트
  그대로 통과). `ProjectListSection`의 목록 조회를 홈 최상단 `Promise.all`에 합치는 리팩터링도 후보로
  검토했으나, 이 컴포넌트의 async 시그니처(및 이를 직접 호출하는 다수의 기존 테스트)를 함께 바꿔야
  해서 "가장 큰 병목 하나만, 위험 낮은 경우에만" 원칙에 비춰 이번에는 보류했다(다음 성능 작업 후보로
  남김).
- 결론: 6초 병목의 대부분은 코드의 순차 await가 아니라 (1) 서버리스 cold-connection 재수립 비용과
  (2) warm 상태에서도 남는 Vercel↔Neon 네트워크 왕복 지연으로 보인다 — DB 리전 조사·이관은 이번
  작업 범위 밖이라 실행하지 않았다(다음 작업에서 Neon 리전 확인 후 결정 필요).

### 후속 확인(2026-08-13) — 원인 확정: Vercel Function ↔ Neon region mismatch

사용자가 직접 대시보드에서 확인한 결과 **Neon Production DB region은 Singapore**였고, 그 시점 **Vercel
Function region은 North America**였다 — 위에서 추정만 했던 "네트워크 왕복 지연"의 실체가 대륙 간
region mismatch였음이 확정됐다. **Vercel Function region을 Singapore로 변경해 Neon과 동일 리전으로
맞춘 뒤 운영 최초 Document 체감 로딩 문제가 해결됐다**(재측정 ms 수치는 별도로 확보하지 않았으므로
숫자로 단정하지 않는다 — "체감 문제 해결"로만 기록한다).

이번 세션에서 시도했던 코드 레벨 개선(`getLatestDataFreshness()` 병렬화 등)은 정상적이고 유지할
가치가 있지만, **6초대 지연의 실제 핵심 원인은 애플리케이션 코드가 아니라 인프라 region 불일치였다**
— 같은 대륙 안에서의 정상적인 네트워크 지연(수십~수백 ms)이 아니라 대륙 간 왕복이 여러 차례 누적된
결과였다. 한국 사용자를 대상으로 하는 이 서비스는 **Vercel Function과 Neon DB를 모두 Singapore로
정렬**하는 것이 현재 권장 운영 구성이다.

**향후 점검 항목** — 다음 작업 중 하나라도 발생하면 Function region과 DB region이 서로 일치하는지
먼저 확인한다: DB provider 변경, DB migration/이관, Vercel project 재생성, Vercel Function region
변경. region 불일치는 코드를 아무리 최적화해도 해소되지 않는 종류의 지연이므로, 새 인프라를 구성할
때마다 이 확인을 가장 먼저 한다.

## 2026-08-13 갱신 — AI 홍보 콘텐츠 생성 timeout 실측 조사(결론: 외부 무료 provider 지연이 근본 원인)

강릉 대표 프로젝트로 실제 OpenRouter 요청을 여러 차례 실측했다. 확인된 사실:
- **timeout은 이미 요청 전체(헤더 수신+본문 읽기+JSON 파싱)를 보호한다** — `AbortController`를
  `finally`에서만 clearTimeout하는 기존 구조(2026-08-11 수정)가 정상 동작함을 재확인.
- **7채널 전체 요청과 2채널(proposalSummary+instagram)만 담은 축소 요청이 똑같이 정확히 20000ms에
  timeout됐다** — payload/schema 크기가 원인이 아니라는 뜻이다(Case B: provider/model latency가
  주원인). 같은 무료 모델(`google/gemma-4-26b-a4b-it:free`)로 추가 요청을 보내자 즉시 HTTP 429(분당
  요청 제한)가 여러 번 발생했다 — 무료 모델 특성상 재시도로도 우회할 수 없다.
- OpenRouter의 실제 모델 카탈로그(`/api/v1/models`, 비민감 메타데이터 조회)에서 structured output을
  지원하는 무료 모델 6개를 확인하고 대표 후보 2개를 추가 실측했다: `openai/gpt-oss-20b:free`는
  5.8초로 빠르게 응답했지만 **reasoning 전용 모델이라 최종 답변이 `message.content`가 아니라
  `message.reasoning`에만 담겨**(실제 raw 응답으로 확인) 기존 파싱 로직과 호환되지 않는다(구조 변경
  없이는 채택 불가). `liquid/lfm-2.5-2.6b:free`(2.6B, 가장 작은 후보)도 동일하게 20000ms timeout —
  모델 크기와 지연이 상관관계가 없음을 보여준다.
- 결론: **timeout의 근본 원인은 애플리케이션 코드가 아니라 OpenRouter 무료 모델의 업스트림 provider
  지연/가용성 자체**다(Case B). 안전하게 코드로 고칠 수 있는 부분이 아니므로 억지로 모델을 바꾸거나
  timeout을 늘리지 않았다.
- 유일하게 적용한 변경: `cardNews.slides`/`shortForm.scenes`에 상한(각각 7/4, 규칙 기반 생성기의 실제
  최대 출력량과 동일)을 추가했다 — 이전에는 상한이 전혀 없어 이론상 더 큰 응답을 요구할 수 있었다.
  사용자 체감 콘텐츠 분량은 줄지 않으며(규칙 기반 fallback과 최대치가 같음), 최악의 경우 응답 크기만
  보수적으로 제한한다.
- 강릉·제천 실제 재생성(로컬 DB, `overwrite: true`)에서 두 번 모두 20초 후 정상적으로 규칙 기반
  fallback으로 저장됐다(`generatedBy: "rule"`, 7채널 전부 유효, UI 뱃지 "기본 생성"과 정확히 일치) —
  실패 시 fallback이 원자적으로(부분 AI 혼입 없이) 동작함을 재확인했다.

**후속 필수 고도화 과제(미해결, 2026-08-13 기록)**: 현재 deterministic rule fallback은 안정적으로
동작하지만, OpenRouter 무료 provider의 응답 지연으로 실제 AI 생성 성공률이 충분하지 않다. 향후
실제 서비스 단계에서는 소액 유료 모델을 포함한 안정적 provider/model 조합, timeout, 비용 상한,
fallback 정책을 별도 고도화해야 한다.

## 2026-08-14 갱신 — POI 추천 품질 2차 고도화(TourAPI 공식 분류체계 기반 테마 적합도)

**배경**: 기존 `computePoiFit`의 테마 적합도 판정은 사용자가 선택한 선호 테마와 POI **이름**의 substring
키워드 일치 여부로만 결정됐다. 조사 결과 이 방식은 두 가지 근본 한계가 있었다.
1. 한국의 실제 문화·역사 유적(경주 첨성대·대릉원·천마총 등)은 이름에 "문화"/"역사"/"유적"/"고궁" 같은
   일반 단어를 포함하지 않아, 실제로는 CULTURE_HISTORY 전략의 핵심 자산인데도 이름 키워드로는 전혀
   확인되지 않았다(로컬 DB 검증: 경주시 ATTRACTION 231건 중 124건, 54%).
2. "강동 워터파크"처럼 카테고리(ATTRACTION)만 일치하고 실제로는 무관한 장소가, 진짜 문화·역사 후보가
   전부 이름 키워드 불일치로 제외되면 `CORE_MINIMUM_RESERVE`(2026-08-13 도입) 최소 보존 대상으로
   함께 복귀되는 문제가 `docs/implementation-status.md`(2026-08-13 "알려진 한계") 항목에 이미
   기록돼 있었다.

**조사**: `Poi.rawPayload`(API로 동기화된 POI 48,268건 전부, 100%)에 TourAPI 신 분류체계
`lclsSystm1`(대분류)·`lclsSystm2`(중분류)가 이미 저장돼 있음을 확인했다 — 별도 API 호출 없이 기존
저장 데이터만으로 쓸 수 있는 신호다. `npm run verify:region -- --lcls-systm1 <코드>`(기존에 FD 음식
분류를 검증했던 것과 동일한 방식, 실 서비스키로 `lclsSystmCode2` 오퍼레이션 직접 호출)로 이전까지
미검증이던 비-음식 대분류(NA/HS/VE/AC/LS/SH/EV/EX)의 공식 명칭을 확인했다(상세는
`docs/public-api-status.md`의 "4-B" 절 참고). 그 결과:
- `lclsSystm1="HS"`(역사관광 — 역사유적지/역사유물/종교성지/안보관광지)가 CULTURE_HISTORY와,
  `lclsSystm1="NA"`(자연관광)가 NATURE와, `lclsSystm1="LS"`(레포츠)가 LEISURE_ACTIVITY와,
  `lclsSystm2="EX05"`(웰니스관광 — 온천/스파/찜질방/한방체험/힐링명상 등)가 WELLNESS와,
  `lclsSystm2="VE07"`(전시시설 — 박물관/기념관/전시관/과학관/미술관)가 CULTURE_HISTORY와 각각
  정확히 대응됨을 공식 코드표로 확인했다.
- VE 대분류 전체(테마공원·도시공원·복합관광시설·레저스포츠시설 등 12개 중분류가 섞여 있음, "강동
  워터파크"=VE02 테마공원이 실제 사례)는 신호로 쓰지 않고, 명확히 문화·역사와 연관된 VE07 중분류만
  썼다 — 근거가 불확실한 대분류를 통째로 신호화해 새로운 오탐을 만들지 않기 위함이다.

**적용**: `src/lib/domain/audienceContext.ts`에 `classifyStructuralPoiThemes()`를 추가했다.
`src/lib/domain/poiFit.ts`의 `computePoiFit`은 이제 이 구조 신호가 있으면(대부분의 API POI) 그것을
이름 키워드보다 우선 사용하고, 없으면(FIXTURE, 매핑 없는 코드) 기존 이름 키워드 판정으로 안전하게
fallback한다 — 판정 산식의 배점·threshold·`CORE_MINIMUM_RESERVE` 알고리즘(cap=3 등)은 전혀 바꾸지
않았다. `PoiFitResult.breakdown.themeFit.source`("STRUCTURAL"/"KEYWORD"/"NONE")로 어떤 근거를 썼는지
노출하고, 화면에 이미 있던 추천 근거 문구("선택한 선호 테마와 장소명 키워드가 일치합니다" 등)를
공식 분류 근거("한국관광공사 관광정보의 공식 분류상 선택한 선호 테마와 일치하는 유형입니다")로 갈아
끼웠다 — 새 UI 배지를 추가하지 않고 기존 표현 자리를 재사용했다.

**검증**: 전국 30개 지역 × 7개 전략 템플릿 A/B 비교(로컬 DB, `filterRecommendablePois` 직접 호출)에서
추천 통과 후보가 16,541건 → 17,405건(+5.2%)으로 늘었고, 0건으로 급락하거나 완전히 사라진 조합은
없었다. 브라우저로 경주(CULTURE_HISTORY) 실행안을 실제로 재생성한 결과 "강동 워터파크"가 더 이상
포함되지 않고, 경주시자전거공원 등 실제로 구조 신호가 없는 후보만 여전히 CORE_MINIMUM_RESERVE로
보완됐다 — 위 "알려진 한계" 항목이 완화됐다(완전히 사라진 것은 아니다: HS/VE07/NA/LS/EX05에 해당하지
않는 POI는 여전히 이름 키워드 판정에 의존한다). 강릉(NIGHT_STAY_EXTENSION, FOOD 테마)과 제천
(NATURE_WELLNESS)도 재생성해 기존 ATTRACTION/FOOD/LODGING/EXPERIENCE 구성이 그대로 유지됨을
확인했다(회귀 없음).

**적용하지 않은 것**: `fetchPoisByCategory.ts` 기반의 "지역 후보 부족 안내" 재계산 경로
(`poiFitService.ts`의 shortage 계산)에는 구조 신호를 연결하지 않았다 — 이 경로는 `strategy.ts`의
`PoiLike` 타입을 확장해야 하는데, strategy 점수 로직 파일을 건드리지 않기 위한 의도적 보수적 선택이다.
영향은 "부족 안내 문구의 제외 건수"가 실제보다 다소 크게 표시될 수 있다는 점뿐이며(예: 경주
"전략 적합 기준에 미달한 장소 300곳을 추천에서 제외했습니다"), 실제 코스 구성(`planService.ts`)과
화면 배지(`poiFitService.ts`의 `buildStrategyPoiFitSummary`)는 정상적으로 구조 신호를 반영한다.
PET_FRIENDLY 테마는 이번에도 대응하는 공식 분류 코드가 없어 그대로 MISSING 처리를 유지했다.

## 2026-08-14 갱신 — 운영 문제 재현 조사 및 최소 수정(코스 구성 품질 2차)

**배경**: 위 POI 추천 품질 2차 고도화(`fe0e46b`) 직후, 실제 Production에서 청주시 흥덕구(자연·웰니스형)
와 경주시(문화·역사형) 실행안을 재현해보니 "강동 워터파크"가 다시 "적합도 높음"으로 나타나는 등 완료
보고와 상충하는 결과가 보였다. 조사 결과 두 가지가 섞여 있었다.

**1) 완료 보고와의 충돌 원인 — 코드 회귀가 아니라 별개의(더 근본적인) 문제**: 문제가 된 Production
프로젝트들은 선호 테마를 입력하지 않은(`preferredThemes: []`) 프로젝트였다. `computePoiFit`은 선호
테마가 없으면 테마 항목 자체를 만점 계산에서 제외한다(`themeEvaluated=false`, 2026-07-30부터의 기존
설계 — "정보가 없어 낮은 점수"와 "실제로 안 맞아 낮은 점수"를 구분하기 위함). 그런데 이 경우
`maxScore`가 카테고리+계절 두 항목만으로 줄어들어, 성수기의 CORE 카테고리 POI는 테마와 무관하게
카테고리·계절만으로도 100/100(적합도 높음)에 도달할 수 있다 — "강동 워터파크"·"경주시청소년수련관"·
"SK하이닉스 문화센터" 등이 실제로는 테마 확인이 전혀 안 됐는데도 "적합도 높음"으로 표시된 이유다.
`fe0e46b`의 구조 신호 개선은 `themeEvaluated=true`(선호 테마를 입력한 경우)에만 작동해, 이 시나리오와는
애초에 무관했다 — 즉 "재등장"이 아니라 (a) 선호 테마 미입력 시의 기존 배지 오해 소지 문제와 (b) 아래
장거리 구간 버그, 두 개의 별개 문제였다.

- **수정(Category A, 표시 문제)**: `PlanEditor.tsx`의 `resolveFitBadge`가 grade≠LOW인데
  `themeFit.evaluated===false`이면 `"적합도 높음 (테마 미입력)"`처럼 근거 범위를 명시하도록 라벨만
  보완했다. 판정 산식(grade/threshold)은 전혀 바꾸지 않았다.

**2) 장거리 구간(EXCESSIVE, 90분 이상)이 화면에 남는 버그(Category A, 실제 코드 결함)**: 경주 실행안
2일차의 "황남비빔밥→감포공설시장 106분" 구간이 90분 기준을 넘는데도 제거되지 않고 그대로 노출됐다.
원인: `repairExcessiveTravelSegments`(2단계, 2026-07-27 도입)는 `scheduleDayPois`(3단계, FOOD를
점심/저녁 시간대에 맞춰 재배치)가 실행되기 **전** 순서만 검사한다. 3단계가 FOOD를 시간대에 맞춰
재배치하면서 2단계가 보지 못한 새 인접 쌍이 생길 수 있는데, 그 결과로 생긴 EXCESSIVE 구간은 그 뒤로
아무도 다시 확인하지 않았다 — `planBuilder.ts`의 실제 좌표로 순수 함수 재현(DB 없이) 및 실 서비스키
데이터로 직접 확인했다.
- **수정**: `planBuilder.ts`에 `repairExcessiveTravelAfterScheduling()`을 추가해, 3단계 스케줄링 이후
  최종 순서에서 다시 EXCESSIVE 인접을 확인하고 남아있으면 제거한다(이동만 하지 않고 제외만 함 —
  "안전한 생략" 원칙 유지). FOOD/LODGING(필수 슬롯)은 이 정리 대상에서 제외한다 — 이 둘을 지우면
  "날짜별 식사 보장"(4단계)이 되돌릴 수 없는 손실이 생기기 때문이다(자정-wrap 방어 기존 테스트로
  실제 회귀를 확인하고 가드를 추가했다). `EXCESSIVE_TRAVEL_MINUTES`(90분) 등 threshold는 그대로다.
- **검증**: 전국 30개 지역 × 4개 교통수단 × 2개 기간(총 208개 코스, 520개 날짜) 비교 결과, EXCESSIVE
  구간이 남은 날짜가 40건 → 33건으로 줄었다(회귀 0건, FOOD 누락 코스도 0건으로 동일). 완전히 0건이
  되지 않은 나머지 33건은 FOOD가 이상치로 지목된 경우를 의도적으로 보호(제거하지 않음)한 결과다 —
  아직 남은 한계로 아래에 기록한다.

**조사했지만 이번에 구현하지 않은 것(근거는 확인, 위험도가 커서 후속 과제로 남김)**:
- **대표 관광지가 선택되지 않는 근본 원인**: `strategy.ts`의 `selectPois`(전략별 POI 후보 선정, 실제
  실행안 생성 이전 단계)는 카테고리 안에서 후보를 **이름 가나다순 + 템플릿·카테고리 해시 오프셋
  회전**으로만 고르고, `computePoiFit`(테마 적합도)은 전혀 참고하지 않는다. 실제 로컬/Production DB로
  확인한 결과, 경주 CULTURE_HISTORY 실행안의 실제 대표 유적(첨성대·대릉원·천마총·불국사·석굴암 등,
  전부 `lclsSystm1="HS"`로 공식 확인됨)은 애초에 `selectPois`의 초기 후보 풀에 들어가지 못했고, 대신
  가나다순 회전으로 걸린 "경주 굴불사지 석조사면불상"(비교적 덜 알려짐)·"강동 워터파크" 등이 선택돼
  이후 필터링 단계(`excludeBelowMinimumFitPois`)가 아무리 정교해도 "이미 잘못 뽑힌 후보 중에서만"
  거를 수 있었다. 구조 신호(`classifyStructuralPoiThemes`)를 `selectPois`의 후보 우선순위에도
  반영하면 근본적으로 해결될 가능성이 높지만, `selectPois`는 전략 3안 생성·실행안 구성 전체가 공유하는
  핵심 함수라 이번 조사 범위를 넘는 폭넓은 회귀 검증이 필요해 이번에는 적용하지 않았다.
- **동일 시설(입점 매장) 중복**: 청주시 흥덕구 "현대백화점 충청점" 안의 11개 매장(갤럭시·유니클로·
  코오롱스포츠 등)이 좌표(위경도 소수 10자리까지 완전 동일)까지 정확히 같은 SHOPPING POI로 각각
  등록돼 있어, 실행안에 "다른 매장"인 것처럼 여러 번 뽑힐 수 있다(전국 다른 백화점·아울렛에서도 같은
  패턴 확인 — 롯데아울렛 청주점 26개 매장 등). 좌표가 소수 10자리까지 완전히 같은 SHOPPING/일반 POI가
  같은 지역에 2개 이상이면 "같은 건물의 다른 매장"으로 보고 코스에는 최대 1~2곳만 남기는 규칙이
  안전하고 일반화 가능한 후보로 보이나, 이번 조사에서는 발견까지만 하고 구현은 하지 않았다.

두 항목 모두 특정 POI 이름을 블랙리스트로 제외하는 방식이 아니라, 이미 존재하는 공식 분류·좌표
신호를 재사용하는 일반화 가능한 규칙으로 후속 세션에서 다뤄야 한다.

## 2026-08-15 갱신 — 전략 테마 기반 POI 후보 우선순위 개선(selectPois 랭킹 고도화)

**배경**: 위(2026-08-14) 조사에서 확인한 근본 원인 — `strategy.ts`의 `selectPois`(전략별 POI 후보를
처음 뽑는 단계, 실행안 생성보다 앞선 analysis 시점)가 카테고리 안에서 후보를 **이름 가나다순 + 템플릿
·카테고리 해시 오프셋 회전**으로만 골라, `computePoiFit`/구조적 테마 분류를 전혀 참고하지 않는 문제를
이번에 고쳤다. 실제 DB로 확인한 결과 경주의 대표 유적(첨성대·대릉원·천마총 등, 전부 `lclsSystm1="HS"`)
은 이 랭킹 문제 때문에 애초에 후보 풀에 못 들어가고 있었다 — 뒤 단계(`excludeBelowMinimumFitPois`)는
이미 뽑힌 후보만 거를 수 있어 이 문제를 되돌릴 수 없었다.

**1) 전략 자체의 테마 조사**: 새 데이터를 추가하지 않고 이미 있던 `THEME_TEMPLATE_BONUS`(전략 점수
가산표, `audienceContext.ts`)를 역방향으로 도출해 "전략이 정체성으로 갖는 테마"를 확인했다 — 어떤
ThemeCategory가 그 templateId에 주는 가산점이 최댓값이면서 10점 이상이면 핵심 테마로 인정한다(12/10점
은 정체성 값, 3~6점은 부차적 가산일 뿐이라는 기존 데이터 분포에 근거). 결과: LOCAL_FOOD_MARKET→FOOD,
NATURE_WELLNESS→NATURE+WELLNESS, CULTURE_HISTORY→CULTURE_HISTORY, FESTIVAL_EVENT→FESTIVAL. 나머지
3개 템플릿(NIGHT_STAY_EXTENSION/FAMILY_EXPERIENCE/YOUTH_LOCAL_CONTENT)은 데이터상 핵심 테마가
뚜렷하지 않아 억지로 지어내지 않고 빈 배열로 둔다(`templateCoreThemeCategories`, audienceContext.ts).
사용자가 `preferredThemes`를 입력하지 않아도(Production 실제 사례) 이 값이 자동으로 후보 랭킹에
반영된다 — `preferredThemeCategories`(사용자 입력)와 `templateCoreThemeCategories`(전략 정체성)를
합집합해 "랭킹에 쓸 관련 테마 집합"으로 쓴다.

**2) 적용한 우선순위 구조**: `selectPois`의 카테고리 내부 후보 선택(`pickNext`/`pickNextByRotation`)이
이제 "관련성 tier(0=구조 신호 일치 > 1=이름 키워드 일치 > 2=확인 불가/불일치) → 거리(공간적 응집,
기존 유지) → 이름 가나다순 회전(기존 tie-break)" 순으로 후보를 고른다 — "관련성 > deterministic
tie-break" 원칙 그대로다. 구조 신호는 `classifyStructuralPoiThemes`(poiFit.ts와 동일 함수 재사용, 새
판정 로직 없음)를 그대로 쓰고, 없을 때만 이름 키워드로 fallback한다. 구조 신호가 다른 테마를 가리키는
경우(예: "강동 워터파크"=VE02)는 tier 0을 받지 못할 뿐 별도로 더 낮은 tier로 떨어뜨리지 않는다(최소
구조). `PoiLike`에 `lclsSystm1/2`(옵션)를 추가하고 `fetchPoisByCategory.ts`가 rawPayload에서 채워
넣는다 — DB 재조회·외부 API 호출 없이 이미 로드된 필드만 쓴다. `computeStrategies`의 점수 계산
(demandFit/supplyFit/targetFit/seasonFit/roleFit/feasibilityFit)은 selectPois보다 먼저·독립적으로
계산되므로 이번 변경의 영향을 받지 않는다(코드로 확인, 아래 검증 참고).

**3) 검증**: 신규 유닛 테스트 5개(가나다순 최하위인데 구조 신호가 있는 후보가 우선 선택되는지,
`preferredThemes=[]`여도 전략 정체성 테마가 반영되는지, 구조 신호가 다른 테마를 가리키는 후보가
우선되지 않는지, 구조>키워드>없음 3단계 순서, 구조 신호를 넘기지 않는 기존 호출부의 하위 호환)를
"수정 전에는 실패, 수정 후에는 통과"로 직접 확인했다. 전국 30개 지역 A/B에서 후보 0개·FOOD/LODGING
완전 누락 건수는 수정 전후 완전히 동일(회귀 없음, 후보 집합 크기 자체는 바뀌지 않고 순서만 바뀜을
확인). CULTURE_HISTORY 전략의 ATTRACTION 후보 중 구조 신호(HS/VE07) 매치가 1개 이상 포함된 지역이
8/30(27%) → 26/30(87%)으로, 선택된 ATTRACTION 중 "매치 없음"이 17건 → 0건으로 개선됐다. 로컬에서
실제 신규 분석(경주 문화·역사, 청주 흥덕구 자연·웰니스〈선호 테마 미입력〉, 강릉, 제천)을 재실행한
결과, 경주는 대표 유적은 아니어도(전체 목표 대비 ATTRACTION 배정 자리 자체가 1곳뿐이라 첨성대까지는
못 들어갔다) `lclsSystm1="HS02"`(역사유물)로 확인되는 진짜 사적("경주 굴불사지 석조사면불상")이
선택됐고, 청주는 기존 "SK하이닉스 문화센터" 대신 `lclsSystm1="NA"`(자연공원)로 확인되는 "문암생태공원"
이 선택됐다. 강릉·제천은 ATTRACTION/FOOD/EXPERIENCE/LODGING 구성이 그대로 유지됐다(회귀 없음). 375px
모바일에서 가로 스크롤 없음을 확인했다. 전체 유닛 테스트 1445개, `npx tsc --noEmit`, lint, build 모두
통과했다.

**아직 남은 한계(투명하게 공개)**: (a) 한 카테고리에 배정되는 총 개수 자체(목표 개수·티어 배분)는 이번
에 바꾸지 않았다 — 경주 사례처럼 ATTRACTION 배정 자리가 원래도 적으면(식사 선점·다른 카테고리와의
라운드로빈 배분 때문에) 구조 신호가 있어도 대표 관광지 전부가 들어가지는 못한다. (b) 동일 건물 입점
매장 중복(현대백화점 등)은 이번 범위가 아니라 그대로다. (c) `poiFitService.ts`의 "지역 후보 부족 안내"
재계산 경로는 여전히 구조 신호를 쓰지 않는다(2026-08-14 항목과 동일한 이유로 이번에도 손대지 않음).

## 2026-08-16 갱신 — 전략 핵심 테마 중심 코스 구성 강화(core-theme floor) + 제품 로드맵 문서화

**배경**: 바로 위(2026-08-15) 개선으로 후보 랭킹의 "순서"는 관련성 우선으로 바뀌었지만, 카테고리별
**총 배정 개수**(목표 개수·라운드로빈 배분)는 그대로였다. 그 결과 경주 CULTURE_HISTORY(`ONE_NIGHT_
TWO_DAYS`)에서 비숙박 목표 7개 중 `mealReserveTarget`(4개)가 먼저 FOOD를 선점하고, 남은 3자리를
ATTRACTION/EXPERIENCE/FOOD 3개 core 카테고리가 라운드로빈으로 1개씩 나눠 가져 **ATTRACTION이 정확히
1개로 고정**되는 근본 원인을 이번에 코드로 재현·확인했다(`selectPois`, `strategy.ts`).

**1) 전략 template의 구조화된 테마 의미 조사**: 2026-08-15에 이미 도입한 `templateCoreThemeCategories()`
(THEME_TEMPLATE_BONUS 역산, CULTURE_HISTORY→CULTURE_HISTORY / NATURE_WELLNESS→NATURE+WELLNESS /
LOCAL_FOOD_MARKET→FOOD / FESTIVAL_EVENT→FESTIVAL, 나머지 3개 템플릿은 빈 배열)를 그대로 재사용했다 —
새 판정표를 만들지 않았다. `preferredThemes`(사용자 입력)와 전략 기본 테마(`templateCoreThemeCategories`)
의 책임은 기존과 동일하게 분리돼 있다: floor는 오직 **전략 자체의 핵심 테마**만 기준으로 삼고(사용자가
선호 테마를 입력하지 않아도 적용됨), 핵심 테마가 없는 템플릿(NIGHT_STAY_EXTENSION/FAMILY_EXPERIENCE/
YOUTH_LOCAL_CONTENT)에는 floor를 전혀 적용하지 않는다.

**2) 전국 30개 지역 공급량 조사**: 핵심 테마가 있는 4개 템플릿에 대해 전략의 "carrier 카테고리"
(`themePreferredPoiCategories(templateCoreThemeCategories(templateId))` ∩ 템플릿 core 카테고리 — 예:
CULTURE_HISTORY→ATTRACTION, NATURE_WELLNESS→ATTRACTION+EXPERIENCE)에서 구조 신호 또는 키워드로
관련성이 확인되는 후보 수 분포를 조사했다. CULTURE_HISTORY/NATURE_WELLNESS/LOCAL_FOOD_MARKET은
29~30/30 지역에서 관련 후보 3개 이상 확보 가능했고, FESTIVAL_EVENT는 축제 데이터 특성상 공급이 고르지
않아(3/30 지역이 관련 후보 0개) 낮은 지역은 floor를 못 채우고 그대로 부족한 채 남는다(강제 채우기 없음,
아래 정책 참고).

**3) 채택한 정책**: 후보 A(전체 최소 개수) 방식을 채택했다 — `CORE_THEME_FLOOR_SHARE = 0.3`(30%),
비숙박 목표 개수의 30%를 core-theme carrier 카테고리에 우선 배정한 뒤, 기존 라운드로빈이 나머지를
그대로 채운다(`strategy.ts`의 `selectPois`, 기존 mealReserve 블록 바로 다음, 기존 priorityTiers
라운드로빈 이전에 삽입). 후보 B(날짜별 최소 1개)는 날짜별 분리 배치 자체가 `planBuilder.ts`(이번 범위
밖) 책임이라 이번에는 채택하지 않았다. floor는 `themeRelevanceTier(candidate, templateCoreThemes) < 2`
(구조 신호 우선, 키워드 fallback)로 확인되는 후보만 채택하고, 그런 후보가 더 없으면(공급 부족) 억지로
채우지 않고 그대로 둔다 — 코스 생성 실패나 부정확한 장소로 채우는 일이 없다. FOOD/LODGING 확보 로직
(`mealReserveTarget`/`LODGING_POI_TARGET_BY_DURATION`)과 `CORE_MINIMUM_RESERVE`(poiFit.ts, 별도
메커니즘)는 전혀 건드리지 않았다.

**4) 검증**: 신규 유닛 테스트 6개(floor 적용 시 관련 후보 3개 이상 확보/공급 부족 시 강제로 채우지
않고 있는 만큼만 확보/핵심 테마 없는 전략은 기존과 동일하게 동작/FOOD·LODGING 개수 불변/deterministic/
전략 점수 불변)를 "수정 전 실패, 수정 후 통과"로 확인했다(`tests/unit/strategy.test.ts`). 실제 DB로
경주 CULTURE_HISTORY(`ONE_NIGHT_TWO_DAYS`) 재현 결과 ATTRACTION 1개→3개로, 청주 흥덕구
NATURE_WELLNESS(`preferredThemes=[]`)는 ATTRACTION 2개→3개로 늘었다. 전국 30개 지역 A/B(핵심 테마
템플릿 4종 × preferredThemes 4개 조합 = 154개 전략)에서 poiIds 총합(2832건)·후보 0개 전략(0건)·FOOD/
LODGING 완전 누락 건수(0/48건)는 수정 전후 완전히 동일(회귀 없음 — 집합 크기 자체는 그대로), core-theme
carrier 카테고리에 관련성 확인 POI가 1개 이상 포함된 비율은 149/154(96.8%)→154/154(100%)로 개선됐다.
경주·청주 재현에서 30/60/90분 이상 이동 구간 발생 건수는 수정 전후 모두 0건(악화 없음). 강릉·제천
재분석에서 ATTRACTION/FOOD/EXPERIENCE/LODGING 구성이 그대로 유지됐다(회귀 없음). 전체 유닛 테스트
1451개, `npx tsc --noEmit`, lint, build 모두 통과했고, 375px 모바일에서 실제 경주·청주 실행안 화면을
확인했다(가로 스크롤 없음, ATTRACTION 항목에 "적합도 높음(+테마 미입력)" 배지와 "전략 핵심 카테고리·
구조 분류 일치" 근거 문구가 정상 노출됨).

**5) 제품 로드맵 문서화**: `README.md`의 "다음 과제(로드맵)" 절 상단에 "TOUR-DNA 중장기 제품 로드맵
(2026-08-16 합의)" 절을 신설해, 코스 스튜디오·Drag & Drop·지도 실시간 갱신·실시간 품질검증·콘텐츠
테마 8종(문화예술/K-콘텐츠/야간관광 등 신규 후보 포함)·여행 조건 분리·축제 Anchor Event화·지역 문제
해결형 UX·동일시설 dedup·관광 가치 랭킹·POI 체류시간 고도화 18개 항목과 Phase A~E 우선순위를
완료/부분 구현/데이터 조사 필요/장기 후보로 구분해 기록했다 — 이미 구현된 기능과 아이디어 단계를
섞어 "전부 구현됨"처럼 보이지 않도록 각 항목의 실제 저장소 기준 상태를 명시했다.

**아직 남은 한계(투명하게 공개)**: (a) 이번 floor는 카테고리별 **총 배정 개수 안에서의 우선순위**만
조정했을 뿐, `NON_LODGING_POI_TARGET_BY_DURATION`(기간별 목표 총 개수) 자체는 바꾸지 않았다 — 경주
ONE_NIGHT_TWO_DAYS처럼 원래 목표가 빠듯한 조건에서는 floor를 적용해도 ATTRACTION이 3개(30%)에서 더
늘어나지 않는다(대표 유적 전부를 담으려면 목표 개수 자체를 늘리는 별도 검토가 필요, 이번 범위 밖).
(b) 동일 건물 입점매장 중복(현대백화점 등)은 이번에도 손대지 않았다 — 청주 재현 화면에서도 SHOPPING
카테고리에 "갤럭시 현대백화점 충청점"/"갤럭시라이프스타일 현대백화점 충청점"/"골든듀 현대백화점
충청점" 3건이 그대로 남아 있음을 실제로 확인했다. (c) `selectPois`가 기존에 이미 갖고 있던 관광 가치·
대표성 신호 부재 문제(첨성대·대릉원처럼 이름만으로는 대표성이 확인되지 않는 문제)는 이번 floor로
완화되지 않았다 — 여전히 구조 분류·키워드로 확인되는 "관련성"만 반영하며 "대표성/인기도"는 별도
신뢰 가능한 데이터가 확보돼야 다룰 수 있다(위 로드맵 17번 항목).

## 2026-08-16 갱신(2) — 동일 시설/입점매장 중복 추천 억제

**배경**: 바로 위(2026-08-16(1)) 한계 (b)에서 남겨둔 문제를 이번에 실제로 해결했다. 청주시 흥덕구
현대백화점 충청점 내부의 "갤럭시 현대백화점 충청점"/"갤럭시라이프스타일 현대백화점 충청점"/"골든듀
현대백화점 충청점" 3개 매장이 같은 실행안에 각각 별도 SHOPPING 관광지처럼 반복 추천되는 문제를 실제
DB 재현으로 확인했다. 조사 결과 이 문제는 **두 곳**에서 동시에 발생했다 — ① `strategy.ts`의
`selectPois`(전략 계산 시점, 카테고리별 후보 선정), ② `planService.ts`의 `ensureSelectedPlan`이
비숙박 목표 밀도(11곳, `NON_LODGING_POI_TARGET_BY_DURATION[duration] + mealReserveTarget`)를 못
채웠을 때 `poiDetails.ts`의 `fetchAdditionalGeneralPois()`로 지역 DB에서 직접 보충하는 경로. 실제
운영에서 관찰된 4건의 SHOPPING(가경 터미널시장 + 백화점 입점매장 3개)은 실행안 목표(11곳)가 전략의
초기 poiIds(7~8개)보다 커서 이 두 번째 보충 경로가 추가로 끌어온 것이었다 — selectPois만 고쳤다면
이 실제 버그는 재현되지 않았을 것이다.

**1) 전국 동일좌표 데이터 조사**: 로컬 DB 전체 POI 48,291건에서 `regionId+lat+lng` 완전 동일 그룹을
조사한 결과, 동일좌표 그룹 1,154개(POI 8,132건)를 확인했다. 카테고리별 그룹 크기가 뚜렷이 갈렸다 —
SHOPPING만 그룹 수 538개·최대 크기 205·평균 12.3·10개 이상 그룹 120개인 반면, ATTRACTION/FOOD/
EXPERIENCE/FESTIVAL/LODGING은 전부 최대 9 이하·평균 2.1~2.3였다. SHOPPING 샘플(부산 롯데백화점
광복점 27개 매장, 부산 롯데백화점 부산본점 61개 매장 등)은 명백히 "한 건물의 여러 입점매장"이었다.

**2) 동일좌표지만 서로 다른 콘텐츠인 사례 확인**: 혼합 category 그룹 267개를 확인했고, 단일 category
안에서도 ATTRACTION("부아산 구름다리"/"부아산전망대" — 같은 언덕의 다른 지형지물), FESTIVAL("영동난계
국악축제"/"영동포도축제" — 같은 장소의 다른 시기 축제), LODGING("델피노 소노캄"/"소노펠리체 델피노" —
같은 리조트의 다른 동) 등 실제로 서로 다른 방문 가치가 있는 사례가 다수 확인됐다 — "동일 좌표=무조건
dedup" 정책을 채택하지 않은 근거다.

**3) 채택한 dedup 기준**: **후보 A**(SHOPPING 카테고리 + 완전 동일 좌표만) 채택. 위 데이터 분포 근거로
SHOPPING만 이 문제가 뚜렷했고, 다른 카테고리는 다양한 콘텐츠가 우연히 좌표를 공유하는 경우가 많아
일괄 처리 시 오탐 위험이 컸다. 근접좌표(반경) 확장은 이번 범위에 포함하지 않았다 — 완전 동일 좌표만
으로 청주 문제가 실제로 해결됨을 확인했기 때문이다(아래 5번).

**4) dedup 적용 위치**: 특정 화면에 로직을 두지 않고 `src/lib/domain/poiDedup.ts`에 재사용 가능한
순수 함수 `dedupeBySameCoordinates(candidates, pickRepresentative)`를 만들어 세 지점에 배선했다 —
① `strategy.ts`의 `selectPois`(카테고리 티어 루프 진입 전, SHOPPING 풀만 대표 1건으로 좁힘 — 대표
선택은 이 전략의 관련성 tier가 우선이고 동률이면 기존 이름 가나다순), ② `poiDetails.ts`의
`fetchAdditionalGeneralPois()`(보충 배치 자체 내 중복 제거 + 이미 선택된 SHOPPING 좌표와도 겹치지
않게, 넉넉히 가져온 뒤 limit만큼만 반환), ③ `planService.ts`의 `ensureSelectedPlan`(위 두 경로
이전에 계산·저장된 stale StrategyResult를 실행안으로 만들 때를 위한 마지막 방어 필터). DB 원본 POI는
전혀 수정하지 않고, 세 지점 모두 "추천 후보 배열만 좁히는" 순수 필터다. 검색으로 사용자가 같은 시설의
다른 매장을 수동으로 추가하는 경로(`searchPoisInRegion`)는 건드리지 않았다.

**5) 청주 before/after(실제 SelectedPlan.course 기준)**: before 전체 10건 중 SHOPPING 4건(가경
터미널시장 + 현대백화점 충청점 입점매장 3개, 동일좌표 중복 그룹 1개) → after 전체 10건 중 SHOPPING
3건(가경 터미널시장 + 현대백화점 대표 1개 + 롯데아울렛 청주점 — 서로 다른 3개 독립 시설, 동일좌표
중복 그룹 0개). ATTRACTION/FOOD/LODGING 구성과 전체 항목 수(10건)는 그대로 유지됐다(빈 자리는 다른
독립 SHOPPING 후보로 자연스럽게 채워짐 — 나이키 유나이트 롯데아울렛 청주점).

**6) 경주/강릉/제천 회귀**: 세 지역 모두 core-theme floor(2026-08-16(1)) 적용 결과(경주 ATTRACTION
3개, 강릉·제천 ATTRACTION/FOOD/EXPERIENCE/LODGING 구성)가 그대로 유지됐고, 이 지역들에는 애초에
SHOPPING 동일좌표 중복 공급이 없어 이번 변경의 영향 자체가 없었다.

**7) 전국 A/B**: (a) `computeStrategies` 기준 30개 지역 × 4개 preferredThemes(120개 조합, 360개
전략)에서 poiIds 총합(2832건)·후보 0개(0건)·FOOD 누락(0건)·LODGING 누락(48건)이 수정 전후 완전히
동일(회귀 없음). (b) 실제 버그가 발생하는 `fetchAdditionalGeneralPois` 경로를 30개 지역에 대해 직접
호출해 비교한 결과, SHOPPING 동일좌표 중복 공급이 있는 14개 지역 중 before 8개 지역(청주 흥덕구 포함,
부산 6개 구, 부여군)에서 중복이 실제로 남아있었으나 after는 0개 지역으로 전부 해소됐다 — 총 반환 POI
수(154건)는 동일해 회귀 없음도 함께 확인했다.

**8) 동선 영향**: 경주·청주 재현에서 30/60/90분 이상 이동 구간 발생 건수는 수정 전후 모두 0건(악화
없음).

**9) strategy score/core-theme floor/deterministic 검증**: 신규 유닛 테스트(전략 계층 8개 + 서비스
계층 3개 + 순수 헬퍼 5개, 총 16개)로 SHOPPING dedup·다른 category 보존·독립 후보 대체·단일 그룹
회귀 없음·구조 관련성 우선 대표 선택·deterministic·strategy score 불변·core-theme floor 비회귀를
확인했다. 이 중 핵심 차별 테스트(ATTRACTION/SHOPPING dedup 효과, stale StrategyResult 재현)를
"수정 전 실패, 수정 후 통과"로 직접 검증했다.

**10) tests/typecheck/lint/build**: 전체 유닛 테스트 1469개, `npx tsc --noEmit`, lint, build 모두
통과했다. 375px 모바일에서 실제 청주 실행안 화면(가경 터미널시장·현대백화점 대표 1개·롯데아울렛
청주점 3개 독립 SHOPPING만 노출, 가로 스크롤 없음)을 확인했다.

**아직 남은 위험(투명하게 공개)**: (a) 근접하지만 좌표가 완전히 같지 않은 동일 시설(예: 소수점 자리
반올림 차이, 건물 여러 출입구 좌표)은 이번 범위 밖 — 완전 동일 좌표만 대상이다. (b) 관광 가치/대표성
ranking은 여전히 없다(로드맵 17번). (c) `poiFitService.ts`의 "지역 후보 부족 안내" 재계산 경로는
이번 dedup을 반영하지 않아, 부족 안내 문구의 제외 건수 계산이 실제 추천 결과와 미세하게 어긋날 수
있다. (d) 코스 스튜디오 후보 풀(로드맵 5번)·Drag & Drop/실시간 지도(로드맵 7~8번)는 이번에도 손대지
않았다 — 다만 `poiDedup.ts`를 재사용 가능한 순수 함수로 분리해 그 UI가 나올 때도 같은 로직을 그대로
쓸 수 있게 준비해뒀다.

## 2026-08-16 갱신(3) — POI 후보 부족 안내 판정 정합성 개선

**배경**: 바로 위(2026-08-16(2)) 한계 (c)에서 남겨둔 문제를 이번에 해결했다. `poiFitService.ts`의
`buildStrategyPoiFitSummary()`가 "지역 후보 부족" 안내를 만들 때 지역 전체 후보를 다시 평가하는
부분(`regionCandidates` 순회, filteredOutCount 계산)이 실제 추천 파이프라인(selectPois/
ensureSelectedPlan)과 서로 다른 기준으로 계산되고 있었다.

**1) 실제 불일치 재현**: 로컬 DB로 직접 재현한 결과, 경주 CULTURE_HISTORY에서 UI가 실제로 보여주는
문구("전략 적합 기준에 미달한 장소 300곳을 추천에서 제외했습니다")의 300이라는 숫자가 구조 신호를
전혀 반영하지 못한 값임을 확인했다. 같은 후보 집합에 구조 신호(`lclsSystm1/2`)만 반영해 다시
계산하면 176(대략 첨성대·대릉원류 124건 차이)으로, 여기에 SHOPPING dedup까지 반영하면 174로
줄어든다. 강릉 CULTURE_HISTORY도 288→253으로, 제천 NATURE_WELLNESS도 181→179로 확인됐다. 청주
NATURE_WELLNESS는 이 시나리오에서 filteredOutCount 자체가 0이라 변화가 없었다(구조 신호 문제가
드러나지 않는 케이스였을 뿐, 코드 결함 자체는 동일하게 존재했다).

**2) 정확한 원인**: 코드를 직접 대조한 결과 두 가지가 확인됐다 — ① `fetchPoisByCategory()`가 이미
채워주는 `lclsSystm1/lclsSystm2`(TourAPI 공식 구조 분류, `strategy.ts`의 selectPois와 실제 추천이
이미 쓰고 있는 신호)를 이 재계산의 `computePoiFit()` 호출에는 전혀 넘기지 않아, 이름 키워드로만
판정했다(구조 신호 우선 원칙이 이 경로에서만 깨져 있었다). ② `4f093ec`(동일 시설 SHOPPING dedup)를
이 재계산에는 반영하지 않아, 백화점 입점매장 중복이 "적합 기준 미달로 제외"나 "추천 가능" 어느 한쪽에
그대로 섞여 카운트됐다(중복 억제와 적합도 판정은 서로 다른 개념인데 뒤섞여 있었다). `sourceType`을
항상 `"FIXTURE"`로 고정해 넘기는 부분도 확인했으나, `computePoiFit()`에서 `sourceType`은 provenance
표시(`LIVE_API`/`CURATED`)에만 쓰이고 `recommendationStatus` 판정 자체에는 영향을 주지 않아(코드로
확인) 숫자 불일치의 원인은 아니었다 — 그대로 두었다.

**3) 적용한 정합성 개선 방식**: 새 적합도 로직을 만들지 않고 기존 `computePoiFit()`을 그대로 재사용
하면서, region candidate에도 `candidate.lclsSystm1`/`candidate.lclsSystm2`(이미 `fetchPoisByCategory`가
로드해 둔 값)를 함께 전달하도록 한 줄만 고쳤다. 그리고 `regionCandidates`를 만들 때 SHOPPING
카테고리에만 `dedupeBySameCoordinates()`(`poiDedup.ts`, `4f093ec`에서 이미 만든 순수 함수 그대로
재사용)를 적용해 동일 시설 그룹을 대표 1건으로 좁힌 뒤 평가한다. 외부 API 호출이나 추가 DB 쿼리는
전혀 없다 — 이미 로드된 필드만 재사용한다.

**4) dedup과 fit 제외 구분**: `dedupeBySameCoordinates()`로 미리 좁혀진 뒤에 `computePoiFit()`을
적용하므로, "동일 시설이라 대표만 남기고 나머지는 애초에 후보에서 제외"와 "적합 기준 미달로
BELOW_MINIMUM_FIT 판정"은 서로 다른 단계에서 분리되어 처리된다 — 중복 제거로 사라진 매장은
`filteredOutCount`에도 `recommendableRegionCount`에도 집계되지 않는다(둘 다에서 완전히 제외).
새로운 통계 패널이나 UI 문구는 추가하지 않았다 — 기존 "전략 적합 기준에 미달한 장소 N곳을
추천에서 제외했습니다" 문구의 N이 정확해진 것뿐이다.

**5) 경주 before/after**: filteredOutCount 300 → 174. 실제 실행안 화면에서 "목표(11곳)보다 5곳
적게 구성되었습니다. 전략 적합 기준에 미달한 장소 174곳을 추천에서 제외했습니다."로 노출됨을
브라우저로 직접 확인했다. StrategyResult.poiIds/totalScore/SelectedPlan.course는 재조회로
완전히 동일함을 확인했다(변경 없음).

**6) 청주/강릉/제천**: 청주는 filteredOutCount 0으로 변화 없음(이 조건에서는 애초에 제외되는
후보가 없었다), 강릉 288→253, 제천 181→179로 개선됐다. 세 지역 모두 StrategyResult/SelectedPlan은
재조회로 완전히 동일함을 확인했다(회귀 없음).

**7) 검증**: 신규 유닛 테스트 5개(구조 신호 반영/SHOPPING dedup 반영/preferredThemes 빈 배열/
키워드 fallback 회귀/deterministic)를 `poiFitService.test.ts`에 추가했다. 핵심 차별 테스트(구조
신호 미반영 시 오제외되던 사례)는 "수정 전 실패(3 vs 기대값 1), 수정 후 통과"로 직접 확인했다.
전체 유닛 테스트 1474개, `npx tsc --noEmit`, lint, build 모두 통과했다. UI 문구 형식 자체는 바뀌지
않아(숫자만 정확해짐) 375px 확인은 필수는 아니었지만, 실제 경주 QA 프로젝트로 개선된 숫자(174)가
실제 화면에 정상 노출됨을 375px에서도 확인했다.

**아직 남은 위험(투명하게 공개)**: (a) 근접하지만 좌표가 완전히 같지 않은 동일 시설은 이번에도
dedup 대상 밖이라, 이 재계산에서도 여전히 별도 후보로 집계된다(2026-08-16(2)의 한계와 동일). (b)
`sourceType`을 여전히 `"FIXTURE"`로 고정해 넘긴다 — `recommendationStatus`에는 영향이 없어 숫자
정합성 문제는 아니지만, 이 재계산에서 만든 `PoiFitResult`의 `dataSource.provenance`/`sourceLabel`
자체는 여전히 부정확하다(단, 이 값은 shortage 요약에서 사용하지 않는다). (c) 관광 가치/대표성
ranking은 여전히 없다(로드맵 17번). (d) 코스 스튜디오 후보 풀·Drag & Drop/실시간 지도는 이번에도
손대지 않았다.

## 2026-08-16 갱신(4) — 실행안 추천 POI 후보 풀(Phase B 첫 단계)

**배경**: 위(2026-08-16(3))에서 남긴 "코스 스튜디오 후보 풀은 이번에도 손대지 않았다"는 한계를 이번에
실제로 해소했다. README 제품 로드맵의 "자동 초안 + 전문가 편집"이라는 Phase B 방향의 첫 실제 UI다 —
자동 생성된 실행안을 대체하지 않고, 그 옆에 대체 가능한 POI 후보를 보여줘 사용자가 골라 추가할 수
있게 한다.

**1) 기존 장소 추가 기능 재사용 조사**: 실행안의 "+ 장소 추가"는 `searchAvailablePoisAction`(이름
검색, `poiDetails.ts`의 `searchPoisInRegion`)으로 후보를 찾고, `PlanEditor.tsx`의 `addPoiToDay`가
클라이언트 state(`days`)에 항목을 추가한 뒤 폼 제출(`savePlanAction`)로 한 번에 저장하는 구조였다 —
장소 추가 전용 서버 mutation은 원래 없었다. 후보 풀도 이 구조를 그대로 따른다 — 새 저장 API를 만들지
않고, `addPoiToDay`의 파라미터 타입만 필요한 최소 필드(`Pick<PoiDetail, "id"|"name"|"category"|
"lat"|"lng">`)로 넓혀 후보 카드에서도 같은 함수를 그대로 호출한다.

**2) 후보 선정 신호**: `src/lib/services/candidatePoolService.ts`(신규)의 `buildRecommendedPoiCandidates()`
가 새 알고리즘 없이 기존 함수만 조합한다 — `fetchPoisByCategory`(지역 POI 1회 조회), `dedupeBySameCoordinates`
(SHOPPING만 동일 시설 대표 1건), `computePoiFit`/`isExcludedFromRecommendation`(BELOW_MINIMUM_FIT
제외), `themeRelevanceTier`(구조 신호 우선 → 키워드 → 관련성 없음 — 이번에 strategy.ts에서 `export`
로 전환해 재사용). `rankingThemeCategories`는 `classifyThemes(preferredThemes)`와
`templateCoreThemeCategories(templateId)`의 합집합으로, selectPois와 완전히 같은 계산이라
`preferredThemes=[]`(청주 운영 사례)에서도 전략 핵심 테마 기반 추천이 그대로 동작한다.

**3) 후보 수/그룹 정책**: 전체 최대 12개, 카테고리별 최대 4개로 제한했다(별도 그룹 UI/탭은 만들지
않고, 카드에 카테고리 라벨과 기존 `POI_CATEGORY_TIER_LABEL_KO` 배지 스타일을 재사용해 최소한으로
구분). 정렬은 관련성 tier → 카테고리 tier(CORE>SUPPLEMENT>FALLBACK) → 이름 가나다순으로 완전히
결정론적이다.

**4) UI 구성**: `PlanEditor.tsx`의 "일자·시간대별 코스" 섹션 바로 아래 "추천 후보" 섹션을 추가했다.
카드에는 이름·카테고리·기존 `resolveFitBadge` 적합도 배지·`positiveReasons[0]`(추천 근거 한 줄)을
보여주고, 날짜 select(1일차/2일차/...)와 "이 날짜에 추가" 버튼이 있다. 현재 course에 있는 POI는
`existingPoiIds`(기존에 이미 있던 `useMemo`)로 클라이언트에서 필터링해 제외한다 — 서버 재조회 없이
추가/삭제 즉시 후보 풀에 반영된다(추가하면 사라지고, 삭제하면 다시 나타남). 빈 상태("현재 조건에서
추가로 추천할 수 있는 장소가 없습니다")와 오류 상태("추천 후보를 불러오지 못했습니다. 기존 일정은
그대로 편집·저장할 수 있습니다")를 명확히 구분해 보여준다.

**5) 데이터 흐름**: `page.tsx`가 기존 `poiFitSummary`와 같은 방식(`Promise.all` 병렬 조회 +
`.catch(() => null)`)으로 `buildRecommendedPoiCandidates()`를 한 번만 호출해 `candidatePois` prop으로
내려준다 — 실패해도 다른 조회(홍보자료·POI 적합도·유사지역 비교)에는 영향이 없고, 후보 풀만 오류
상태로 표시된다. 외부 API 추가 호출·N+1 쿼리 없음(지역 POI 조회 1회만 재사용).

**6) 경주/청주/강릉/제천 QA(실제 로컬 DB)**: 경주 CULTURE_HISTORY에서 감은사지·경덕왕릉·경애왕릉·
계림 등 실제 신라 유적지가 "적합도 높음"(구조 신호 일치)으로 상단에 노출되고 FOOD 후보는 뒤에
배치됨을 확인했다. 청주 NATURE_WELLNESS(`preferredThemes=[]`)는 뉴베라관광호텔·메리제인호텔(숙박)·
문암생태공원캠핑장(체험)·바른스포츠월드·백록서원(관광지) 등이 "적합도 높음(테마 미입력)"으로
우선됐고, 이미 코스에 있는 문암생태공원·청주 발산공원·현대백화점·롯데아울렛은 후보에서 정상 제외됐다.
강릉·제천은 회귀 없이 12개 후보(카테고리 다양)가 정상 노출됐다 — 제천은 큐레이션(FIXTURE) POI가
많은 지역인데도 구조 신호가 없을 때 이름 키워드 fallback(국립제천치유의숲·본초다담·제천킹스파찜질방
등)이 정상 동작함을 확인했다.

**7) 검증**: 신규 유닛 테스트 8개(`candidatePoolService.test.ts` — 현재 course 제외/structural
relevance 우선/preferredThemes 빈 배열/SHOPPING dedup/BELOW_MINIMUM_FIT 제외/좌표 없는 POI 제외/
빈 배열/deterministic)와 신규 컴포넌트 테스트 6개(`PlanEditor.test.tsx` — 후보 표시/현재 course 제외/
빈 상태/오류 상태/추가 후 즉시 제외/날짜 변경/삭제 후 재후보)를 추가했다. 핵심 차별 테스트를 "수정
전 실패(6개 모두), 수정 후 통과"로 직접 확인했다. 전체 유닛 테스트 1489개, `npx tsc --noEmit`, lint,
build 모두 통과했다. 375px 모바일에서 실제 경주 실행안 화면을 확인했다(가로 스크롤 없음,
`scrollWidth===clientWidth===375`).

**8) 변경 금지 범위 준수 확인**: DNA/Network/similarity/전략 점수/`CORE_THEME_FLOOR_SHARE`/dedup
기준/route algorithm은 전혀 건드리지 않았다 — `buildRecommendedPoiCandidates`는 읽기 전용 계산이고
StrategyResult/SelectedPlan.course를 변경하지 않는다(코드 경로상 이 함수를 호출하는 곳은 화면
표시뿐이다).

**아직 남은 위험(투명하게 공개)**: (a) Drag & Drop은 2026-08-16 갱신(5)에서 추가됐다(아래 참고) —
날짜 select + 버튼 클릭 방식도 그대로 남아있다. (b) 후보를 추가해도 저장 전에는 지도가 실시간으로
갱신되지 않는다(기존과 동일하게 저장 후에만 지도가 최신 course를 반영). (c) 실시간 코스 품질 검증
(추가 직후 "핵심 테마 POI 부족" 같은 경고)은 없다 — 저장된 실행안 기준의 "사업 사전검증 리포트"만
있다. (d) 후보 카드에 예상 이동 거리는 표시하지 않는다(이번 범위에서 저비용 근사조차 넣지 않음 —
필요성이 확인되면 후속 검토). (e) 카테고리별 최대 4개·전체 12개라는 상한은 이번 세션의 판단이며,
실제 사용자 피드백에 따라 조정될 수 있다.

## 2026-08-16 갱신(5) — 코스 Drag & Drop 편집(Phase B 두 번째 단계)

**배경**: 위(2026-08-16(4))에서 남긴 "Drag & Drop은 이번에도 없다"는 한계를 이번에 해소했다. 실행안
편집기에 같은 날짜 순서 변경·다른 날짜 이동·추천 후보→일정 Drag & Drop 3가지를 추가하되, 기존 위/
아래 이동 버튼·날짜 이동 select·검색/후보 추가 버튼은 전부 그대로 남긴다(모바일·키보드·스크린리더
fallback).

**1) 기존 편집 state/함수 조사**: `PlanEditor.tsx`는 클라이언트 `days` state(`useState<CourseDay[]>`)
하나를 유일한 source of truth로 쓰고 있었고, `moveItem`(인접 자리 swap)/`moveItemToDay`(항상 끝자리로
이동)/`addPoiToDay`(항상 끝자리에 추가)가 각각 `recomputeDayItems`(시간·이동 재계산)를 호출해
`setDays`로 반영하는 구조였다. Drag & Drop을 위해 새 편집 state를 만들 필요가 없었다 — 기존 함수를
"임의 위치"를 받을 수 있도록 일반화하기만 하면 됐다.

**2) 재정렬 로직 일반화**: `src/lib/domain/planBuilder.ts`에 순수 함수 3개를 추가했다 —
`reorderCourseItemWithinDay(days, dayIndex, fromIndex, toIndex, transport)`(같은 날짜 안 임의 위치
이동, 경계를 벗어나면 버튼과 동일하게 변경 없이 반환), `moveCourseItemToDay(days, fromDayIndex,
itemIndex, toDayIndex, toIndex, transport)`(다른 날짜의 임의 위치로 이동, 같은 날짜면
`reorderCourseItemWithinDay`로 위임), `insertPoiIntoDay(days, dayIndex, poi, index, transport)`(검색
결과/추천 후보를 임의 위치에 삽입). 세 함수 모두 내부적으로 기존 `recomputeDayItems`만 호출하므로,
버튼 조작(인접 자리 교환·끝자리 추가)과 Drag & Drop(임의 위치)이 최종적으로 완전히 같은 재계산
경로를 탄다. `PlanEditor.tsx`의 `moveItem`/`moveItemToDay`/`addPoiToDay`는 이 함수들을 호출하는
얇은 래퍼로 바뀌었을 뿐, 버튼에서 보이는 동작은 전혀 바뀌지 않았다(회귀 테스트로 확인).

**3) 라이브러리 선택**: `package.json`에 새 dependency가 없어 처음부터 검토했다. 네이티브 HTML5
Drag & Drop(`draggable` 속성)은 터치 디바이스를 전혀 지원하지 않아(모바일 375px가 필수 요구사항) 바로
제외했다. `@dnd-kit/core`+`@dnd-kit/sortable`+`@dnd-kit/utilities`(각 6.3.1/10.0.0/3.2.2)를 도입했다 —
포인터(마우스+터치 통합)·키보드 센서를 기본 제공하고, React state와 직접 통합되며(내부적으로 DOM을
직접 조작하지 않고 매 렌더마다 우리 state를 그대로 반영), bundle 영향이 상대적으로 작고(3개 패키지
합쳐 수십 KB대), 접근성(`role="button"`, `aria-roledescription`, 키보드 화살표 이동)을 라이브러리가
기본 제공해 직접 구현할 범위를 크게 줄여준다.

**4) Drag 결과 계산**: `PlanEditor.tsx`에 순수 함수 `computeDragOutcome(days, candidates, transport,
activeId, overId)`를 추가했다 — dnd-kit의 `DragEndEvent`가 넘겨주는 `active.id`/`over.id`(문자열
접두사로 "일정 항목"/"추천 후보"/"날짜 드롭 영역"을 구분: `schedule-item:`/`candidate:`/
`day-container:`)만으로 무엇을 어디에 놓았는지 해석해 위 2)의 함수 중 하나로 위임한다. dnd-kit
자체의 포인터 이동·충돌 감지는 라이브러리 책임으로 남기고, 우리 코드의 책임은 "이 id 조합이면 이런
결과"라는 순수 계산 하나로 좁혔다 — 그 덕에 실제 포인터/터치 이벤트를 흉내내지 않고도 이 함수 자체를
완전히 단위 테스트할 수 있었다. drop 대상을 해석할 수 없거나(`over===null`, 알 수 없는 id, 존재하지
않는 후보 id) 유효하지 않으면 `null`을 반환해 아무 것도 바꾸지 않는다(DnD 실패가 기존 편집을 막지
않는다).

**5) UI 구성**: 일정 항목 `<li>`와 추천 후보 `<li>` 맨 앞에 드래그 손잡이(`⋮⋮`) 버튼을 추가했다 —
`aria-label`은 각각 "{이름} 드래그로 순서·날짜 변경"/"{이름} 드래그로 일정에 놓기"다. 각 날짜는
`useDroppable`로 감싼 드롭 영역(`day-container:{dayIndex}`)이라 빈 공간에 놓아도 그 날짜 끝자리에
추가된다. 일정 항목은 `useSortable`(날짜별 `SortableContext`), 추천 후보는 `useDraggable`을 쓴다.
기존 시간/체류시간 입력, 적합도 배지, 위/아래/날짜 이동/삭제 버튼, 날짜 select+추가 버튼은 모두
그대로 남아 있다.

**6) 기존 버튼/모바일/접근성 fallback**: 컴포넌트 테스트로 위/아래 이동 버튼·날짜 이동 select·삭제
버튼·후보 날짜 select·추가 버튼이 드래그 손잡이 추가 후에도 여전히 존재함을 확인했다(회귀 없음).
`PointerSensor`(마우스+터치 통합, `activationConstraint: {distance: 8}`로 실수 클릭과 구분)와
`KeyboardSensor`(`sortableKeyboardCoordinates`)를 함께 등록해 터치·키보드 사용자도 드래그를 쓸 수
있게 했지만, 두 경우 모두 기존 버튼이 여전히 완전히 동등한 대체 수단으로 남아있다.

**7) 저장/새로고침 정합성**: Drag 결과도 다른 편집(버튼 조작)과 동일하게 클라이언트 `days` state만
바꾸고, 저장은 기존 `savePlanAction` 제출 시에만 일어난다 — Drag 전용 자동 저장/서버 호출은 없다.

**8) 검증**: `planBuilder.test.ts`에 재정렬 함수 순수 로직 테스트 10개(같은 날짜 임의 위치 이동/
인접 이동=버튼과 동일/경계 이탈 시 무변경/존재하지 않는 날짜로 이동 시 무변경·데이터 유실 방지/
다른 날짜 임의 위치 이동/후보 삽입/삽입 위치 초과 시 끝자리/deterministic)를 추가했다. 이 중
"존재하지 않는 날짜로 이동을 시도하면 변경 없이 그대로 반환한다" 테스트가 실제 버그를 잡았다 —
`moveCourseItemToDay`가 원래 대상 날짜(`toDayIndex`) 존재 여부를 검증하지 않아, 잘못된 날짜로
이동을 시도하면 원본 날짜에서만 항목이 삭제되고 어디에도 들어가지 않는 데이터 유실이 있었다(대상
날짜 존재 검증을 추가해 수정). `PlanEditor.test.tsx`에 `computeDragOutcome` 순수 함수 테스트 11개
(같은 날짜 재정렬/다른 날짜 이동/빈 날짜 드롭/후보 삽입/빈 날짜에 후보 추가/over===null 시 무변경/
알 수 없는 id 무변경/존재하지 않는 후보 id 무변경/deterministic)와 드래그 손잡이 존재 확인 테스트
2개를 추가했다. 신규 21개 테스트를 `git stash`로 구현 파일만 되돌려 전부 실패함을 확인한 뒤(fail-
before) 복원해 통과함을 확인했다(pass-after). 전체 유닛 테스트 1510개, `npx tsc --noEmit`, lint,
build 모두 통과했다.

**9) 브라우저 QA(제한적, 이후 2026-08-16 갱신(6)에서 실제 pointer 검증으로 보완됨)**: 로컬 DB에
경주 CULTURE_HISTORY·청주 NATURE_WELLNESS QA 프로젝트를 만들어 실제 서버 렌더링 결과를 확인했다 —
두 페이지 모두 일정 항목·추천 후보 카드에 드래그 손잡이(`⋮⋮`, 정확한 `aria-label`)가 실제로
렌더링되고, 후보 추천 데이터(경주: 감은사지·경덕왕릉 등 실제 문화유적, 청주: 뉴베라관광호텔 등
core-theme 후보)에 회귀가 없음을 `get_page_text`/DOM 질의로 확인했다. 375px에서
`document.documentElement.scrollWidth===clientWidth===375`(가로 스크롤 없음)를 확인했다. 이 세션에서는
Browser pane이 실제로 화면에 표시되지 않아(백그라운드 tab, `document.hidden===true`로 실제
레이아웃이 계산되지 않음) 실제 pointer drag 자체는 재현하지 못했다 — 이 한계는 아래
"2026-08-16 갱신(6)"에서 Playwright(실제 Chromium)로 완전히 해소됐다.

**10) 변경 금지 범위 준수 확인**: DNA/Network/similarity/전략 점수/전략 선택/후보 랭킹·개수/POI fit/
dedup 정책/route algorithm/저장 전 지도 갱신/실시간 품질검증은 전혀 건드리지 않았다 — 이번 변경은
전부 클라이언트 편집 state를 다루는 `planBuilder.ts`/`PlanEditor.tsx`에 한정된다.

**아직 남은 위험(투명하게 공개)**: (a) 저장 전 지도 실시간 갱신은 아직 없다. (b) 실시간 코스 품질
검증(추가/이동 직후 "핵심 테마 POI 부족" 경고 등)은 아직 없다. (c) 실제 마우스/터치 드래그의 시각적
동작은 2026-08-16 갱신(6)에서 Playwright 실제 pointer 이벤트로 재현·확인됐다(마우스 drag 검증
완료, touch drag 자체는 CDP synthetic touch 신뢰도 문제로 미검증 — 아래 절 참고). (d) 후보 카드에
예상 이동거리는 여전히 표시하지 않는다.

## 2026-08-16 갱신(6) — 코스 Drag & Drop 실제 pointer 상호작용 검증

**배경**: 위(2026-08-16(5))에서 Browser pane이 표시되지 않아 실제 마우스 drag를 재현하지 못했다는
한계를 이번에 해소했다. 이번 세션의 목표는 새 기능 구현이 아니라 실제 브라우저 interaction 수준의
검증이었다 — 코드를 먼저 고치지 않고, 저장소에 이미 있는 실제 도구(Playwright, `@playwright/test`,
`e2e/core-flow.spec.ts`)부터 조사해 활용했다.

**1) 검증 방법**: `computeDragOutcome()` 같은 순수 함수 직접 호출이나 React handler 직접 실행이
아니라, Playwright로 실제 Chromium을 띄우고 `page.mouse.down()`→`move()`(단계별)→`up()`으로 진짜
포인터 이벤트를 dnd-kit의 `PointerSensor`에 전달했다 — sensor→collision detection(`closestCenter`)→
`active`/`over`→`onDragEnd`→`computeDragOutcome`→`setDays`까지 이어지는 전체 경로를 통과시켰다.
로컬 전용 QA 프로젝트(경주 CULTURE_HISTORY·청주 NATURE_WELLNESS)를 스크립트로 미리 만들어 프로젝트
id를 환경변수로 전달하는 방식을 썼다(Production Neon 무관). 신규 파일: `e2e/plan-drag-drop.spec.ts`.

**2) 같은 날짜 pointer Drag**: 실제 mouse down→move→up으로 1일차 3번째 항목을 1번째 항목 위로
드래그하면 DOM 순서가 실제로 바뀜(개수는 그대로)을 확인했다.

**3) 날짜 간 pointer Drag**: 1일차 항목을 2일차 항목 위로 드래그하면 1일차에서 사라지고 2일차에
나타나며, 전체 POI 수가 그대로 유지됨을 확인했다.

**4) 추천 후보 → 일정 pointer Drag**: 추천 후보 카드를 1일차 항목 위로 드래그하면 일정에 추가되고
(시간 입력이 실제로 나타남), 같은 이름의 후보 카드는 후보 풀에서 즉시 사라짐을 확인했다.

**5) KeyboardSensor 검증**: 드래그 손잡이에 포커스 후 `Space`(활성화)→`ArrowDown`(이동)→`Space`(드롭)
로 실제 순서가 바뀜을 확인했다. 최초 시도에서는 키 입력 사이에 지연 없이 연속으로 보내 활성화 전에
`ArrowDown`이 무시되는 현상이 있었다(테스트 코드 문제) — 각 키 입력 사이에 150ms 대기를 추가해
해결했다(dnd-kit 자체 문제가 아니라 테스트의 이벤트 타이밍 문제였다).

**6) 모바일/touch 검증**: 375px 뷰포트에서 가로 스크롤 없음
(`document.documentElement.scrollWidth===clientWidth`)과 날짜 select+"이 날짜에 추가" 버튼 fallback
이 실제 클릭으로 정상 동작함을 확인했다. **실제 touch(멀티터치 포인터) drag 자체는 검증하지
않았다** — Playwright/CDP의 synthetic touch 이벤트가 dnd-kit `PointerSensor`가 기대하는
`pointerType:"touch"` 시퀀스를 안정적으로 재현하기 어려워, 검증 범위에서 명시적으로 제외했다(추측성
"검증 완료" 주장을 피하기 위해 완료 보고에서도 이 부분만 별도로 "미검증"이라고 밝혔다).

**7) 저장/새로고침 검증**: 드래그 직후 "저장하지 않은 변경사항이 있습니다" 상태만 뜨고(DB 미반영),
저장 버튼 클릭 후 새로고침해도 새 순서가 유지됨을 실제 브라우저 흐름(저장→reload→재확인)으로
검증했다.

**8) 실제 버그 발견 여부**: 이번 검증에서 dnd-kit 통합 경로 자체의 버그는 발견되지 않았다. 처음
8개 중 6개가 실패했던 원인은 전부 테스트 코드 결함이었다 — (a) 기본 720px 뷰포트에서는 세로로 긴
실행안 페이지의 drag source/target이 동시에 화면에 들어오지 않아 좌표가 어긋남(뷰포트를
1280×2600으로 확대 + `scrollIntoViewIfNeeded()`로 해결), (b) 날짜 컨테이너를 찾는 locator가
`getByText("N일차")`만 써서 모든 항목의 "다른 날짜로 이동" `<select>` 안 `<option>N일차</option>`
에도 걸려 지나치게 넓은 div를 골랐음(`<p>` 태그로 한정하는 `dayContainer()` 헬퍼로 해결), (c)
KeyboardSensor 키 입력 사이 지연 부족(위 5) 참고). 세 가지 모두 앱 코드가 아니라 테스트 작성의
문제였으므로, 이번 세션에서 앱 코드(`PlanEditor.tsx`/`planBuilder.ts`)는 전혀 수정하지 않았다.

**9) 기존 버튼/accessibility 회귀**: 위/아래 이동, 삭제 버튼을 실제 클릭했을 때 drag가 오작동으로
시작되지 않고 각 버튼 고유 동작만 수행함을 확인했다(Playwright 실제 클릭 기준).

**10) 검증 결과**: 신규 `e2e/plan-drag-drop.spec.ts` 9개 테스트(같은 날짜 재정렬, 날짜 간 이동,
후보→일정 추가, KeyboardSensor, 버튼 오작동 없음, 저장/새로고침, 청주 후보 추가→삭제→재등장→버튼
재추가, SHOPPING dedup 회귀, 375px 모바일 레이아웃+버튼 fallback) 전부 실제 Chromium에서 통과했다.
전체 유닛 테스트 1510개(변경 없음), `npx tsc --noEmit`, lint 모두 통과했다(코드 변경이 없어 build는
이번 세션에서 재실행하지 않음 — 이전 갱신(5)에서 이미 통과 확인됨).

**최종 판정**: **검증 완료** — 같은 날짜 재정렬, 날짜 간 이동, 추천 후보→일정 추가 세 가지 핵심
Drag를 모두 실제 pointer 이벤트로 재현·성공시켰다. 단, touch drag 자체는 미검증 상태로 남아있다
(위 6) 참고).
