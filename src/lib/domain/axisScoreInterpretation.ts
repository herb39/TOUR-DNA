import type { DnaAxisKey } from "./types";

/**
 * DNA 축 점수(0~100)의 "상대점수" 의미를 해석해 사용자 화면에 보여줄 문구를 만든다(2026-08-07).
 * DNA 산식(dna.ts)·최소-최대 정규화 공식(normalize.ts)은 전혀 건드리지 않고, 이미 계산돼 저장된
 * Evidence의 normalizedValue(정규화 이후 소수값, 반올림 전)만 다시 읽어 순수하게 표시용 문구를
 * 만든다 — axisSourceSummary.ts와 같은 패턴이다.
 *
 * 핵심 배경: 화면에 최종 표시되는 축 점수는 정수로 반올림한 값이라(`roundForDisplay`), 반올림 때문에
 * 0 또는 100이 된 경우와 실제로 비교지역 중 정확한 최저·최고인 경우를 화면 정수값만으로는 구분할 수
 * 없다. 예: 화천군의 수요 점수는 화면에는 "0"으로 뜨지만, 실제 정규화값은 0.03이라 27개 비교지역 중
 * 정확한 최저가 아니라 근소한 차이의 2위다(실제 최저는 울릉군). 최소-최대 정규화의 정의상, 어떤
 * 지표의 normalizedValue가 정확히 0.00이면 그 지표는 비교지역 중 정확한 최솟값이고, 정확히 100.00이면
 * 정확한 최댓값이다 — 이 성질만으로 "확정" 여부를 판별한다(코호트 전체 값을 다시 조회할 필요 없음).
 */

export type AxisExtremeLevel = "CONFIRMED_LOWEST" | "NEAR_LOWEST" | "CONFIRMED_HIGHEST" | "NEAR_HIGHEST" | "NONE";

export interface AxisExtremeInterpretation {
  level: AxisExtremeLevel;
  /** 점수 옆에 기본 노출하는 짧은 배지 문구. hover 없이도 항상 보인다. */
  badgeLabel: string | null;
  /** 배지 아래 한 줄 보조 설명. 절대적 의미가 아니라는 점을 명시한다. */
  helperText: string | null;
}

/** 연계(Network) 축은 다른 지역과 비교하는 최소-최대 정규화 방식이 아니라(개수 기반 체감 곡선),
 * "비교지역 내 최저/최고"라는 개념 자체가 적용되지 않는다. */
function isComparableAxis(axisKey: DnaAxisKey): boolean {
  return axisKey !== "network";
}

/**
 * @param axisKey 축 코드(연계는 항상 NONE을 반환)
 * @param displayScore 화면에 최종 표시되는 반올림된 점수(0~100 또는 null)
 * @param contributingNormalizedValues 이 축 점수 계산에 실제로 쓰인 근거들의 정규화값(반올림 전,
 *   normalizedValue가 null이 아닌 것만 — 화면 표시 전용 참고 지표는 애초에 제외돼 있어야 한다)
 */
export function interpretAxisExtreme(
  axisKey: DnaAxisKey,
  displayScore: number | null,
  contributingNormalizedValues: number[],
): AxisExtremeInterpretation {
  const none: AxisExtremeInterpretation = { level: "NONE", badgeLabel: null, helperText: null };
  if (displayScore === null) return none;
  if (!isComparableAxis(axisKey)) return none;
  if (contributingNormalizedValues.length === 0) return none;

  if (displayScore === 0) {
    const confirmed = contributingNormalizedValues.every((v) => v === 0);
    return confirmed
      ? {
          level: "CONFIRMED_LOWEST",
          badgeLabel: "비교지역 내 최저",
          helperText: "실제 값이 0이라는 뜻이 아니라, 현재 비교지역 중 상대적으로 가장 낮은 수준입니다.",
        }
      : {
          level: "NEAR_LOWEST",
          badgeLabel: "비교지역 내 매우 낮음",
          helperText: "실제 값이 0이라는 뜻이 아니라, 현재 비교지역 중 최저 수준에 매우 가깝다는 의미입니다.",
        };
  }

  if (displayScore === 100) {
    const confirmed = contributingNormalizedValues.every((v) => v === 100);
    return confirmed
      ? {
          level: "CONFIRMED_HIGHEST",
          badgeLabel: "비교지역 내 최고",
          helperText: "절대적인 만점이 아니라, 현재 비교지역 중 상대적으로 가장 높은 수준입니다.",
        }
      : {
          level: "NEAR_HIGHEST",
          badgeLabel: "비교지역 내 매우 높음",
          helperText: "절대적인 만점이 아니라, 현재 비교지역 중 최고 수준에 매우 가깝다는 의미입니다.",
        };
  }

  return none;
}
