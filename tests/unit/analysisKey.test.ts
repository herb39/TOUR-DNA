import { describe, expect, it } from "vitest";
import { computeAnalysisKey } from "@/lib/domain/analysisKey";

describe("computeAnalysisKey", () => {
  it("동일 입력·버전이면 항상 같은 키를 반환한다", () => {
    const params = {
      input: { region: "DAEJEON", month: 9, goal: "GOAL_STAY_SPEND_EXPANSION" },
      dataVersion: "2026-07-01T00:00:00.000Z",
      modelVersion: "tour-dna-v1.0.0",
    };
    expect(computeAnalysisKey(params)).toBe(computeAnalysisKey(params));
  });

  it("객체 키 순서가 달라도 동일한 키를 반환한다", () => {
    const a = computeAnalysisKey({
      input: { region: "DAEJEON", month: 9 },
      dataVersion: "v1",
      modelVersion: "tour-dna-v1.0.0",
    });
    const b = computeAnalysisKey({
      input: { month: 9, region: "DAEJEON" },
      dataVersion: "v1",
      modelVersion: "tour-dna-v1.0.0",
    });
    expect(a).toBe(b);
  });

  it("입력이 다르면 다른 키를 반환한다", () => {
    const a = computeAnalysisKey({ input: { region: "DAEJEON" }, dataVersion: "v1", modelVersion: "v1" });
    const b = computeAnalysisKey({ input: { region: "JECHEON" }, dataVersion: "v1", modelVersion: "v1" });
    expect(a).not.toBe(b);
  });

  it("dataVersion이 다르면 다른 키를 반환한다", () => {
    const a = computeAnalysisKey({ input: { region: "DAEJEON" }, dataVersion: "v1", modelVersion: "v1" });
    const b = computeAnalysisKey({ input: { region: "DAEJEON" }, dataVersion: "v2", modelVersion: "v1" });
    expect(a).not.toBe(b);
  });
});
