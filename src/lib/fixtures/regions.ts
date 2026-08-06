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
  // 2026-08-07 지원지역 확대 Batch 1(10곳) — 유사지역 비교 모집단이 6곳뿐이라 결과가 "전국에서 가장
  // 유사한 지역"이 아니라 "현재 지원지역 중 상대적으로 가까운 지역"이라는 제한된 의미로만 쓰였던 문제를
  // 완화한다. 후보 46곳을 `areaTouDivList`(다양성)로 먼저 걸러 응답 지역명이 요청과 정확히 일치하는지
  // 확인했고, 이 10곳은 추가로 체류·소비·수요서비스 지표(`areaTarSjrnDsList`/`areaTarExpDsList`/
  // `areaTarSvcDemList`)와 POI(`areaBasedList2`)까지 실 서비스키로 확인해(baseYm=202606, docs/
  // public-api-status.md 참고) 전부 정상 응답임을 검증했다. DNA 산식·유사지역 공식은 전혀 바꾸지 않았다.
  {
    code: "SIDO_GYEONGGI",
    name: "경기도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "41",
    apiSigunguCode: null,
    tourApiAreaCode: "31",
    tourApiLdongRegnCd: "41",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_GAPYEONG",
    name: "가평군",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGGI",
    apiAreaCode: "41",
    apiSigunguCode: "41820",
    tourApiAreaCode: "31",
    tourApiLdongRegnCd: "41",
    tourApiLdongSignguCd: "820",
  },
  {
    code: "SGG_PAJU",
    name: "파주시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGGI",
    apiAreaCode: "41",
    apiSigunguCode: "41480",
    tourApiAreaCode: "31",
    tourApiLdongRegnCd: "41",
    tourApiLdongSignguCd: "480",
  },
  {
    code: "SGG_ANDONG",
    name: "안동시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGBUK",
    apiAreaCode: "47",
    apiSigunguCode: "47170",
    tourApiAreaCode: "35",
    tourApiLdongRegnCd: "47",
    tourApiLdongSignguCd: "170",
  },
  {
    code: "SIDO_CHUNGNAM",
    name: "충청남도",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "44",
    apiSigunguCode: null,
    tourApiAreaCode: "34",
    tourApiLdongRegnCd: "44",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_BUYEO",
    name: "부여군",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGNAM",
    apiAreaCode: "44",
    apiSigunguCode: "44760",
    tourApiAreaCode: "34",
    tourApiLdongRegnCd: "44",
    tourApiLdongSignguCd: "760",
  },
  {
    code: "SGG_GEOJE",
    name: "거제시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGNAM",
    apiAreaCode: "48",
    apiSigunguCode: "48310",
    tourApiAreaCode: "36",
    tourApiLdongRegnCd: "48",
    tourApiLdongSignguCd: "310",
  },
  {
    code: "SGG_PYEONGCHANG",
    name: "평창군",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51760",
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: "760",
  },
  {
    code: "SGG_ASAN",
    name: "아산시",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGNAM",
    apiAreaCode: "44",
    apiSigunguCode: "44200",
    tourApiAreaCode: "34",
    tourApiLdongRegnCd: "44",
    tourApiLdongSignguCd: "200",
  },
  {
    code: "SIDO_BUSAN",
    name: "부산광역시",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "26",
    apiSigunguCode: null,
    tourApiAreaCode: "6",
    tourApiLdongRegnCd: "26",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_HAEUNDAE",
    name: "해운대구",
    level: "SIGUNGU",
    parentCode: "SIDO_BUSAN",
    apiAreaCode: "26",
    apiSigunguCode: "26350",
    tourApiAreaCode: "6",
    tourApiLdongRegnCd: "26",
    tourApiLdongSignguCd: "350",
  },
  {
    code: "SGG_BORYEONG",
    name: "보령시",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGNAM",
    apiAreaCode: "44",
    apiSigunguCode: "44180",
    tourApiAreaCode: "34",
    tourApiLdongRegnCd: "44",
    tourApiLdongSignguCd: "180",
  },
  {
    code: "SGG_HADONG",
    name: "하동군",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGNAM",
    apiAreaCode: "48",
    apiSigunguCode: "48850",
    tourApiAreaCode: "36",
    tourApiLdongRegnCd: "48",
    tourApiLdongSignguCd: "850",
  },
  // 2026-08-07 지원지역 확대 Batch 2(10곳) — Batch 1과 같은 방식(실 서비스키로 지역명·핵심 지표·POI
  // 확인)으로 검증한 10곳을 추가한다.
  {
    code: "SGG_YANGPYEONG",
    name: "양평군",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGGI",
    apiAreaCode: "41",
    apiSigunguCode: "41830",
    tourApiAreaCode: "31",
    tourApiLdongRegnCd: "41",
    tourApiLdongSignguCd: "830",
  },
  {
    code: "SGG_GONGJU",
    name: "공주시",
    level: "SIGUNGU",
    parentCode: "SIDO_CHUNGNAM",
    apiAreaCode: "44",
    apiSigunguCode: "44150",
    tourApiAreaCode: "34",
    tourApiLdongRegnCd: "44",
    tourApiLdongSignguCd: "150",
  },
  {
    code: "SGG_GIMHAE",
    name: "김해시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGNAM",
    apiAreaCode: "48",
    apiSigunguCode: "48250",
    tourApiAreaCode: "36",
    tourApiLdongRegnCd: "48",
    tourApiLdongSignguCd: "250",
  },
  {
    code: "SGG_ULLEUNG",
    name: "울릉군",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGBUK",
    apiAreaCode: "47",
    apiSigunguCode: "47940",
    tourApiAreaCode: "35",
    tourApiLdongRegnCd: "47",
    tourApiLdongSignguCd: "940",
  },
  {
    code: "SGG_JEONGSEON",
    name: "정선군",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51770",
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: "770",
  },
  {
    code: "SGG_CHANGNYEONG",
    name: "창녕군",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGNAM",
    apiAreaCode: "48",
    apiSigunguCode: "48740",
    tourApiAreaCode: "36",
    tourApiLdongRegnCd: "48",
    tourApiLdongSignguCd: "740",
  },
  {
    code: "SGG_ICHEON",
    name: "이천시",
    level: "SIGUNGU",
    parentCode: "SIDO_GYEONGGI",
    apiAreaCode: "41",
    apiSigunguCode: "41500",
    tourApiAreaCode: "31",
    tourApiLdongRegnCd: "41",
    tourApiLdongSignguCd: "500",
  },
  {
    code: "SIDO_DAEGU",
    name: "대구광역시",
    level: "SIDO",
    parentCode: null,
    apiAreaCode: "27",
    apiSigunguCode: null,
    tourApiAreaCode: "4",
    tourApiLdongRegnCd: "27",
    tourApiLdongSignguCd: null,
  },
  {
    code: "SGG_DAEGU_JUNG",
    // 사용자에게는 "대구 중구"로 명확히 표시하되(다른 도시 중구와 혼동 방지), POI 주소 필터는
    // syncService.ts의 TOUR_INFO_ADDRESS_FILTER_OVERRIDE에서 "중구"로 따로 지정한다 — 이 이름
    // 그대로("대구 중구")는 실제 주소("대구광역시 중구 ...")에 부분 문자열로 나타나지 않아 필터에 쓰면
    // POI가 전부 걸러진다(2026-08-07 발견, 실행 전 확인). API 호출 자체는 이미 lDongRegnCd=27+
    // lDongSignguCd=110으로 대구 중구만 정확히 좁혀 조회하므로, 주소 필터에 "중구"만 써도 다른 도시의
    // 중구가 섞여 들어올 위험은 없다.
    name: "대구 중구",
    level: "SIGUNGU",
    parentCode: "SIDO_DAEGU",
    apiAreaCode: "27",
    apiSigunguCode: "27110",
    tourApiAreaCode: "4",
    tourApiLdongRegnCd: "27",
    tourApiLdongSignguCd: "110",
  },
  {
    code: "SGG_HWACHEON",
    name: "화천군",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51790",
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: "790",
  },
  {
    code: "SGG_SAMCHEOK",
    name: "삼척시",
    level: "SIGUNGU",
    parentCode: "SIDO_GANGWON",
    apiAreaCode: "51",
    apiSigunguCode: "51230",
    tourApiAreaCode: "32",
    tourApiLdongRegnCd: "51",
    tourApiLdongSignguCd: "230",
  },
];

export const DEMO_REGION_CODES = ["SGG_DAEJEON", "SGG_JECHEON", "SGG_YANGYANG"] as const;
