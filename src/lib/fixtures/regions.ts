export interface RegionSeed {
  code: string;
  name: string;
  level: "SIDO" | "SIGUNGU";
  parentCode: string | null;
  /** 통계청 행정표준코드 시도 2자리. AreaTarDemDsService/AreaTarDivService의 areaCd 파라미터용. */
  apiAreaCode: string | null;
  /** 통계청 행정표준코드 시군구 5자리. 같은 API들의 signguCd 파라미터용. */
  apiSigunguCode: string | null;
  /** KorService2(국문관광정보) 전용 구식 TourAPI areaCode(1~39, 시도 단위). */
  tourApiAreaCode: string | null;
}

/**
 * 2026-07-21 실 서비스키로 확인된 값이다(docs/public-api-status.md 참고).
 * 대전광역시는 시군구(자치구) 단위로만 통계청 API 데이터가 제공되어, 대표 자치구로 유성구(30200)를
 * 사용한다(fixture POI 다수가 유성구에 위치해 자연스러운 선택). 다른 구로 세분화하는 것은 P2 과제다.
 */
export const REGION_SEED: RegionSeed[] = [
  {
    code: "SIDO_DAEJEON",
    name: "대전광역시",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "30",
    apiSigunguCode: null,
    tourApiAreaCode: "3",
  },
  {
    code: "SGG_DAEJEON",
    name: "대전광역시",
    level: "SIGUNGU",
    parentCode: "SIDO_DAEJEON",
    apiAreaCode: "30",
    apiSigunguCode: "30200", // 유성구(대표)
    tourApiAreaCode: "3",
  },
  {
    code: "SIDO_CHUNGBUK",
    name: "충청북도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "43",
    apiSigunguCode: null,
    tourApiAreaCode: "33",
  },
  {
    code: "SGG_JECHEON",
    name: "제천시",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGBUK",
    apiAreaCode: "43",
    apiSigunguCode: "43150",
    tourApiAreaCode: "33",
  },
  {
    code: "SIDO_GANGWON",
    name: "강원특별자치도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "51",
    apiSigunguCode: null,
    tourApiAreaCode: "32",
  },
  {
    code: "SGG_YANGYANG",
    name: "양양군",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51830",
    tourApiAreaCode: "32",
  },
  // 2026-07-21 4개 지역 추가: DNA 축 정규화(min-max)가 SIGUNGU 코호트 안에서 이뤄지는데 코호트가 3개뿐이면
  // 최댓값/최솟값 지역이 항상 정확히 100/0으로 나와 신뢰도가 떨어진다는 문제가 있었다. 비교 표본을 늘리기
  // 위해 실 서비스키로 코드를 확인한 지역 4곳을 추가했다(area/signguNm 응답으로 직접 대조 확인).
  {
    code: "SIDO_GYEONGBUK",
    name: "경상북도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "47",
    apiSigunguCode: null,
    tourApiAreaCode: "35",
  },
  {
    code: "SGG_GYEONGJU",
    name: "경주시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGBUK",
    apiAreaCode: "47",
    apiSigunguCode: "47130",
    tourApiAreaCode: "35",
  },
  {
    code: "SGG_GANGNEUNG",
    name: "강릉시",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51150",
    tourApiAreaCode: "32",
  },
  {
    code: "SIDO_JEJU",
    name: "제주특별자치도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "50",
    apiSigunguCode: null,
    tourApiAreaCode: "39",
  },
  {
    code: "SGG_JEJU",
    name: "제주시",
    level: "SIGUNGU",
    parentCode: "SIDO_JEJU",
    apiAreaCode: "50",
    apiSigunguCode: "50110",
    tourApiAreaCode: "39",
  },
  {
    code: "SIDO_GYEONGNAM",
    name: "경상남도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "48",
    apiSigunguCode: null,
    tourApiAreaCode: "36",
  },
  {
    code: "SGG_TONGYEONG",
    name: "통영시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGNAM",
    apiAreaCode: "48",
    apiSigunguCode: "48220",
    tourApiAreaCode: "36",
  },
];

export const DEMO_REGION_CODES = ["SGG_DAEJEON", "SGG_JECHEON", "SGG_YANGYANG"] as const;
