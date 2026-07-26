"use client";

import { useState } from "react";
import type { InstagramContent } from "@/lib/domain/promoContent";

interface Props {
  instagram: InstagramContent;
  onChangeCaption: (value: string) => void;
  onChangeHashtagsText: (text: string) => void;
  onCopy: () => void;
  copied: boolean;
}

/** 해시태그 textarea는 자기 자신의 원문 버퍼(hashtagsText)로 제어한다 — 부모가 매 입력마다 파싱한
 * 배열을 다시 join해 돌려주면 사용자가 타이핑 중인 쉼표/공백/줄바꿈이 매 입력마다 재포맷되어 커서
 * 위치가 튈 수 있다. 원문은 여기서만 보관하고, 파싱된 배열만 부모(PromoContent.instagram.hashtags)로
 * 전달한다. */
export function InstagramEditor({ instagram, onChangeCaption, onChangeHashtagsText, onCopy, copied }: Props) {
  const [hashtagsText, setHashtagsText] = useState(() => instagram.hashtags.join(", "));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Instagram</h3>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <label htmlFor="promo-instagram-caption" className="mt-2 block text-xs font-medium text-slate-500">
        캡션
      </label>
      <textarea
        id="promo-instagram-caption"
        rows={2}
        value={instagram.caption}
        onChange={(e) => onChangeCaption(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <label htmlFor="promo-instagram-hashtags" className="mt-3 block text-xs font-medium text-slate-500">
        해시태그(쉼표·공백·줄바꿈으로 구분, # 없이 입력)
      </label>
      <textarea
        id="promo-instagram-hashtags"
        rows={2}
        value={hashtagsText}
        onChange={(e) => {
          setHashtagsText(e.target.value);
          onChangeHashtagsText(e.target.value);
        }}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {instagram.hashtags.length > 0 ? (
        <p className="mt-1 break-words text-xs text-slate-400">{instagram.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
      ) : null}
    </div>
  );
}
