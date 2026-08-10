import type { ShortFormContent } from "@/lib/domain/promoContent";

/** 숏폼 미리보기(2026-08-11) — 실제 촬영본이 아니라 Hook→장면→CTA 흐름을 확인하는 구성안 카드다.
 * PromoCardNewsPreview.tsx와 같은 리스트형 카드 레이아웃을 재사용한다. */
export function PromoShortFormPreview({ shortForm }: { shortForm: ShortFormContent }) {
  if (shortForm.scenes.length === 0) {
    return <p className="text-sm text-slate-500">아직 생성된 숏폼 구성안이 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-slate-900">{shortForm.title}</h4>
        <p className="mt-1 text-xs text-slate-500">Hook: {shortForm.hook}</p>
      </div>
      <div role="list" aria-label="숏폼 장면 구성" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shortForm.scenes.map((scene) => (
          <div key={scene.scene} role="listitem" className="flex min-h-[9rem] flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div>
              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                장면 {scene.scene}
              </span>
              <p className="mt-2 text-xs text-slate-500">{scene.visual}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{scene.caption}</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">{scene.narration}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
        CTA: {shortForm.cta}
      </div>
    </div>
  );
}
