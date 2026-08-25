import {
  CONTENT_THEME_OPTIONS,
  TRAVEL_CONDITION_OPTIONS,
  labelForContentTheme,
  labelForTravelCondition,
} from "./codes";

export type ContentThemeCode = (typeof CONTENT_THEME_OPTIONS)[number]["code"];
export type TravelConditionCode = (typeof TRAVEL_CONDITION_OPTIONS)[number]["code"];

export interface StructuredProjectPreferences {
  [key: string]: 1 | ContentThemeCode[] | TravelConditionCode[];
  version: 1;
  themes: ContentThemeCode[];
  travelConditions: TravelConditionCode[];
}

export interface ParsedProjectPreferences {
  themeCodes: ContentThemeCode[];
  themeLabels: string[];
  travelConditionCodes: TravelConditionCode[];
  travelConditionLabels: string[];
}

const themeCodes = new Set<string>(CONTENT_THEME_OPTIONS.map((option) => option.code));
const conditionCodes = new Set<string>(TRAVEL_CONDITION_OPTIONS.map((option) => option.code));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

/** 기존 자유 입력/라벨 데이터를 새 고정 테마 코드로 최대한 연결한다. 알 수 없는 레거시 문구는 표시용으로 보존한다. */
export function themeCodeForLabel(value: string): ContentThemeCode | undefined {
  const normalized = value.trim().toLowerCase();
  if (["미식", "음식", "맛집", "먹거리"].some((keyword) => normalized.includes(keyword))) return "THEME_FOOD";
  if (["자연", "자연관광", "자연경관"].some((keyword) => normalized.includes(keyword))) return "THEME_NATURE";
  if (["웰니스", "힐링", "휴양", "온천"].some((keyword) => normalized.includes(keyword))) return "THEME_WELLNESS";
  if (["문화예술", "문화 예술", "공연", "전시", "미술"].some((keyword) => normalized.includes(keyword))) {
    return "THEME_CULTURE_ARTS";
  }
  if (["문화·역사", "문화역사", "문화", "역사", "유적", "전통"].some((keyword) => normalized.includes(keyword))) {
    return "THEME_CULTURE_HISTORY";
  }
  if (["레저", "액티비티", "스포츠", "체험"].some((keyword) => normalized.includes(keyword))) {
    return "THEME_LEISURE_ACTIVITY";
  }
  if (["k-콘텐츠", "k콘텐츠", "촬영지", "한류"].some((keyword) => normalized.includes(keyword))) return "THEME_K_CONTENT";
  if (["야간관광", "야경", "야시장", "야간"].some((keyword) => normalized.includes(keyword))) {
    return "THEME_NIGHT_TOURISM";
  }
  return undefined;
}

export function themeLabelsFromCodes(codes: string[]): string[] {
  return codes.filter((code): code is ContentThemeCode => themeCodes.has(code)).map(labelForContentTheme);
}

export function buildStructuredProjectPreferences(
  selectedThemeCodes: string[],
  selectedTravelConditionCodes: string[],
): StructuredProjectPreferences {
  return {
    version: 1,
    themes: [...new Set(selectedThemeCodes.filter((code): code is ContentThemeCode => themeCodes.has(code)))],
    travelConditions: [
      ...new Set(selectedTravelConditionCodes.filter((code): code is TravelConditionCode => conditionCodes.has(code))),
    ],
  };
}

/** Json 컬럼의 신규 구조와 기존 string[] 구조를 모두 읽는다. */
export function readProjectPreferences(value: unknown): ParsedProjectPreferences {
  const record = isRecord(value) ? value : null;
  const rawThemes = record ? cleanStrings(record.themes) : cleanStrings(value);
  const rawConditions = record ? cleanStrings(record.travelConditions) : [];
  const codes: ContentThemeCode[] = [];
  const labels: string[] = [];

  for (const rawTheme of rawThemes) {
    const code = themeCodes.has(rawTheme) ? (rawTheme as ContentThemeCode) : themeCodeForLabel(rawTheme);
    if (code && !codes.includes(code)) codes.push(code);
    if (!labels.includes(rawTheme)) labels.push(themeCodes.has(rawTheme) ? labelForContentTheme(rawTheme) : rawTheme);
  }

  const travelConditionCodes = rawConditions.filter(
    (code): code is TravelConditionCode => conditionCodes.has(code),
  );
  return {
    themeCodes: codes,
    themeLabels: labels,
    travelConditionCodes: [...new Set(travelConditionCodes)],
    travelConditionLabels: [...new Set(travelConditionCodes)].map(labelForTravelCondition),
  };
}

export function preferredThemeLabels(value: unknown): string[] {
  return readProjectPreferences(value).themeLabels;
}

export function preferredThemeCodes(value: unknown): ContentThemeCode[] {
  return readProjectPreferences(value).themeCodes;
}

export function travelConditionCodes(value: unknown): TravelConditionCode[] {
  return readProjectPreferences(value).travelConditionCodes;
}

/** 반려동물 근거 표시·advisory를 켜는 공용 조건 판정. 컴포넌트마다 문자열을 직접 비교하지 않는다. */
export function hasPetFriendlyTravelCondition(value: unknown): boolean {
  return travelConditionCodes(value).includes("CONDITION_PET_FRIENDLY");
}

/** 무장애 근거 표시·advisory를 켜는 공용 조건 판정. 추천·필터·코스 계산에는 사용하지 않는다. */
export function hasAccessibleTravelCondition(value: unknown): boolean {
  return travelConditionCodes(value).includes("CONDITION_ACCESSIBLE");
}
