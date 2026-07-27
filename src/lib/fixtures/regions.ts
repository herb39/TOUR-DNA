export interface RegionSeed {
  code: string;
  name: string;
  level: "SIDO" | "SIGUNGU";
  parentCode: string | null;
  /** 통계청 행정표준코드 시도 2자리. AreaTarDemDsService/AreaTarDivService의 areaCd 파라미터용. */
  apiAreaCode: string | null;
  /** 통계청 행정표준코드 시군구 5자리. 같은 API들의 signguCd 파라미터용. */
  apiSigunguCode: string | null;
  /** KorService2 구식 TourAPI areaCode(1~39, 시도 단위). 2026-07-27 신 체계로 전환 — 신규 요청에는
   * 더 이상 쓰지 않는다(구형 데이터 참고용으로만 보존). */
  tourApiAreaCode: string | null;
  /** KorService2 신 법정동 시도 코드(ldongCode2로 조회). 2026-07-28 실 서비스키로 확인됨 — 통계청
   * 행정표준코드(apiAreaCode)와 동일한 2자리 시도 코드 체계임을 확인했다. null이면 syncService.ts가
   * TOUR_INFO를 SKIPPED로 표시하고 fixture POI를 그대로 쓴다. */
  tourApiLdongRegnCd: string | null;
  /** KorService2 신 법정동 시군구 코드. 2026-07-28 실 서비스키로 확인됨 — 통계청 apiSigunguCode(5자리 =
   * 시도 2자리 + 시군구 3자리)의 뒤 3자리와 정확히 같은 값이다(예: 제천시 apiSigunguCode="43150" →
   * tourApiLdongSignguCd="150"). 값이 채워지면 addr1 키워드 필터 없이도 시군구 단위로 정확히 좁힐 수
   * 있다. */
  tourApiLdongSignguCd: string | null;
}

/**
 * 2026-07-21 실 서비스키로 확인된 값이다(docs/public-api-status.md 참고, apiAreaCode/apiSigunguCode/
 * tourApiAreaCode에 한함). tourApiLdongRegnCd/tourApiLdongSignguCd(신 체계)는 2026-07-28 별도 실
 * 서비스키로 `ldongCode2`를 직접 호출해 확인했다(대전 유성구/제천/양양/경주/강릉/제주/통영 전부
 * area/signguNm 응답으로 직접 대조 확인, docs/public-api-status.md 참고).
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
    tourApiLdongRegnCd: "30",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_DAEJEON",
    name: "대전광역시",
    level: "SIGUNGU",
    parentCode: "SIDO_DAEJEON",
    apiAreaCode: "30",
    apiSigunguCode: "30200", // 유성구(대표)
    tourApiAreaCode: "3",
    tourApiLdongRegnCd: "30",
    tourApiLdongSignguCd: "200", // 유성구
  },
  {
    code: "SIDO_CHUNGBUK",
    name: "충청북도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "43",
    apiSigunguCode: null,
    tourApiAreaCode: "33",
    tourApiLdongRegnCd: "43",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_JECHEON",
    name: "제천시",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGBUK",
    apiAreaCode: "43",
    apiSigunguCode: "43150",
    tourApiAreaCode: "33",
    tourApiLdongRegnCd: "43",
    tourApiLdongSignguCd: "150",
  },
  {
    code: "SIDO_GANGWON",
    name: "강원특별자치도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "51",
    apiSigunguCode: null,
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_YANGYANG",
    name: "양양군",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51830",
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: "830",
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
    tourApiLdongRegnCd: "47",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_GYEONGJU",
    name: "경주시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGBUK",
    apiAreaCode: "47",
    apiSigunguCode: "47130",
    tourApiAreaCode: "35",
    tourApiLdongRegnCd: "47",
    tourApiLdongSignguCd: "130",
  },
  {
    code: "SGG_GANGNEUNG",
    name: "강릉시",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51150",
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: "150",
  },
  {
    code: "SIDO_JEJU",
    name: "제주특별자치도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "50",
    apiSigunguCode: null,
    tourApiAreaCode: "39",
    tourApiLdongRegnCd: "50",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_JEJU",
    name: "제주시",
    level: "SIGUNGU",
    parentCode: "SIDO_JEJU",
    apiAreaCode: "50",
    apiSigunguCode: "50110",
    tourApiAreaCode: "39",
    tourApiLdongRegnCd: "50",
    tourApiLdongSignguCd: "110",
  },
  {
    code: "SIDO_GYEONGNAM",
    name: "경상남도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "48",
    apiSigunguCode: null,
    tourApiAreaCode: "36",
    tourApiLdongRegnCd: "48",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_TONGYEONG",
    name: "통영시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGNAM",
    apiAreaCode: "48",
    apiSigunguCode: "48220",
    tourApiAreaCode: "36",
    tourApiLdongRegnCd: "48",
    tourApiLdongSignguCd: "220",
  },
];

export const DEMO_REGION_CODES = ["SGG_DAEJEON", "SGG_JECHEON", "SGG_YANGYANG"] as const;
