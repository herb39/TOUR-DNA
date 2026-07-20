# 공공데이터 API 연동 현황

> 작성일: 2026-07-20, 2026-07-21 갱신. 2026-07-21에 실 서비스키(`TOUR_API_SERVICE_KEY`)를 발급받아
> "지역별 관광 수요 강도" API를 실제로 호출해 검증했다. 아래 "2026-07-21 실키 검증 결과" 섹션이
> 최신 확인 사실이며, 그 이전 섹션들은 실키 발급 전 웹 조사 결과(추정치)다.

## 2026-07-21 실키 검증 결과

**서비스**: 지역별 관광 수요 강도 (`AreaTarDemDsService`)

- **Base URL**: `https://apis.data.go.kr/B551011/AreaTarDemDsService` (data.go.kr 소개 페이지 URL이
  아니라 실제 게이트웨이 호출 주소는 이것임 — 처음에 소개 페이지 URL로 호출해 `invalid JSON response`
  오류를 겪었다)
- **오퍼레이션(확인됨)**:
  - `/areaTarSjrnDsList` → 체류 강도(Stay) 지수. `resultCode: 0000`, JSON 응답 정상 확인.
  - `/areaTarExpDsList` → 소비 강도(Spend) 지수. 마찬가지로 정상 확인.
- **오퍼레이션(미확인)**: 관광 서비스 수요(Demand) 지수의 오퍼레이션명. `areaTarSvcDemList`,
  `areaTarDemList`, `areaTarDemDsList`, `areaTarSvcDemDsList` 등을 시도했으나 전부 `API not found`.
  같은 서비스 안에 있을 수도, 없을 수도 있다 — Swagger UI에서 직접 확인 필요.
- **필수 파라미터**: `serviceKey`(일반 인증키/Decoding), `MobileOS`, `MobileApp`, `areaCd`, `baseYm`.
  `MobileOS`/`MobileApp`은 필수이며 빠지면 어떻게 응답하는지는 별도 확인하지 않았다(항상 포함해서 호출).
- **JSON 응답**: 기본은 XML이고, `_type=json`(밑줄 포함, `type=json`은 `INVALID_REQUEST_PARAMETER_ERROR`
  발생)을 붙여야 JSON으로 온다. 응답 스키마는 스펙이 가정한 `response.header.{resultCode,resultMsg}` /
  `response.body.{items,numOfRows,pageNo,totalCount}` 구조와 **정확히 일치**하고, 데이터가 없을 때
  `items`가 빈 문자열 `""`로 오는 것도 실제로 확인했다(우리 파서가 이미 이 케이스를 처리하고 있었음).
- **areaCd 코드 체계**: 서울(`areaCd=11`)로 호출했을 때 `resultCode: 0000`(정상)이 왔다. 11은 통계청
  행정표준코드의 서울특별시 시도 코드와 일치하므로, **이 API는 TourAPI의 areaCode(1~39)가 아니라
  통계청 행정표준코드 체계(시도 2자리)를 사용하는 것으로 보인다**(확정은 아님 — 우연히 유효 범위 안의
  숫자라 통과했을 가능성도 배제 못함). 대전=30, 충북=43, 강원특별자치도=51로 추정하고 테스트했으나
  해당 지역들도 포함해 아래 "데이터 0건" 문제 때문에 진위를 완전히 확인하지 못했다.
- **⚠️ 데이터 0건 문제**: `areaCd`∈{11(서울), 30(대전 추정), 3(대전, TourAPI 구식 코드 추정)},
  `baseYm`∈{202312, 202412, 202508, 202509, 202510, 202512, 202601, 202607}의 모든 조합에서
  `resultCode: 0000`(호출 성공)이지만 `totalCount: 0`(데이터 없음)이었다. 사용자가 준 예시 URL
  (서울, baseYm=202607) 자체도 0건이었다. 즉 **API 연동 자체는 정상이지만, 이 데이터셋에 실제로
  조회 가능한 데이터가 아직 없거나, 우리가 모르는 추가 필수 파라미터가 있을 가능성**이 있다.
  다른 파라미터 없이 순수 재시도로는 원인을 좁히지 못했다 — data.go.kr Swagger UI의 "OpenAPI 호출"
  버튼으로 실제 성공 예시(0건이 아닌)가 있는지 확인이 필요하다.
- **나머지 5개 API(다양성/자원수요/방문자수/국문관광정보/연관관광지)**: 같은 패턴(`Area{Xxx}Service`
  형태)으로 추정 호출을 시도했으나 전부 실패(`Unexpected errors` — 서비스명 자체가 틀렸을 가능성이
  높음). 각 API의 정확한 서비스명은 여전히 Swagger UI 확인이 필요하다.

이전(2026-07-20, 실키 발급 전) 웹 조사 결과는 아래에 그대로 남겨둔다.

## 확인된 사실

| API | 정식 서비스명 | data.go.kr 페이지 | 제공기관 | 확인 상태 |
|---|---|---|---|---|
| 1. 지역별 관광 수요 강도 | 한국관광공사_지역별 관광 수요 강도 | data.go.kr/data/15151868/openapi.do | 한국관광공사 | 등록/설명 확인, 스키마 미확인 |
| 2. 지역별 관광 다양성 | 한국관광공사_지역별 관광 다양성 | data.go.kr/data/15151365/openapi.do | 한국관광공사 | 등록/설명 확인, 스키마 미확인 |
| 3. 지역별 관광 자원 수요 | 한국관광공사_지역별 관광 자원 수요 | data.go.kr/data/15152138/openapi.do | 한국관광공사 | 데이터셋 존재만 확인 |
| 4. 지역별 방문자수 | 한국관광공사_빅데이터_지역별 방문자수_GW | data.go.kr/data/15101972/openapi.do | 한국관광공사 | 데이터셋 존재만 확인 (활용신청 2,835건, 등록 2022-07-01) |
| 5. 국문 관광정보 서비스 | 한국관광공사_국문 관광정보 서비스_GW | data.go.kr/data/15101578 | 한국관광공사 | 데이터셋 존재만 확인 |
| 6. 기초지자체 중심 관광지 및 연관 관광지 | (정확한 서비스명 미확인) | 미확인 | 한국관광공사 추정 | 미확인 |

API #1, #2는 등록일 2025-11월, 최종 수정일 2026-02-25로 동일 — 최근 개편 가능성이 있음. 갱신주기는 상세페이지에 "실시간"으로만 표기되어 있고, 실제 수록 기준월(baseYm)의 범위(언제부터 언제까지 데이터가 존재하는지)는 상세페이지 텍스트만으로는 확인할 수 없었다.

한국관광 데이터랩(datalab.visitkorea.or.kr)의 데이터 갱신주기 안내에 따르면 지역별 분석류 지표는 통상 "매월 17일에 전월 데이터"로 갱신되는 것으로 보이나, 이 표에 API #1/#2가 명시적으로 매핑되어 있는지는 확인하지 못했다.

## 미확인 항목 (반드시 실 키 발급 후 재검증)

1. **필드명**: 스펙에서 후보로 제시된 `tarSvcDemIxCd`, `tarSvcDemIxVal`, `tarSjrnDsIxCd`, `tarSjrnDsIxVal`, `tarExpDsIxCd`, `tarExpDsIxVal`, `touDivIxCd`, `touDivIxVal`는 웹 검색·GitHub 코드 검색 어디에서도 발견되지 않았다. **실제 존재 여부가 검증되지 않은 placeholder 코드**로 취급한다.
2. **엔드포인트 baseUrl/operation 경로**: 예) `getAreaBasedList` 형태의 오퍼레이션명, 실제 요청 URL 구조 — 미확인.
3. **areaCd 코드 체계**: 통계청 행정표준코드(5자리)인지, TourAPI의 areaCode(시도, 1~39)+sigunguCode(시군구) 2단계 체계인지 텍스트 조사로 확정하지 못함. 대전광역시/제천시/양양군의 정확한 공식 코드값도 미확인.
4. **응답 JSON 스키마**: `response.header.resultCode/resultMsg`, `response.body.items.item` 구조가 실제로 이 6개 API에도 동일하게 적용되는지는 공공데이터포털의 일반적 관행(TourAPI 계열 공통 패턴)으로 추정만 하고 있으며 실제 응답으로 확인되지 않았다.
5. **기초지자체 중심 관광지 및 연관 관광지 API**: 정확한 정식 서비스명, data.go.kr 페이지 자체가 미확인.
6. 현재 실제로 제공되는 최신 baseYm(예: 2026년 몇 월까지 있는지)이 스펙이 가정한 `202509`와 일치하는지.

## 이번 구현에서 취한 조치

- 위 6개 미확인 필드명/코드는 어댑터·정규화 계층에서 **불투명한 문자열(opaque string)**로만 다룬다. 즉 도메인 엔진(`src/lib/domain/dna.ts`)은 특정 필드명에 하드코딩 의존하지 않고, `metricCode: string` 키로 넘겨받은 값만으로 동작하므로 실제 필드명이 확정되면 어댑터 매핑 테이블 한 곳(`src/lib/public-data/adapters/*`)만 수정하면 된다.
- Region 모델에 내부 식별자(`code`)와 별도로 `apiAreaCode`/`apiSigunguCode`를 두어, 실제 코드 체계가 확정되기 전까지는 null로 두고 fixture 기반 시연에는 영향이 없게 했다.
- `DATA_MODE`를 `snapshot`으로 두면 라이브 API 호출 자체를 생략하고 fixture/DB에 적재된 정규화 데이터만으로 전체 데모가 가능하다.
- 실 키 발급 후 재검증 절차는 [operator-checklist.md](operator-checklist.md)에 별도 항목으로 기록한다.
- `TAR_SVC_DEM` 어댑터(`src/lib/public-data/adapters/tarSvcDem.ts`)는 2026-07-21 검증 결과를 반영해
  실제 확인된 두 오퍼레이션(체류/소비)을 병렬 호출하도록 갱신했다. 수요(Demand) 오퍼레이션과 나머지
  5개 API는 여전히 미확인 상태이며, `apiAreaCode`가 null인 동안 sync는 모든 지역을 안전하게 건너뛴다
  (fixture 기반 데모에는 영향 없음).

## 다음 재검증 시 확인할 것 (사용자 수행)

1. data.go.kr Swagger UI에서 "지역별 관광 수요 강도"의 전체 오퍼레이션 목록을 확인 — 수요(Demand)
   지수를 반환하는 오퍼레이션명 특정.
2. 같은 Swagger UI에서 **0건이 아닌 성공 예시**가 있는지 확인(우리가 시도한 8개 baseYm × 3개 areaCd
   조합은 전부 0건이었다). 있다면 그 예시의 정확한 파라미터(특히 areaCd 값)를 그대로 복사해서 전달.
3. 나머지 5개 API도 Swagger UI에서 정확한 서비스명(`Area{Xxx}Service` 형태로 추정)과 오퍼레이션명 확인.
