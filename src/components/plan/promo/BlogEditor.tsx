"use client";

import type { BlogContent } from "@/lib/domain/promoContent";

interface Props {
  blog: BlogContent;
  onChange: (next: BlogContent) => void;
  onCopy: () => void;
  copied: boolean;
}

export function BlogEditor({ blog, onChange, onCopy, copied }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">블로그</h3>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <label htmlFor="promo-blog-title" className="mt-2 block text-xs font-medium text-slate-500">
        제목
      </label>
      <input
        id="promo-blog-title"
        value={blog.title}
        onChange={(e) => onChange({ ...blog, title: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <label htmlFor="promo-blog-body" className="mt-3 block text-xs font-medium text-slate-500">
        본문
      </label>
      <textarea
        id="promo-blog-body"
        rows={6}
        value={blog.body}
        onChange={(e) => onChange({ ...blog, body: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
