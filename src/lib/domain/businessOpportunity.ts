import { classifyThemes, roleLabel, type ThemeCategory, type UserRoleCode } from "./audienceContext";
import { clamp, roundForDisplay } from "./normalize";
import { AXIS_LABEL_KO, type AxisStatus, type DnaAxisKey } from "./types";
import type { PoiCategoryCode } from "./strategyTemplates";

/**
 * 관광사업 기회 3안(README 로드맵 "기회발굴", 2026-08-02). DNA 진단(축 점수/상태)과 전략 3안 사이에
 * 표시되는, 전략보다 한 단계 위의 "지금 검토할 가치가 있는 사업 기회"를 계산한다.
 *
 * ## 전략 3안과의 경계
 * - **전략 3안**(`strategy.ts`)은 "실제 상품화 가능한 코스 유형"을 7개 고정 템플릿 카탈로그에서
 *   점수화해 상위 3개를 고르고, 그중 하나를 선택하면 POI·체크리스트·KPI가 붙은 실행안으로 이어진다.
 * - **기회 3안**(이 파일)은 "왜 지금 이 사업을 검토해야 하는가"를 축 점수·계절·POI 공급량·선호 테마
 *   조합에서 발견한 **문제**와 **방향**으로만 제시한다. 실행 가능한 코스나 POI 배치까지는 내려가지
 *   않으며, 선택·저장 개념이 없다(전략처럼 DB에 저장하지 않고 분석 화면 렌더링 시점에 항상 다시
 *   계산한다 — 결정론적 순수 함수라 새로고침해도 같은 입력이면 같은 결과가 나온다. Prisma 스키마
 *   변경이 필요 없다).
 * - 후보 생성 로직이 전략 템플릿 카탈로그(`STRATEGY_TEMPLATES`)를 전혀 참조하지 않아, 문구가 전략
 *   카드와 우연히도 실질적으로 겹치지 않는다(축 취약점/계절/공급 격차/테마 격차라는 서로 다른 4개
 *   신호를 쓴다 — 전략은 "템플릿 적합도 점수", 기회는 "구조적 격차 발견"이라는 다른 질문에 답한다).
 *
 * ## 4가지 기회 신호(서로 독립적인 데이터 신호를 사용해 문제·타깃·자원이 자연히 달라지게 한다)
 * 1. `WEAKNESS_RECOVERY`(취약축 보완형): DNA 5축 중 점수가 가장 낮은 축을 보완하는 사업 기회.
 * 2. `SEASONALITY_GAP`(계절 격차형): 입력한 여행월이 통상적 비수기/성수기인지에 따른 사업 기회.
 * 3. `SUPPLY_GAP`(공급 격차형): 지역 POI 카테고리 중 상대적으로 공급이 부족한 유형을 보완하는 기회.
 * 4. `TARGET_THEME_GAP`(타깃·테마 격차형): 사용자가 선택한 선호 테마 대비 관련 POI 공급이 부족한 기회.
 *
 * 근거가 부족하면(여행월 미입력, 선호 테마 미입력, 지역 POI 데이터 없음 등) 해당 신호의 후보를 아예
 * 생성하지 않는다(임의 수치·장소를 지어내지 않음, 마스터 문서의 기존 원칙과 동일) — 그 결과 유효한
 * 후보가 3개 미만이면 3개를 채우지 않고 있는 만큼만 반환하며 `note`에 사유를 남긴다.
 */

export type OpportunityCategory = "WEAKNESS_RECOVERY" | "SEASONALITY_GAP" | "SUPPLY_GAP" | "TARGET_THEME_GAP";

export interface OpportunityItem {
  category: OpportunityCategory;
  /** 기회 제목 */
  title: string;
  /** 발견된 지역 문제 */
  problem: string;
  /** 활용 가능한 강점·자원 */
  strengthsToLeverage: string;
  /** 주요 타깃 */
  targetAudience: string;
  /** 적정 시기 */
  timing: string;
  /** 사업 방향 */
  direction: string;
  /** 데이터 근거(사람이 읽는 요약 문장들) */
  evidence: string[];
  /** 한계 및 추가 확인사항(공통 안내 포함, 전체 문장) */
  limitations: string;
  /** limitations 중 이 기회에만 해당하는 부분(공통 안내 제외) — 카드마다 반복되는 공통 안내
   * (OPPORTUNITY_LIMITATION_SUFFIX)는 섹션에 한 번만 표시하고, 카드에는 이 필드만 보여준다
   * (2026-08-06). 공통 안내만 해당하고 기회별로 다른 한계가 없으면 null. */
  uniqueLimitationNote: string | null;
}

/** 기회 생성 규칙의 버전. 규칙 문구·점수식을 바꿀 때마다 올린다 — 화면에 노출해 "이 결과가 어떤
 * 규칙 버전으로 만들어졌는지" 추적 가능하게 한다(재현성 보완, 2026-08-02). */
export const OPPORTUNITY_RULE_VERSION = "opportunity-rules-v1";

export interface BusinessOpportunityAnalysis {
  items: OpportunityItem[]; // 0~3개
  /** 유효한 후보가 3개 미만일 때만 채워지는 사유 설명. 3개 모두 확보되면 null. */
  note: string | null;
  /** 이 결과를 만든 규칙 버전(OPPORTUNITY_RULE_VERSION과 동일) — 화면에는 원문 노출 없이 "정제 규칙
   * 적용" 배지로만 표시한다(2026-08-07, 내부 식별자 노출 정리). */
  ruleVersion: string;
  /** 모든 기회 카드에 공통으로 붙는 한계 안내(OPPORTUNITY_LIMITATION_SUFFIX와 동일 문구) — 카드마다
   * 반복하지 않고 섹션에 한 번만 표시한다(2026-08-06, 2026-08-07부터 페이지 전체 통합 섹션 1곳에만
   * 표시). items가 비어 있으면 표시할 대상이 없어 null. */
  commonLimitationNote: string | null;
}

export interface AxisScoreInput {
  axis: DnaAxisKey;
  score: number | null;
  status: AxisStatus;
}

export interface ComputeBusinessOpportunitiesInput {
  regionName: string;
  /** DNA 5축 점수/상태 — 5개 전부 없어도 되며, 순서는 무관하다. */
  axisScores: AxisScoreInput[];
  role: UserRoleCode | undefined;
  travelMonth: number | undefined;
  /** 자유 텍스트 선호 테마 원본(정규화는 이 함수 내부에서 `classifyThemes`로 처리). */
  preferredThemes: string[];
  /** 지역 전체 POI 카테고리별 개수(좌표·이름 등 상세는 필요 없다 — 개수만으로 공급 격차를 판단). */
  poiCountByCategory: Partial<Record<PoiCategoryCode, number>>;
}

const CANDIDATE_ORDER: OpportunityCategory[] = [
  "WEAKNESS_RECOVERY",
  "SEASONALITY_GAP",
  "SUPPLY_GAP",
  "TARGET_THEME_GAP",
];

function axisScoreText(a: AxisScoreInput): string {
  const statusLabel = a.status === "LIVE" ? "실시간 데이터" : a.status === "SNAPSHOT" ? "최근 확보 데이터" : "데이터 부족";
  return `${AXIS_LABEL_KO[a.axis]} 축 ${a.score ?? "확인 불가"}점(${statusLabel})`;
}

/** 가장 높은 축을 "활용 가능한 강점·자원" 문구로 재사용한다 — 후보마다 새로 지어내지 않고 이미 계산된
 * DNA 축 결과를 그대로 근거로 삼는다. 유효한 축이 하나도 없으면 정직하게 데이터 부족을 알린다. */
function topStrengthText(scored: AxisScoreInput[]): string {
  const available = scored.filter((s): s is AxisScoreInput & { score: number } => s.score !== null);
  if (available.length === 0) return "현재 확보된 데이터로는 뚜렷한 강점 축을 특정할 수 없음 — 추가 데이터 확보 후 재확인 필요";
  const top = [...available].sort((a, b) => b.score - a.score)[0];
  return `${AXIS_LABEL_KO[top.axis]} 축(${top.score}점)이 비교군 내 상대적 강점으로 확인됨`;
}

const OPPORTUNITY_LIMITATION_SUFFIX = "공공데이터 비교와 기획 규칙을 바탕으로 도출한 사업 아이디어입니다.";

// ── 1. 취약축 보완형 ────────────────────────────────────────────────

const AXIS_OPPORTUNITY_COPY: Record<
  DnaAxisKey,
  { title: string; problem: string; direction: string; targetAudience: string }
> = {
  demand: {
    title: "수요 기반 확대 기회",
    problem: "관광 수요 자체가 비교군 지역 대비 상대적으로 낮음",
    direction: "신규 유입보다 재방문·구전 유도에 우선 집중하는 사업",
    targetAudience: "재방문 가능성이 높은 근거리·반복 방문객",
  },
  stay: {
    title: "체류 연장형 상품 기회",
    problem: "체류 강도가 낮아 방문객이 짧게 머물다 이동함",
    direction: "야간·체험형 콘텐츠로 체류 시간을 늘리는 사업",
    targetAudience: "1박 이상 체류가 가능한 여가형 방문객",
  },
  spend: {
    title: "소비 접점 확대 기회",
    problem: "1인당 소비 강도가 비교군 대비 낮음",
    direction: "유료 체험·로컬 상품 등 소비 접점을 늘리는 사업",
    targetAudience: "구매력이 있는 개별·소규모 그룹 방문객",
  },
  diversity: {
    title: "테마 다각화 기회",
    problem: "관광 유형이 단조로워 재방문 유인이 약함",
    direction: "기존과 다른 테마 콘텐츠를 추가해 다양성을 넓히는 사업",
    targetAudience: "다양한 체험을 찾는 여행객",
  },
  network: {
    title: "관광지 연계 강화 기회",
    problem: "관광지 간 연계가 약해 하나의 코스로 묶이지 않음",
    direction: "인근 명소를 잇는 연계 코스·교통 상품 개발",
    targetAudience: "여러 곳을 묶어 도는 코스형 여행객",
  },
};

function buildWeaknessRecoveryOpportunity(
  axisScores: AxisScoreInput[],
  regionName: string,
): (OpportunityItem & { score: number }) | null {
  const available = axisScores.filter((s): s is AxisScoreInput & { score: number } => s.score !== null);
  if (available.length === 0) return null;
  const weakest = [...available].sort((a, b) => a.score - b.score)[0];
  const copy = AXIS_OPPORTUNITY_COPY[weakest.axis];

  return {
    category: "WEAKNESS_RECOVERY",
    title: copy.title,
    problem: `${regionName}의 ${copy.problem}(${AXIS_LABEL_KO[weakest.axis]} 축 ${weakest.score}점).`,
    strengthsToLeverage: topStrengthText(axisScores),
    targetAudience: copy.targetAudience,
    timing: "특정 계절 제약보다 상시 추진 가능한 구조적 과제",
    direction: copy.direction,
    evidence: [axisScoreText(weakest)],
    limitations:
      weakest.status === "SNAPSHOT"
        ? `${OPPORTUNITY_LIMITATION_SUFFIX} 이 축은 실시간이 아닌 최근 확보 데이터를 사용해 계산됐습니다.`
        : OPPORTUNITY_LIMITATION_SUFFIX,
    uniqueLimitationNote: weakest.status === "SNAPSHOT" ? "이 축은 실시간이 아닌 최근 확보 데이터를 사용해 계산됐습니다." : null,
    score: 100 - weakest.score,
  };
}

// ── 2. 계절 격차형 ──────────────────────────────────────────────────

/** 통상적으로 국내 관광 방문이 저조한 것으로 알려진 시기(CURATED, 실제 방문자 통계 API 연동 전까지의
 * 명시적 규칙 — 실제 수치를 지어내지 않는다). 혹서기/혹한기와 겹치지만 이 판정은 "위험요인"이 아니라
 * "수요 시기" 관점이라 `audienceContext.ts`의 계절 위험 규칙과는 별도로 이 파일에 독립적으로 둔다. */
const OFF_PEAK_MONTHS = new Set([1, 2, 7, 8, 12]);

const SEASON_DIRECTION_BY_ROLE: Record<"OFF_PEAK" | "PEAK", Record<UserRoleCode, string>> = {
  OFF_PEAK: {
    LOCAL_GOV: "지자체 주도 비수기 프로모션·바우처 연계 사업",
    TRAVEL_AGENCY: "비수기 할인 패키지 상품화",
    FESTIVAL_PLANNER: "비수기 소규모 이벤트·체험 프로그램 기획",
  },
  PEAK: {
    LOCAL_GOV: "성수기 혼잡 분산과 방문객 관리 체계 마련",
    TRAVEL_AGENCY: "성수기 고부가 프리미엄 패키지 상품화",
    FESTIVAL_PLANNER: "성수기 대형 이벤트 수용력 확대 기획",
  },
};
const SEASON_TARGET_BY_ROLE: Record<"OFF_PEAK" | "PEAK", Record<UserRoleCode, string>> = {
  OFF_PEAK: {
    LOCAL_GOV: "비수기에도 방문 가능한 지역 주민·근거리 관광객",
    TRAVEL_AGENCY: "비수기 할인에 민감한 개별 여행객",
    FESTIVAL_PLANNER: "소규모 비수기 이벤트 참가층",
  },
  PEAK: {
    LOCAL_GOV: "성수기 방문이 몰리는 가족·단체 방문객",
    TRAVEL_AGENCY: "성수기에도 지출 여력이 있는 방문객",
    FESTIVAL_PLANNER: "대형 이벤트를 찾는 방문객",
  },
};
const SEASON_DEFAULT_DIRECTION: Record<"OFF_PEAK" | "PEAK", string> = {
  OFF_PEAK: "비수기 전용 프로모션 상품 기획",
  PEAK: "성수기 수용력·객단가 관리 전략 마련",
};
const SEASON_DEFAULT_TARGET: Record<"OFF_PEAK" | "PEAK", string> = {
  OFF_PEAK: "가격에 민감한 개별 여행객",
  PEAK: "성수기에도 방문을 결정한 방문객",
};

function buildSeasonalityGapOpportunity(
  axisScores: AxisScoreInput[],
  travelMonth: number | undefined,
  role: UserRoleCode | undefined,
  regionName: string,
): (OpportunityItem & { score: number }) | null {
  if (travelMonth === undefined) return null; // 여행월 자체가 없으면 계절 기회를 지어내지 않는다.

  const isOffPeak = OFF_PEAK_MONTHS.has(travelMonth);
  const key: "OFF_PEAK" | "PEAK" = isOffPeak ? "OFF_PEAK" : "PEAK";
  const direction = role ? SEASON_DIRECTION_BY_ROLE[key][role] : SEASON_DEFAULT_DIRECTION[key];
  const targetAudience = role ? SEASON_TARGET_BY_ROLE[key][role] : SEASON_DEFAULT_TARGET[key];

  return {
    category: "SEASONALITY_GAP",
    title: isOffPeak ? "비수기 수요 분산 기회" : "성수기 수용력 활용 기회",
    problem: isOffPeak
      ? `입력한 여행월(${travelMonth}월)은 국내 관광에서 일반적으로 비수기로 분류되는 시기임(전국 통계 기반 일반적 경향이며 ${regionName}의 실제 월별 방문자 데이터로 확인된 것은 아님) — 이 시기 ${regionName}의 수요 확보 전략이 필요할 수 있음.`
      : `입력한 여행월(${travelMonth}월)은 국내 관광에서 일반적으로 성수기로 분류되는 시기임(전국 통계 기반 일반적 경향이며 ${regionName}의 실제 월별 방문자 데이터로 확인된 것은 아님) — 이 시기 ${regionName}의 수용력·객단가 관리가 필요할 수 있음.`,
    strengthsToLeverage: topStrengthText(axisScores),
    targetAudience,
    timing: `${travelMonth}월(${isOffPeak ? "비수기" : "성수기"}) 및 전후 시기`,
    direction,
    evidence: [`입력 조건의 여행월: ${travelMonth}월(${isOffPeak ? "비수기로 분류" : "성수기로 분류"}, 기획 규칙 기준)`],
    limitations: `이 시기 구분은 일반적으로 알려진 경향(기획 규칙)이며, ${regionName}의 실제 월별 방문자 데이터로 재검증이 필요합니다. ${OPPORTUNITY_LIMITATION_SUFFIX}`,
    uniqueLimitationNote: `이 시기 구분은 일반적으로 알려진 경향(기획 규칙)이며, ${regionName}의 실제 월별 방문자 데이터로 재검증이 필요합니다.`,
    score: isOffPeak ? 65 : 40,
  };
}

// ── 3·4. 공급 격차형 / 타깃·테마 격차형(공용 헬퍼) ──────────────────

const ALL_POI_CATEGORIES: PoiCategoryCode[] = ["ATTRACTION", "FOOD", "LODGING", "EXPERIENCE", "FESTIVAL", "SHOPPING"];

const POI_CATEGORY_LABEL_KO: Record<PoiCategoryCode, string> = {
  ATTRACTION: "관광지",
  FOOD: "음식",
  LODGING: "숙박",
  EXPERIENCE: "체험",
  FESTIVAL: "축제/이벤트",
  SHOPPING: "쇼핑",
};

const POI_CATEGORY_TARGET_AUDIENCE: Record<PoiCategoryCode, string> = {
  ATTRACTION: "관광명소를 찾는 일반 방문객",
  FOOD: "미식을 목적으로 방문하는 방문객",
  LODGING: "숙박을 연계한 체류형 방문객",
  EXPERIENCE: "체험형 프로그램을 찾는 방문객",
  FESTIVAL: "축제·이벤트 참가를 목적으로 하는 방문객",
  SHOPPING: "지역 특산품 구매를 원하는 방문객",
};

/** 카테고리 공급 부족 정도를 0~100으로 계산한다 — "전체 카테고리가 균등하게 있다면 각각 1/6을
 * 차지해야 한다"는 기준선(uniform baseline) 대비 실제 비중이 얼마나 못 미치는지를 본다. 균등 기준
 * 이상이면 0(격차 아님), 카테고리 자체가 0건이면 100(가장 큰 격차)이 나온다. */
function shareDeficitScore(categoryCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  const expectedShare = 1 / ALL_POI_CATEGORIES.length;
  const actualShare = categoryCount / totalCount;
  const deficit = Math.max(0, expectedShare - actualShare);
  return roundForDisplay(clamp((deficit / expectedShare) * 100, 0, 100));
}

function buildSupplyGapOpportunity(
  axisScores: AxisScoreInput[],
  poiCountByCategory: Partial<Record<PoiCategoryCode, number>>,
  travelMonth: number | undefined,
  regionName: string,
): (OpportunityItem & { score: number }) | null {
  const counts = ALL_POI_CATEGORIES.map((c) => ({ category: c, count: poiCountByCategory[c] ?? 0 }));
  const totalCount = counts.reduce((sum, c) => sum + c.count, 0);
  if (totalCount === 0) return null; // 지역 POI 데이터 자체가 없으면 공급 격차를 지어내지 않는다.

  const scored = counts
    .map((c) => ({ ...c, deficit: shareDeficitScore(c.count, totalCount) }))
    .sort((a, b) => b.deficit - a.deficit || ALL_POI_CATEGORIES.indexOf(a.category) - ALL_POI_CATEGORIES.indexOf(b.category));
  const worst = scored[0];
  if (worst.deficit <= 0) return null; // 카테고리가 균등해 의미 있는 공급 격차가 없음

  const label = POI_CATEGORY_LABEL_KO[worst.category];

  return {
    category: "SUPPLY_GAP",
    title: `${label} 공급 확충 기회`,
    problem: `${regionName}의 ${label} 관련 장소 공급이 지역 내 다른 유형 대비 부족함(전체 ${totalCount}건 중 ${worst.count}건).`,
    strengthsToLeverage: topStrengthText(axisScores),
    targetAudience: POI_CATEGORY_TARGET_AUDIENCE[worst.category],
    timing: travelMonth ? `${travelMonth}월 기준 발굴 착수, 다음 성수기 적용 목표` : "연중 상시 발굴 가능",
    direction: `${label} 신규 발굴·연계 상품화 및 지역 사업자 육성`,
    evidence: [`지역 등록 POI ${totalCount}건 중 ${label} ${worst.count}건(비중 ${roundForDisplay((worst.count / totalCount) * 100)}%)`],
    limitations: `이 지역에 등록된 공공데이터 POI 기준이며, 실제로는 아직 등록되지 않은 사업자가 있을 수 있어 현장 조사로 보완이 필요합니다. ${OPPORTUNITY_LIMITATION_SUFFIX}`,
    uniqueLimitationNote: "이 지역에 등록된 공공데이터 POI 기준이며, 실제로는 아직 등록되지 않은 사업자가 있을 수 있어 현장 조사로 보완이 필요합니다.",
    score: worst.deficit,
  };
}

const THEME_LABEL_KO: Record<ThemeCategory, string> = {
  FOOD: "미식",
  NATURE: "자연",
  CULTURE_HISTORY: "문화·역사",
  CULTURE_ARTS: "문화예술",
  WELLNESS: "웰니스",
  FESTIVAL: "축제",
  PET_FRIENDLY: "반려동물 동반",
  LEISURE_ACTIVITY: "레저·액티비티",
  K_CONTENT: "K-콘텐츠",
  NIGHT_TOURISM: "야간관광",
};

/** 테마 카테고리 → 공급량을 비교할 대표 POI 카테고리. 반려동물 동반은 대응하는 POI 카테고리 자체가
 * 없어(전용 코스 템플릿이 없는 것과 같은 이유, strategyTemplates.ts 참고) 의도적으로 비워둔다(MISSING). */
const THEME_TO_POI_CATEGORY: Partial<Record<ThemeCategory, PoiCategoryCode>> = {
  FOOD: "FOOD",
  NATURE: "ATTRACTION",
  CULTURE_HISTORY: "ATTRACTION",
  CULTURE_ARTS: "ATTRACTION",
  WELLNESS: "EXPERIENCE",
  FESTIVAL: "FESTIVAL",
  LEISURE_ACTIVITY: "EXPERIENCE",
  K_CONTENT: "ATTRACTION",
  NIGHT_TOURISM: "ATTRACTION",
};

function buildTargetThemeGapOpportunity(
  axisScores: AxisScoreInput[],
  preferredThemes: string[],
  poiCountByCategory: Partial<Record<PoiCategoryCode, number>>,
  role: UserRoleCode | undefined,
  travelMonth: number | undefined,
  regionName: string,
): (OpportunityItem & { score: number }) | null {
  const themeCategories = classifyThemes(preferredThemes);
  if (themeCategories.length === 0) return null; // 선호 테마 미입력이면 이 유형은 지어내지 않는다.

  const totalCount = ALL_POI_CATEGORIES.reduce((sum, c) => sum + (poiCountByCategory[c] ?? 0), 0);
  if (totalCount === 0) return null;

  const candidates = themeCategories
    .map((theme) => {
      const poiCategory = THEME_TO_POI_CATEGORY[theme];
      if (!poiCategory) return null;
      const count = poiCountByCategory[poiCategory] ?? 0;
      return { theme, poiCategory, count, deficit: shareDeficitScore(count, totalCount) };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.deficit - a.deficit);

  if (candidates.length === 0 || candidates[0].deficit <= 0) return null;

  const best = candidates[0];
  const themeLabel = THEME_LABEL_KO[best.theme];
  const poiLabel = POI_CATEGORY_LABEL_KO[best.poiCategory];
  const roleAudience = role
    ? `${roleLabel(role)}가 유치하려는 '${themeLabel}' 테마 방문객`
    : `'${themeLabel}' 테마를 원하는 방문객`;

  return {
    category: "TARGET_THEME_GAP",
    title: `${themeLabel} 테마 자원 활용 기회`,
    problem: `선호 테마로 선택한 '${themeLabel}' 관련 장소(${poiLabel})가 ${regionName} 내 다른 유형 대비 부족함(전체 ${totalCount}건 중 ${best.count}건).`,
    strengthsToLeverage: topStrengthText(axisScores),
    targetAudience: roleAudience,
    timing: travelMonth ? `${travelMonth}월 방문객 대상` : "연중 상시",
    direction: `'${themeLabel}' 테마에 맞는 자원 발굴 및 상품화`,
    evidence: [`선호 테마 입력: ${preferredThemes.join(", ")} → '${themeLabel}' 분류`, `지역 등록 POI ${totalCount}건 중 ${poiLabel} ${best.count}건`],
    limitations: `테마 매칭은 키워드 기반 근사치이며 실제 자원 성격과 다를 수 있습니다. ${OPPORTUNITY_LIMITATION_SUFFIX}`,
    uniqueLimitationNote: "테마 매칭은 키워드 기반 근사치이며 실제 자원 성격과 다를 수 있습니다.",
    score: best.deficit,
  };
}

/** 관광사업 기회 3안을 계산한다. DB 조회·외부 API 호출이 전혀 없는 순수 함수 — 매 렌더링 시점에
 * 다시 호출해도 안전하고, 저장이 필요 없다. */
export function computeBusinessOpportunities(
  input: ComputeBusinessOpportunitiesInput,
): BusinessOpportunityAnalysis {
  const candidates = [
    buildWeaknessRecoveryOpportunity(input.axisScores, input.regionName),
    buildSeasonalityGapOpportunity(input.axisScores, input.travelMonth, input.role, input.regionName),
    buildSupplyGapOpportunity(input.axisScores, input.poiCountByCategory, input.travelMonth, input.regionName),
    buildTargetThemeGapOpportunity(
      input.axisScores,
      input.preferredThemes,
      input.poiCountByCategory,
      input.role,
      input.travelMonth,
      input.regionName,
    ),
  ].filter((c): c is OpportunityItem & { score: number } => c !== null);

  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || CANDIDATE_ORDER.indexOf(a.category) - CANDIDATE_ORDER.indexOf(b.category),
  );
  const items = sorted.slice(0, 3).map((candidate) => {
    const { score, ...rest } = candidate;
    void score; // 정렬에만 쓰고 화면에는 노출하지 않는다.
    return rest;
  });

  const note =
    items.length < 3
      ? `데이터 근거가 확인되는 기회만 표시했습니다(${items.length}건). 나머지 유형은 여행월/선호 테마 미입력 또는 지역 POI 데이터 부족 등으로 근거가 충분하지 않아 만들지 않았습니다.`
      : null;

  return {
    items,
    note,
    ruleVersion: OPPORTUNITY_RULE_VERSION,
    commonLimitationNote: items.length > 0 ? OPPORTUNITY_LIMITATION_SUFFIX : null,
  };
}
