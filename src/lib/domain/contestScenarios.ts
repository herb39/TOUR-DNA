import type { NationalityCode, UserRoleCode } from "./audienceContext";
import type { BudgetLevelCode, DurationCode, GroupTypeCode, TransportCode } from "./strategy";

/**
 * P0-2: 공모전 시연용 대표 시나리오 3개(강릉/경주/제천) — 입력값 묶음일 뿐이다.
 * 여기에는 관광 DNA 점수, 전략 순위, 추천 근거, KPI, 실행안, 위험요인 등 어떤 계산 결과도 담지
 * 않는다 — 프리셋을 고르면 `/projects/new` 입력폼에 아래 조건이 채워질 뿐, 이후 실제 분석 결과는
 * 기존 파이프라인(`analyzeProject.ts` → `computeDna`/`computeStrategies` → `planBuilder.ts`)이
 * 그대로 계산한다. 시나리오 ID나 지역명으로 결과를 분기하는 코드는 어디에도 없다.
 *
 * 각 필드는 `src/lib/validation/project-input.schema.ts`가 실제로 검증하는 값만 사용한다(존재하지
 * 않는 국적/테마 enum을 새로 만들지 않는다 — 국적은 DOMESTIC/FOREIGN 두 값뿐이라 "외국 국적"은
 * 곧 FOREIGN을 뜻한다).
 */
export interface RepresentativeScenario {
  id: "gangneung-summer-food-nature" | "gyeongju-autumn-culture-history" | "jecheon-winter-wellness";
  title: string;
  /** 카드에 보여줄 지역명(표시용 — 실제 지역 결정은 sigunguCode가 담당한다). */
  regionLabel: string;
  description: string;
  /** 이 프리셋을 만든 기획 의도/추천 사용 사례. */
  intent: string;
  sidoCode: string;
  sigunguCode: string;
  role: UserRoleCode;
  nationality: NationalityCode;
  ageGroups: string[];
  companionType: string;
  primaryGoal: string;
  secondaryGoal: string | null;
  duration: DurationCode;
  budgetLevel: BudgetLevelCode;
  transport: TransportCode;
  groupType: GroupTypeCode;
  preferredThemes: string[];
  excludedThemes: string[];
  travelMonth: number;
  travelYear: number;
}

export const REPRESENTATIVE_SCENARIOS: readonly RepresentativeScenario[] = [
  {
    id: "gangneung-summer-food-nature",
    title: "강릉 여름 미식·자연 상품",
    regionLabel: "강릉시",
    description: "외국인 대상으로 지역 음식과 해변·자연 자원을 엮어 판매하는 여름 체류형 상품.",
    intent: "여행사 관점 — 상품성·판매 포인트·예약 편의성 중심으로 외국인 타깃 여름 상품을 기획할 때",
    sidoCode: "SIDO_GANGWON",
    sigunguCode: "SGG_GANGNEUNG",
    role: "TRAVEL_AGENCY",
    nationality: "FOREIGN",
    ageGroups: ["AGE_20S", "AGE_30S"],
    companionType: "COMPANION_COUPLE",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: "GOAL_NEW_MARKET",
    duration: "ONE_NIGHT_TWO_DAYS",
    budgetLevel: "MID",
    transport: "PUBLIC_TRANSPORT",
    groupType: "FIT",
    preferredThemes: ["미식", "자연"],
    excludedThemes: [],
    travelMonth: 8,
    travelYear: 2026,
  },
  {
    id: "gyeongju-autumn-culture-history",
    title: "경주 가을 문화·역사 전략",
    regionLabel: "경주시",
    description: "문화유산 중심 체류시간 확대와 방문 분산으로 지역경제 파급효과를 노리는 가을 전략.",
    intent: "지자체 관점 — 공공성·지역경제·행정 보고용 KPI 중심으로 문화·역사 전략을 검토할 때",
    sidoCode: "SIDO_GYEONGBUK",
    sigunguCode: "SGG_GYEONGJU",
    role: "LOCAL_GOV",
    nationality: "DOMESTIC",
    ageGroups: ["AGE_40S", "AGE_50S"],
    companionType: "COMPANION_GROUP_TOUR",
    primaryGoal: "GOAL_LOCAL_ECONOMY",
    secondaryGoal: "GOAL_BRAND_IMAGE",
    duration: "TWO_NIGHTS_THREE_DAYS",
    budgetLevel: "MID",
    transport: "PUBLIC_TRANSPORT",
    groupType: "MEDIUM_21_40",
    preferredThemes: ["문화", "역사"],
    excludedThemes: [],
    travelMonth: 10,
    travelYear: 2026,
  },
  {
    id: "jecheon-winter-wellness",
    title: "제천 겨울 웰니스 상품",
    regionLabel: "제천시",
    description: "숙박·휴식·실내 프로그램을 결합한 겨울 체류형 웰니스 상품(의료행위·효능 주장 없음).",
    intent: "여행사 관점 — 겨울철 이동 안전과 다국어 서비스 준비도를 반영한 외국인 대상 웰니스 상품을 기획할 때",
    sidoCode: "SIDO_CHUNGBUK",
    sigunguCode: "SGG_JECHEON",
    role: "TRAVEL_AGENCY",
    nationality: "FOREIGN",
    ageGroups: ["AGE_30S", "AGE_40S"],
    companionType: "COMPANION_COUPLE",
    primaryGoal: "GOAL_STAY_SPEND_EXPANSION",
    secondaryGoal: "GOAL_REPEAT_VISIT",
    duration: "TWO_NIGHTS_THREE_DAYS",
    budgetLevel: "PREMIUM",
    transport: "PRIVATE_VEHICLE",
    groupType: "FIT",
    preferredThemes: ["웰니스"],
    excludedThemes: [],
    travelMonth: 12,
    travelYear: 2026,
  },
] as const;

export function getRepresentativeScenarioById(id: string): RepresentativeScenario | undefined {
  return REPRESENTATIVE_SCENARIOS.find((s) => s.id === id);
}
