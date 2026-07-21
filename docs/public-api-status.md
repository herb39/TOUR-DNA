# 공공데이터 API 연동 현황

> 작성일: 2026-07-20, 2026-07-21 두 차례 갱신. 2026-07-21에 실 서비스키(`TOUR_API_SERVICE_KEY`)를
> 발급받아 여러 API를 실제로 호출해 검증했다. 아래 "2026-07-21 실키 검증 결과"가 최신 확인 사실이며,
> 맨 아래 "실키 발급 전 웹 조사 결과(2026-07-20)" 섹션은 그 이전의 추정치로 참고용으로만 남겨둔다.

## 2026-07-21 실키 검증 결과

### 지역 코드 체계 (확정)

이 프로젝트가 쓰는 공공데이터 API들은 **서로 다른 두 코드 체계**를 쓴다. 실제 API 응답의 `areaNm`/
`signguNm`/`areacode` 등 지역명 필드로 직접 대조해 확정했다.

| 체계 | 사용 API | 대전(유성구) | 제천시 | 양양군 |
|---|---|---|---|---|
| 통계청 행정표준코드 (시도 2자리 + 시군구 5자리) | `AreaTarDemDsService`, `AreaTarDivService` | areaCd=30, signguCd=30200 | areaCd=43, signguCd=43150 | areaCd=51, signguCd=51830 |
| TourAPI 구코드 (시도 1~39) | `KorService2` | areaCode=3 | areaCode=33(충북) | areaCode=32(강원) |

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

**2) 지역별 관광 다양성 — `AreaTarDivService` (✅ 실제 데이터 확인)**
- Base: `https://apis.data.go.kr/B551011/AreaTarDivService`
- `/areaTouDivList`(관광객 다양성): `touDivIxCd` 파라미터 필요. 확인된 코드 `3103`="30대 방문객수".
  실제 데이터 확인됨(예: 대전 유성구 202509월 `touDivIxVal: 95.99`).
- `/areaExpDivList`(관광 소비 다양성), `/areaIntlDivList`(국제적 다양성): `touDivIxCd`를 붙이면
  `INVALID_REQUEST_PARAMETER_ERROR(touDivIxCd)` 발생 — 이 두 오퍼레이션은 다른 이름의 코드 파라미터를
  쓴다(미확인). 코드 파라미터 없이 호출하면 정상 응답하지만 0건.
- ⚠️ **의미론적 주의**: `touDivIxCd=3103`은 "30대 방문객수" 단일 지표이지 종합 다양성 점수가 아니다.
  우리 도메인 엔진이 기대하는 "다양성(여러 연령/국적/소비 유형에 걸친 분산)"을 계산하려면 여러
  `touDivIxCd`(연령대별로 추정: 3101~3106 등, 국적/소비 다양성은 다른 오퍼레이션의 코드) 값을 모두
  가져와 분산·표준편차 등으로 재계산해야 한다. 이 재계산 로직은 아직 구현하지 않았다.
- ✅ **저장 보류 조치(2026-07-21)**: 재계산 로직 없이 그대로 라이브 동기화를 돌리면 fixture의 종합
  다양성 점수를 의미가 다른 단일 지표로 덮어쓰는 것을 실제로 확인했다(당시 데모 안정성을 위해 즉시
  fixture로 재시드 복원). 이제는 `syncService.ts`가 이 값을 `NormalizedMetric`에 아예 쓰지 않도록
  막아뒀다 — API 호출/파싱은 계속하고 `SyncLog`에 `SKIPPED`로 기록해 연결 상태는 계속 확인하지만,
  Cron이 매월 자동 실행돼도 더 이상 데모 점수가 바뀌지 않는다. 재계산 로직이 준비되면 이 보류를 풀 것.

**3) 국문 관광정보 서비스 — `KorService2` (✅ 실제 데이터 확인)**
- Base: `https://apis.data.go.kr/B551011/KorService2`
- `/areaBasedList2`(지역기반 목록): 대전(areaCode=3)에서 실제 POI("갑천" 등) 정상 조회 확인.
- `/searchFestival2`(축제 검색): 실제 축제 데이터 정상 조회 확인(사용자가 예시 제공).
- `contentTypeId`(공식 문서 기준): 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠,
  32=숙박, 38=쇼핑, 39=음식점.
- 아직 실제 sync 파이프라인에 POI upsert 로직으로는 연결하지 않았다(어댑터만 준비됨, `syncService.ts`는
  여전히 SKIPPED로 기록 — fixture POI를 계속 사용). 연결은 추후 과제.

**4) 지역별 관광 자원 수요, 5) 지역별 방문자수** — 여전히 미확인. `https://www.data.go.kr/data/...`
소개 페이지 URL로 호출하면 `invalid JSON response`(게이트웨이 주소가 아님). `AreaTarDemDsService`/
`AreaTarDivService`처럼 `Area{Xxx}Service` 패턴을 추정 시도했으나 확인하지 못했다. Swagger UI 확인 필요.

**6) 기초지자체 중심 관광지 및 연관 관광지** — 정식 서비스명 자체가 여전히 미확인.

### 공통으로 확인된 사항

- 필수 파라미터: `serviceKey`, `MobileOS`, `MobileApp`, `baseYm`(지표 API), `areaCd`+`signguCd`(통계청
  코드 API) 또는 `areaCode`(KorService2). JSON 응답은 `_type=json`(밑줄 포함) 필요, 기본은 XML.
- 성공 응답 구조는 스펙이 가정한 `response.header.{resultCode,resultMsg}` /
  `response.body.{items,numOfRows,pageNo,totalCount}`와 정확히 일치, 데이터 0건이면 `items`가 빈
  문자열 `""`로 온다(우리 파서가 이미 처리하던 케이스와 일치).
- **에러 응답은 다른 최상위 구조**로 온다: `{"responseTime":"...","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(...)"}` — `response` 래퍼가 없다. 어댑터들은 오퍼레이션별로 개별
  try/catch로 파싱해, 하나의 오퍼레이션이 이 에러 구조로 응답해도 나머지가 죽지 않게 처리했다.

## 이번 구현에서 취한 조치 (2026-07-21, 체류/소비 코드 확인 후 2차 갱신)

- `Region.apiAreaCode`/`apiSigunguCode`(통계청 코드), `Region.tourApiAreaCode`(TourAPI 구코드) 3개
  필드로 두 코드 체계를 분리 저장한다.
- `TAR_SVC_DEM`, `TOU_DIV_IX` 어댑터를 확인된 실제 base URL·오퍼레이션·파라미터로 재작성했다.
- `TAR_SVC_DEM`의 체류(`tarSjrnDsIxCd=2103`)/소비(`tarExpDsIxCd=2201`) 코드 파라미터를 확인해 어댑터에
  반영, 라이브 동기화로 3개 지역 전부 실제 값이 정상 저장되는 것을 확인했다(데모 안정성을 위해 재시드로
  fixture 값 복원함 — 다양성과 달리 의미 대응은 정확하지만, 데모 발표용 고정값 유지를 위해 동일하게 처리).
- `TOUR_INFO` 어댑터를 `KorService2/areaBasedList2`로 재작성했으나, sync 파이프라인의 POI upsert
  연결은 아직 하지 않았다(fixture POI 유지).
- 다양성 지표의 "단일 연령대 비율 ≠ 종합 다양성 점수" 문제 때문에, 실 동기화가 자동으로 fixture 점수를
  의미가 다른 값으로 덮어쓸 수 있음을 문서화했다. 재계산 로직 구현 전까지는 `npm run sync:tourism-data`
  또는 Cron 실행 후 다양성 점수가 바뀔 수 있다는 점을 운영자가 인지해야 한다(operator-checklist.md).

## 다음 재검증 시 확인할 것 (사용자 수행)

1. `AreaTarDivService`의 `areaExpDivList`/`areaIntlDivList` 코드 파라미터명과, 다양성 재계산에 필요한
   `touDivIxCd` 전체 목록(연령대별 등)
2. 지역별 관광 자원 수요·방문자수 API의 실제 base URL·오퍼레이션명
3. 기초지자체 중심 관광지 및 연관 관광지 API의 정식 서비스명

(수요(Demand) 오퍼레이션명 확인은 완료 — Swagger UI로 `AreaTarDemDsService`에 체류/소비 2개 오퍼레이션만
있고 별도 수요 오퍼레이션은 없음을 확인함, 위 "서비스별 확인 상태" 1번 항목 참고.)

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
