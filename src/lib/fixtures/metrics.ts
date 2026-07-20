export interface MetricFixture {
  regionCode: string;
  baseYm: string;
  tarSvcDemIxVal: number; // 관광 서비스 수요 강도 (0~100, fixture 추정치)
  tarSjrnDsIxVal: number; // 체류 강도 (0~100)
  tarExpDsIxVal: number; // 소비 강도 (0~100)
  touDivIxVal: number; // 관광 다양성 (0~100)
  touResDemIxVal: number; // 관광자원 수요 (0~100)
  visitorCnt: number; // 방문자수 (명)
}

/**
 * 대전/제천/양양 각 2개 기준월(202508, 202509) fixture.
 * 실 API 응답을 아직 확보하지 못했으므로, 지역별 관광 특성(대전=광역 도심형, 제천=호반 중견관광지,
 * 양양=여름 서핑 성수기형)을 반영한 추정치다. 실 서비스키 발급 후 교체해야 한다.
 */
export const METRIC_FIXTURES: MetricFixture[] = [
  {
    regionCode: "SGG_DAEJEON",
    baseYm: "202508",
    tarSvcDemIxVal: 68,
    tarSjrnDsIxVal: 42,
    tarExpDsIxVal: 55,
    touDivIxVal: 78,
    touResDemIxVal: 60,
    visitorCnt: 1_850_000,
  },
  {
    regionCode: "SGG_DAEJEON",
    baseYm: "202509",
    tarSvcDemIxVal: 74,
    tarSjrnDsIxVal: 45,
    tarExpDsIxVal: 58,
    touDivIxVal: 81,
    touResDemIxVal: 65,
    visitorCnt: 1_980_000,
  },
  {
    regionCode: "SGG_JECHEON",
    baseYm: "202508",
    tarSvcDemIxVal: 52,
    tarSjrnDsIxVal: 58,
    tarExpDsIxVal: 40,
    touDivIxVal: 48,
    touResDemIxVal: 50,
    visitorCnt: 320_000,
  },
  {
    regionCode: "SGG_JECHEON",
    baseYm: "202509",
    tarSvcDemIxVal: 57,
    tarSjrnDsIxVal: 61,
    tarExpDsIxVal: 44,
    touDivIxVal: 51,
    touResDemIxVal: 55,
    visitorCnt: 345_000,
  },
  {
    regionCode: "SGG_YANGYANG",
    baseYm: "202508",
    tarSvcDemIxVal: 81,
    tarSjrnDsIxVal: 88,
    tarExpDsIxVal: 63,
    touDivIxVal: 39,
    touResDemIxVal: 70,
    visitorCnt: 410_000,
  },
  {
    regionCode: "SGG_YANGYANG",
    baseYm: "202509",
    tarSvcDemIxVal: 69,
    tarSjrnDsIxVal: 79,
    tarExpDsIxVal: 57,
    touDivIxVal: 41,
    touResDemIxVal: 62,
    visitorCnt: 305_000,
  },
];

export const DEFAULT_BASE_YM = "202509";
