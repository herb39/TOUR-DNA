import type { PromoPosterViewModel } from "@/lib/domain/promoPreview";

/** 이미지 없이 타이포그래피·숫자·도형만으로 구성한 포스터 미리보기(Phase 1). 정보 위계: Level 1(지역/
 * 제목/한 줄 카피) → Level 2(여행월/타깃/대표 코스) → Level 3(핵심 전략/마무리 문구). KPI·위험·체크리스트·
 * provenance는 포스터에 넣지 않는다(분석 보고서가 아니라 홍보용 결과물). */
export function PromoPosterPreview({ poster }: { poster: PromoPosterViewModel }) {
  return (
    <div
      role="img"
      aria-label={`${poster.headline} 포스터 미리보기`}
      className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-900 to-slate-800 text-white shadow-sm"
    >
      <div className="p-5">
        <span className="inline-block rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] font-medium tracking-wide">
          {poster.regionName}
        </span>
        <h3 className="mt-3 text-xl font-bold leading-snug">{poster.headline}</h3>
        <p className="mt-1.5 text-sm text-slate-200">{poster.tagline}</p>
      </div>

      <div className="space-y-3 border-t border-white/10 bg-black/10 p-5 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-200">
          <span>{poster.travelPeriodLabel}</span>
          {poster.targetLabel ? <span>· {poster.targetLabel}</span> : null}
        </div>

        {poster.courseItems.length > 0 ? (
          <ol className="space-y-1.5">
            {poster.courseItems.map((item) => (
              <li key={item.order} className="flex items-baseline gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold">
                  {item.order}
                </span>
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-slate-400">{item.timeSlot}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-white/10 p-5">
        <span className="inline-block rounded border border-white/30 px-2 py-0.5 text-[11px] font-medium">
          {poster.strategyName}
        </span>
        <p className="text-xs leading-relaxed text-slate-200">{poster.closingNote}</p>
      </div>
    </div>
  );
}
