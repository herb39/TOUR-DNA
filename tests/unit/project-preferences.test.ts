import { describe, expect, it } from "vitest";
import {
  buildStructuredProjectPreferences,
  preferredThemeLabels,
  readProjectPreferences,
} from "@/lib/validation/project-preferences";

describe("project preferences", () => {
  it("신규 구조에서 콘텐츠 테마와 여행 조건을 분리해 읽는다", () => {
    const stored = buildStructuredProjectPreferences(
      ["THEME_NIGHT_TOURISM", "THEME_K_CONTENT"],
      ["CONDITION_ACCESSIBLE", "CONDITION_WALK_TRANSIT"],
    );

    expect(readProjectPreferences(stored)).toEqual({
      themeCodes: ["THEME_NIGHT_TOURISM", "THEME_K_CONTENT"],
      themeLabels: ["야간관광", "K-콘텐츠"],
      travelConditionCodes: ["CONDITION_ACCESSIBLE", "CONDITION_WALK_TRANSIT"],
      travelConditionLabels: ["무장애·이동약자", "뚜벅이·대중교통"],
    });
  });

  it("기존 string[] 선호 테마를 새 고정 테마 코드로 연결한다", () => {
    const parsed = readProjectPreferences(["문화", "역사", "야경"]);

    expect(parsed.themeCodes).toEqual(["THEME_CULTURE_HISTORY", "THEME_NIGHT_TOURISM"]);
    expect(parsed.themeLabels).toEqual(["문화", "역사", "야경"]);
    expect(preferredThemeLabels(["미식", "문화예술"])).toEqual(["미식", "문화예술"]);
  });
});
