"use client";

import type { LandingContent } from "@/lib/domain/promoContent";

interface Props {
  landing: LandingContent;
  onChange: (next: LandingContent) => void;
  onCopy: () => void;
  copied: boolean;
}

export function LandingEditor({ landing, onChange, onCopy, copied }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">랜딩페이지</h3>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <label htmlFor="promo-landing-title" className="mt-2 block text-xs font-medium text-slate-500">
        제목
      </label>
      <input
        id="promo-landing-title"
        value={landing.title}
        onChange={(e) => onChange({ ...landing, title: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <label htmlFor="promo-landing-body" className="mt-3 block text-xs font-medium text-slate-500">
        본문
      </label>
      <textarea
        id="promo-landing-body"
        rows={4}
        value={landing.body}
        onChange={(e) => onChange({ ...landing, body: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
