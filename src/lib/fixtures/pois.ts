import type { PoiCategoryCode } from "@/lib/domain/strategyTemplates";

export interface PoiSeed {
  key: string; // fixture 내부 참조용 고유키
  regionCode: string;
  name: string;
  category: PoiCategoryCode;
  address: string;
  lat: number;
  lng: number;
  operatingHours?: string;
  closedDays?: string;
}

export interface PoiRelationSeed {
  centerKey: string;
  relatedKey: string;
  relationType: string;
  distanceM: number;
}

export const POI_SEED: PoiSeed[] = [
  // ── 대전광역시 ──
  {
    key: "DJ_EXPO_PARK",
    regionCode: "SGG_DAEJEON",
    name: "대전엑스포과학공원",
    category: "ATTRACTION",
    address: "대전광역시 유성구 대덕대로 480",
    lat: 36.3742,
    lng: 127.3833,
    operatingHours: "09:00~18:00",
    closedDays: "연중무휴",
  },
  {
    key: "DJ_HANBAT_ARBORETUM",
    regionCode: "SGG_DAEJEON",
    name: "한밭수목원",
    category: "EXPERIENCE",
    address: "대전광역시 서구 둔산대로 169",
    lat: 36.3504,
    lng: 127.3845,
    operatingHours: "06:00~21:00(계절별 상이)",
    closedDays: "매주 월요일",
  },
  {
    key: "DJ_JANGTAESAN",
    regionCode: "SGG_DAEJEON",
    name: "장태산자연휴양림",
    category: "ATTRACTION",
    address: "대전광역시 서구 장안로 461",
    lat: 36.2699,
    lng: 127.3138,
    operatingHours: "09:00~18:00",
  },
  {
    key: "DJ_SUNGSIMDANG",
    regionCode: "SGG_DAEJEON",
    name: "성심당 본점",
    category: "FOOD",
    address: "대전광역시 중구 대종로480번길 15",
    lat: 36.3287,
    lng: 127.4268,
    operatingHours: "08:00~22:00",
  },
  {
    key: "DJ_JUNGANG_MARKET",
    regionCode: "SGG_DAEJEON",
    name: "대전중앙시장 먹거리타운",
    category: "FOOD",
    address: "대전광역시 중구 중앙로 200",
    lat: 36.3277,
    lng: 127.4257,
    operatingHours: "10:00~20:00",
    closedDays: "매월 둘째·넷째 화요일",
  },
  {
    key: "DJ_YUSEONG_HOTEL",
    regionCode: "SGG_DAEJEON",
    name: "유성호텔",
    category: "LODGING",
    address: "대전광역시 유성구 온천로 106",
    lat: 36.3574,
    lng: 127.3421,
  },
  {
    key: "DJ_SHINSEGAE",
    regionCode: "SGG_DAEJEON",
    name: "신세계백화점 대전점",
    category: "SHOPPING",
    address: "대전광역시 유성구 엑스포로 1",
    lat: 36.3712,
    lng: 127.3841,
    operatingHours: "10:30~20:00",
  },
  {
    key: "DJ_SCIENCE_FESTIVAL",
    regionCode: "SGG_DAEJEON",
    name: "대전사이언스페스티벌",
    category: "FESTIVAL",
    address: "대전광역시 유성구 대덕대로 480(엑스포시민광장)",
    lat: 36.3742,
    lng: 127.3833,
    operatingHours: "매년 10월 중 개최",
  },

  // ── 제천시 ──
  {
    key: "JC_CHEONGPUNG_CABLECAR",
    regionCode: "SGG_JECHEON",
    name: "청풍호반 케이블카",
    category: "ATTRACTION",
    address: "충청북도 제천시 청풍면 문화재길 166",
    lat: 36.9877,
    lng: 128.1594,
    operatingHours: "09:00~17:30",
  },
  {
    key: "JC_UIRIMJI",
    regionCode: "SGG_JECHEON",
    name: "의림지",
    category: "ATTRACTION",
    address: "충청북도 제천시 모산동 636",
    lat: 37.1497,
    lng: 128.2072,
  },
  {
    key: "JC_BAERON",
    regionCode: "SGG_JECHEON",
    name: "배론성지",
    category: "EXPERIENCE",
    address: "충청북도 제천시 봉양읍 배론성지길 296",
    lat: 37.0335,
    lng: 128.159,
  },
  {
    key: "JC_HANBANG_EXPO",
    regionCode: "SGG_JECHEON",
    name: "제천 한방엑스포공원",
    category: "EXPERIENCE",
    address: "충청북도 제천시 한방엑스포로 74",
    lat: 37.1449,
    lng: 128.1976,
    operatingHours: "09:00~18:00",
    closedDays: "매주 월요일",
  },
  {
    key: "JC_UIRIMJI_RESTAURANT",
    regionCode: "SGG_JECHEON",
    name: "의림지 향어회식당",
    category: "FOOD",
    address: "충청북도 제천시 의림대로 33",
    lat: 37.149,
    lng: 128.2065,
  },
  {
    key: "JC_CHEONGPUNG_RESORT",
    regionCode: "SGG_JECHEON",
    name: "청풍리조트",
    category: "LODGING",
    address: "충청북도 제천시 청풍면 문화재길 60",
    lat: 36.993,
    lng: 128.165,
  },
  {
    key: "JC_YAKCHAERAK_FESTIVAL",
    regionCode: "SGG_JECHEON",
    name: "제천 약채락 축제",
    category: "FESTIVAL",
    address: "충청북도 제천시 청전동 일원",
    lat: 37.1326,
    lng: 128.2035,
    operatingHours: "매년 9~10월 중 개최",
  },

  // ── 양양군 ──
  {
    key: "YY_NAKSAN_BEACH",
    regionCode: "SGG_YANGYANG",
    name: "낙산해수욕장",
    category: "ATTRACTION",
    address: "강원특별자치도 양양군 강현면 낙산해변길 100",
    lat: 38.1211,
    lng: 128.6266,
  },
  {
    key: "YY_HAJODAE",
    regionCode: "SGG_YANGYANG",
    name: "하조대",
    category: "ATTRACTION",
    address: "강원특별자치도 양양군 현북면 하조대길 29",
    lat: 38.0708,
    lng: 128.6395,
  },
  {
    key: "YY_SURFYY_BEACH",
    regionCode: "SGG_YANGYANG",
    name: "서피비치",
    category: "EXPERIENCE",
    address: "강원특별자치도 양양군 현북면 잔교리",
    lat: 38.0472,
    lng: 128.6266,
    operatingHours: "하절기 09:00~20:00",
  },
  {
    key: "YY_JUKDO_SURF_SCHOOL",
    regionCode: "SGG_YANGYANG",
    name: "죽도해변 서핑스쿨",
    category: "EXPERIENCE",
    address: "강원특별자치도 양양군 현남면 죽도해변길 24",
    lat: 38.0177,
    lng: 128.6188,
  },
  {
    key: "YY_MARKET",
    regionCode: "SGG_YANGYANG",
    name: "양양전통시장",
    category: "FOOD",
    address: "강원특별자치도 양양군 양양읍 남문리",
    lat: 38.0752,
    lng: 128.6194,
    closedDays: "매월 4·9일(오일장 외)",
  },
  {
    key: "YY_MULCHI_SASHIMI",
    regionCode: "SGG_YANGYANG",
    name: "양양 물치항 회센터",
    category: "FOOD",
    address: "강원특별자치도 양양군 강현면 물치리",
    lat: 38.1105,
    lng: 128.621,
  },
  {
    key: "YY_SURF_GUESTHOUSE",
    regionCode: "SGG_YANGYANG",
    name: "서핑비치 게스트하우스",
    category: "LODGING",
    address: "강원특별자치도 양양군 현북면 잔교리",
    lat: 38.0468,
    lng: 128.6261,
  },
  {
    key: "YY_SONGI_FESTIVAL",
    regionCode: "SGG_YANGYANG",
    name: "양양송이축제",
    category: "FESTIVAL",
    address: "강원특별자치도 양양군 양양읍 남문리 일원",
    lat: 38.0752,
    lng: 128.6194,
    operatingHours: "매년 10월 중 개최",
  },
];

export const POI_RELATION_SEED: PoiRelationSeed[] = [
  { centerKey: "DJ_EXPO_PARK", relatedKey: "DJ_HANBAT_ARBORETUM", relationType: "연관관광지", distanceM: 3200 },
  { centerKey: "DJ_EXPO_PARK", relatedKey: "DJ_SHINSEGAE", relationType: "연관관광지", distanceM: 900 },
  { centerKey: "DJ_JUNGANG_MARKET", relatedKey: "DJ_SUNGSIMDANG", relationType: "연관관광지", distanceM: 450 },
  { centerKey: "JC_UIRIMJI", relatedKey: "JC_UIRIMJI_RESTAURANT", relationType: "연관관광지", distanceM: 300 },
  { centerKey: "JC_CHEONGPUNG_CABLECAR", relatedKey: "JC_CHEONGPUNG_RESORT", relationType: "연관관광지", distanceM: 1800 },
  { centerKey: "YY_NAKSAN_BEACH", relatedKey: "YY_MULCHI_SASHIMI", relationType: "연관관광지", distanceM: 2100 },
  { centerKey: "YY_SURFYY_BEACH", relatedKey: "YY_SURF_GUESTHOUSE", relationType: "연관관광지", distanceM: 250 },
  { centerKey: "YY_SURFYY_BEACH", relatedKey: "YY_JUKDO_SURF_SCHOOL", relationType: "연관관광지", distanceM: 3400 },
];
