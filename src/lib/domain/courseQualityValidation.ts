import {
  DAY_COUNT_BY_DURATION,
  DAILY_ITEM_TARGETS_BY_DURATION,
  DAY_TIME_SLOTS_BY_DURATION,
  DEFAULT_ITEM_STAY_MINUTES,
  MEAL_WINDOWS,
  estimateTravel,
  parseTimeSlotToMinutes,
  type CourseDay,
  type CourseItem,
  type TransportCode,
} from "./planBuilder";
import {
  CAUTION_TRAVEL_MINUTES,
  classifyTravelMinutes,
  EXCESSIVE_TRAVEL_MINUTES,
} from "./geo";
import {
  classifyStructuralPoiThemes,
  classifyThemes,
  templateCoreThemeCategories,
  type ThemeCategory,
} from "./audienceContext";
import { classifyLeisureActivity } from "./leisureClassification";
import { CORE_THEME_FLOOR_SHARE, type DurationCode } from "./strategy";

export interface CourseQualityWarning {
  id: string;
  title: string;
  message: string;
  details?: string[];
}

export interface CourseQualityReport {
  warnings: CourseQualityWarning[];
}

export interface CourseQualityInput {
  days: CourseDay[];
  duration: DurationCode;
  transport: TransportCode;
  templateId?: string | null;
  preferredThemes?: string[];
}

const THEME_LABEL_KO: Record<ThemeCategory, string> = {
  FOOD: "미식",
  NATURE: "자연",
  CULTURE_HISTORY: "문화·역사",
  CULTURE_ARTS: "문화예술",
  WELLNESS: "웰니스",
  FESTIVAL: "축제·이벤트",
  PET_FRIENDLY: "반려동물",
  LEISURE_ACTIVITY: "레저·액티비티",
};

type TravelSource = "ROUTE" | "ESTIMATE";

interface ResolvedTravel {
  minutes: number;
  source: TravelSource;
}

interface OperatingHoursRange {
  openMinutes: number;
  closeMinutes: number;
}

/** 운영시간 문구에서 HH:MM~HH:MM 구간을 추출한다. 여러 구간이거나 요일·시즌·회차 조건이
 * 섞인 경우는 별도 복합 문구로 취급해 자동 범위 판정을 하지 않는다. */
function parseOperatingHoursRanges(value: string | null | undefined): OperatingHoursRange[] {
  if (!value?.trim()) return [];
  const ranges: OperatingHoursRange[] = [];
  const pattern = /(\d{1,2}:\d{2})\s*[~〜–—-]\s*(\d{1,2}:\d{2})/g;
  for (const match of value.matchAll(pattern)) {
    const openMinutes = parseTimeSlotToMinutes(match[1]);
    const closeMinutes = parseTimeSlotToMinutes(match[2]);
    if (openMinutes === null || closeMinutes === null) continue;
    ranges.push({ openMinutes, closeMinutes });
  }
  return ranges;
}

function hasComplexOperatingHours(value: string | null | undefined, ranges: OperatingHoursRange[]): boolean {
  if (!value?.trim()) return false;
  if (ranges.length > 1) return true;
  return /(평일|주말|공휴일|월요일|화요일|수요일|목요일|금요일|토요일|일요일|요일|성수기|비수기|하절기|동절기|시즌|회차|입장마감|공연시간)/u.test(
    value,
  );
}

function hasReservationNotice(value: string | null | undefined): value is string {
  return Boolean(value?.trim() && /예약/u.test(value));
}

function hasMeaningfulClosedDays(value: string | null | undefined): value is string {
  const normalized = value?.trim();
  return Boolean(normalized && !hasReservationNotice(normalized) && !/^(없음|연중무휴|무휴|[-–—]+)$/u.test(normalized));
}

function formatOperatingHoursWarningDetail(dayIndex: number, item: CourseItem, reason: string): string {
  const leisureType = classifyLeisureActivity(item.lclsSystm1, item.lclsSystm2);
  const source = [
    item.operatingHours ? `운영시간 ${item.operatingHours}` : null,
    hasReservationNotice(item.closedDays)
      ? `운영 안내 ${item.closedDays}`
      : hasMeaningfulClosedDays(item.closedDays)
        ? `휴무일 ${item.closedDays}`
        : null,
    leisureType ? `공식 레저 분류 ${leisureType.label}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${dayIndex}일차 ${item.poiName}: ${reason}${source ? ` (${source})` : ""}`;
}

function evaluateOperatingHoursWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  const details: string[] = [];

  for (const day of input.days) {
    for (const item of day.items) {
      if (item.category === "LODGING") continue;

      const startMinutes = parseTimeSlotToMinutes(item.timeSlot);
      const endMinutes = startMinutes === null ? null : startMinutes + Math.max(0, item.stayMinutes);
      const ranges = parseOperatingHoursRanges(item.operatingHours);
      const complexOperatingHours = hasComplexOperatingHours(item.operatingHours, ranges);
      if (complexOperatingHours) {
        details.push(
          formatOperatingHoursWarningDetail(
            day.dayIndex,
            item,
            "요일·시즌·회차 또는 복수 시간대가 포함된 복합 운영시간은 자동 판정하지 않음",
          ),
        );
      } else if (startMinutes !== null && endMinutes !== null && ranges.length > 0) {
        const fitsAnyRange = ranges.some(({ openMinutes, closeMinutes }) => {
          const adjustedClose = closeMinutes <= openMinutes ? closeMinutes + 24 * 60 : closeMinutes;
          const adjustedEnd = endMinutes < startMinutes ? endMinutes + 24 * 60 : endMinutes;
          return startMinutes >= openMinutes && adjustedEnd <= adjustedClose;
        });
        if (!fitsAnyRange) {
          details.push(
            formatOperatingHoursWarningDetail(
              day.dayIndex,
              item,
              `일정 ${item.timeSlot} 시작·${item.stayMinutes}분 체류가 운영시간 범위를 벗어날 수 있음`,
            ),
          );
        }
      }

      if (hasReservationNotice(item.closedDays)) {
        details.push(
          formatOperatingHoursWarningDetail(
            day.dayIndex,
            item,
            "예약 운영 문구가 있어 방문 전 운영 방식 확인 필요",
          ),
        );
      } else if (hasMeaningfulClosedDays(item.closedDays)) {
        details.push(
          formatOperatingHoursWarningDetail(
            day.dayIndex,
            item,
            "휴무일 문구가 있어 여행일자·요일 기준 확인 필요(날짜 정보가 없어 자동 휴무 판정은 하지 않음)",
          ),
        );
      }
    }
  }

  if (details.length === 0) return [];
  return [
    {
      id: "operating-hours-check",
      title: "운영시간·휴무일 확인",
      message: "저장된 운영시간과 휴무일을 기준으로 확인이 필요한 장소가 있습니다. 날짜·요일이 없는 상태에서는 자동 확정 판정하지 않으므로 방문 전 공식 안내를 확인해주세요.",
      details: details.slice(0, 6),
    },
  ];
}

function resolveTravel(prev: CourseItem, current: CourseItem, transport: TransportCode): ResolvedTravel | null {
  const storedMinutes = current.travelMinutes;
  if (Number.isFinite(storedMinutes)) {
    const isRoute = current.travelSource === "LIVE_API" || current.travelSource === "CACHED_API";
    return { minutes: storedMinutes as number, source: isRoute ? "ROUTE" : "ESTIMATE" };
  }

  const estimated = estimateTravel(prev, current, transport).minutes;
  return estimated === null ? null : { minutes: estimated, source: "ESTIMATE" };
}

function formatTravelDetail(
  dayIndex: number,
  from: CourseItem,
  to: CourseItem,
  travel: ResolvedTravel,
): string {
  const tier = classifyTravelMinutes(travel.minutes);
  const sourceLabel = travel.source === "ROUTE" ? "저장된 도로 경로" : "직선거리 기반 추정";
  return `${dayIndex}일차 ${from.poiName} → ${to.poiName}: 약 ${travel.minutes}분(${sourceLabel}, ${tier})`;
}

function evaluateTravelWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  const burdened: string[] = [];
  const infeasible: string[] = [];

  for (const day of input.days) {
    for (let index = 1; index < day.items.length; index += 1) {
      const previous = day.items[index - 1];
      const current = day.items[index];
      const travel = resolveTravel(previous, current, input.transport);
      if (!travel) continue;

      if (classifyTravelMinutes(travel.minutes) !== "NORMAL") {
        burdened.push(formatTravelDetail(day.dayIndex, previous, current, travel));
      }

      const previousStart = parseTimeSlotToMinutes(previous.timeSlot);
      const currentStart = parseTimeSlotToMinutes(current.timeSlot);
      if (previousStart === null || currentStart === null) continue;
      const availableGap = currentStart - (previousStart + previous.stayMinutes);
      if (availableGap < travel.minutes) {
        infeasible.push(
          `${day.dayIndex}일차 ${previous.poiName} → ${current.poiName}: 이동 약 ${travel.minutes}분, 실제 여유 ${Math.max(0, availableGap)}분`,
        );
      }
    }
  }

  const warnings: CourseQualityWarning[] = [];
  if (burdened.length > 0) {
    const excessiveCount = burdened.filter((detail) => detail.includes("EXCESSIVE")).length;
    warnings.push({
      id: "travel-burden",
      title: "이동 부담",
      message:
        excessiveCount > 0
          ? `60분 이상 이동 구간 ${burdened.length}개가 있으며, 그중 ${excessiveCount}개는 기존 90분 초과 기준입니다.`
          : `60분 이상 이동 구간 ${burdened.length}개가 있습니다. 일정 순서나 날짜를 조정해보세요.`,
      details: burdened.slice(0, 4),
    });
  }
  if (infeasible.length > 0) {
    warnings.push({
      id: "schedule-feasibility",
      title: "시간표와 이동시간 불일치",
      message: `이전 일정의 체류시간과 이동시간을 고려하면 시작시각이 맞지 않는 구간 ${infeasible.length}개가 있습니다.`,
      details: infeasible.slice(0, 4),
    });
  }
  return warnings;
}

function evaluateDailyDensityWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  const details: string[] = [];
  for (const day of input.days) {
    const target = DAILY_ITEM_TARGETS_BY_DURATION[input.duration]?.[day.dayIndex - 1];
    const slots = DAY_TIME_SLOTS_BY_DURATION[input.duration]?.[day.dayIndex - 1];
    if (target === undefined || !slots || slots.length === 0) continue;

    const reasons: string[] = [];
    if (day.items.length > target) {
      reasons.push(`장소 ${day.items.length}곳(기본 목표 ${target}곳)`);
    }

    const lastItem = day.items[day.items.length - 1];
    const lastStart = lastItem ? parseTimeSlotToMinutes(lastItem.timeSlot) : null;
    const plannedEnd = parseTimeSlotToMinutes(slots[slots.length - 1]);
    const actualEnd = lastItem && lastStart !== null ? lastStart + lastItem.stayMinutes : null;
    const plannedEndWithStay = plannedEnd === null ? null : plannedEnd + DEFAULT_ITEM_STAY_MINUTES;
    if (actualEnd !== null && plannedEndWithStay !== null && actualEnd > plannedEndWithStay) {
      reasons.push(`예상 종료 ${lastItem.timeSlot} 시작·체류 ${lastItem.stayMinutes}분(기본 기준 ${slots[slots.length - 1]} 시작)`);
    }

    if (reasons.length > 0) {
      details.push(`${day.dayIndex}일차: ${reasons.join(", ")}`);
    }
  }

  if (details.length === 0) return [];
  return [
    {
      id: "daily-density",
      title: "하루 일정 과밀",
      message: "자동 생성 기준보다 장소 수가 많거나 기본 종료 시각을 넘긴 날짜가 있습니다. 의도한 일정인지 확인해주세요.",
      details,
    },
  ];
}

function evaluateMealWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  const details: string[] = [];
  const lunchStart = parseTimeSlotToMinutes(MEAL_WINDOWS.lunch.start) ?? 0;
  const lunchEnd = parseTimeSlotToMinutes(MEAL_WINDOWS.lunch.end) ?? 0;
  const dinnerStart = parseTimeSlotToMinutes(MEAL_WINDOWS.dinner.start) ?? 0;
  const dinnerEnd = parseTimeSlotToMinutes(MEAL_WINDOWS.dinner.end) ?? 0;

  for (const day of input.days) {
    const slots = DAY_TIME_SLOTS_BY_DURATION[input.duration]?.[day.dayIndex - 1];
    if (!slots || slots.length === 0) continue;
    const dayEnd = parseTimeSlotToMinutes(slots[slots.length - 1]);
    if (dayEnd === null) continue;

    const mealEligibleItems = day.items.filter((item) => item.category === "FOOD" && item.mealEligible !== false);
    const hasLunch = mealEligibleItems.some((item) => {
      const start = parseTimeSlotToMinutes(item.timeSlot);
      return start !== null && start >= lunchStart && start <= lunchEnd;
    });
    const hasDinner = mealEligibleItems.some((item) => {
      const start = parseTimeSlotToMinutes(item.timeSlot);
      return start !== null && start >= dinnerStart && start <= dinnerEnd;
    });

    const missing: string[] = [];
    if (dayEnd >= lunchStart && !hasLunch) missing.push("점심");
    if (dayEnd >= dinnerStart && !hasDinner) missing.push("저녁");
    if (missing.length > 0) {
      details.push(`${day.dayIndex}일차: ${missing.join("·")} 시간대에 식사 가능한 FOOD가 없습니다.`);
    }
  }

  if (details.length === 0) return [];
  return [
    {
      id: "meal-composition",
      title: "식사 구성 확인",
      message: "기존 일정 생성 규칙상 도달 가능한 점심·저녁 시간대에 식사 장소가 배치됐는지 확인해주세요.",
      details,
    },
  ];
}

function evaluateLodgingWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  const expectedDayCount = DAY_COUNT_BY_DURATION[input.duration];
  const warnings: CourseQualityWarning[] = [];

  if (input.days.length !== expectedDayCount) {
    warnings.push({
      id: "duration-days",
      title: "기간·날짜 정합성",
      message: `선택 기간의 기본 날짜 수는 ${expectedDayCount}일인데 현재 ${input.days.length}일차 데이터가 있습니다.`,
    });
  }

  const missingLodgingDays: number[] = [];
  for (let dayIndex = 1; dayIndex < expectedDayCount; dayIndex += 1) {
    const day = input.days.find((candidate) => candidate.dayIndex === dayIndex);
    if (day && !day.lodging) missingLodgingDays.push(dayIndex);
  }
  if (missingLodgingDays.length > 0) {
    warnings.push({
      id: "lodging-missing",
      title: "숙박 구성 확인",
      message: `선택 기간상 숙박이 필요한 날짜 ${missingLodgingDays.length}곳에 숙소가 없습니다.`,
      details: missingLodgingDays.map((dayIndex) => `${dayIndex}일차 숙박 필요`),
    });
  }

  const lastDay = input.days.find((day) => day.dayIndex === expectedDayCount);
  if (lastDay?.lodging) {
    warnings.push({
      id: "lodging-last-day",
      title: "숙박 날짜 확인",
      message: `${expectedDayCount}일차는 기존 기간 규칙상 마지막 날이라 숙박을 별도 일정으로 두지 않습니다.`,
      details: [lastDay.lodging.poiName],
    });
  }

  const invalidLodging = input.days
    .filter((day) => day.lodging && day.lodging.category !== "LODGING")
    .map((day) => `${day.dayIndex}일차: ${day.lodging?.poiName ?? "알 수 없음"}`);
  if (invalidLodging.length > 0) {
    warnings.push({
      id: "lodging-category",
      title: "숙박 데이터 확인",
      message: "숙박 영역에 LODGING 카테고리가 아닌 장소가 들어 있습니다.",
      details: invalidLodging,
    });
  }

  const invalidDayOrder = input.days
    .filter((day, index) => day.dayIndex !== index + 1)
    .map((day) => `${day.dayIndex}일차`);
  if (invalidDayOrder.length > 0) {
    warnings.push({
      id: "day-order",
      title: "날짜 순서 확인",
      message: "일차 번호가 연속되지 않아 저장 전 날짜 구성을 확인해주세요.",
      details: invalidDayOrder,
    });
  }

  return warnings;
}

function evaluateShoppingWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  const groups = new Map<string, string[]>();
  for (const day of input.days) {
    for (const item of day.items) {
      if (item.category !== "SHOPPING" || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      const key = `${item.lat}|${item.lng}`;
      const names = groups.get(key) ?? [];
      names.push(`${day.dayIndex}일차 ${item.poiName}`);
      groups.set(key, names);
    }
  }

  const duplicateGroups = [...groups.values()].filter((names) => names.length > 1);
  if (duplicateGroups.length === 0) return [];
  return [
    {
      id: "shopping-duplicate",
      title: "동일시설 쇼핑 중복",
      message: `같은 좌표로 확인되는 SHOPPING 시설 그룹 ${duplicateGroups.length}개가 반복됩니다. 대표 시설 1곳만 남길지 확인해주세요.`,
      details: duplicateGroups.slice(0, 4).map((names) => names.join(" · ")),
    },
  ];
}

interface ThemeEvidence {
  matched: boolean;
  source: "STRUCTURAL" | "KEYWORD" | "CATEGORY";
}

function themeEvidence(item: CourseItem, requiredThemes: ThemeCategory[]): ThemeEvidence {
  if (requiredThemes.includes("FOOD") && item.category === "FOOD") {
    return { matched: true, source: "CATEGORY" };
  }

  const structural = classifyStructuralPoiThemes(item.lclsSystm1, item.lclsSystm2);
  if (structural.length > 0) {
    return {
      matched: structural.some((theme) => requiredThemes.includes(theme)),
      source: "STRUCTURAL",
    };
  }

  const keyword = classifyThemes([item.poiName]);
  return {
    matched: keyword.some((theme) => requiredThemes.includes(theme)),
    source: "KEYWORD",
  };
}

function evaluateThemeWarnings(input: CourseQualityInput): CourseQualityWarning[] {
  if (!input.templateId) return [];
  const requiredThemes = [
    ...new Set([...templateCoreThemeCategories(input.templateId), ...classifyThemes(input.preferredThemes ?? [])]),
  ];
  if (requiredThemes.length === 0) return [];

  const hasNonFoodTheme = requiredThemes.some((theme) => theme !== "FOOD");
  const themeItems = input.days.flatMap((day) =>
    day.items.filter((item) => (hasNonFoodTheme ? item.category !== "FOOD" && item.category !== "LODGING" : item.category === "FOOD")),
  );
  if (themeItems.length === 0) return [];

  const evidence = themeItems.map((item) => ({ item, result: themeEvidence(item, requiredThemes) }));
  const matchedCount = evidence.filter(({ result }) => result.matched).length;
  const ratio = matchedCount / evidence.length;
  if (ratio >= CORE_THEME_FLOOR_SHARE) return [];

  const themeLabel = requiredThemes.map((theme) => THEME_LABEL_KO[theme]).join("·");
  const sourceCounts = evidence.reduce(
    (counts, { result }) => {
      counts[result.source] += 1;
      return counts;
    },
    { STRUCTURAL: 0, KEYWORD: 0, CATEGORY: 0 },
  );
  const sourceNote = sourceCounts.STRUCTURAL > 0 ? "공식 구조 분류를 우선 확인" : "장소명 키워드 fallback 포함";

  return [
    {
      id: "core-theme-composition",
      title: "핵심 테마 구성 부족",
      message: `${themeLabel} 관련 장소가 확인 가능한 ${evidence.length}곳 중 ${matchedCount}곳(${Math.round(ratio * 100)}%)입니다. 기존 자동 생성 권장 기준 ${Math.round(CORE_THEME_FLOOR_SHARE * 100)}%에 미달합니다.`,
      details: [`판정 근거: ${sourceNote}`],
    },
  ];
}

export function computeCourseQuality(input: CourseQualityInput): CourseQualityReport {
  const warnings = [
    ...evaluateThemeWarnings(input),
    ...evaluateShoppingWarnings(input),
    ...evaluateDailyDensityWarnings(input),
    ...evaluateMealWarnings(input),
    ...evaluateLodgingWarnings(input),
    ...evaluateTravelWarnings(input),
    ...evaluateOperatingHoursWarnings(input),
  ];
  return { warnings };
}

/** 외부 UI가 기존 이동 기준을 설명할 때 사용할 근거 문구를 한 곳에서 관리한다. */
export const COURSE_QUALITY_TRAVEL_BASIS = `기존 이동 기준 재사용: 주의 ${CAUTION_TRAVEL_MINUTES}분 이상, 과다 ${EXCESSIVE_TRAVEL_MINUTES}분 이상`;
