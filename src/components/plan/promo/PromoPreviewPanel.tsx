"use client";

import { useState } from "react";
import type { PromoContent } from "@/lib/domain/promoContent";
import type { PromoProjectSummary } from "@/lib/domain/promoPreview";
import { buildPromoCardNewsViewModel, buildPromoPosterViewModel } from "@/lib/domain/promoPreview";
import { PromoPosterPreview } from "./PromoPosterPreview";
import { PromoCardNewsPreview } from "./PromoCardNewsPreview";

type PreviewTab = "poster" | "cardNews";

const TABS: { key: PreviewTab; label: string }[] = [
  { key: "poster", label: "포스터" },
  { key: "cardNews", label: "카드뉴스" },
];

/** 홍보자료 화면 상단 "미리보기" — 저장된 promoContent를 읽기만 하고 새 콘텐츠를 만들지 않는다.
 * PromoContentEditor의 content state를 그대로 props로 받으므로, 편집·저장·재생성 후에도 항상 최신
 * 값을 그대로 반영한다(별도 state를 두지 않음 — source of truth가 하나). */
export function PromoPreviewPanel({
  content,
  project,
}: {
  content: PromoContent;
  project: PromoProjectSummary;
}) {
  const [tab, setTab] = useState<PreviewTab>("poster");
  const poster = buildPromoPosterViewModel(content, project);
  const cardNewsSlides = buildPromoCardNewsViewModel(content);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">홍보자료 미리보기</h3>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
          {poster.roleLabel} 관점
        </span>
      </div>

      <div role="tablist" aria-label="미리보기 형태" className="mt-3 inline-flex gap-1 rounded-md border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded px-3 py-1 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel">
        {tab === "poster" ? (
          <PromoPosterPreview poster={poster} />
        ) : (
          <PromoCardNewsPreview slides={cardNewsSlides} />
        )}
      </div>
    </div>
  );
}
