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
];

export const DEMO_REGION_CODES = ["SGG_DAEJEON", "SGG_JECHEON", "SGG_YANGYANG"] as const;
