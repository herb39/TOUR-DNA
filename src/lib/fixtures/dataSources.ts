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
      "수요 강도(tarSvcDemIxVal) 오퍼레이션명은 아직 미확인(docs/public-api-status.md).",
  },
  {
    code: "TOU_DIV_IX",
    name: "지역별 관광 다양성",
    baseUrl: "https://www.data.go.kr/data/15151365/openapi.do",
    description: "관광객/소비/국적 다양성 지수(31)를 제공. 필드명 미확인(docs/public-api-status.md).",
  },
  {
    code: "TOU_RES_DEM",
    name: "지역별 관광 자원 수요",
    baseUrl: "https://www.data.go.kr/data/15152138/openapi.do",
    description: "관광자원 단위 수요 지표. 상세 스키마 미확인.",
  },
  {
    code: "VISITOR_CNT",
    name: "지역별 방문자수",
    baseUrl: "https://www.data.go.kr/data/15101972/openapi.do",
    description: "지역별 방문자수(빅데이터 기반). 전월 대비 증감률 계산에 사용.",
  },
  {
    code: "TOUR_INFO",
    name: "국문 관광정보 서비스",
    baseUrl: "https://www.data.go.kr/data/15101578/openapi.do",
    description: "관광지/음식점/숙박/체험 등 POI 상세정보(TourAPI 4.0 계열).",
  },
  {
    code: "POI_RELATION",
    name: "기초지자체 중심 관광지 및 연관 관광지",
    baseUrl: "미확인",
    description: "중심 관광지와 연관 관광지(음식/숙박/체험 포함) 관계 데이터. 정식 서비스명/URL 미확인.",
  },
];
