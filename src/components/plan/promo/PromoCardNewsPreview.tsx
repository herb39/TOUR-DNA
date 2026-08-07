import type { PromoCardNewsPreviewSlide } from "@/lib/domain/promoPreview";

const KIND_LABEL: Record<PromoCardNewsPreviewSlide["kind"], string> = {
  cover: "표지",
  course: "코스",
  closing: "마무리",
};

const KIND_ACCENT: Record<PromoCardNewsPreviewSlide["kind"], string> = {
  cover: "bg-slate-900 text-white",
  course: "bg-white text-slate-900",
  closing: "bg-amber-50 text-slate-900",
};

/** 저장된 cardNews.slides 순서를 그대로 DOM 순서로 렌더링한다(위치만으로 표지/코스/마무리를 구분 —
 * 새 콘텐츠를 만들지 않는다). 데스크톱은 grid, 모바일은 가로 스크롤(snap)로 body 전체 가로 스크롤 없이
 * 카드 트랙만 스크롤되게 한다. */
export function PromoCardNewsPreview({ slides }: { slides: PromoCardNewsPreviewSlide[] }) {
  if (slides.length === 0) {
    return <p className="text-sm text-slate-500">아직 카드뉴스 슬라이드가 없습니다.</p>;
  }

  return (
    <div
      role="list"
      aria-label="카드뉴스 미리보기"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {slides.map((slide) => (
        <div
          key={slide.index}
          role="listitem"
          className={`flex min-h-[9rem] w-full flex-col justify-between rounded-lg border border-slate-200 p-4 ${KIND_ACCENT[slide.kind]}`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold opacity-40">{String(slide.index).padStart(2, "0")}</span>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium opacity-70">
                {KIND_LABEL[slide.kind]}
              </span>
            </div>
            <h4 className="mt-2 text-sm font-semibold leading-snug">{slide.title}</h4>
          </div>
          <p className="mt-3 text-xs leading-relaxed opacity-80">{slide.body}</p>
        </div>
      ))}
    </div>
  );
}
