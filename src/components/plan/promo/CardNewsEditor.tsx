"use client";

import type { CardNewsContent } from "@/lib/domain/promoContent";

interface Props {
  cardNews: CardNewsContent;
  onChange: (next: CardNewsContent) => void;
  onCopy: () => void;
  copied: boolean;
}

export function CardNewsEditor({ cardNews, onChange, onCopy, copied }: Props) {
  function updateSlide(index: number, field: "title" | "body", value: string) {
    const slides = cardNews.slides.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange({ slides });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">카드뉴스 구성안</h3>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <div className="mt-2 space-y-3">
        {cardNews.slides.map((slide, i) => (
          <div key={i} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-slate-400">슬라이드 {i + 1}</p>
            <input
              value={slide.title}
              onChange={(e) => updateSlide(i, "title", e.target.value)}
              aria-label={`슬라이드 ${i + 1} 제목`}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <textarea
              rows={2}
              value={slide.body}
              onChange={(e) => updateSlide(i, "body", e.target.value)}
              aria-label={`슬라이드 ${i + 1} 본문`}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
