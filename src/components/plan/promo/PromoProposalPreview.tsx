import type { PromoProposalViewModel } from "@/lib/domain/promoPreview";

/** 제안서 미리보기 — 사업명/추진 목적/핵심 전략/대표 코스/기대 효과/주요 위험 구조로 보여준다
 * (2026-08-08). 역할별로 존재하지 않는 항목(예: 여행사의 "주요 위험")은 조용히 생략한다. */
export function PromoProposalPreview({ view }: { view: PromoProposalViewModel }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-400">사업명</p>
      <h3 className="mt-0.5 text-base font-bold text-slate-900">{view.businessName}</h3>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500">추진 목적</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{view.purpose}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500">핵심 전략</p>
          <span className="mt-1 inline-block rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-sm font-medium text-teal-800">
            {view.coreStrategy}
          </span>
        </div>

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

        {view.expectedEffects.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-slate-500">기대 효과</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
              {view.expectedEffects.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {view.risks.length > 0 ? (
          <div>
            <p className="text-xs font-semibold text-slate-500">주요 위험</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-amber-700">
              {view.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
