# 구현 상태 (2026-08-01 갱신 — Production 마이그레이션 적용 + 실사용 검증 반영)

> 최초 작성 2026-07-23(REVIEW_ONLY 재검증), 2026-07-26 Phase 5-A~5-C+보완·문서 갱신·Phase 4, 2026-07-27
> P0-2(대표 시나리오 3개), 2026-07-29 사용자 화면 데이터 신뢰도 1차 개선, 2026-07-29~30 역할 적합도·
> 관광 지표 요약 2차 개선, 2026-07-31 전략 3안 구조적 차별화(Phase 4-보완), **2026-08-01 Production
> DB migration 적용 + Vercel 배포 실사용 검증(P0-3/P0-4 완료)** 순으로 갱신. 맨 아래 새 섹션
> "Production 실사용 검증 및 대표 시나리오 완성(2026-08-01)"에 이번 라운드의 상세 내역이 있다.
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

## Phase 6. 조건 수정 및 안전한 재분석 — `NOT_STARTED`

- `src/app/projects/[id]/` 하위에 분석 조건을 수정하는 route/action이 없다(글롭 검색 결과 0건). 전략 재선택은 가능하지만 `ProjectInput` 자체를 고쳐 재분석하는 흐름은 없다.

## Phase 7. 비교 코호트와 행정 범위 설명 — `IN_PROGRESS` (부분 구현)

- 대전 라벨("대전광역시 (DNA 지표는 유성구 기준)")은 이미 반영됨(직전 세션, `regionQueries.ts`).
- 그러나 분석 화면에 "7개 지역 내 상대점수"라는 명시적 문구, 지표별 코호트 수(N)·min/max 범위 표시는 없음(검색 결과 근거 패널 관련 컴포넌트에 코호트/표본 언급 없음).

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

## Phase 12. 실제 경로(카카오내비/카카오맵 경로 API) — `NOT_STARTED`

- `CourseMap.tsx`는 Haversine 직선거리 기반 Polyline만 그린다. `RouteProvider`, `KAKAO_NAVI`, `directions` 등 실제 경로 API 연동 코드 없음(전체 검색 0건).
- 무료 쿼터 조건 자체가 아직 확인되지 않았음 — `docs/route-api-status.md` 참고, Phase 12는 그 문서의 선검증 완료 전까지 `BLOCKED`로 둔다.

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

- **Phase 6(조건 수정 및 안전한 재분석)은 여전히 `NOT_STARTED`** — 이번 조사로 그 부재가 실사용
  시나리오에서 실제로 불편을 야기함을 재확인했다(기존 프로젝트의 신규 필드를 채우려면 새 프로젝트를
  만들어야 함). 우선순위 재검토 권장.
- 기존 데모/시연 프로젝트(대전·양양·통영·제주 등 다수) 중 2026-07-31 이전에 분석된 것들은 여전히
  전략 차별화 필드가 비어 있다 — 실제로 그 값을 보여주는 시연을 원하면 위와 같이 신규 프로젝트를
  만들어야 한다.
- 원격 카카오맵·홍보자료 검증에 사용한 Playwright 스크립트는 1회성 조사 도구였으며 저장소에 커밋하지
  않고 검증 후 삭제했다(재현이 필요하면 이 섹션의 절차를 참고해 다시 작성할 것).
