export interface RegionSeed {
  code: string;
  name: string;
  level: "SIDO" | "SIGUNGU";
  parentCode: string | null;
  /**
   * TourAPI 계열 areaCode/sigunguCode 추정값. 공식 Swagger/실 응답으로 재검증 전까지는
   * null로 두고 fixture 시연에는 영향이 없게 한다. (docs/public-api-status.md 참고)
   */
  apiAreaCode: string | null;
  apiSigunguCode: string | null;
}

export const REGION_SEED: RegionSeed[] = [
  {
    code: "SIDO_DAEJEON",
    name: "대전광역시",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: null,
    apiSigunguCode: null,
  },
  {
    code: "SGG_DAEJEON",
    name: "대전광역시",
    level: "SIGUNGU",
    parentCode: "SIDO_DAEJEON",
    apiAreaCode: null,
    apiSigunguCode: null,
  },
  {
    code: "SIDO_CHUNGBUK",
    name: "충청북도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: null,
    apiSigunguCode: null,
  },
  {
    code: "SGG_JECHEON",
    name: "제천시",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGBUK",
    apiAreaCode: null,
    apiSigunguCode: null,
  },
  {
    code: "SIDO_GANGWON",
    name: "강원특별자치도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: null,
    apiSigunguCode: null,
  },
  {
    code: "SGG_YANGYANG",
    name: "양양군",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: null,
    apiSigunguCode: null,
  },
];

export const DEMO_REGION_CODES = ["SGG_DAEJEON", "SGG_JECHEON", "SGG_YANGYANG"] as const;
