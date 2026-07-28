export interface DataSourceSeed {
  code: string;
  name: string;
  baseUrl: string;
  description: string;
}

export const DATA_SOURCE_SEED: DataSourceSeed[] = [
  {
    code: "TAR_SVC_DEM",
    name: "지역별 관광 수요 강도",
    baseUrl: "https://apis.data.go.kr/B551011/AreaTarDemDsService",
    description:
      "체류 강도(/areaTarSjrnDsList)·소비 강도(/areaTarExpDsList) 오퍼레이션은 실 키로 확인됨(2026-07-21). " +
      "이 서비스에는 별도의 수요(Demand) 오퍼레이션이 없음을 Swagger UI로 확인(2026-07-21).",
  },
  {
    code: "TOU_DIV_IX",
    name: "지역별 관광 다양성",
    baseUrl: "https://apis.data.go.kr/B551011/AreaTarDivService",
    description:
      "관광객(/areaTouDivList, 연령대 6종)·소비(/areaExpDivList, 연령대 6종)·국제적(/areaIntlDivList, " +
      "국적 다양성 등) 다양성 3개 오퍼레이션 전부 실 키로 확인됨(2026-07-21). 연령대별 평활도(evenness) + " +
      "국적 다양성을 조합해 종합 다양성 점수를 재계산한다(touDivIx.ts).",
  },
  {
    code: "TOU_RES_DEM",
    name: "지역별 관광 자원 수요",
    baseUrl: "https://apis.data.go.kr/B551011/AreaTarResDemService",
    description:
      "/areaTarSvcDemList(관광 서비스 수요, tarSvcDemIxCd=1101)는 실 키로 확인됨(2026-07-21) — " +
      "METRIC_CODES.DEMAND_SERVICE의 실제 출처. /areaCulResDemList(문화 자원 수요)는 파라미터명" +
      "(culResDemIxCd)만 확인되고 유효 코드값은 아직 미확인(touResDem.ts).",
  },
  {
    code: "VISITOR_CNT",
    name: "지역별 방문자수",
    // 2026-07-28 실제 API 명세(DataLabService)로 확인된 진짜 게이트웨이 주소로 교체 — 이전 baseUrl
    // (data.go.kr 소개 페이지 HTML)이 원인이었던 매 동기화 실패는 해결됨(docs/public-api-status.md
    // §5-A/§5-B 참고). /locgoRegnVisitrDDList(시군구)·/metcoRegnVisitrDDList(광역) 두 오퍼레이션을
    // 쓴다(visitorCnt.ts).
    baseUrl: "https://apis.data.go.kr/B551011/DataLabService",
    description:
      "지역별 방문자수(빅데이터 기반). 시군구 분석(/locgoRegnVisitrDDList)과 광역 분석" +
      "(/metcoRegnVisitrDDList)을 각각 전국 단위로 조회해 signguCode/areaCode로 지역에 매핑한다. " +
      "외지인+외국인 합계를 VISITOR_CNT로, 현지인 합계는 VISITOR_CNT_LOCAL 보조지표로 기록한다" +
      "(2026-07-28 신규 API 구조 전환).",
  },
  {
    code: "TOUR_INFO",
    name: "국문 관광정보 서비스",
    baseUrl: "https://apis.data.go.kr/B551011/KorService2",
    description:
      "areaBasedList2 오퍼레이션 실 키로 확인됨(2026-07-21, 대전 유성구 POI 정상 조회). " +
      "areaCode는 구식 TourAPI 코드(1~39) 체계 — Region.tourApiAreaCode 사용.",
  },
  {
    code: "POI_RELATION",
    name: "기초지자체 중심 관광지 및 연관 관광지",
    baseUrl: "미확인",
    description: "중심 관광지와 연관 관광지(음식/숙박/체험 포함) 관계 데이터. 정식 서비스명/URL 미확인.",
  },
];
