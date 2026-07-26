"use client";

import { useState } from "react";
import type { PromoCourseHighlight, PromoEvidenceReference } from "@/lib/domain/promoContent";
import { formatBaseYm } from "@/lib/format";

interface Props {
  evidenceReferences: PromoEvidenceReference[];
  courseHighlights: PromoCourseHighlight[];
}

/** 근거자료·코스 하이라이트는 참고용 표시 전용이다 — 여기서는 절대 편집 입력을 만들지 않는다. */
export function PromoContentSources({ evidenceReferences, courseHighlights }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="cursor-pointer text-sm font-semibold text-slate-900"
      >
        {open ? "생성 근거 숨기기 ▲" : "생성 근거 보기 ▼"}
      </button>
      {open ? (
        <div className="mt-3 space-y-4">
          {evidenceReferences.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold text-slate-500">데이터 근거</h4>
              <ul className="mt-1 space-y-1 break-words text-xs text-slate-600">
                {evidenceReferences.map((e, i) => (
                  <li key={i}>
                    {e.metricCode}: {e.rawValue}
                    {e.unit ? ` ${e.unit}` : ""} (출처 {e.sourceCode}, 기준월 {formatBaseYm(e.baseYm)}
                    {e.isEstimated ? ", 추정값" : ""})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {courseHighlights.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold text-slate-500">코스 하이라이트</h4>
              <ul className="mt-1 space-y-1 break-words text-xs text-slate-600">
                {courseHighlights.map((h, i) => (
                  <li key={i}>
                    {h.dayIndex}일차 {h.timeSlot} {h.poiName} ({h.category}
                    {h.mealPurpose ? `, ${h.mealPurpose}` : ""})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evidenceReferences.length === 0 && courseHighlights.length === 0 ? (
            <p className="text-xs text-slate-400">참고할 생성 근거가 없습니다.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
