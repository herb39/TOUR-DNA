import { formatBaseYm, formatIndexValue, formatSignedPercent, formatVisitorCount, metricLabel, sourceLabel } from "@/lib/format";
import { METRIC_CODES } from "./types";

/**
 * 핵심 관광 지표 요약카드(2026-07-29, 2차 데이터 신뢰도 개선 Section 4). 분석 결과에 실제로 저장된
 * Evidence(방문자수/증감률/체류·소비 지수)만으로 카드를 구성한다 — 값이 없는 지표는 카드 자체를 만들지
 * 않는다(허위로 0을 지어내지 않음). analysis 화면과 print 화면이 동일한 함수를 공유해 값·단위·포맷이
 * 어긋나지 않게 한다.
 */
export interface TourismMetricEvidenceLike {
  rawValue: number;
  baseYm: string;
  sourceCode: string;
  /** 저장된 Evidence.appliedRule을 그대로 넘기면(증감률 카드) 비교 기준(전년 동월/직전 확인월)을
   * 화면에 그대로 노출할 수 있다. */
  appliedRule?: string;
}

export interface TourismMetricCard {
  key: "visitor" | "growth" | "stay" | "spend";
  label: string;
  valueText: string;
  metaText: string;
  note?: string;
}

export function buildTourismMetricCards(input: {
  visitor: TourismMetricEvidenceLike | null;
  growth: TourismMetricEvidenceLike | null;
  stay: TourismMetricEvidenceLike | null;
  spend: TourismMetricEvidenceLike | null;
}): TourismMetricCard[] {
  const cards: TourismMetricCard[] = [];

  if (input.visitor) {
    cards.push({
      key: "visitor",
      label: metricLabel(METRIC_CODES.VISITOR_CNT),
      valueText: formatVisitorCount(input.visitor.rawValue),
      metaText: `${formatBaseYm(input.visitor.baseYm)} · ${sourceLabel(input.visitor.sourceCode)}`,
    });
  }

  if (input.growth) {
    cards.push({
      key: "growth",
      label: metricLabel(METRIC_CODES.DEMAND_VISITOR_GROWTH_DISPLAY),
      valueText: formatSignedPercent(input.growth.rawValue),
      metaText: `${formatBaseYm(input.growth.baseYm)} · ${sourceLabel(input.growth.sourceCode)}`,
      note: input.growth.appliedRule,
    });
  }

  if (input.stay) {
    cards.push({
      key: "stay",
      label: metricLabel(METRIC_CODES.STAY),
      valueText: `${formatIndexValue(input.stay.rawValue)} 지수`,
      metaText: `${formatBaseYm(input.stay.baseYm)} · ${sourceLabel(input.stay.sourceCode)}`,
      note: "실제 체류시간이 아니라 비교군 내 상대적 체류 강도 지수입니다.",
    });
  }

  if (input.spend) {
    cards.push({
      key: "spend",
      label: metricLabel(METRIC_CODES.SPEND),
      valueText: `${formatIndexValue(input.spend.rawValue)} 지수`,
      metaText: `${formatBaseYm(input.spend.baseYm)} · ${sourceLabel(input.spend.sourceCode)}`,
      note: "실제 소비 금액이 아니라 비교군 내 상대적 소비 강도 지수입니다.",
    });
  }

  return cards;
}
