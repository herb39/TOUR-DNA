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

### 지역 코드 검증 자동화 (2026-07-21, `scripts/verify-region-codes.ts`)

지금까지는 새 지역을 추가할 때마다 사람이 직접 curl로 후보 코드를 호출하고 JSON 응답의 `areaNm`/
`signguNm`을 눈으로 읽어 맞는지 확인했다(그 과정에서 해운대구→강서구, 통영시 코드 오답 등 여러 번
잘못된 코드가 반환된 걸 사후에 발견한 적이 있다). `npm run verify:region -- --name <지역명> \
--area-cd <시도2자리> --signgu-cd <시군구5자리> --tour-api-area-code <구코드>`로 이 확인을 자동화했다 —
통계청 코드는 `AreaTarDivService/areaTouDivList` 응답 원본을, TourAPI 코드는 `KorService2/areaCode2`
(전체 시/도 코드→명칭 목록, 추측이 아닌 원본 목록)를 그대로 출력한다. 최종 판단(이름이 실제로 일치하는지)은
여전히 사람이 하지만 API 호출·파싱은 반복하지 않아도 된다.

이 스크립트를 만들며 `areaCode2` 전체 목록을 실제로 받아봤고, 그 결과 이전에 "확인 안 됨"으로 남겨뒀던
전북 지역 TourAPI 구코드가 **37(전북특별자치도)**임을 확인했다(이전에 시도했던 45xxx/52xxx는 통계청
코드 체계와 TourAPI 코드 체계를 혼동한 잘못된 추측이었다). 전라남도는 38이다. 참고로 전체 목록:
서울=1, 인천=2, 대전=3, 대구=4, 광주=5, 부산=6, 울산=7, 세종특별자치시=8, 경기도=31,
강원특별자치도=32, 충청북도=33, 충청남도=34, 경상북도=35, 경상남도=36, 전북특별자치도=37,
전라남도=38, 제주특별자치도=39.

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
- `/areaBasedList2`(지역기반 목록): 대전(구 코드 areaCode=3, 2026-07-21 확인 당시 기준)에서 실제
  POI("갑천" 등) 정상 조회 확인. **2026-07-27 신 법정동·분류체계로 전환**(아래 별도 절 참고) — 이
  줄의 `areaCode=3`은 전환 이전에 확인했던 구 코드 값을 남긴 역사 기록이며, 신규 요청은 더 이상 이
  값을 쓰지 않는다.
- `contentTypeId`(공식 문서 기준): 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠,
  32=숙박, 38=쇼핑, 39=음식점 → `PoiCategory` 매핑(`mapContentTypeToPoiCategory`, 25=여행코스는
  개별 장소가 아니라서 제외). 신구 법정동·분류체계 전환과 무관 — 변경 없음.

**4-A) KorService2 구→신 법정동·분류체계 전환 (2026-07-27 전환, 2026-07-28 실 코드값 확인 완료)**
- **구 중단**: `areaCode`/`sigunguCode`(요청 파라미터)와 `cat1`/`cat2`/`cat3`(응답 필드)는 신규
  요청/응답 어디에도 더 이상 쓰지 않는다(`src/lib/public-data/adapters/tourInfo.ts`). 구 값은
  `LEGACY_*` 이름으로 남겨 **구형 저장 데이터(rawPayload) 재조회 전용**으로만 참조한다.
- **신규 사용**: 요청 파라미터 `lDongRegnCd`(법정동 시도)·`lDongSignguCd`(법정동 시군구), 응답 필드
  `lclsSystm1~3`(신 분류체계 대/중/소분류). `Region.tourApiLdongRegnCd`/`tourApiLdongSignguCd`
  (nullable, migration `20260727010000_add_tour_api_ldong_codes`)가 지역별 코드를 저장한다.
- ✅ **실 서비스키로 코드값 확인 완료(2026-07-28)**: `ldongCode2`/`lclsSystmCode2`/`areaBasedList2`를
  직접 호출해 확인했다(이전 세션의 401은 승인되지 않은 키였던 것으로 판명 — 새로 발급받은 승인된 키로
  재시도해 정상 응답을 받았다).
  - **법정동 코드**: `lDongRegnCd`(시도)는 기존 통계청 `apiAreaCode`와 **완전히 동일한 2자리 코드
    체계**임을 확인했다(예: 충남=44, 강원=51, 경북=47). `lDongSignguCd`(시군구)는 기존 통계청
    `apiSigunguCode`(5자리)의 뒤 3자리와 정확히 같다(예: 제천시 `43150` → `150`). `REGION_SEED`
    (`src/lib/fixtures/regions.ts`) 13개 지역 전부에 실제 값을 반영했다 — `areaBasedList2`에
    `lDongRegnCd=43&lDongSignguCd=150`을 요청해 실제로 충북 제천시 항목만 반환되는 것으로 재검증.
  - **신 분류체계**: `lclsSystmCode2`로 FD(음식) 대분류 하위 중분류 5개(FD01 한식/FD02 외국식/FD03
    간이음식/FD04 주점/FD05 카페·찻집)와 소분류 21개를 전부 확인했다 — 구 `cat3`(7개)보다 훨씬
    세분화됐고, 구 체계에 없다고 알려졌던 제과(베이커리/디저트) 전용 코드(`FD030100`)가 별도로
    존재한다(간이음식 하위, 카페 하위가 아님 — 식사 불가 그룹으로 분류). 전체 코드는
    `src/lib/public-data/adapters/tourInfo.ts`의 `FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3` 참고.
  - **실 응답 확인**: `areaBasedList2` 실 호출에서 구 필드(`areacode`/`sigungucode`/`cat1~3`)는 전부
    빈 문자열로 오고, 신 필드(`lDongRegnCd`/`lDongSignguCd`/`lclsSystm1~3`)에 실제 값이 채워져
    있음을 확인했다 — 신 체계 전환이 실제 운영 API 응답과 일치한다.
  - **참고**: `npm run verify:region -- --ldong-regn-cd <코드>` / `--lcls-systm1 <대분류>`로 위와
    동일한 조회를 재현할 수 있다(향후 새 지역 추가 시 재사용).
- ✅ **POI upsert 파이프라인 연결 완료(2026-07-21)**: `syncService.ts`가 이제 실제로 지역당 최대
  100건까지 조회해 `Poi` 테이블에 upsert한다. **큐레이션된 FIXTURE POI는 절대 덮어쓰지 않는다** —
  이름이 겹치면 라이브 데이터(운영시간/휴무일 정보 없음)가 데모용 큐레이션 정보를 지울 수 있어, 기존
  레코드가 `sourceType=FIXTURE`이면 건너뛴다. 실제 동기화로 3개 지역 총 281건의 실제 장소가 새로 반영된
  것을 확인했다(기존 fixture 23건은 그대로 유지).

**5) 지역별 방문자수** — 여전히 미확인. `https://www.data.go.kr/data/...` 소개 페이지 URL로 호출하면
`invalid JSON response`(게이트웨이 주소가 아님). `Area{Xxx}Service` 패턴을 추정 시도했으나 확인하지
못했다. Swagger UI 확인 필요.

**5-A) VISITOR_CNT 동기화 실패 원인 재확인(2026-07-27, TourAPI 마이그레이션 이후 첫 운영 동기화에서 재현)**
- 위 5)에서 이미 지목한 원인(baseUrl이 게이트웨이가 아닌 소개 페이지)이 2026-07-27 실제 운영 동기화
  오류 로그로 다시 확인됐다 — 마지막 성공 스냅샷은 여전히 2026-07-21(그 이후 매 시도가 동일하게
  실패, `syncService.ts`의 기존 SUCCESS 보존 정책으로 갱신되지 않고 그대로 유지됨).
- **코드 개선(원인 자체는 해소하지 못함)**: `src/lib/public-data/client.ts`에 `classifyNonJsonBody()`
  추가 — JSON 파싱 실패 응답을 EMPTY/HTML/XML/UNKNOWN으로 분류해 로그·`DataSnapshot.resultMsg`에
  남긴다(본문 원문은 남기지 않음). HTML로 분류되면(=baseUrl이 게이트웨이가 아니라는 강한 신호) 같은
  요청을 재시도해도 결과가 같을 것이므로 재시도 없이 즉시 실패 처리해 불필요한 반복 호출을 줄인다
  (EMPTY/XML은 일시적일 수 있어 기존처럼 재시도).
- **여전히 미해결**: 실제 REST 게이트웨이 주소·오퍼레이션명은 이번에도 확인하지 못했다 — Swagger
  문서(가이드 PDF/TourAPI_Guide zip, data.go.kr 상세 페이지 참고) 확인 없이 `Area{Xxx}Service` 패턴을
  추측해 코드에 넣지 않는다(잘못된 주소를 또 하드코딩하는 위험을 피하기 위함). `src/lib/fixtures/
  dataSources.ts`의 VISITOR_CNT 항목에 이 결론을 주석으로 남겼다.
- **TOU_DIV_IX는 실제로는 정상**: 같은 동기화 실행에서 `TOU_DIV_IX:exp attempt 0 aborted` 로그가
  1건 있었으나, 이는 13개 하위 코드 호출 중 1건의 일시적 타임아웃이며 기존 재시도 로직(`maxRetries=2`)
  으로 자동 복구됐다 — 같은 실행에서 7개 지역 전부 `itemCount=13`(만점)으로 SUCCESS 확인됨. 코드
  결함이 아니므로 별도 수정을 하지 않았다.

**5-B) VISITOR_CNT 실제 API 구조 확인 및 전면 재작성(2026-07-28)**
- 5)/5-A)에서 미확인이던 실제 게이트웨이가 확인됐다: **한국관광공사_빅데이터_지역별 방문자수(DataLabService)**,
  base `https://apis.data.go.kr/B551011/DataLabService`. 시군구 분석은 `/locgoRegnVisitrDDList`
  (`signguCode`), 광역시도 분석은 `/metcoRegnVisitrDDList`(`areaCode`) — 별개 오퍼레이션이며, 광역 값을
  시군구 합산으로 만들지 않는다.
- 이 API는 **지역 필터 파라미터가 없다** — `startYmd`/`endYmd`(baseYm의 1일~말일)만으로 전국 응답을
  받아 우리 쪽에서 `signguCode`/`areaCode`로 Region과 매핑한다(`syncService.ts`가 지역마다 반복 호출하지
  않고 이번 baseYm에 대해 시군구/광역 각 1회만 조회 — `region.apiSigunguCode`/`apiAreaCode`로 매핑,
  통계청 행정표준코드 체계와 동일한 코드값임을 전제로 한다).
- `touDivCd`: 1=현지인, 2=외지인, 3=외국인. **VISITOR_CNT는 외지인+외국인 합계**로 재정의했다(이전의
  "필드 의미 미확인이라 ESTIMATED 고정" 처리를 제거 — 이제 실제 성공 응답은 `LIVE_API`로 기록한다).
  현지인 합계는 버리지 않고 `METRIC_CODES.VISITOR_CNT_LOCAL`(`visitorCntLocal`)로 별도 저장한다.
- `touNum`은 소수로 올 수 있어(빅데이터 추정치) 반올림하지 않고 number 그대로 합산한다. 월간 수치는
  월간 순방문자수가 아니라 `baseYmd`(일자)별 값의 월간 합계다(원본 API 자체의 산출 방식).
- `body.totalCount`/`numOfRows` 기준으로 전체 페이지를 조회한다(`fetchAllPages`, 페이지 하나라도
  실패하면 불완전한 월간 합계를 SUCCESS로 오기록하지 않도록 전체를 ERROR 처리). `resultCode`가 정확히
  `"0000"`인 경우만 성공으로 처리하고, EMPTY(성공이지만 0건)와 ERROR를 구분해 기존 SUCCESS 스냅샷을
  ERROR로 덮어쓰지 않는다(`upsertVisitorCntForRegion`이 다른 소스와 동일한 preserve 정책을 따른다).
- 모든 요청에 `_type=json`을 포함해 JSON만 파싱한다(XML 파서는 추가하지 않음).
- `DataSnapshot.rawPayload`는 전국 원본 전체가 아니라 그 지역 코드에 해당하는 실제 응답 행만 추려
  저장한다(가공 없이 그대로, 지역마다 전국 데이터를 중복 저장하지 않기 위함).

**5-C) VISITOR_CNT 최신 완전 기준월 탐색 · 지역 코드 감사 · 저장 게이트(2026-07-28)**

- **최신 완전 기준월 탐색**(`src/lib/services/visitorBaseYmFinder.ts`의 `findLatestCompleteVisitorBaseYm`):
  - 진행 중인 이번 달은 절대 선택하지 않는다. 직전 달부터 과거 방향으로 최대 6개월만 확인한다
    (`lookbackCandidates`).
  - "완전한 월"의 조건: 기초지자체(`locgoRegnVisitrDDList`)·광역지자체(`metcoRegnVisitrDDList`) 응답이
    모두 SUCCESS이고, 그 baseYm의 1일~말일에 해당하는 `baseYmd`가 하나도 빠짐없이 존재해야 한다
    (`src/lib/services/visitorMonthCompleteness.ts`). 페이지 일부 실패·날짜 일부 누락·EMPTY·ERROR는
    전부 불완전으로 취급하고, 기초/광역 둘 중 하나만 불완전해도 그 달 전체를 건너뛴다.
  - 월간 수치는 월간 "순"방문자수가 아니라 baseYmd(일자)별 값의 합계이므로, 날짜 커버리지가 이 전제가
    성립하는 최소 조건이다(§5-B 참고).
  - 캐시 우선: 새 watermark 테이블을 만들지 않고 기존 `DataSnapshot`을 그대로 재사용한다 —
    `checkVisitorCntCacheViaDataSnapshot()`이 "이 baseYm에 대해 필요한 지역 전부가 이미
    SUCCESS/EMPTY로 저장돼 있는지"를 확인해 참이면 API 호출 없이 즉시 `CACHED`를 반환한다(일일 호출
    한도 절약).
  - 반환 상태는 `LIVE_COMPLETE`(실제 API로 확인한 최신 완전 기준월) / `CACHED`(기존 캐시 사용) /
    `NONE_AVAILABLE`(6개월 내 사용 가능한 달 없음) / `API_ERROR`(탐색 도중 API 오류로 중단, 같은
    문제가 반복될 수 있어 더 과거 달을 시도하지 않고 즉시 중단) 4가지로 구분되며, 완전한 월을 찾지
    못하면 임의의 baseYm이나 seed 값을 LIVE_API로 위장해 반환하지 않는다. 개별 후보가 왜 불완전했는지는
    `checked[].reason`(`LOCGO_ERROR`/`LOCGO_EMPTY`/`LOCGO_INCOMPLETE_DATES`/`METCO_ERROR`/
    `METCO_EMPTY`/`METCO_INCOMPLETE_DATES`)으로 남는다.

- **동기화 저장 게이트**(`syncService.ts`의 `syncVisitorCnt`): 실제 동기화 시 기초/광역 응답이 SUCCESS인데
  날짜가 일부 누락됐으면(예: 페이지 일부 실패) 그 응답을 조용히 ERROR로 바꿔치기해 기존 ERROR-보존
  경로를 그대로 태운다 — 불완전한 월간 합계가 정상값을 덮어쓰지 않는다. ⚠️ 최초 구현(위 내용)은
  기초·광역을 독립적으로 게이트해 "한쪽만 완전하면 그쪽만 저장"하는 결함이 있었다 — 아래 §5-D에서
  원자적 게이트(`enforceCombinedDateCompleteness`)로 수정했다. 캐시 확인 함수의 위치·완전성 마커도
  §5-D 참고.

- **Region 행정구역 코드 감사**(`src/lib/services/regionCodeAudit.ts`의 `auditRegionCodes`): 지역명
  문자열 비교로 자동 매핑하지 않고 행정구역 코드(문자열, 앞자리 0 보존)를 기준으로 Region과 실제 API
  응답 코드를 대조한다. `apiAreaCode`는 SIDO 사이에서만 유일해야 한다고 본다 — 같은 SIDO의 여러
  SIGUNGU가 부모의 2자리 시도 코드를 공유하는 것은 정상 구조이기 때문이다(그렇지 않으면 대량의
  오탐이 난다). `apiSigunguCode`는 SIGUNGU 전체에서 유일해야 한다. 강릉시(`SGG_GANGNEUNG`)·
  경주시(`SGG_GYEONGJU`)·제천시(`SGG_JECHEON`)는 대표 시나리오로 별도 하이라이트한다.

- **검증/감사 CLI**(모두 `TOUR_API_SERVICE_KEY` 환경변수 필요, 값은 어떤 로그에도 남기지 않고 URL에
  포함될 때도 마스킹한다 — `src/lib/public-data/urlMasking.ts`):
  - `npm run verify:visitor-api` — 인증키 설정 여부, 기초/광역 API 성공 여부·resultCode·totalCount·
    페이지 수·수집된 기준일자 범위, touDivCd 1/2/3 존재 여부, touNum 소수 보존 여부, 최신 완전 기준월
    후보와 제외된 달의 사유, 총 API 호출 횟수를 출력한다.
  - `npm run audit:region-codes [-- --base-ym 202606]` — 전체 Region 수, 정상 매핑 수, 코드 누락/중복/
    형식 오류 목록, API에만 있는 코드, Region에만 있는 코드, 강릉·경주·제천 매핑 상태를 출력한다.
  - `npm run sync:visitor -- --baseYm=YYYYMM [--force-current-month]` — VISITOR_CNT만 동기화한다(다른
    5개 소스는 건드리지 않음). YYYYMM 형식을 검증하고, 진행 중인 이번 달은 기본적으로 거부한다. 전국
    시군구/광역 응답을 baseYm당 한 번씩만 조회하고, 날짜 커버리지가 불완전하면 저장을 건너뛴다. 동일
    baseYm으로 재실행해도 unique key(`regionId+baseYm+metricCode`, `dataSourceId+regionId+baseYm`)
    upsert라 중복 레코드가 생기지 않는다.

**5-D) 검증에서 발견된 결함 수정(2026-07-29)**

§5-C 구현을 실제로 검증하는 과정에서 아래 결함이 발견되어 수정했다.

- **DB 결합 제거**: `checkVisitorCntCacheViaDataSnapshot`이 `visitorBaseYmFinder.ts`에 함께 있어, 이
  파일을 import하기만 해도 `@/lib/db`가 로드되고(DATABASE_URL 없으면 즉시 throw) DATABASE_URL 없이는
  순수 탐색 로직조차 단위테스트할 수 없었다. DB 전용 모듈 `src/lib/services/visitorCntCacheStore.ts`로
  분리해, `visitorBaseYmFinder.ts`는 이제 `@/lib/db`를 전혀 참조하지 않는다. `verify:visitor-api`도
  DB를 쓰지 않으므로 DATABASE_URL 없이 실행된다(정적 검사로 확인, `tests/unit/dbFreeModules.test.ts`).
- **원자적 저장 게이트**: 기존 구현은 기초(locgo)·광역(metco)을 각각 독립적으로 `enforceDateCompleteness`
  에 통과시켜, "한쪽만 완전하면 완전한 쪽은 저장한다"는 의도치 않은 동작이 있었다. `syncVisitorCnt`가
  이제 두 응답을 함께 평가해, 하나라도 불완전하면 기초·광역 **양쪽 모두** 저장을 건너뛴다. ⚠️ 이때
  구현한 방식(완전성 검증 실패를 합성 ERROR 객체로 만들어 기존 ERROR-preserve 경로에 태우는 방식)에
  기존 스냅샷이 없는 지역에서도 신규 ERROR `DataSnapshot`을 만들어버리는 잔여 결함이 있었다 — 아래
  §5-E에서 저장 함수 자체를 호출하지 않는 early return 방식으로 다시 고쳤다.
- **캐시 완전성 마커**: 완전성 검사 도입 이전에 저장된 SUCCESS 스냅샷을 캐시로 잘못 신뢰하는 문제를
  막기 위해, `syncVisitorCnt`가 저장하는 `DataSnapshot.rawPayload`에 `completeMonthVerified: true`를
  남긴다(Prisma schema 변경 없음). `checkVisitorCntCacheViaDataSnapshot`은 이제 지역 수 일치뿐 아니라
  이 마커가 전부 있는지도 확인하고, 마커가 없는 과거 스냅샷은 캐시 미확인으로 처리해 라이브로
  재검증한다.
- **verify:visitor-api 재호출/카운트 수정**: 최신 완전 기준월을 찾은 뒤 상세 보고를 위해 같은 baseYm을
  또 조회하던 중복 호출을 제거했다(`findLatestCompleteVisitorBaseYm`이 LIVE_COMPLETE일 때 그 baseYm의
  locgo/metco 원본 결과를 함께 반환하고, `src/lib/services/visitorApiVerification.ts`가 그대로
  재사용한다). "총 API 호출 횟수"도 어댑터 함수 호출 횟수가 아니라 `globalThis.fetch`를 감싼 실제 HTTP
  요청 수로 정확히 센다(어댑터 1회 호출이 페이지네이션으로 여러 요청을 만들 수 있기 때문).
- **Region 코드 감사 오류 범위 처리**: 기초/광역 API 중 하나가 ERROR면 그 범위의 코드 집합을 빈 Set으로
  넘겨 "Region에만 존재"로 대량 오탐을 내던 문제를 고쳤다. 이제 ERROR면 해당 범위에 `null`을 넘기고,
  `auditRegionCodes`는 그 범위의 API_ONLY/REGION_ONLY 판정을 생략한 뒤 `areaCodeVerificationSkipped`/
  `signguCodeVerificationSkipped`로 "검증 불가"임을 명시한다(종료 코드도 실패로 표시). 최신월 탐색이
  API_ERROR로 끝났을 때 같은 실패 달을 감사 스크립트가 또 호출하던 것도 제거했다(API_ERROR면 재시도 없이
  중단).
- **MAX_PAGES 초과 처리**: `totalCount` 기준으로 필요한 페이지가 안전 상한(500페이지)을 넘으면, 이전에는
  500페이지까지만 받고 SUCCESS로 반환해 나머지가 빠진 부분 합계가 정상 응답처럼 저장될 위험이 있었다.
  이제 상한 초과를 감지하면 첫 페이지 응답만으로 즉시 `TOO_MANY_PAGES` ERROR를 반환하고 나머지 페이지는
  요청하지 않는다.

**5-E) 원자적 게이트 잔여 결함 및 후속 페이지 EMPTY 처리(2026-07-29 2차 수정)**

직접 검증(테스트 528개 실행)에서 §5-D의 "원자적 저장 게이트" 수정 자체에 남아있던 결함과 그 외 문제가
추가로 발견되어 수정했다.

- **불완전 시 신규 스냅샷 생성 금지**: §5-D의 1차 수정은 완전성 검증에 실패하면 locgo/metco를 합성
  ERROR 객체(`resultCode: "INCOMPLETE_MONTH"`, 합성 `rawPayload`)로 바꿔치기해 기존
  `upsertVisitorCntForRegion`의 ERROR-preserve 경로를 그대로 태우게 했는데, 이 경로는 "기존 스냅샷이
  없으면 이번 ERROR 본문을 그대로 새로 저장한다"는 정책(다른 소스와 동일)이라 기존 스냅샷이 없는
  지역에서도 신규 ERROR `DataSnapshot` 행이 만들어지는 결함이 있었다(실제로는 아무 응답도 유효하지
  않은데 그럴듯한 합성 원문을 저장 함수에 넘긴 셈). `enforceCombinedDateCompleteness`는 이제 판정
  결과만(`complete: boolean`, 완전할 때만 `locgo`/`metco` 포함) 반환하고, `syncVisitorCnt`가 `complete`
  가 `false`면 저장 함수(`upsertVisitorCntForRegion`) 자체를 호출하지 않는 early return을 한다
  (`reportVisitorCntIncomplete`가 대신 SyncSourceResult만 FAILED로 보고하고, 기존 LIVE_API metric이
  있으면 CACHED_API로만 낮춘다 — DataSnapshot은 절대 새로 쓰지 않는다).
- **후속 페이지 EMPTY 처리**: `fetchAllPages`가 첫 페이지 `totalCount` 기준으로 더 받아야 하는데 2번째
  이후 페이지가 EMPTY로 오면, 이전에는 그 페이지를 빈 배열로 취급하고 계속 진행해 최종적으로 SUCCESS를
  반환했다 — 부분 응답이 완전한 응답처럼 저장될 위험이 있었다. 이제 후속 페이지가 EMPTY면 즉시
  `PARTIAL_PAGE_EMPTY` ERROR로 중단하고(이미 받은 페이지까지만 `rawPages`에 보존), 그 이후 페이지는
  요청하지 않는다.
- **테스트 보정**: `syncService.test.ts`의 기존 성공 테스트들이 locgo만 완전한 값으로 mock하고 metco는
  기본값(ERROR)로 남아 있어 원자적 게이트가 정상적으로 저장을 막고 있었다 — 두 응답 모두 해당 월 전체
  날짜를 가진 SUCCESS mock을 설정하도록 고쳤다(`fullMonthRawItems`를 codeField로 매개변수화해
  locgo/metco 공용으로 정리). DB 미결합 테스트는 파일 전체에서 `@/lib/db`/`prisma` 부분 문자열을 찾아
  그 사실을 설명하는 주석 자체까지 위반으로 오인했다 — 실제 import 선언(`from "..."`)만 검사하도록
  고치고, DATABASE_URL을 제거한 상태로 `visitorBaseYmFinder.ts`를 동적 import해 성공하는 테스트를
  추가했다. Region 코드 감사 테스트는 한쪽 범위(API 오류)의 판정 생략을 확인하면서 반대쪽 정상 범위의
  탐지 결과까지 없어야 한다고 잘못 기대하고 있었다 — 범위별로 분리해서 검증하도록 고쳤다.

**6) 기초지자체 중심 관광지 및 연관 관광지** — 정식 서비스명 자체가 여전히 미확인.

### 공통으로 확인된 사항

- 필수 파라미터: `serviceKey`, `MobileOS`, `MobileApp`, `baseYm`(지표 API), `areaCd`+`signguCd`(통계청
  코드 API) 또는 `lDongRegnCd`(KorService2, 2026-07-27부터 — 구 `areaCode`는 중단). JSON 응답은
  `_type=json`(밑줄 포함) 필요, 기본은 XML.
- 성공 응답 구조는 스펙이 가정한 `response.header.{resultCode,resultMsg}` /
  `response.body.{items,numOfRows,pageNo,totalCount}`와 정확히 일치, 데이터 0건이면 `items`가 빈
  문자열 `""`로 온다(우리 파서가 이미 처리하던 케이스와 일치).
- **에러 응답은 다른 최상위 구조**로 온다: `{"responseTime":"...","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(...)"}` — `response` 래퍼가 없다. 어댑터들은 오퍼레이션별로 개별
  try/catch로 파싱해, 하나의 오퍼레이션이 이 에러 구조로 응답해도 나머지가 죽지 않게 처리했다.

## 2026-08-07 지역 확장(Batch 1+2)에서 확인된 사항

- **TourAPI ↔ 통계청 코드 체계가 항상 같지는 않다**: 문서(위 "지역 코드 체계" 절)는 두 체계가 시/도
  2자리 코드를 공유한다고 전제하지만, TourAPI `ldongCode2`가 반환하는 시/도 코드 `12`("전남광주통합
  특별시")는 통계청 API(`areaTouDivList` 등)에 그대로 쓰면 항상 빈 응답이 온다 — 전남/광주는 실제로는
  통계청 코드가 각각 `46`/`29`로 분리돼 있다. 이 발견 이후 전남/광주 권역 후보는 전부 등록에서
  제외했다(코드 추측을 하지 않는다는 원칙상, 대체 코드를 임의로 추정해 채우지 않았다). 다른 도(경기·
  강원·경북·경남·충남·충북·인천·대구·부산·전북)에서는 이 세션에서 실제로 대조 확인한 모든 후보가
  두 체계 간 번호가 일치했다.
- **`AreaTarDivService`(TOU_DIV_IX, 관광 다양성)의 일일 호출 한도가 존재한다(정확한 수치는 미확인)**:
  Batch 1+2 후보 스크리닝 과정에서 이 오퍼레이션(`areaTouDivList`)을 많이 호출한 뒤, 이후 모든 호출이
  HTTP 429로 실패하기 시작했다 — 같은 서비스키의 다른 오퍼레이션(`TAR_SVC_DEM`, `TOUR_INFO`/
  `KorService2`)은 동시에 정상 응답해, 이 한도가 `AreaTarDivService`에만 적용되는 것으로 보인다. 2분
  간격을 두고 재시도해도 풀리지 않아 짧은 버스트 제한이 아니라 일수 단위 쿼터로 추정되나, 초기화
  시점은 확인하지 못했다. **후속 지역 확장(Batch 3 이상) 작업 전에는 후보 코드 검증(§코드 검증)을
  하루 앞서 나눠 실행하거나, 이 오퍼레이션 호출량을 줄이는 방식으로 계획해야 한다** — 한도가
  불확실한 상태에서 무제한 재시도하지 않는다(이 세션에서도 재시도를 중단하고 사용자에게 보고했다).

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
2. ~~지역별 방문자수 API의 실제 base URL·오퍼레이션명~~ — 2026-07-28 확인 완료(위 5-B 참고)
3. 기초지자체 중심 관광지 및 연관 관광지 API의 정식 서비스명

(수요 오퍼레이션명·다양성 전체 코드 체계·자원수요 서비스·방문자수 API 확인은 모두 완료 — 위 "서비스별
확인 상태" 1~5번 항목 참고.)

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
