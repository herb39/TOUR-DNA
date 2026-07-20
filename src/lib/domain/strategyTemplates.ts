import type { DnaAxisKey } from "./types";

export type PoiCategoryCode =
  | "ATTRACTION"
  | "FOOD"
  | "LODGING"
  | "EXPERIENCE"
  | "FESTIVAL"
  | "SHOPPING";

export interface StrategyTemplate {
  id: string;
  name: string;
  concept: string;
  /** demandFit 계산에 쓰이는 DNA 축 가중치 (결측 축은 제외 후 재정규화) */
  demandAxisWeights: Partial<Record<DnaAxisKey, number>>;
  /** supplyFit 계산에 쓰이는 DNA 축 가중치 */
  supplyAxisWeights: Partial<Record<DnaAxisKey, number>>;
  /** 성수기로 보는 월 (1~12). seasonFit 계산에 사용. */
  idealMonths: number[];
  targetAgeGroups: string[];
  targetCompanionTypes: string[];
  supportedGoals: string[];
  preferredBudgetLevels: Array<"LOW" | "MID" | "PREMIUM">;
  preferredTransport: Array<"WALK" | "PUBLIC_TRANSPORT" | "PRIVATE_VEHICLE" | "MIXED">;
  preferredGroupTypes: Array<"FIT" | "SMALL_10_20" | "MEDIUM_21_40">;
  requiresOvernight: boolean;
  poiCategories: PoiCategoryCode[];
  kpiTemplates: { name: string; method: string }[];
  riskTemplates: string[];
  targetDescriptionTemplate: string;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "LOCAL_FOOD_MARKET",
    name: "로컬미식·시장 연계형",
    concept: "지역 전통시장과 맛집을 엮어 미식 테마로 체류 소비를 늘리는 코스",
    demandAxisWeights: { demand: 0.5, spend: 0.5 },
    supplyAxisWeights: { network: 0.6, diversity: 0.4 },
    idealMonths: [3, 4, 5, 9, 10, 11],
    targetAgeGroups: ["AGE_20S", "AGE_30S", "AGE_40S"],
    targetCompanionTypes: ["COMPANION_FRIENDS", "COMPANION_COUPLE", "COMPANION_FAMILY"],
    supportedGoals: ["GOAL_STAY_SPEND_EXPANSION", "GOAL_LOCAL_ECONOMY"],
    preferredBudgetLevels: ["LOW", "MID"],
    preferredTransport: ["WALK", "PUBLIC_TRANSPORT", "MIXED"],
    preferredGroupTypes: ["FIT", "SMALL_10_20"],
    requiresOvernight: false,
    poiCategories: ["FOOD", "ATTRACTION", "SHOPPING"],
    kpiTemplates: [
      { name: "1인당 평균 소비액", method: "코스 내 결제업소 카드매출 데이터 비교(전월 대비)" },
      { name: "시장 체류시간", method: "코스 참여자 방문 인증(스탬프/설문)으로 평균 체류시간 측정" },
      { name: "재방문 의사율", method: "종료 후 설문(5점 척도) 상위 2점 비율" },
    ],
    riskTemplates: ["전통시장 정기 휴장일과 코스 일정 충돌", "우천 시 야외 시장 매력도 저하"],
    targetDescriptionTemplate: "미식에 관심이 높은 소규모 동행 여행객",
  },
  {
    id: "NIGHT_STAY_EXTENSION",
    name: "야간·체류 확대형",
    concept: "야경/야시장/야간 프로그램으로 체류시간과 숙박 전환을 늘리는 코스",
    demandAxisWeights: { stay: 0.6, demand: 0.4 },
    supplyAxisWeights: { network: 0.5, spend: 0.5 },
    idealMonths: [5, 6, 7, 8, 9],
    targetAgeGroups: ["AGE_20S", "AGE_30S"],
    targetCompanionTypes: ["COMPANION_COUPLE", "COMPANION_FRIENDS"],
    supportedGoals: ["GOAL_STAY_SPEND_EXPANSION", "GOAL_VISITOR_GROWTH"],
    preferredBudgetLevels: ["MID", "PREMIUM"],
    preferredTransport: ["PUBLIC_TRANSPORT", "PRIVATE_VEHICLE", "MIXED"],
    preferredGroupTypes: ["FIT", "SMALL_10_20"],
    requiresOvernight: true,
    poiCategories: ["ATTRACTION", "FOOD", "LODGING"],
    kpiTemplates: [
      { name: "숙박 전환율", method: "당일 대비 1박 이상 예약 비율(예약 데이터)" },
      { name: "야간 프로그램 참여율", method: "야간 시간대(18~22시) 코스 항목 체크인 수" },
      { name: "체류시간 증가폭", method: "전체 일정 체류시간 대비 야간 구간 비중" },
    ],
    riskTemplates: ["야간 이동 시 대중교통 배차 감소", "안전 조명/치안 확인 필요 구간 존재"],
    targetDescriptionTemplate: "체류를 늘리고 싶은 20~30대 커플/소그룹",
  },
  {
    id: "NATURE_WELLNESS",
    name: "자연·웰니스형",
    concept: "자연경관과 휴양 콘텐츠 중심으로 힐링을 목적으로 하는 코스",
    demandAxisWeights: { demand: 0.4, diversity: 0.6 },
    supplyAxisWeights: { network: 0.4, diversity: 0.6 },
    idealMonths: [4, 5, 6, 9, 10],
    targetAgeGroups: ["AGE_30S", "AGE_40S", "AGE_50S"],
    targetCompanionTypes: ["COMPANION_COUPLE", "COMPANION_SOLO", "COMPANION_FAMILY"],
    supportedGoals: ["GOAL_REPEAT_VISIT", "GOAL_BRAND_IMAGE"],
    preferredBudgetLevels: ["MID", "PREMIUM"],
    preferredTransport: ["PRIVATE_VEHICLE", "MIXED"],
    preferredGroupTypes: ["FIT", "SMALL_10_20"],
    requiresOvernight: false,
    poiCategories: ["ATTRACTION", "EXPERIENCE", "LODGING"],
    kpiTemplates: [
      { name: "체험 프로그램 만족도", method: "현장 설문(5점 척도) 평균" },
      { name: "평균 체류시간", method: "코스 전체 소요시간 로그" },
      { name: "재방문 의사율", method: "종료 후 설문 상위 2점 비율" },
    ],
    riskTemplates: ["기상 악화 시 자연 코스 대체 동선 필요", "성수기 주차 공간 부족"],
    targetDescriptionTemplate: "자연 속 휴식을 원하는 30~50대 여행객",
  },
  {
    id: "CULTURE_HISTORY",
    name: "문화·역사 체험형",
    concept: "지역 문화유산과 역사 스토리텔링 중심의 학습형 코스",
    demandAxisWeights: { demand: 0.5, network: 0.5 },
    supplyAxisWeights: { network: 0.7, diversity: 0.3 },
    idealMonths: [3, 4, 5, 9, 10, 11],
    targetAgeGroups: ["AGE_30S", "AGE_40S", "AGE_50S", "AGE_60S_PLUS"],
    targetCompanionTypes: ["COMPANION_FAMILY", "COMPANION_GROUP_TOUR"],
    supportedGoals: ["GOAL_BRAND_IMAGE", "GOAL_NEW_MARKET"],
    preferredBudgetLevels: ["LOW", "MID"],
    preferredTransport: ["PUBLIC_TRANSPORT", "MIXED", "PRIVATE_VEHICLE"],
    preferredGroupTypes: ["SMALL_10_20", "MEDIUM_21_40"],
    requiresOvernight: false,
    poiCategories: ["ATTRACTION", "EXPERIENCE", "FOOD"],
    kpiTemplates: [
      { name: "해설 프로그램 참여율", method: "해설사 동반 코스 참여 인원 / 전체 인원" },
      { name: "학습 만족도", method: "설문 5점 척도 평균" },
      { name: "체류시간", method: "코스 전체 소요시간 로그" },
    ],
    riskTemplates: ["문화재 관람 정기 휴관일 확인 필요", "단체 해설 인원 제한"],
    targetDescriptionTemplate: "역사·문화 학습에 관심 있는 가족/단체 여행객",
  },
  {
    id: "FESTIVAL_EVENT",
    name: "축제·이벤트 연계형",
    concept: "지역 축제/행사 일정에 맞춰 집중 방문을 유도하는 코스",
    demandAxisWeights: { demand: 0.7, diversity: 0.3 },
    supplyAxisWeights: { network: 0.5, spend: 0.5 },
    idealMonths: [4, 5, 9, 10],
    targetAgeGroups: ["AGE_20S", "AGE_30S", "AGE_40S"],
    targetCompanionTypes: ["COMPANION_FRIENDS", "COMPANION_FAMILY", "COMPANION_GROUP_TOUR"],
    supportedGoals: ["GOAL_VISITOR_GROWTH", "GOAL_SEASONALITY_BALANCE"],
    preferredBudgetLevels: ["LOW", "MID"],
    preferredTransport: ["PUBLIC_TRANSPORT", "MIXED"],
    preferredGroupTypes: ["SMALL_10_20", "MEDIUM_21_40"],
    requiresOvernight: false,
    poiCategories: ["FESTIVAL", "FOOD", "SHOPPING"],
    kpiTemplates: [
      { name: "축제 기간 방문객 수 증가율", method: "행사 기간 vs 평월 방문자수 비교" },
      { name: "동반 소비 연계율", method: "축제장 인근 음식/쇼핑 결제 비중" },
      { name: "SNS 언급량", method: "행사 해시태그 언급 건수(정성 참고 지표)" },
    ],
    riskTemplates: ["축제 일정과 여행 시기 불일치 가능", "혼잡 시 이동 지연"],
    targetDescriptionTemplate: "축제 시즌에 맞춰 방문하는 다양한 동행 유형",
  },
  {
    id: "FAMILY_EXPERIENCE",
    name: "가족 체험형",
    concept: "아이 동반 가족 단위에 맞춘 체험·안전 중심 코스",
    demandAxisWeights: { diversity: 0.5, demand: 0.5 },
    supplyAxisWeights: { network: 0.5, diversity: 0.5 },
    idealMonths: [1, 2, 7, 8, 12],
    targetAgeGroups: ["AGE_30S", "AGE_40S"],
    targetCompanionTypes: ["COMPANION_FAMILY"],
    supportedGoals: ["GOAL_NEW_MARKET", "GOAL_REPEAT_VISIT"],
    preferredBudgetLevels: ["MID", "PREMIUM"],
    preferredTransport: ["PRIVATE_VEHICLE", "MIXED"],
    preferredGroupTypes: ["FIT", "SMALL_10_20"],
    requiresOvernight: false,
    poiCategories: ["EXPERIENCE", "ATTRACTION", "FOOD"],
    kpiTemplates: [
      { name: "가족 단위 재방문율", method: "동반유형 '가족' 재예약 비율" },
      { name: "체험 프로그램 완료율", method: "체험 항목 완료 체크인 수 / 등록 인원" },
      { name: "안전사고 발생 건수", method: "운영 로그(0건 목표)" },
    ],
    riskTemplates: ["아동 안전사고 대비 동선 점검 필요", "방학 성수기 예약 조기 마감"],
    targetDescriptionTemplate: "아이를 동반한 가족 단위 여행객",
  },
  {
    id: "YOUTH_LOCAL_CONTENT",
    name: "청년 로컬·감성 콘텐츠형",
    concept: "SNS 감성 스팟과 로컬 콘텐츠 중심의 20대 타깃 코스",
    demandAxisWeights: { demand: 0.4, diversity: 0.6 },
    supplyAxisWeights: { network: 0.5, spend: 0.5 },
    idealMonths: [3, 4, 5, 6, 9, 10],
    targetAgeGroups: ["AGE_20S"],
    targetCompanionTypes: ["COMPANION_FRIENDS", "COMPANION_SOLO", "COMPANION_COUPLE"],
    supportedGoals: ["GOAL_NEW_MARKET", "GOAL_STAY_SPEND_EXPANSION"],
    preferredBudgetLevels: ["LOW", "MID"],
    preferredTransport: ["WALK", "PUBLIC_TRANSPORT"],
    preferredGroupTypes: ["FIT"],
    requiresOvernight: false,
    poiCategories: ["ATTRACTION", "FOOD", "SHOPPING"],
    kpiTemplates: [
      { name: "SNS 콘텐츠 생성 건수", method: "코스 해시태그/위치태그 게시물 수(정성 참고 지표)" },
      { name: "1인당 소비액", method: "코스 내 결제업소 매출 비교" },
      { name: "재방문 의사율", method: "설문 상위 2점 비율" },
    ],
    riskTemplates: ["트렌드 변화가 빨라 콘텐츠 갱신 필요", "소규모 매장 수용 인원 제한"],
    targetDescriptionTemplate: "감성 콘텐츠와 로컬 경험을 중시하는 20대",
  },
];

export function getTemplateById(id: string): StrategyTemplate {
  const template = STRATEGY_TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown strategy template: ${id}`);
  return template;
}
