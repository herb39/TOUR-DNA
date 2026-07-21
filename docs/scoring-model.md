# 점수 산정 모델

모델 버전: `tour-dna-v1.0.0` (`src/lib/domain/constants.ts`). 공식을 바꾸면 버전을 올린다.

## 1. 정규화 규칙

- 모든 지표는 **동일 행정단위(SIDO/SIGUNGU) · 동일 기준월(baseYm) · 동일 지표(metricCode)** 코호트
  안에서 min-max 정규화한다 (`src/lib/domain/normalize.ts#minMaxNormalize`).
- 코호트에 비교 대상이 1개뿐이거나 모든 값이 같으면 비교가 불가능하므로 중립값 **50**을 반환한다.
- 내부 계산은 소수점 둘째 자리까지, 화면 표시는 정수로 반올림한다(`roundForDisplay`).
- 광역(SIDO)과 기초지자체(SIGUNGU) 값은 절대 같은 코호트로 섞지 않는다(코호트 조회 시 `adminLevel`로 분리).

## 2. DNA 5축

| 축 | 구성 지표 | 비고 |
|---|---|---|
| Demand | tarSvcDemIxVal + touResDemIxVal + visitorGrowthRateVal(선택) | 존재하는 지표만 단순 평균 |
| Stay | tarSjrnDsIxVal | 단일 지표 |
| Spend | tarExpDsIxVal | 단일 지표 |
| Diversity | touDivIxVal(아래 재계산 산식으로 합성) | 3개 하위 지표 조합 |
| Network | 구조적 산식(아래) | 외부 지표 아님 |

**다양성(touDivIxVal) 재계산 산식(2026-07-21 구현, `src/lib/public-data/adapters/touDivIx.ts`)**:
관광 다양성 API의 개별 코드(예: `touDivIxCd=3103`="30대 방문객수")는 그 자체로는 종합 다양성 점수가
아니라 연령대 하나의 단일 값이다. 아래처럼 여러 코드를 조합해 재계산한다.
```
visitorAgeEvenness = 100 * (1 - CV(touDivIxCd 3101~3106 6개 값))   // 연령대별 방문객 지수의 변동계수
spendAgeEvenness   = 100 * (1 - CV(expDivIxCd 3201~3206 6개 값))   // 연령대별 소비 지수의 변동계수
nationalityDiversity = intlDivIxCd 3303 값("외국인 방문객 국적 다양성", 이미 지수화됨)
touDivIxVal(합성) = mean(visitorAgeEvenness, spendAgeEvenness, nationalityDiversity)  // 0~100 clamp
```
CV(변동계수) = 표준편차/평균 — 연령대별 값이 고르게 분포할수록(변동계수가 작을수록) evenness가 높다.
이 산식은 공공데이터 API가 제공하는 공식 다양성 점수가 아니라 원자료로부터 도출한 자체 방법론이다.

**방문자수 증감률 → Demand 보조지표 변환**: `growthRatePercent = (current - previous) / previous * 100`,
`normalized = clamp(50 + growthRatePercent, 0, 100)` (0%→50, +50%p→100, -50%p→0, 구간 밖은 clamp).

**Network 축 구조적 산식**:
```
raw = attractionCount * 4 + relatedPoiCount * 3 + categoryCoverage * (100/3/2)
categoryCoverage = 음식/숙박/체험 중 POI가 1개 이상 존재하는 카테고리 수(0~3)
score = clamp(raw, 0, 100)
```

**축 상태(status)**: 지표가 하나도 없으면 `MISSING`(score=null, 0점 아님). 있으면 `LIVE` 또는
`SNAPSHOT`(구성 지표 중 하나라도 지난 성공 스냅샷으로 대체된 경우).

**overallDataMode**: 5축 모두 `LIVE`면 `LIVE`, 5축 모두 비-`LIVE`면 `SNAPSHOT`, 그 외 `HYBRID`.
`LIVE 5/5` 배지는 이 조건을 만족할 때만 표시한다.

**강점/기회/주의**: 사용 가능한 축 중 점수 상위 2개 → 강점, 하위 2개(또는 MISSING 축 우선) → 기회,
가장 취약한 축 또는 결측 축에 대한 경고 1개 → 주의. 항상 강점 2/기회 2/주의 1을 반환한다
(`buildStrengthsOpportunitiesCautions`, `src/lib/domain/dna.ts`).

**사용자 목표는 DNA 원점수에 영향을 주지 않는다.** `primaryGoal`/`secondaryGoal`은 아래 전략 점수
(targetFit)에만 반영된다.

## 3. 전략 점수

```
strategyScore =
  demandFit      * 0.35 +
  supplyFit      * 0.25 +
  seasonFit      * 0.20 +
  targetFit      * 0.10 +
  feasibilityFit * 0.10
```

모든 하위 점수는 0~100으로 clamp하고 정수로 반올림한다.

- **demandFit / supplyFit**: 전략 템플릿마다 정의된 DNA 축 가중치(`demandAxisWeights`/`supplyAxisWeights`)로
  가중평균. 결측 축은 제외하고 남은 가중치를 재정규화한다. 관련 축이 전부 결측이면 중립값 50.
- **seasonFit**: 여행 월이 템플릿의 성수기(`idealMonths`)에 포함되면 100. 아니면
  `100 - (가장 가까운 성수기월까지의 순환 거리 × 20)`을 0~100으로 clamp.
- **targetFit**: `ageGroups`(복수, 하나라도 일치 시 100/불일치 40) × 0.4 + `companionType`(일치 100/불일치
  40) × 0.35 + `primaryGoal`(일치 100, `secondaryGoal` 일치 70, 불일치 40) × 0.25, 선호 테마가 전략명/콘셉트에
  포함되면 +10 보너스.
- **feasibilityFit**: 예산/이동수단/그룹규모 각각 선호 목록에 있으면 100, 아니면 60의 평균. 당일치기인데
  숙박이 필요한 전략이면 -40 패널티.

**동점 처리**: `totalScore` 동점 시 `supplyFit` → `demandFit` → `templateId` 알파벳 순으로 안정 정렬
(`src/lib/domain/strategy.ts`의 sort comparator).

**제외 테마**: `excludedThemes` 문자열이 템플릿명/콘셉트에 포함되면 해당 템플릿은 후보에서 완전히 제외된다.

**전략 근거(evidences)**: 전략이 참조하는 모든 DNA 축의 evidence를 axis+metricCode 기준으로 중복 제거해
모은다. 정상적인 LIVE 데이터에서는 각 전략이 최소 3개 이상의 근거를 갖는다.

**전략 점수는 매출/방문객 증가 예측치가 아니라 "조건 적합도"다.** UI에 이 문구를 명시한다.

**전략별 POI 선택 다양화(2026-07-21)**: 여러 템플릿이 같은 POI 카테고리(예: ATTRACTION)를 공유하면,
카테고리별로 이름순 정렬한 목록에서 항상 앞의 2개만 뽑을 경우 서로 다른 전략인데도 같은 장소를
고르게 된다(실제로 발견된 문제 — 전략을 재선택해도 코스가 똑같아 보이는 원인 중 하나였다).
`selectPois`(`src/lib/domain/strategy.ts`)는 이제 `template.id`를 결정론적으로 해시해 정렬된 목록
안에서의 시작 위치(offset)를 템플릿마다 다르게 준다 — 같은 입력이면 항상 같은 결과를 내는 결정론
요구사항은 유지하면서, 카테고리를 공유하는 템플릿끼리도 서로 다른 POI를 뽑도록 한다. POI 풀이
카테고리당 2개 이하면 offset은 무의미해지고 동일하게 겹칠 수 있다(지역별 POI 수가 적을 때의 한계).

## 4. 버전과 결정론

- `dataVersion` = 분석에 실제로 쓰인 원값(대상 지역의 각 지표 rawValue + 방문자수 전/월 + network 입력)을
  JSON 직렬화해 SHA-256 해시한 앞 16자 (`src/lib/domain/dataVersion.ts`). 같은 데이터면 같은 값.
- `analysisKey` = `sha256(정렬된 입력 JSON + dataVersion + modelVersion)` (`src/lib/domain/analysisKey.ts`).
  같은 지역·같은 조건·같은 데이터·같은 모델 버전이면 항상 같은 키.
- 위 두 해시 덕분에 "동일 입력·데이터 버전·모델 버전에서는 점수와 전략 순위가 항상 같다"는 요구사항을
  테스트로 검증할 수 있다(`tests/unit/analysisKey.test.ts`, `tests/unit/strategy.test.ts`의 결정론 테스트).

## 5. 코스/실행안 생성 (LLM 미사용)

- `buildDraftCourse`(`src/lib/domain/planBuilder.ts`)는 전략이 선택한 POI(`StrategyResult.poiIds`, 실제
  DB에 존재하는 장소만)를 여행 기간(당일/1박2일/2박3일)에 맞춰 시간대에 배치한다. 새 장소·좌표·수치를
  생성하지 않는다. 처음 4자리는 고정 시간대(`10:00,13:00,16:00,18:30`)를 쓰고, 하루에 4곳을 넘으면
  그 이후는 마지막 슬롯에서 150분(`DEFAULT_SLOT_STEP_MINUTES`)씩 이어간다(`defaultTimeSlotFor`) — 하루에
  담을 수 있는 장소 수 자체는 제한하지 않는다(2026-07-22, 이전에는 4곳으로 캡을 걸었었다).
- 2026-07-21부터 배치 전에 `orderByNearestNeighbor`(`src/lib/domain/geo.ts`)로 POI를 그리디 최근접
  이웃 순서로 재정렬한다(외판원 문제의 근사해, 첫 POI를 시작점으로 고정해 결정론 유지). 이전에는 카테고리별
  선택 순서 그대로 시간대에 꽂아서 같은 시/군/구 안에서도 동선이 비효율적일 수 있었다. 구간별 이동 텍스트도
  `"이동 15~20분"` 고정 문구 대신 haversine 직선거리와 `ProjectInput.transport`(도보/대중교통/차량/혼합)별
  평균 속도 가정으로 계산한 추정 시간(`estimateTravel` — 분 단위 숫자와 표시용 문구를 함께 반환)을 쓴다 —
  직선거리 기반 추정치이므로 실제 도로·대중교통 경로와는 다를 수 있다.
- 체크리스트/KPI/위험은 전략 템플릿에 미리 정의된 목록(`kpiTemplates`, `riskTemplates`)에서 그대로 가져온다.
- 실행안 편집기(`PlanEditor.tsx`)에서 코스를 자유롭게 고칠 수 있다 — 같은 날짜 안 순서 변경/삭제/다른
  날짜로 이동/같은 지역 POI 검색 후 추가(`searchAvailablePoisAction` → `searchPoisInRegion`)/시간 직접
  수정(2026-07-22). `timeSlot`은 이제 자리(순서)가 아니라 각 장소가 독립적으로 갖는 값이다 — 순서 변경은
  방문 순서(따라서 이동거리 재계산)만 바꾸고 시간은 건드리지 않으며, 시간은 `<input type="time">`으로
  직접 수정한다. 하루에 담을 수 있는 장소 수는 제한하지 않는다.
- **실행 가능성 표시(2026-07-22)**: 순서/시간을 자유롭게 바꿀 수 있게 되면서 "이전 장소 체류 종료 시각
  + 이동시간 > 다음 장소 시작 시각"처럼 물리적으로 불가능한 일정이 만들어질 수 있다. `PlanEditor.tsx`의
  `checkFeasibility`가 매 렌더마다 각 장소에 대해 `이전 장소 timeSlot + stayMinutes`와 `현재 장소
  timeSlot` 사이의 여유(분)를 `estimateTravel(...).minutes`(예상 이동시간)와 비교해서, 여유가 부족하면
  (음수 포함 — 즉 시간이 거꾸로 가는 경우도 잡아낸다) 해당 장소를 빨간 테두리/배경과 경고 문구로
  표시한다. 좌표가 없어 이동시간을 추정할 수 없는 경우(2026-07-21 이전 저장된 실행안 등)는 판단을
  보류한다(경고를 띄우지 않는다) — 오탐보다 미탐이 낫다고 판단했다.
- `recomputeDayItems`(순서/이동텍스트만 다시 계산, `timeSlot`은 이미 있으면 보존)는 순수 도메인 함수라
  서버(실행안 최초 생성)와 클라이언트(편집기의 추가/삭제/이동) 양쪽에서 동일하게 재사용된다 — 로직이
  두 곳에서 갈라질 위험이 없다.
