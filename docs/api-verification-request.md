# API 검증 요청 (사용자 확인 필요, 2026-07-23 REVIEW_ONLY 재검증)

마스터 프롬프트 3-1 원칙에 따라, 아래 항목은 엔드포인트·파라미터·필드 의미를 추측하지 않고 사용자의
실제 신청/Swagger 확인을 기다린다. `docs/public-api-status.md`에 이미 기록된 내용을 지정과제 매핑
관점에서 재정리했으며, 새로 추측한 URL/코드는 없다.

## 1. 지역별 관광 자원 수요 — 문화자원 수요 코드값 미확인

```text
API 이름: 지역별 관광 자원 수요 (AreaTarResDemService)
공공데이터포털 데이터 ID: 15152138
테스트 날짜: 2026-07-21 (사용자 실키 검증)
요청 URL: https://apis.data.go.kr/B551011/AreaTarResDemService/areaCulResDemList?serviceKey=[REDACTED]
요청 파라미터: MobileOS, MobileApp, baseYm, areaCd, signguCd, culResDemIxCd, _type=json (serviceKey 제외)
HTTP 상태: 200 (요청 자체는 성공하지만 culResDemIxCd 값 후보 1101~1110 등 다수 시도 전부 0건)
resultCode/resultMsg: 정상 응답 구조(에러 아님), items만 빈 문자열
응답 items 1~3개: 없음(0건)
Swagger에 표시된 필드 설명/단위: 미확인 — Swagger UI 접근 시 파라미터명(culResDemIxCd)은 확인되나 코드표 없음
최신 데이터 기준일 또는 제공 기간: 미확인
코드표 또는 공식 문서 링크: https://www.data.go.kr/data/15152138/openapi.do (제공기관 문의 필요할 수 있음)
```

**막힌 기능**: `METRIC_CODES.DEMAND_RESOURCE`(문화자원수요)에 실제 값을 채울 수 없어 계속 `MISSING` 처리.
Demand 축이 서비스수요(`tarSvcDemIxVal`)와 방문자수 증감률만으로 계산됨(코드 변경 불필요, 정보만 있으면 됨).

## 2. 지역별 방문자수 API — 서비스명/엔드포인트 미확인

```text
API 이름: 한국관광공사_빅데이터_지역별 방문자수_GW (추정 명칭, 확정 아님)
공공데이터포털 데이터 ID: 15101972
테스트 날짜: 2026-07-20~21 (웹 조사만, 실키 호출 미시도)
요청 URL: 미확인 — https://www.data.go.kr/data/15101972/openapi.do 소개 페이지 URL로 직접 호출 시 invalid JSON response(게이트웨이 주소 아님)
요청 파라미터: 미확인
HTTP 상태: 해당 없음
resultCode/resultMsg: 해당 없음
응답 items 1~3개: 없음
Swagger에 표시된 필드 설명/단위: 미확인
최신 데이터 기준일 또는 제공 기간: 미확인
코드표 또는 공식 문서 링크: https://www.data.go.kr/data/15101972/openapi.do
```

**막힌 기능**: `visitorCnt`(현재/이전 월 방문자수, Demand 축 보조지표)가 fixture 추정치로 남아 있음.
Phase 1 완료 후에도 이 지표는 `ESTIMATED` 상태를 유지해야 한다(3-3절 규칙). Swagger UI에서 정확한
base URL·오퍼레이션명·응답 필드를 확인해 주시면 어댑터를 작성한다.

## 3. 기초지자체 중심 관광지 및 연관 관광지 API — 정식 서비스명 미확인

```text
API 이름: 미확인 (한국관광공사 제공 추정)
공공데이터포털 데이터 ID: 15128559(중심 관광지) / 15128560(연관 관광지) — 마스터 문서 3-2절 기재값, 실제 존재 여부 미대조
테스트 날짜: 미시도
요청 URL: 미확인
요청 파라미터: 미확인 — hubTatsCd/tAtsCd/rlteTatsCd 등 공식 ID 필드명도 미확인
HTTP 상태: 해당 없음
resultCode/resultMsg: 해당 없음
응답 items 1~3개: 없음
Swagger에 표시된 필드 설명/단위: 미확인
최신 데이터 기준일 또는 제공 기간: 미확인(2025년 개편으로 과거 기간 한정 데이터일 가능성 — 3-3절)
코드표 또는 공식 문서 링크: 위 데이터 ID 페이지에서 최신 공고 확인 필요
```

**막힌 기능**: `PoiRelation` 모델은 schema에 존재하지만, 현재 `src/lib/public-data/adapters/poiRelation.ts`가
실제로 이 미확인 API를 호출하는지 코드 확인이 REVIEW_ONLY 범위에서 완료되지 않았다(다음 Phase 착수
시 재확인 필요). Network 축 evidence를 `POI_RELATION`/`CURATED`로 분리하려면(Phase 1-3) 이 API의
실제 성공 응답 또는 "확인 불가로 CURATED만 사용" 결정이 먼저 필요하다.

## 4. 사용자 확인 대기 중 진행 가능한 항목

위 3개 API가 막혀 있어도 아래는 **독립적으로 진행 가능**하다(마스터 문서 3-4절 "독립적인 Phase는
계속 진행할 수 있다"):

- Phase 1의 provenance 모델 추가·`isSnapshotFallback` 하드코딩 제거 — 이미 확인된 지표(체류/소비/
  다양성/서비스수요/POI)만으로도 `LIVE_API`/`ESTIMATED` 구분을 정확히 표시할 수 있다.
- Phase 3(결정론), Phase 4(role/nationality/테마), Phase 6(재분석), Phase 7(코호트 설명), Phase 8
  (사이트 잠금 제거), Phase 9~11(운영/CI) — 모두 위 3개 API와 무관하다.
- Phase 5(홍보 초안)는 새 API가 필요 없다(기존 Evidence만 사용).

## 5. 이미 검증 완료되어 재확인 불필요한 항목 (참고)

`docs/public-api-status.md`에 실키로 검증 완료된 것으로 기록된 항목 — 이번 REVIEW_ONLY에서 재검증
요청하지 않는다: 지역 코드 체계(통계청/TourAPI 2종), `AreaTarDemDsService`(체류/소비), `AreaTarDivService`
(다양성 전체 코드), `AreaTarResDemService/areaTarSvcDemList`(서비스수요), `KorService2/areaBasedList2`
(POI). 단, "검증 완료"는 2026-07-21 시점 기록이며 data.go.kr 정책이 그 사이 바뀌었을 가능성은 사용자가
재확인해야 한다(REVIEW_ONLY는 코드 재실행을 하지 않았으므로 실시간 재확인은 아님).
