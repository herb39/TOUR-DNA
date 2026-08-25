import { describe, expect, it } from "vitest";
import { rerankCandidatesForCurrentCourse, type CandidateRerankInput } from "@/lib/domain/candidateRerank";

function candidate(
  id: string,
  lat: number | null,
  lng: number | null,
  overrides: Partial<CandidateRerankInput> = {},
): CandidateRerankInput {
  return {
    id,
    category: "ATTRACTION",
    lat,
    lng,
    recommendationStatus: "ALLOW",
    fit: {
      breakdown: {
        categoryFit: { score: 30, tier: "CORE" },
        themeFit: { score: 45, evaluated: true, matched: true, source: "STRUCTURAL" },
        seasonFit: { score: 20, isIdealMonth: true },
      },
    },
    ...overrides,
  };
}

describe("rerankCandidatesForCurrentCourse", () => {
  it("같은 relevance 묶음에서는 가까운 후보를 먼저 보여준다", () => {
    const result = rerankCandidatesForCurrentCourse(
      [candidate("far", 36.1, 127.1), candidate("near", 36.01, 127.01)],
      [{ lat: 36, lng: 127 }],
    );

    expect(result.map(({ candidate: item }) => item.id)).toEqual(["near", "far"]);
    expect(result[0].proximityKm).toBeLessThan(result[1].proximityKm!);
  });

  it("강한 테마 relevance는 가까운 약한 후보보다 먼저 유지한다", () => {
    const result = rerankCandidatesForCurrentCourse(
      [
        candidate("strong-far", 37, 128),
        candidate("weak-near", 36.01, 127.01, {
          fit: {
            breakdown: {
              categoryFit: { score: 30, tier: "CORE" },
              themeFit: { score: 0, evaluated: true, matched: false, source: "STRUCTURAL" },
              seasonFit: { score: 20, isIdealMonth: true },
            },
          },
        }),
      ],
      [{ lat: 36, lng: 127 }],
    );

    expect(result.map(({ candidate: item }) => item.id)).toEqual(["strong-far", "weak-near"]);
  });

  it("현재 코스가 비어 있으면 기존 순서와 좌표 근거를 그대로 유지한다", () => {
    const result = rerankCandidatesForCurrentCourse(
      [candidate("b", 36.01, 127.01), candidate("a", 36.02, 127.02)],
      [],
    );

    expect(result.map(({ candidate: item }) => item.id)).toEqual(["b", "a"]);
    expect(result.every((item) => item.proximityKm === null)).toBe(true);
  });

  it("invalid 후보와 현재 코스의 invalid 좌표는 거리 기준에 참여하지 않는다", () => {
    const result = rerankCandidatesForCurrentCourse(
      [candidate("invalid", 19.69442748, 117.9925662504), candidate("valid", 36.01, 127.01)],
      [{ lat: 19.69442748, lng: 117.9925662504 }, { lat: 36, lng: 127 }],
    );

    expect(result.map(({ candidate: item }) => item.id)).toEqual(["invalid", "valid"]);
    expect(result[0].proximityKm).toBeNull();
    expect(result[1].proximityKm).not.toBeNull();
  });

  it("같은 거리 구간의 작은 차이는 기존 결정론적 순서를 흔들지 않는다", () => {
    const result = rerankCandidatesForCurrentCourse(
      [candidate("first", 36.01, 127.01), candidate("second", 36.015, 127.015)],
      [{ lat: 36, lng: 127 }],
    );

    expect(result.map(({ candidate: item }) => item.id)).toEqual(["first", "second"]);
  });
});
