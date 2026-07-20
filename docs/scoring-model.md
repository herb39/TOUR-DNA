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
| Diversity | touDivIxVal | 단일 지표 |
| Network | 구조적 산식(아래) | 외부 지표 아님 |

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

## 4. 버전과 결정론

- `dataVersion` = 분석에 실제로 쓰인 원값(대상 지역의 각 지표 rawValue + 방문자수 전/월 + network 입력)을
  JSON 직렬화해 SHA-256 해시한 앞 16자 (`src/lib/domain/dataVersion.ts`). 같은 데이터면 같은 값.
- `analysisKey` = `sha256(정렬된 입력 JSON + dataVersion + modelVersion)` (`src/lib/domain/analysisKey.ts`).
  같은 지역·같은 조건·같은 데이터·같은 모델 버전이면 항상 같은 키.
- 위 두 해시 덕분에 "동일 입력·데이터 버전·모델 버전에서는 점수와 전략 순위가 항상 같다"는 요구사항을
  테스트로 검증할 수 있다(`tests/unit/analysisKey.test.ts`, `tests/unit/strategy.test.ts`의 결정론 테스트).

## 5. 코스/실행안 생성 (LLM 미사용)

- `buildDraftCourse`(`src/lib/domain/planBuilder.ts`)는 전략이 선택한 POI(`StrategyResult.poiIds`, 실제
  DB에 존재하는 장소만)를 여행 기간(당일/1박2일/2박3일)에 맞춰 고정된 시간대(`10:00,13:00,16:00,18:30`)에
  결정론적으로 배치한다. 새 장소·좌표·수치를 생성하지 않는다.
- 체크리스트/KPI/위험은 전략 템플릿에 미리 정의된 목록(`kpiTemplates`, `riskTemplates`)에서 그대로 가져온다.
