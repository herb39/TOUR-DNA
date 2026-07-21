# 공공데이터 API 연동 현황

> 작성일: 2026-07-20, 2026-07-21 세 차례 갱신(1차: 지역코드/다양성/국문관광정보, 2차: 체류·소비 코드,
> 3차: 자원수요 서비스·다양성 전체 코드 체계·데이터 기준월 최신화). 아래 "2026-07-21 실키 검증 결과"가
> 최신 확인 사실이며, 맨 아래 "실키 발급 전 웹 조사 결과(2026-07-20)" 섹션은 그 이전의 추정치로
> 참고용으로만 남겨둔다.

## 데이터 기준월(baseYm) 최신화 (2026-07-21 3차 확인)

`TOUR_DATA_BASE_YM`이 오랫동안 `202509`(2025년 9월)로 고정돼 있었던 이유는, 실 서비스키 발급 직후
확인 작업을 그 달 기준으로 시작했고 이후 갱신하지 않았기 때문이다. 실제로는 훨씬 최신 데이터가 존재하는지
확인이 안 되어 있었다. 이번에 여러 baseYm으로 실 API를 호출해 확인한 결과, **202509~202606(2026년
6월)까지 매달 데이터가 존재**하고 202607(호출 시점의 이번 달)만 아직 비어 있었다(당연한 결과). 즉
**9개월 치 더 최신 데이터가 이미 사용 가능한 상태**였다. `DEFAULT_BASE_YM`/`TOUR_DATA_BASE_YM`을
`202606`으로 갱신했고(로컬 `.env.local`, Vercel 환경변수, `src/lib/fixtures/metrics.ts`의 fixture),
데모 프로젝트의 분석 결과도 202606 기준으로 재생성했다. 향후에도 이 값은 수동으로 유지보수해야 한다 —
API가 최신 baseYm을 자동으로 알려주지 않는다.

## 2026-07-21 실키 검증 결과

### 지역 코드 체계 (확정)

이 프로젝트가 쓰는 공공데이터 API들은 **서로 다른 두 코드 체계**를 쓴다. 실제 API 응답의 `areaNm`/
`signguNm`/`areacode` 등 지역명 필드로 직접 대조해 확정했다.

| 체계 | 사용 API | 대전(유성구) | 제천시 | 양양군 | 강릉시 | 경주시 | 제주시 | 통영시 |
|---|---|---|---|---|---|---|---|---|
| 통계청 행정표준코드 | `AreaTarDemDsService`, `AreaTarDivService` | areaCd=30, signguCd=30200 | 43/43150 | 51/51830 | 51/51150 | 47/47130 | 50/50110 | 48/48220 |
| TourAPI 구코드 (시도 1~39) | `KorService2` | areaCode=3 | 33(충북) | 32(강원) | 32(강원) | 35(경북) | 39(제주) | 36(경남) |

**2026-07-21 지역 확장**: DNA 축 min-max 정규화 코호트가 3개뿐이면 최댓값/최솟값 지역이 항상 정확히
100점/0점이 되는 문제가 있어, 강릉·경주·제주·통영 4개 지역을 위 표처럼 실 API 응답(areaNm/signguNm)으로
직접 대조해 코드를 확인한 뒤 추가했다. 4개 지역 모두 체류/소비/다양성/관광서비스수요 실 데이터와 POI
라이브 동기화(경주 354건/강릉 791건/제주 631건/통영 191건)까지 확인했다.

대전광역시는 자치구 단위로만 통계청 API 데이터가 제공되어, 대표 자치구로 **유성구(30200)**를 쓴다
(fixture POI 다수가 유성구 소재). 다른 4개 구(동구30110/중구30140/서구30170/대덕구30230)로 세분화하는
것은 P2 과제다. `Region.apiAreaCode`/`apiSigunguCode`(통계청)와 `Region.tourApiAreaCode`(TourAPI
구코드)에 반영했다.

### 서비스별 확인 상태

**1) 지역별 관광 수요 강도 — `AreaTarDemDsService` (✅ 체류/소비 실제 데이터 확인, 2026-07-21 2차 갱신)**
- Base: `https://apis.data.go.kr/B551011/AreaTarDemDsService`
- `/areaTarSjrnDsList`(체류 강도): `tarSjrnDsIxCd` 파라미터 필요(다양성 API와 동일 패턴 — 이전에
  0건이었던 원인이 바로 이 코드 파라미터 누락이었다). 확인된 코드 `2103`="1박 방문자수". 대전 유성구
  (88.29)/제천(71.97)/양양(71.72) 3개 지역 전부 실제 값 확인. `tarSvcDem.ts` 어댑터에 반영 완료.
- `/areaTarExpDsList`(소비 강도): `tarExpDsIxCd` 파라미터 필요. 확인된 코드 `2201`="외지인 소비액".
  대전 유성구(91.36)/제천(68.3)/양양(65.29) 3개 지역 전부 실제 값 확인. 어댑터에 반영 완료.
- 다양성 지표(`touDivIxVal`, 아래 2번 항목)와 달리, "1박 방문자수"↔체류 강도, "외지인 소비액"↔소비
  강도는 의미가 직접 대응되는 지표라 별도 재계산 로직 없이 그대로 사용해도 무방하다고 판단.
- ✅ **수요(Demand) 지수 오퍼레이션 결론(2026-07-21 3차 확인, Swagger UI)**: 사용자가 Swagger UI에서
  직접 확인한 결과 `AreaTarDemDsService`에 등록된 오퍼레이션은 `/areaTarSjrnDsList`(체류)·
  `/areaTarExpDsList`(소비) 단 2개뿐이다. "지역별 관광 수요 강도"라는 서비스명과 달리 별도의 범용
  수요 오퍼레이션은 애초에 존재하지 않는다 — 그동안 여러 오퍼레이션명을 추측 시도했던 것은 존재하지
  않는 엔드포인트를 찾던 것이었다. `tarSvcDemIxVal`(METRIC_CODES.DEMAND_SERVICE)에 대응하는 실 데이터
  소스는 없다고 결론. DNA Demand 축은 이 값 없이 나머지 두 하위지표(자원수요/방문자수 증감률)만으로
  계산되거나, 그마저 없으면 스냅샷으로 대체된다(`src/lib/domain/dna.ts`가 이미 이렇게 방어적으로
  설계되어 있어 코드 변경은 불필요, 문서만 갱신).

**2) 지역별 관광 다양성 — `AreaTarDivService` (✅ 실제 데이터 확인, 2026-07-21 3차 갱신: 코드 체계 전체 확인)**
- Base: `https://apis.data.go.kr/B551011/AreaTarDivService`
- `/areaTouDivList`(관광객 다양성): `touDivIxCd` **3101~3106 전체 확인** = 10대~60대 방문객수 지수
  (6개 연령대 전부 실 데이터 확인, 예: 대전 유성구 202606월 10대=96/20대=93.12/.../60대=101.59).
- `/areaExpDivList`(관광 소비 다양성): `expDivIxCd` **3201~3206 전체 확인** = 10대~60대 소비액 지수
  (6개 연령대 전부 실 데이터 확인).
- `/areaIntlDivList`(국제적 다양성): `intlDivIxCd` **3301~3303 확인** = 3301"외국인 소비액"/
  3302"외국인 방문자수"/3303"외국인 방문객 국적 다양성"(이미 그 자체로 다양성 지수).
- ✅ **재계산 로직 구현 완료(2026-07-21)**: `touDivIxCd`/`expDivIxCd` 각 6개 값의 변동계수(CV=표준편차/
  평균)를 "evenness"(고르게 분포할수록 높은 값)로 변환하고, `intlDivIxCd=3303`(국적 다양성)과 함께 3개를
  단순 평균해 최종 `touDivIxVal`을 합성한다(`src/lib/public-data/adapters/touDivIx.ts`,
  scoring-model.md의 공식 참고). 저장 보류(SKIPPED) 조치는 해제했다 — 이제 실제 합성 점수를
  `NormalizedMetric`에 정상 저장한다(대전 202606월 합성 점수 85.24 등, 기존 fixture 81과 유사한 범위).

**3) 지역별 관광 자원 수요 — `AreaTarResDemService` (✅ 관광서비스수요 실제 데이터 확인, 2026-07-21 3차 확인)**
- Base: `https://apis.data.go.kr/B551011/AreaTarResDemService` (기존에 알려지지 않았던 base — 사용자가
  실 호출 예시로 제공, `TOU_RES_DEM` 데이터소스에 반영).
- `/areaTarSvcDemList`(관광 서비스 수요): `tarSvcDemIxCd` 파라미터 필요. 확인된 코드 `1101`="레포츠여행
  유형 SNS언급량". 3개 지역 전부 실제 값 확인(대전 72.88/제천 75.14/양양 104.57, 202606월).
  ⚠️ **정정**: 이 값(`tarSvcDemIxVal`, METRIC_CODES.DEMAND_SERVICE)은 원래 `AreaTarDemDsService`
  (TAR_SVC_DEM)에 있을 것으로 추정했으나, 실제로는 이 서비스(TOU_RES_DEM/AreaTarResDemService)
  소속이었다. `touResDem.ts`/`syncService.ts`를 이 사실에 맞게 수정했다.
- `/areaCulResDemList`(문화 자원 수요): 파라미터명은 `culResDemIxCd`로 확인됨(다른 이름을 쓰면
  `INVALID_REQUEST_PARAMETER_ERROR` 발생, 이 이름은 에러 없이 수락됨)이지만, 유효한 코드값은 찾지
  못했다(1101~1110 등 다수 시도, 전부 0건). `METRIC_CODES.DEMAND_RESOURCE`(touResDemIxVal)의 실제
  출처일 가능성이 높으나, 유효 코드 확인 전까지는 호출하지 않는다(추측성 호출 지양).

**4) 국문 관광정보 서비스 — `KorService2` (✅ 실제 데이터 확인, POI 파이프라인 연결 완료)**
- Base: `https://apis.data.go.kr/B551011/KorService2`
- `/areaBasedList2`(지역기반 목록): 대전(areaCode=3)에서 실제 POI("갑천" 등) 정상 조회 확인.
- `contentTypeId`(공식 문서 기준): 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠,
  32=숙박, 38=쇼핑, 39=음식점 → `PoiCategory` 매핑(`mapContentTypeToPoiCategory`, 25=여행코스는
  개별 장소가 아니라서 제외).
- ✅ **POI upsert 파이프라인 연결 완료(2026-07-21)**: `syncService.ts`가 이제 실제로 지역당 최대
  100건까지 조회해 `Poi` 테이블에 upsert한다. **큐레이션된 FIXTURE POI는 절대 덮어쓰지 않는다** —
  이름이 겹치면 라이브 데이터(운영시간/휴무일 정보 없음)가 데모용 큐레이션 정보를 지울 수 있어, 기존
  레코드가 `sourceType=FIXTURE`이면 건너뛴다. 실제 동기화로 3개 지역 총 281건의 실제 장소가 새로 반영된
  것을 확인했다(기존 fixture 23건은 그대로 유지).

**5) 지역별 방문자수** — 여전히 미확인. `https://www.data.go.kr/data/...` 소개 페이지 URL로 호출하면
`invalid JSON response`(게이트웨이 주소가 아님). `Area{Xxx}Service` 패턴을 추정 시도했으나 확인하지
못했다. Swagger UI 확인 필요.

**6) 기초지자체 중심 관광지 및 연관 관광지** — 정식 서비스명 자체가 여전히 미확인.

### 공통으로 확인된 사항

- 필수 파라미터: `serviceKey`, `MobileOS`, `MobileApp`, `baseYm`(지표 API), `areaCd`+`signguCd`(통계청
  코드 API) 또는 `areaCode`(KorService2). JSON 응답은 `_type=json`(밑줄 포함) 필요, 기본은 XML.
- 성공 응답 구조는 스펙이 가정한 `response.header.{resultCode,resultMsg}` /
  `response.body.{items,numOfRows,pageNo,totalCount}`와 정확히 일치, 데이터 0건이면 `items`가 빈
  문자열 `""`로 온다(우리 파서가 이미 처리하던 케이스와 일치).
- **에러 응답은 다른 최상위 구조**로 온다: `{"responseTime":"...","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(...)"}` — `response` 래퍼가 없다. 어댑터들은 오퍼레이션별로 개별
  try/catch로 파싱해, 하나의 오퍼레이션이 이 에러 구조로 응답해도 나머지가 죽지 않게 처리했다.

## 이번 구현에서 취한 조치 (2026-07-21, 3차 갱신 — 자원수요/다양성 전체 코드/POI 파이프라인/baseYm 최신화)

- `Region.apiAreaCode`/`apiSigunguCode`(통계청 코드), `Region.tourApiAreaCode`(TourAPI 구코드) 3개
  필드로 두 코드 체계를 분리 저장한다.
- `TAR_SVC_DEM`, `TOU_DIV_IX`, `TOU_RES_DEM` 어댑터를 확인된 실제 base URL·오퍼레이션·파라미터로
  재작성했다. `TOU_RES_DEM`의 base URL이 이번에 처음 확인됐다(`AreaTarResDemService`).
- 다양성 지표의 전체 코드 체계(연령대별 방문객/소비 각 6종 + 국적 다양성)를 확인하고, 변동계수 기반
  evenness 산식으로 종합 점수를 재계산하는 로직을 구현했다 — 더 이상 저장을 보류하지 않는다.
- `TOU_RES_DEM`(관광서비스수요)이 실제로는 METRIC_CODES.DEMAND_SERVICE의 출처였음을 확인하고
  `syncService.ts`의 저장 위치를 바로잡았다(이전에는 `TAR_SVC_DEM` 쪽에서 찾고 있었음).
- `TOUR_INFO`(국문관광정보) 어댑터를 실제 sync 파이프라인의 POI upsert 로직에 연결했다 — 큐레이션된
  FIXTURE POI는 보호하고 신규 장소만 반영한다.
- `TOUR_DATA_BASE_YM`을 202509 → 202606으로 최신화하고(실제로 202606까지 데이터 존재 확인),
  fixture/데모 프로젝트도 이 기준월로 갱신했다.

## 다음 재검증 시 확인할 것 (사용자 수행, Swagger UI 복구 후)

1. `AreaTarResDemService`의 `/areaCulResDemList`(문화 자원 수요) 유효 코드값 — 파라미터명(`culResDemIxCd`)
   은 확인됐으나 코드값을 찾지 못했다(METRIC_CODES.DEMAND_RESOURCE의 유력한 출처)
2. 지역별 방문자수 API의 실제 base URL·오퍼레이션명
3. 기초지자체 중심 관광지 및 연관 관광지 API의 정식 서비스명

(수요 오퍼레이션명·다양성 전체 코드 체계·자원수요 서비스 확인은 모두 완료 — 위 "서비스별 확인 상태"
1~4번 항목 참고.)

---

## 실키 발급 전 웹 조사 결과 (2026-07-20, 참고용)

실 서비스키가 없는 상태에서 공식 문서(data.go.kr)를 웹 조사로 확인한 결과였다. 위 실키 검증 결과로
대부분 갱신되었으나, 아직 확인되지 않은 API(자원수요/방문자수/연관관광지)에 대한 배경 정보로 남겨둔다.

| API | 정식 서비스명 | data.go.kr 페이지 | 제공기관 |
|---|---|---|---|
| 지역별 관광 자원 수요 | 한국관광공사_지역별 관광 자원 수요 | data.go.kr/data/15152138/openapi.do | 한국관광공사 |
| 지역별 방문자수 | 한국관광공사_빅데이터_지역별 방문자수_GW | data.go.kr/data/15101972/openapi.do | 한국관광공사 |
| 기초지자체 중심 관광지 및 연관 관광지 | (정확한 서비스명 미확인) | 미확인 | 한국관광공사 추정 |

위 필드명 후보(`tarSvcDemIxCd` 등)는 실제로는 대부분 실키 검증에서 확인되거나(체류/소비/다양성) 여전히
미확인(수요/자원수요/방문자수)으로 판명되었다 — 최신 상태는 위 "2026-07-21 실키 검증 결과" 참고.
