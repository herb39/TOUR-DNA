import { describe, expect, it } from "vitest";
import { classifyLeisureActivity } from "@/lib/domain/leisureClassification";

describe("classifyLeisureActivity", () => {
  it("TourAPI 공식 LS01~LS04 중분류를 유형별로 해석한다", () => {
    expect(classifyLeisureActivity("LS", "LS01")).toMatchObject({ code: "LS01", label: "육상레저스포츠", group: "LAND" });
    expect(classifyLeisureActivity("LS", "LS02")).toMatchObject({ code: "LS02", label: "수상레저스포츠", group: "WATER" });
    expect(classifyLeisureActivity("LS", "LS03")).toMatchObject({ code: "LS03", label: "항공레저스포츠", group: "AIR" });
    expect(classifyLeisureActivity("LS", "LS04")).toMatchObject({ code: "LS04", label: "복합레저스포츠", group: "COMBINED" });
  });

  it("LS 대분류가 아니거나 공식 목록에 없는 중분류는 장소명으로 추정하지 않는다", () => {
    expect(classifyLeisureActivity("VE", "VE10")).toBeNull();
    expect(classifyLeisureActivity("LS", "LS99")).toBeNull();
    expect(classifyLeisureActivity(undefined, "LS01")).toBeNull();
  });
});
