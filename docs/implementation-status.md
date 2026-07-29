# 구현 상태 (2026-07-27 갱신 — P0-2 대표 시나리오 3개 완료 반영)

> 최초 작성 2026-07-23(REVIEW_ONLY 재검증), 2026-07-26 Phase 5-A~5-C+보완·문서 갱신·Phase 4, 2026-07-27
> P0-2(대표 시나리오 3개) 순으로 갱신. Phase 4/5 커밋은 이미 `origin/main`에 push됐지만(`git push`
> 완료, 2026-07-26), 이번 P0-2 작업은 로컬 커밋만 있고 아직 push되지 않았다 — "DONE"이라고 적은
> 항목이라도 **로컬 구현 완료**를 뜻할 뿐 원격 반영·DB 적용·배포·실제 브라우저 검증 완료를 의미하지
> 않는다(각 항목에서 이를 구분해 표기한다).
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

## 다음 작업 순서 (P0, 2026-07-27 갱신 — P0-2 대표 시나리오 3개 로컬 구현 완료 반영)

Phase 4(P0-1, `origin/main`에 push 완료)에 이어 대표 시나리오 3개(P0-2)도 로컬 구현·테스트를 마쳤다.
지금부터는 다음 순서로 진행한다.

1. **P0-1. Phase 4 구현 — 완료(로컬+원격)** — 아래 "Phase 4" 절 참고. 역할·국적·테마·여행월을 전략 점수
   (`roleFit`/`targetFit`/`feasibilityFit`/`seasonFit`)·추천 근거·실행안 체크리스트·위험요인·KPI 관점에
   실제로 반영했다. 지역 객관적 DNA(`demandFit`/`supplyFit`)는 그대로 유지해 조건별 해석과 분리했다.
   `origin/main`에 이미 push됐다(`68f8ed9`/`9ca0084`).
2. **P0-2. 대표 시나리오 3개 완성 — 완료(로컬)** — 아래 "대표 시나리오(P0-2)" 절 참고. 강릉/경주/제천
   3개 프리셋을 `/projects/new` 입력폼에 추가해, 카드를 고르면 지역·역할·국적·테마·여행월(및 나머지
   필수 입력값)이 채워지고 기존 분석 파이프라인을 그대로 통과한다. 프리셋은 입력값 묶음일 뿐 결과를
   저장하거나 하드코딩하지 않는다 — 실제로 계산한 DNA·전략 점수·순위·근거·KPI·체크리스트·위험요인이
   세 시나리오마다 다르다는 것을 `contestScenarios.test.ts`로 확인했다. 아직 push 전이다.
3. **P0-3. DB migration 적용 및 통합 검증** — P0-2 이후 진행. 적용 대상 Neon DB가 개발용인지
   운영용인지부터 확인하고, 미적용 migration(`20260726000000_add_selected_plan_promo_content` 포함)을
   적용하기 전 백업·영향 범위를 확인한다. 적용 후 실제 DB·브라우저로 홍보자료 생성·편집·저장·재조회,
   새로고침 유지, 재생성 취소/승인, 개별/전체 복사, 여행사·지자체 역할 화면, 모바일 레이아웃, 인쇄
   미리보기, Phase 4 조건별 결과 차이, 강릉·경주·제천 대표 시나리오 3개, 기존 실행안 화면 회귀를
   검증한다.
4. **P0-4. 원격 반영 및 배포** — 통합 검증 후 커밋 범위를 확인하고 push, Vercel 빌드 확인, 운영
   환경변수·운영 DB migration 상태 확인, 배포 URL smoke test까지 진행한다.

아래 "요약 테이블"의 우선순위 열은 이 순서를 반영해 갱신했다.

## POI 선택·동선 거리 인식 개선 (2026-07-27, P0-2 push 이후 — 운영 경주 사례 87분·127분 이동 구간 보완)

운영 배포 후 신규 생성한 경주 실행안에서 87분·127분짜리 단일 이동 구간과, 강릉·경주 양쪽에서 FOOD
카테고리(식당/카페 구분 없이) 연속 배치가 확인됐다 — 이번 보완의 출발점이다. **로컬 구현·테스트
완료, 아직 push하지 않았다.**

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

## Phase 5. 다채널 홍보 초안 — `DONE(로컬)` — 원격/DB/배포는 별도 확인 필요

4개 커밋으로 순차 구현했다. 상태를 아래처럼 명확히 구분한다.

| 구분 | 상태 |
|---|---|
| 로컬 코드 구현 | 완료 |
| 로컬 자동 테스트 | 완료(신규 89개: 5-A 21 + 5-B 30 + 5-C 27 + 보완 11) |
| GitHub `origin/main` 반영 | **미완료** — 4개 커밋 전부 로컬 `main`에만 있음 |
| DB migration 적용 | **미완료** — `20260726000000_add_selected_plan_promo_content` 미적용(`prisma migrate status`로 확인, 원격 Neon DB 대상) |
| 실제 브라우저 통합 검증 | **미완료** — 위 migration이 적용된 DB가 없어 수행 불가 |
| 운영 배포 반영 | **미완료** |

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
- **다음 확인 필요**: 위 표의 미완료 4개 항목. 상세 순서는 이 문서 상단 "다음 작업 순서(P0)"의 P0-3/P0-4.

## Phase 6. 조건 수정 및 안전한 재분석 — `NOT_STARTED`

- `src/app/projects/[id]/` 하위에 분석 조건을 수정하는 route/action이 없다(글롭 검색 결과 0건). 전략 재선택은 가능하지만 `ProjectInput` 자체를 고쳐 재분석하는 흐름은 없다.

## Phase 7. 비교 코호트와 행정 범위 설명 — `IN_PROGRESS` (부분 구현)

- 대전 라벨("대전광역시 (DNA 지표는 유성구 기준)")은 이미 반영됨(직전 세션, `regionQueries.ts`).
- 그러나 분석 화면에 "7개 지역 내 상대점수"라는 명시적 문구, 지표별 코호트 수(N)·min/max 범위 표시는 없음(검색 결과 근거 패널 관련 컴포넌트에 코호트/표본 언급 없음).

## Phase 8. 사이트 전체 잠금 제거 + 프로젝트별 비밀번호 — `NOT_STARTED`

- 현재 `SITE_ACCESS_PASSWORD` + `src/proxy.ts` 전역 게이트가 그대로 존재([proxy.ts](../src/proxy.ts) 전체 내용 확인, 2026-07-21 도입 그대로).
- `OwnerSession`, `ProjectAccessSession`, `ProjectOwnerRecovery`, `ProjectAccessAttempt`, `Project.publicId`/`passwordHash` 등 마스터 프롬프트가 요구하는 모델이 schema에 전혀 없음.
- **가장 우선순위 높은 미착수 항목** — 마스터 문서 자체가 "최우선 보안 작업"으로 지정.

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

## 요약 테이블 (2026-07-27 갱신 — P0-2 대표 시나리오 3개 로컬 완료 반영)

> 2026-07-23 버전은 지정과제 7번 직결 항목과 심사 노출도를 최우선 기준으로 삼아 Phase 5를 P0-2로
> 두었다. Phase 5, 이어서 Phase 4, 이어서 대표 시나리오 3개(P0-2)가 로컬 구현·테스트를 마쳤다.
> 우선순위 열의 "P0-1~P0-4"는 이 문서 상단 "다음 작업 순서" 절과 동일한 시퀀스를 가리킨다(Phase
> 번호와 P0 순번은 1:1 대응이 아니다 — 시나리오·DB 적용·배포는 특정 Phase 번호가 없는 작업이다).

| Phase | 상태 | 우선순위(재조정 2026-07-27) |
|---|---|---|
| 1. Provenance 모델 + 실제 snapshot 저장 | **DONE**(1-A~1-E 전부 완료, 배포 반영됨) | 완료 |
| 5. 다채널 홍보 초안 | **DONE(로컬)** — 원격은 반영됐으나(push 완료) DB 적용·배포 미완료(위 Phase 5 절 참고) | 로컬+원격 완료, P0-3/P0-4에서 DB 적용·배포 진행 |
| 4. role/nationality/테마/여행월 반영 | **DONE(로컬+원격)** — push 완료, DB 적용 대상 스키마 변경 없음(위 Phase 4 절 참고) | 완료 |
| (신규) 대표 시나리오 3개 차별화 + E2E | **DONE(로컬)** — 원격 반영·실제 브라우저 검증 미완료(위 "대표 시나리오 3개" 절 참고). E2E 확장은 미착수(단위 테스트로 대체 검증) | 로컬 완료, P0-3/P0-4에서 원격 반영·브라우저 검증 진행 |
| (신규) DB migration 적용 + 통합 검증(Phase 5 포함) | NOT_STARTED | **P0-3** |
| (신규) 원격 반영(push) + 배포 | NOT_STARTED | **P0-4** |
| 8. 사이트 잠금 제거/프로젝트 비밀번호(축소 구현) | NOT_STARTED | P1-5 |
| 2. 최소 갱신 구조(축소 구현) | NOT_STARTED | P1-6 |
| 11. 빌드/CI 정비 | NOT_STARTED | P1-7 |
| 10. `/admin/ops` | NOT_STARTED | P2-8 |
| 12. 실제 경로 API | NOT_STARTED(BLOCKED — 쿼터/REST키/약관 일부 미확인) | P2-9 |
| 3. 결정론/dataVersion | IN_PROGRESS(1개 결함 해소, 2개 결함 잔존 — 위 Phase 3 절) | P1 이후(휘발성 `collectedAt`/코호트 미반영 결함은 별도 작업 필요) |
| 6. 조건 수정/안전 재분석 | NOT_STARTED | P1 이후(P0~P1 완료 후 재검토) |
| 7. 코호트/행정범위 설명 | IN_PROGRESS(부분) | P1 이후(표시만 남은 작업이라 낮은 리스크로 아무 때나 끼워넣기 가능) |
| 9. 무료 운영비 가드 | NOT_STARTED | 전 Phase 횡단 적용(외부 API를 새로 호출하는 모든 구현 단위에 동시 적용) |

단위 테스트는 `tests/unit/*` 27개 파일에 389개(2026-07-27, 이 문서 갱신 시점에 직접 재실행해 확인 —
과거 실행 결과를 인용한 것이 아니다), E2E는 `e2e/core-flow.spec.ts` 8개(이번 문서 갱신에서는 재실행하지
않음, 대표 시나리오용 E2E 확장도 하지 않음 — 핵심 화면 흐름 자체는 변경이 없어 마지막 통과 상태가 그대로
유효하다고 판단하지만, 대표 시나리오 카드의 실제 브라우저 동작은 별도로 검증이 필요하다). `npm run
typecheck`/`npm run lint`/`npm run build`도 같은 시점에 통과를 확인했다.

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
