# 데이터 사전

DB/코드에는 영문 코드값을, 화면에는 한글 라벨을 사용한다. 코드-라벨 매핑의 단일 출처는
`src/lib/validation/codes.ts`이며, 아래 표는 그 스냅샷이다.

## 입력 코드값

| 필드 | 코드 | 한글 라벨 |
|---|---|---|
| role | TRAVEL_AGENCY | 여행사/DMC |
| role | LOCAL_GOV | 지자체/관광재단 |
| nationality | DOMESTIC | 내국인 |
| nationality | FOREIGN | 외국인 |
| ageGroups (복수선택) | AGE_TEEN | 10대 이하 |
| ageGroups | AGE_20S | 20대 |
| ageGroups | AGE_30S | 30대 |
| ageGroups | AGE_40S | 40대 |
| ageGroups | AGE_50S | 50대 |
| ageGroups | AGE_60S_PLUS | 60대 이상 |
| companionType | COMPANION_SOLO | 혼자 |
| companionType | COMPANION_COUPLE | 커플/부부 |
| companionType | COMPANION_FRIENDS | 친구/지인 |
| companionType | COMPANION_FAMILY | 가족 |
| companionType | COMPANION_GROUP_TOUR | 단체 |
| primaryGoal / secondaryGoal | GOAL_STAY_SPEND_EXPANSION | 체류 및 지역 소비 확대 |
| primaryGoal / secondaryGoal | GOAL_VISITOR_GROWTH | 방문객 증가 |
| primaryGoal / secondaryGoal | GOAL_REPEAT_VISIT | 재방문 유도 |
| primaryGoal / secondaryGoal | GOAL_SEASONALITY_BALANCE | 비수기 수요 분산 |
| primaryGoal / secondaryGoal | GOAL_LOCAL_ECONOMY | 지역 소상공인 매출 연계 |
| primaryGoal / secondaryGoal | GOAL_BRAND_IMAGE | 지역 브랜드 이미지 제고 |
| primaryGoal / secondaryGoal | GOAL_NEW_MARKET | 신규 타깃 시장 개척 |
| duration | DAY_TRIP | 당일 |
| duration | ONE_NIGHT_TWO_DAYS | 1박 2일 |
| duration | TWO_NIGHTS_THREE_DAYS | 2박 3일 |
| budgetLevel | LOW / MID / PREMIUM | 저가 / 중간 / 프리미엄 |
| transport | WALK | 도보 |
| transport | PUBLIC_TRANSPORT | 대중교통 |
| transport | PRIVATE_VEHICLE | 전용차량 |
| transport | MIXED | 혼합 |
| groupType | FIT | 개별/FIT |
| groupType | SMALL_10_20 | 10~20명 |
| groupType | MEDIUM_21_40 | 21~40명 |

## 지역(Region)

| code | name | level | parentCode | apiAreaCode | apiSigunguCode | tourApiAreaCode |
|---|---|---|---|---|---|---|
| SIDO_DAEJEON | 대전광역시 | SIDO | - | 30 | - | 3 |
| SGG_DAEJEON | 대전광역시(유성구 대표) | SIGUNGU | SIDO_DAEJEON | 30 | 30200 | 3 |
| SIDO_CHUNGBUK | 충청북도 | SIDO | - | 43 | - | 33 |
| SGG_JECHEON | 제천시 | SIGUNGU | SIDO_CHUNGBUK | 43 | 43150 | 33 |
| SIDO_GANGWON | 강원특별자치도 | SIDO | - | 51 | - | 32 |
| SGG_YANGYANG | 양양군 | SIGUNGU | SIDO_GANGWON | 51 | 51830 | 32 |
| SGG_GANGNEUNG | 강릉시 | SIGUNGU | SIDO_GANGWON | 51 | 51150 | 32 |
| SIDO_GYEONGBUK | 경상북도 | SIDO | - | 47 | - | 35 |
| SGG_GYEONGJU | 경주시 | SIGUNGU | SIDO_GYEONGBUK | 47 | 47130 | 35 |
| SIDO_JEJU | 제주특별자치도 | SIDO | - | 50 | - | 39 |
| SGG_JEJU | 제주시 | SIGUNGU | SIDO_JEJU | 50 | 50110 | 39 |
| SIDO_GYEONGNAM | 경상남도 | SIDO | - | 48 | - | 36 |
| SGG_TONGYEONG | 통영시 | SIGUNGU | SIDO_GYEONGNAM | 48 | 48220 | 36 |

`apiAreaCode`/`apiSigunguCode`(통계청 행정표준코드, `AreaTarDemDsService`/`AreaTarDivService`용)와
`tourApiAreaCode`(TourAPI 구코드, `KorService2`용)는 2026-07-21 실 서비스키로 검증됐다
(docs/public-api-status.md). 대전광역시는 자치구 단위로만 통계청 API 데이터가 제공되어, 대표
자치구로 유성구(30200)를 쓴다(다른 4개 구로 세분화하는 것은 P2).

**2026-07-21 지역 확장**: DNA 축 정규화(min-max)가 SIGUNGU 코호트 안에서 이뤄지는데 코호트가 3개뿐이면
최댓값/최솟값 지역이 항상 정확히 100/0으로 나와 신뢰도가 떨어진다는 문제가 있었다. 비교 표본을 7개로
늘리기 위해 강릉시·경주시·제주시·통영시를 추가했다(area/signguNm 응답으로 직접 대조해 코드 확인).

## 지표 코드 (NormalizedMetric.metricCode)

| metricCode | 설명 | DNA 축 | 출처(DataSource.code) | 확인 상태 |
|---|---|---|---|---|
| tarSvcDemIxVal | 관광 서비스 수요 강도(원지표: `tarSvcDemIxCd=1101` "레포츠여행유형 SNS언급량") | Demand(주지표) | TOU_RES_DEM | 2026-07-21 실키 확인(`AreaTarResDemService/areaTarSvcDemList`) |
| touResDemIxVal | 문화 자원 수요 | Demand(보조지표) | TOU_RES_DEM | 파라미터명(`culResDemIxCd`)만 확인, 유효 코드값 미확인 |
| visitorGrowthRateVal | 전월 대비 방문자수 증감률 | Demand(보조지표, 계산값) | VISITOR_CNT | 계산 로직은 자체 구현(원 API 필드는 visitorCnt) |
| tarSjrnDsIxVal | 체류 강도(원지표: `tarSjrnDsIxCd=2103` "1박 방문자수") | Stay | TAR_SVC_DEM | 2026-07-21 실키 확인 |
| tarExpDsIxVal | 소비 강도(원지표: `tarExpDsIxCd=2201` "외지인 소비액") | Spend | TAR_SVC_DEM | 2026-07-21 실키 확인 |
| touDivIxVal | 관광 다양성(방문객 연령 evenness+소비 연령 evenness+국적 다양성의 합성값, scoring-model.md 참고) | Diversity | TOU_DIV_IX | 2026-07-21 실키 확인, 재계산 로직 구현 완료 |
| visitorCnt | 방문자수(원값) | Demand 증감률 계산용 | VISITOR_CNT | 데이터셋 존재 확인, 필드명 미확인 |
| poiNetworkDensity | POI/연관관광지 밀도(구조적 산식) | Network | POI_RELATION | 외부 API 지표 아님 — 자체 산식 |

## DataSource (공공데이터 출처)

| code | 정식 서비스명 | 확인 상태 |
|---|---|---|
| TAR_SVC_DEM | 한국관광공사_지역별 관광 수요 강도 | 실 키 확인(2026-07-21) — 체류/소비 2개 오퍼레이션이 전부, 별도 수요 오퍼레이션 없음(Swagger UI로 확정) |
| TOU_DIV_IX | 한국관광공사_지역별 관광 다양성 | 실 키 확인(2026-07-21) — 3개 오퍼레이션 전부, 연령대별 코드(6종×2) + 국적 다양성 코드까지 확인 |
| TOU_RES_DEM | 한국관광공사_지역별 관광 자원 수요 | 실 키 확인(2026-07-21) — `AreaTarResDemService`. `/areaTarSvcDemList`(관광서비스수요) 확인, `/areaCulResDemList`(문화자원수요)는 파라미터명만 확인 |
| VISITOR_CNT | 한국관광공사_빅데이터_지역별 방문자수_GW | 데이터셋 존재만 확인 |
| TOUR_INFO | 한국관광공사_국문 관광정보 서비스_GW | 실 키 확인(2026-07-21) — `areaBasedList2`로 POI 라이브 동기화 파이프라인 연결 완료(syncService.ts) |
| POI_RELATION | 기초지자체 중심 관광지 및 연관 관광지 | 정식 서비스명/URL 미확인 |

## POI 카테고리 (PoiCategory)

`ATTRACTION`(관광지) · `FOOD`(음식) · `LODGING`(숙박) · `EXPERIENCE`(체험) · `FESTIVAL`(축제/이벤트) ·
`SHOPPING`(쇼핑)

## 전략 템플릿 ID (StrategyResult.templateId)

`LOCAL_FOOD_MARKET`(로컬미식·시장 연계형) · `NIGHT_STAY_EXTENSION`(야간·체류 확대형) ·
`NATURE_WELLNESS`(자연·웰니스형) · `CULTURE_HISTORY`(문화·역사 체험형) ·
`FESTIVAL_EVENT`(축제·이벤트 연계형) · `FAMILY_EXPERIENCE`(가족 체험형) ·
`YOUTH_LOCAL_CONTENT`(청년 로컬·감성 콘텐츠형) — 정의는 `src/lib/domain/strategyTemplates.ts`.

## 상태값

- `Project.status`: `DRAFT`(입력 완료) → `ANALYZED`(분석 완료) → `PLANNED`(실행안 저장 완료)
- `AnalysisResult.xxxStatus` (축별): `LIVE` / `SNAPSHOT` / `MISSING`
- `AnalysisResult.overallDataMode`: `LIVE`(5축 모두 LIVE) / `HYBRID`(일부만 LIVE) / `SNAPSHOT`(모두 비-LIVE)
- `DataSnapshot.status`: `SUCCESS` / `EMPTY`(성공했지만 0건) / `ERROR`
- `SyncLog.overallStatus`: `SUCCESS` / `PARTIAL` / `FAILED`
