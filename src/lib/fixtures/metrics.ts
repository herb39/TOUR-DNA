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
 * 대전/제천/양양 각 4개 기준월(202508, 202509, 202605, 202606) fixture.
 * 202508/202509: 실 서비스키 발급 전 지역별 관광 특성(대전=광역 도심형, 제천=호반 중견관광지, 양양=여름
 * 서핑 성수기형)을 반영해 추정한 값 — 과거 참고용으로 남겨둔다.
 * 202605/202606: 2026-07-21 실 서비스키로 확인한 실제 값을 스냅샷 기준값으로 반영했다(단,
 * touResDemIxVal/visitorCnt는 여전히 API 미확인이라 추정치 이월). DEFAULT_BASE_YM은 202606을 가리킨다.
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
  // 202605/202606: 2026-07-21 실 서비스키로 확인한 실제 값(tarSvcDemIxVal/tarSjrnDsIxVal/
  // tarExpDsIxVal/touDivIxVal, docs/public-api-status.md 참고)을 그대로 스냅샷 기준값으로 옮겼다.
  // touResDemIxVal(문화자원수요)·visitorCnt(방문자수)는 여전히 API 미확인이라 202509 추정치를 그대로
  // 이월했다(임의로 새 숫자를 만들지 않음 — 202605/202606 두 기준월의 값이 같으므로 방문자수 증감률
  // 축은 0%로 계산된다).
  {
    regionCode: "SGG_DAEJEON",
    baseYm: "202605",
    tarSvcDemIxVal: 72.88,
    tarSjrnDsIxVal: 87.1,
    tarExpDsIxVal: 92.33,
    touDivIxVal: 85.24,
    touResDemIxVal: 65,
    visitorCnt: 1_980_000,
  },
  {
    regionCode: "SGG_DAEJEON",
    baseYm: "202606",
    tarSvcDemIxVal: 72.88,
    tarSjrnDsIxVal: 87.1,
    tarExpDsIxVal: 92.33,
    touDivIxVal: 85.24,
    touResDemIxVal: 65,
    visitorCnt: 1_980_000,
  },
  {
    regionCode: "SGG_JECHEON",
    baseYm: "202605",
    tarSvcDemIxVal: 75.14,
    tarSjrnDsIxVal: 72.86,
    tarExpDsIxVal: 68.82,
    touDivIxVal: 91.84,
    touResDemIxVal: 55,
    visitorCnt: 345_000,
  },
  {
    regionCode: "SGG_JECHEON",
    baseYm: "202606",
    tarSvcDemIxVal: 75.14,
    tarSjrnDsIxVal: 72.86,
    tarExpDsIxVal: 68.82,
    touDivIxVal: 91.84,
    touResDemIxVal: 55,
    visitorCnt: 345_000,
  },
  {
    regionCode: "SGG_YANGYANG",
    baseYm: "202605",
    tarSvcDemIxVal: 104.57,
    tarSjrnDsIxVal: 77.14,
    tarExpDsIxVal: 66.78,
    touDivIxVal: 91.88,
    touResDemIxVal: 62,
    visitorCnt: 305_000,
  },
  {
    regionCode: "SGG_YANGYANG",
    baseYm: "202606",
    tarSvcDemIxVal: 104.57,
    tarSjrnDsIxVal: 77.14,
    tarExpDsIxVal: 66.78,
    touDivIxVal: 91.88,
    touResDemIxVal: 62,
    visitorCnt: 305_000,
  },
  // 2026-07-21 추가된 4개 지역(경주/강릉/제주/통영) — DNA 축 정규화 코호트를 3개에서 7개로 늘려
  // 최댓값/최솟값이 항상 정확히 100/0으로 나오는 문제를 완화하기 위해 추가했다. tarSvcDemIxVal/
  // tarSjrnDsIxVal/tarExpDsIxVal/touDivIxVal은 실 서비스키로 확인한 202606 실제 값이다.
  // touResDemIxVal/visitorCnt는 기존 3개 지역과 동일하게 API 미확인이라 지역 규모에 맞춰 추정했다.
  {
    regionCode: "SGG_GYEONGJU",
    baseYm: "202605",
    tarSvcDemIxVal: 87.45,
    tarSjrnDsIxVal: 113.3,
    tarExpDsIxVal: 80.95,
    touDivIxVal: 85.18,
    touResDemIxVal: 70,
    visitorCnt: 1_200_000,
  },
  {
    regionCode: "SGG_GYEONGJU",
    baseYm: "202606",
    tarSvcDemIxVal: 87.45,
    tarSjrnDsIxVal: 113.3,
    tarExpDsIxVal: 80.95,
    touDivIxVal: 85.18,
    touResDemIxVal: 70,
    visitorCnt: 1_200_000,
  },
  {
    regionCode: "SGG_GANGNEUNG",
    baseYm: "202605",
    tarSvcDemIxVal: 113.38,
    tarSjrnDsIxVal: 114.52,
    tarExpDsIxVal: 77.73,
    touDivIxVal: 87.64,
    touResDemIxVal: 68,
    visitorCnt: 900_000,
  },
  {
    regionCode: "SGG_GANGNEUNG",
    baseYm: "202606",
    tarSvcDemIxVal: 113.38,
    tarSjrnDsIxVal: 114.52,
    tarExpDsIxVal: 77.73,
    touDivIxVal: 87.64,
    touResDemIxVal: 68,
    visitorCnt: 900_000,
  },
  {
    regionCode: "SGG_JEJU",
    baseYm: "202605",
    tarSvcDemIxVal: 120.27,
    tarSjrnDsIxVal: 98.09,
    tarExpDsIxVal: 91.33,
    touDivIxVal: 76.65,
    touResDemIxVal: 75,
    visitorCnt: 1_500_000,
  },
  {
    regionCode: "SGG_JEJU",
    baseYm: "202606",
    tarSvcDemIxVal: 120.27,
    tarSjrnDsIxVal: 98.09,
    tarExpDsIxVal: 91.33,
    touDivIxVal: 76.65,
    touResDemIxVal: 75,
    visitorCnt: 1_500_000,
  },
  {
    regionCode: "SGG_TONGYEONG",
    baseYm: "202605",
    tarSvcDemIxVal: 83.64,
    tarSjrnDsIxVal: 74.08,
    tarExpDsIxVal: 65.72,
    touDivIxVal: 87.36,
    touResDemIxVal: 58,
    visitorCnt: 400_000,
  },
  {
    regionCode: "SGG_TONGYEONG",
    baseYm: "202606",
    tarSvcDemIxVal: 83.64,
    tarSjrnDsIxVal: 74.08,
    tarExpDsIxVal: 65.72,
    touDivIxVal: 87.36,
    touResDemIxVal: 58,
    visitorCnt: 400_000,
  },
];

export const DEFAULT_BASE_YM = "202606";
