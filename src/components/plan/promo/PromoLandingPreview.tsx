import type { PromoLandingViewModel } from "@/lib/domain/promoPreview";

/** 랜딩페이지 미리보기 — 히어로 제목/가치 제안/주요 특징/대표 코스/추천 대상/CTA 구조로 보여준다
 * (2026-08-08). 실제 값이 없는 섹션(예: 축제 기획자의 "추천 대상")은 조용히 생략한다. */
export function PromoLandingPreview({ view }: { view: PromoLandingViewModel }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-teal-700 to-slate-900 p-6 text-white">
        <h3 className="text-lg font-bold leading-snug">{view.heroTitle}</h3>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-slate-700">{view.valueProposition}</p>

        {view.keyFeatures.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-slate-500">주요 특징</p>
            <ul className="mt-1.5 space-y-1">
              {view.keyFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                  <span className="mt-0.5 text-teal-600">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.courseItems.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-slate-500">대표 코스</p>
            <ol className="mt-1.5 space-y-1">
              {view.courseItems.map((item) => (
                <li key={item.order} className="flex items-baseline gap-2 text-sm text-slate-700">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                    {item.order}
                  </span>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-slate-400">{item.timeSlot}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {view.recommendedFor ? (
          <div>
            <p className="text-xs font-semibold text-slate-500">추천 대상</p>
            <p className="mt-1 text-sm text-slate-700">{view.recommendedFor}</p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 p-4">
        <span className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          {view.cta}
        </span>
      </div>
    </div>
  );
}
