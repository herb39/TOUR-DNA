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

> 2026-07-27: `tourApiAreaCode`(구 KorService2 코드)는 신규 요청에 더 이상 쓰이지 않는다(구형 데이터
> 참고용으로만 컬럼 보존). `Region`에 신 법정동 코드 컬럼 `tourApiLdongRegnCd`/`tourApiLdongSignguCd`가
> 추가됐다(migration `20260727010000_add_tour_api_ldong_codes`). 2026-07-28 실 서비스키로 값을
> 확인해 13개 지역 전부에 반영했다 — `tourApiLdongRegnCd`는 `apiAreaCode`와 동일한 값, `tourApiLdong
> SignguCd`는 `apiSigunguCode`의 뒤 3자리와 동일한 값이다(`docs/public-api-status.md` 4-A절 참고).
> 표에는 지면상 생략했다(값이 `apiAreaCode`/`apiSigunguCode`에서 기계적으로 도출 가능).

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

**2026-08-07 지역 확장(Batch 1+2, 총 20곳 신규 추가 — 지원 SIGUNGU 7→27곳)**: 유사지역 비교·정규화
코호트를 넓히고 유형별 대표 지역을 확보하기 위해 두 배치로 나눠 추가했다. 후보 코드는 전부 TourAPI
`ldongCode2`(시/도별 시군구 전체 목록, 추측 없이 원본 응답 그대로)로 확인한 뒤, 실제 응답의
`areaNm`/`signguNm`이 의도한 지역명과 일치하는지 대조해서만 등록했다 — 이 과정에서 전남·광주 통합
코드(TourAPI `ldongRegnCd=12`)가 통계청 API와 코드 체계가 다르다는 것을 발견해(§전남/광주 코드 불일치
참고) 해당 권역 후보는 전부 제외했다.

| Batch | 지역(SIGUNGU) | 등록일 | 데이터 품질 등급 |
|---|---|---|---|
| 1 | 가평군·파주시·안동시·부여군·거제시·평창군·아산시·해운대구·보령시·하동군 | 2026-08-07 | A(5축 LIVE) |
| 2 | 양평군·공주시·김해시·울릉군·정선군·창녕군·이천시·대구 중구·화천군·삼척시 | 2026-08-07 | A(5축 LIVE) |
| 3 | 남해군·옹진군·기장군·서산시·무주군·함양군·단양군·영월군·연수구·수성구 | 2026-08-08 | 남해군만 A(5축 LIVE) 확인, 나머지 9곳은 §Batch 3 진행 상태 참고 |

**2026-08-08 지역 확장(Batch 3, 10곳 신규 추가 — 지원 SIGUNGU 27→37곳)**: Batch 1+2와 같은 방식으로
후보 코드를 확인했다. Batch 1+2 당시 소진됐던 `AreaTarDivService`(관광 다양성) 일일 호출 한도는
이번 세션에서 회복돼 있었다(대표 지역 1건 사전 확인 후 10개 후보 전부 1회씩 호출, 429 없음) —
`AreaTarDivService`를 반복 호출하는 대신 호출 한도가 없는 TourAPI `ldongCode2`로 후보의 시/도·
시군구 코드를 먼저 특정한 뒤, 지역당 `AreaTarDivService`를 1회씩만 호출해 지역명 일치를 확인했다.
인천광역시(`SIDO_INCHEON`, 통계청·TourAPI 코드 모두 28)·전북특별자치도(`SIDO_JEONBUK`, 모두 52)를
이번에 처음 추가했으며, 두 체계의 시/도 코드가 정확히 일치함을 실 서비스키로 확인했다(§전남/광주
코드 불일치 같은 사례가 아님). 10곳 전부 `REGION_SEED`·DB `Region` 테이블에 반영했고, 코드 감사
(`npm run audit:region-codes`)에서 전체 49건 Region이 전부 정상 매핑됨을 확인했다(코드 누락·중복·
형식 오류 0건).

**⚠️ Batch 3 관광 데이터 동기화는 미완료 상태다**: `npm run sync:tourism-data`로 전체 37개 지역
동기화를 실행했으나, 실행 중 Neon Postgres 프로젝트의 **데이터 전송(data transfer) 쿼터 초과**로
DB 연결 자체가 차단되며 중단됐다(`Your project has exceeded the data transfer quota. Upgrade your
plan to increase limits.` — `AreaTarDivService` API 호출 한도와는 무관한, Neon 플랜 자체의 한도).
중단 시점까지 확인된 상태: 남해군(`SGG_NAMHAE`)은 DataSnapshot 5건·NormalizedMetric 6건·POI 214건이
모두 반영돼 정상 동기화가 완료됐다. 나머지 9곳(옹진군·기장군·서산시·무주군·함양군·단양군·영월군·
연수구·수성구)은 각각 DataSnapshot 1건·NormalizedMetric 2건만 반영된 채 중단됐다 — 일부 소스만
반영된 불완전한 상태이며, 기존 SUCCESS 보존 정책상 이 상태로 잘못된 값이 완전한 것처럼 저장되지는
않았지만 나머지 데이터 소스(체류/소비/다양성 등)는 아직 동기화되지 않았다. Neon 데이터 전송 쿼터가
회복된 뒤(플랜 업그레이드 또는 다음 결제 주기 초기화) `npm run sync:tourism-data`를 다시 실행하면
idempotent upsert로 안전하게 이어서 완료할 수 있다 — 이미 완료된 남해군도 다시 실행돼도 문제없다.
신규 지역 분석·전략 3안 생성·기존 27곳 회귀 확인은 DB 접근이 막혀 이번 세션에서 실제 확인하지
못했다 — 동기화 완료 후 재검증이 필요하다. 지원 SIGUNGU는 7 + 20 + 10 = **37곳**이다(관광 데이터
동기화는 남해군 1곳만 완료).

**2026-08-09 전국 Region 마스터 확장(지원 SIGUNGU 37 → 255곳, SIDO 12 → 16곳)**: `--all-regions`
재개형 배치 동기화(위 §관광 데이터 재개형 동기화 참고)가 실제로 전국을 대상으로 돌 수 있으려면
Region 마스터 자체가 전국을 커버해야 했다. 실 서비스키로 TourAPI `ldongCode2`(시/도 목록 1회 +
16개 시/도별 시군구 목록 각 1회, 총 17회 — 호출 한도 없는 오퍼레이션만 사용)를 호출해 얻은 원본
목록만 등록했다(추측 없음). 청주시·수원시·창원시 등 "구" 단위로 분할된 시는 통계청 API로 실제
확인한 결과(`checkStatCode`) 상위 "시" 코드가 항상 EMPTY를 반환해 하위 "구" 코드만 등록했다.

- **서울특별시(11)**: 25개 자치구 전부 등록.
- **울산광역시(31)**: 5개 구/군 전부 등록(기존에 SIDO 자체가 없었음).
- **세종특별자치시**: TourAPI `ldongCode2`가 시/도 목록 단계에서 이미 5자리 전체 코드(`36110`)로
  반환하고, 그 코드로 재조회해도 자기 자신만 돌아온다 — 시군구 하위분류가 없는 단일 조회 단위다.
  통계청 API도 `areaCd=36, signguCd=36110` 조합으로 실제 데이터가 확인됐다(`checkStatCode` PASS).
  `SGG_SEJONG` 하나로 표현하며 `tourApiLdongSignguCd`는 null이다.
- **전남광주통합특별시(TourAPI `ldongRegnCd=12`)**: 2026-08-07에 이미 문서화된 "TourAPI ↔ 통계청
  코드 체계 불일치"(위 §2026-08-07 지역 확장 참고 — 통계청 코드는 전남 46/광주 29로 분리)가 전국
  확장 시에도 그대로 발견됐다. 이번에는 "후보 제외" 대신 Region 마스터에는 27개 SIGUNGU 전부
  등록하되(`tourApiLdongRegnCd`/`tourApiLdongSignguCd`는 실 응답으로 채움), 검증되지 않은 통계청
  코드(`apiAreaCode`/`apiSigunguCode`)는 null로 남겨뒀다 — "코드를 추측하지 않는다"는 원칙을 그대로
  따른 것이다. `syncService.ts`의 기존 `REGION:code SKIPPED` 분기가 이 27곳을 자동으로 건너뛴다
  (TOUR_INFO/POI 포함 5개 소스 전부 미수집). **실제 전남/광주 통계청 코드(46/29) 검증은 후속 작업
  으로 남아 있다** — 새 Region을 만들거나 지우지 않고 기존 27개 행의 `apiAreaCode`/`apiSigunguCode`
  만 채우면 된다.
- 그 외 12개 기존 SIDO(대전·충북·강원·경북·제주·경남·경기·충남·부산·대구·인천·전북)는 이미
  등록된 37개 SIGUNGU와 실 API 코드가 전부 일치함을 확인했고(재검증 목적 대조, 불일치 0건), 나머지
  전국 시군구 191곳을 추가로 등록했다.

무결성은 `src/lib/services/regionMasterIntegrity.ts`(API 호출 없이 REGION_SEED 배열 자체만 검사하는
순수 함수, `tests/unit/regionMasterIntegrity.test.ts`)로 코드 중복·부모 연결·통계청 코드 누락·같은
SIDO 안 시군구 코드 중복을 확인한다 — 전남광주통합 27곳의 통계청 코드 누락은 "알려진 예외"로 취급해
회귀 테스트가 명시적으로 그 목록과 일치하는지 검증한다(조용히 다른 결함이 숨지 않도록).

**이번 확장에서는 실제 전국 관광 데이터 동기화를 실행하지 않았다** — Region 마스터 등록만 반영했고,
`npm run sync:tourism-data -- --base-ym=<YYYYMM> --all-regions --max-regions=<N>`로 실제 수집을
시작하는 것은 후속 작업이다.

대구 중구(`SGG_DAEGU_JUNG`)는 표시명을 "대구 중구"로 유지하되, POI 주소 필터는
`TOUR_INFO_ADDRESS_FILTER_OVERRIDE`(`syncService.ts`)에서 "중구"로 별도 지정한다 — 실제 주소
("대구광역시 중구 ...")가 표시명 "대구 중구"를 부분 문자열로 포함하지 않아 필터에 표시명을 그대로
쓰면 POI가 전부 걸러지는 문제가 있었다(2026-08-07 발견, 회귀 테스트 `tests/unit/syncService.test.ts`
추가). API 호출 자체는 이미 법정동 코드로 대구 중구만 좁혀 조회하므로 "중구"만으로도 다른 도시의
중구가 섞여 들어올 위험은 없다.

**"A(5축 LIVE)" 등급의 정확한 의미(2026-08-07 재검증)**: 신규 20곳은 실제로 `AnalysisResult.
overallDataMode=LIVE`, `liveAxisCount=5`가 나온다 — 3개 지역(해운대구·안동시·울릉군) 표본의
`Evidence` 레코드를 직접 조회해 확인했다. 다만 이는 "모든 지표가 존재하고 전부 LIVE"라는 뜻이
아니라 "**존재하는 지표가 전부 LIVE_API 출처**"라는 뜻이다 — 구체적으로:
- 수요(Demand) 축은 `tarSvcDemIxVal`(관광 서비스 수요)·`visitorCnt`(방문자수 증감률)만으로 계산되고,
  기존 7곳에서 ESTIMATED fixture로 채워지던 `touResDemIxVal`(관광자원수요) 근거는 신규 지역에
  **아예 존재하지 않는다**(결측 취급도 아니고, 축 계산에서 처음부터 빠진다).
- 연계(Network) 축은 `networkPoiCount`(등록 POI 수, LIVE_API)만으로 계산되고, `PoiRelation`(연계
  관광지) 근거는 신규 20곳 전부 0건이라 아예 존재하지 않는다 — 이는 결측이 아니라, `PoiRelation`이
  seed 수작업 큐레이션 전용이라 신규 지역에 대해 만든 적이 없기 때문이다(위 "연계 축 관계 데이터
  CURATED" 항목 참고).

즉 신규 지역의 "LIVE 5/5"는 "있는 근거는 전부 실시간 API"라는 뜻이며, 기존 7곳 일부처럼 ESTIMATED/
CURATED 근거가 섞여 들어와 있지 않다는 점에서 오히려 축 근거 구성이 더 단순(POI API 근거만)하다 —
근거가 더 완전해서가 아니라 애초에 보조 지표 자체가 없어서 나오는 결과다. "전 지역 5축 모두 실시간
API로 완전 검증됨"처럼 근거의 완전성까지 보장하는 표현은 쓰지 않는다.

## 지표 코드 (NormalizedMetric.metricCode)

| metricCode | 설명 | DNA 축 | 출처(DataSource.code) | 확인 상태 |
|---|---|---|---|---|
| tarSvcDemIxVal | 관광 서비스 수요 강도(원지표: `tarSvcDemIxCd=1101` "레포츠여행유형 SNS언급량") | Demand(주지표) | TOU_RES_DEM | 2026-07-21 실키 확인(`AreaTarResDemService/areaTarSvcDemList`) |
| touResDemIxVal | 문화 자원 수요 | Demand(보조지표) | TOU_RES_DEM | 파라미터명(`culResDemIxCd`)만 확인, 유효 코드값 미확인 |
| visitorGrowthRateVal | 전월 대비 방문자수 증감률 | Demand(보조지표, 계산값) | VISITOR_CNT | 계산 로직은 자체 구현(원 API 필드는 visitorCnt) |
| tarSjrnDsIxVal | 체류 강도(원지표: `tarSjrnDsIxCd=2103` "1박 방문자수") | Stay | TAR_SVC_DEM | 2026-07-21 실키 확인 |
| tarExpDsIxVal | 소비 강도(원지표: `tarExpDsIxCd=2201` "외지인 소비액") | Spend | TAR_SVC_DEM | 2026-07-21 실키 확인 |
| touDivIxVal | 관광 다양성(방문객 연령 evenness+소비 연령 evenness+국적 다양성의 합성값, scoring-model.md 참고) | Diversity | TOU_DIV_IX | 2026-07-21 실키 확인, 재계산 로직 구현 완료 |
| visitorCnt | 방문자수(외지인+외국인, `touDivCd` 2+3 합계) | Demand 증감률 계산용 | VISITOR_CNT | 2026-07-28 실 API 구조 확인, LIVE_API로 기록 |
| visitorCntLocal | 현지인 방문자수(`touDivCd=1` 합계, 보조지표) | 근거 패널 보조지표(DNA 점수식 미사용) | VISITOR_CNT | 2026-07-28 도입 |
| poiNetworkDensity | POI/연관관광지 밀도(구조적 산식) | Network | POI_RELATION | 외부 API 지표 아님 — 자체 산식 |

## DataSource (공공데이터 출처)

| code | 정식 서비스명 | 확인 상태 |
|---|---|---|
| TAR_SVC_DEM | 한국관광공사_지역별 관광 수요 강도 | 실 키 확인(2026-07-21) — 체류/소비 2개 오퍼레이션이 전부, 별도 수요 오퍼레이션 없음(Swagger UI로 확정) |
| TOU_DIV_IX | 한국관광공사_지역별 관광 다양성 | 실 키 확인(2026-07-21) — 3개 오퍼레이션 전부, 연령대별 코드(6종×2) + 국적 다양성 코드까지 확인 |
| TOU_RES_DEM | 한국관광공사_지역별 관광 자원 수요 | 실 키 확인(2026-07-21) — `AreaTarResDemService`. `/areaTarSvcDemList`(관광서비스수요) 확인, `/areaCulResDemList`(문화자원수요)는 파라미터명만 확인 |
| VISITOR_CNT | 한국관광공사_빅데이터 지역별 방문자수(DataLabService) | 실 API 구조 확인(2026-07-28) — `/locgoRegnVisitrDDList`(시군구)·`/metcoRegnVisitrDDList`(광역), 지역 필터 없이 전국 조회 후 매핑 |
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

## 분석 화면 표시 관련 알려진 한계(2026-08-06, Production 조사 결과)

`E2E 결정론 B` 프로젝트(제천시) 조사 결과를 바탕으로 화면 표시 문구를 개선했다. 점수 산식·정규화·
유사지역 순위는 이 조사·개선 과정에서 전혀 바꾸지 않았다 — 아래는 표시 방식과 알려진 데이터 공백에
대한 설명이다.

- **축 출처 배지**(`src/lib/domain/axisSourceSummary.ts`): 예전에는 `AxisStatus`(LIVE/SNAPSHOT/MISSING)
  enum 원문을 그대로 노출했는데, `SNAPSHOT`은 "이 축 점수 계산에 쓰인 근거 중 `LIVE_API`가 아닌 것이
  하나라도 있다"는 뜻일 뿐이라 `CACHED_API`(과거 API 캐시)·`CURATED`(사람이 만든 정제 데이터)·
  `ESTIMATED`(추정값)를 전부 뭉뚱그려 "저장된 과거 스냅샷"처럼 오해하기 쉬웠다. 이제 축 카드는
  "모두 실시간 API" / "실시간 2 · 추정 1" / "API 249 · 정제 7 · 관계 정제 2"처럼 실제 출처 구성을
  짧게 보여준다. 개별 근거의 정확한 값·기준월·출처는 여전히 "근거 보기"에서 확인한다.
- **상대점수 0의 의미**: DNA 5축 점수는 같은 행정단위(SIGUNGU) 코호트 안에서 min-max 정규화한
  상대 순위다. 원값이 실제로 존재하는 축(status=LIVE)이 0점이면 "데이터 없음"이 아니라 "현재 코호트
  안에서 최저값"이라는 뜻이다. `데이터 부족`(MISSING, 근거 자체가 없음)과 `비교지역 내 최저`(LIVE인데
  상대적으로 0점)는 화면에서 서로 다른 배지로 구분한다. **2026-08-07 지역 확장(7→27곳) 영향**: 코호트가
  넓어지면서 기존 지역의 점수도 함께 바뀔 수 있다 — 예를 들어 제천시 체류(Stay) 축은 7개 코호트에서
  0점이었으나 27개 코호트에서는 34점으로 올랐다(더 낮은 지역이 새로 들어왔기 때문). 이는 정규화가
  올바르게 재계산됐다는 뜻이지 오류가 아니다 — 이미 저장된 기존 `AnalysisResult`(과거 분석 시점의
  점수)는 자동으로 재계산되지 않으며, 새로 분석을 실행해야 새 코호트 기준 점수를 보게 된다.
- **유사지역 비교의 모집단 제한**: 유사지역 비교는 전국이 아니라 **현재 지원하는 SIGUNGU 지역만의
  모집단** 안에서 계산한다(2026-08-07 기준 27곳 — 위 지역 표 전체). 대상 지역을 제외하면 후보는 26곳
  이다 — 계산(RMS 거리 + POI 구성 거리, `regionSimilarity.ts`) 자체는 정확히 재현 가능하다. 화면은
  `candidatePoolSize`(대상 지역을 제외한 후보 수)를 그대로 표시하고, 임계값(현재 10곳) 미만이면
  참고용 안내를 추가로 보여준다 — 27곳 확장 이후로는 후보가 항상 10곳을 넘어 이 안내가 표시되지
  않는다.
- **수요 축 `touResDemIxVal`(관광자원수요) ESTIMATED**: 실제 공공데이터 API(`AreaTarResDemService`의
  `culResDemIxCd`)가 유효한 코드값을 확인하지 못해([public-api-status.md](public-api-status.md) 3번
  항목) 호출하지 않고 seed fixture 추정값을 그대로 쓴다. 지역·POI를 추가해도 해결되지 않는 구조적
  공백이다.
- **연계 축 관계 데이터(PoiRelation) CURATED**: 연관관광지 API는 정식 서비스명조차 미확인이라
  ([public-api-status.md](public-api-status.md) 6번 항목) `syncService.ts`가 절대 호출하지 않는다 —
  존재하는 관계 데이터는 전부 seed 수작업 큐레이션이며, 모든 지역에 동일하게 적용되는 구조적 한계다.
