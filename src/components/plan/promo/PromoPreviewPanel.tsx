"use client";

import { useState } from "react";
import type { PromoContent } from "@/lib/domain/promoContent";
import type { PromoProjectSummary } from "@/lib/domain/promoPreview";
import {
  buildPromoCardNewsViewModel,
  buildPromoLandingViewModel,
  buildPromoPosterViewModel,
  buildPromoProposalViewModel,
} from "@/lib/domain/promoPreview";
import {
  formatBlogForCopy,
  formatCardNewsForCopy,
  formatInstagramForCopy,
  formatLandingForCopy,
  formatProposalSummaryForCopy,
  formatRoleContentForCopy,
  parseHashtagsInput,
} from "@/lib/domain/promoContentFormat";
import { PromoPosterPreview } from "./PromoPosterPreview";
import { PromoCardNewsPreview } from "./PromoCardNewsPreview";
import { PromoInstagramPreview } from "./PromoInstagramPreview";
import { PromoBlogPreview } from "./PromoBlogPreview";
import { PromoLandingPreview } from "./PromoLandingPreview";
import { PromoProposalPreview } from "./PromoProposalPreview";
import { ProposalSummaryEditor } from "./ProposalSummaryEditor";
import { LandingEditor } from "./LandingEditor";
import { InstagramEditor } from "./InstagramEditor";
import { BlogEditor } from "./BlogEditor";
import { CardNewsEditor } from "./CardNewsEditor";
import { RoleContentEditor } from "./RoleContentEditor";

type PreviewTab = "poster" | "cardNews" | "sns" | "blog" | "landing" | "proposal";

const TABS: { key: PreviewTab; label: string }[] = [
  { key: "poster", label: "포스터" },
  { key: "cardNews", label: "카드뉴스" },
  { key: "sns", label: "SNS" },
  { key: "blog", label: "블로그" },
  { key: "landing", label: "랜딩" },
  { key: "proposal", label: "제안서" },
];

function replaceTupleAt(
  tuple: readonly [string, string, string],
  index: 0 | 1 | 2,
  value: string,
): readonly [string, string, string] {
  const next: [string, string, string] = [tuple[0], tuple[1], tuple[2]];
  next[index] = value;
  return next;
}

/** 홍보자료 화면의 탭형 결과물 미리보기(2026-08-08, 6개 채널 전체로 확장) — 결과물을 먼저 보여주고,
 * "문구 편집"을 눌러야 해당 채널의 편집 폼이 열린다(기본 화면에는 입력폼을 먼저 보여주지 않는다).
 * 탭을 옮겨도 편집 폼이 아니라 상위(PromoContentEditor)의 content state를 그대로 읽고 쓰므로, 수정
 * 중인 내용은 탭 전환·재생성 확인 등과 무관하게 유지된다. "포스터" 탭은 랜딩·SNS·제안서 문구를 조합한
 * 합성 결과물이라 자체 편집 폼이 없다 — 대신 어느 탭에서 고치면 되는지 안내만 보여준다. */
export function PromoPreviewPanel({
  content,
  project,
  updateContent,
  copyToClipboard,
  copiedKey,
}: {
  content: PromoContent;
  project: PromoProjectSummary;
  updateContent: (updater: (prev: PromoContent) => PromoContent) => void;
  copyToClipboard: (key: string, text: string) => void;
  copiedKey: string | null;
}) {
  const [tab, setTab] = useState<PreviewTab>("poster");
  const [editingOpen, setEditingOpen] = useState(false);

  const poster = buildPromoPosterViewModel(content, project);
  const cardNewsSlides = buildPromoCardNewsViewModel(content);
  const landingView = buildPromoLandingViewModel(content);
  const proposalView = buildPromoProposalViewModel(content, project);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">홍보자료 미리보기</h3>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
          {poster.roleLabel} 관점
        </span>
      </div>

      <div
        role="tablist"
        aria-label="미리보기 형태"
        className="mt-3 flex flex-wrap gap-1 rounded-md border border-slate-200 bg-white p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setEditingOpen(false);
            }}
            className={`cursor-pointer rounded px-3 py-1 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel">
        {tab === "poster" ? <PromoPosterPreview poster={poster} /> : null}
        {tab === "cardNews" ? <PromoCardNewsPreview slides={cardNewsSlides} /> : null}
        {tab === "sns" ? <PromoInstagramPreview instagram={content.instagram} regionName={project.regionName} /> : null}
        {tab === "blog" ? <PromoBlogPreview blog={content.blog} /> : null}
        {tab === "landing" ? <PromoLandingPreview view={landingView} /> : null}
        {tab === "proposal" ? <PromoProposalPreview view={proposalView} /> : null}
      </div>

      {tab === "poster" ? (
        <p className="mt-3 text-[11px] text-slate-400">
          포스터 문구는 랜딩·SNS·제안서 탭의 문구를 조합해 자동으로 구성됩니다. 문구를 바꾸려면 해당
          탭에서 편집해주세요.
        </p>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setEditingOpen((v) => !v)}
            className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {editingOpen ? "문구 편집 닫기" : "문구 편집"}
          </button>

          {editingOpen ? (
            <div className="mt-3 space-y-4 border-t border-slate-200 pt-3">
              {tab === "cardNews" ? (
                <CardNewsEditor
                  cardNews={content.cardNews}
                  onChange={(next) => updateContent((prev) => ({ ...prev, cardNews: next }))}
                  onCopy={() => copyToClipboard("cardNews", formatCardNewsForCopy(content.cardNews))}
                  copied={copiedKey === "cardNews"}
                />
              ) : null}
              {tab === "sns" ? (
                <InstagramEditor
                  instagram={content.instagram}
                  onChangeCaption={(value) =>
                    updateContent((prev) => ({ ...prev, instagram: { ...prev.instagram, caption: value } }))
                  }
                  onChangeHashtagsText={(text) =>
                    updateContent((prev) => ({
                      ...prev,
                      instagram: { ...prev.instagram, hashtags: parseHashtagsInput(text) },
                    }))
                  }
                  onCopy={() => copyToClipboard("instagram", formatInstagramForCopy(content.instagram))}
                  copied={copiedKey === "instagram"}
                />
              ) : null}
              {tab === "blog" ? (
                <BlogEditor
                  blog={content.blog}
                  onChange={(next) => updateContent((prev) => ({ ...prev, blog: next }))}
                  onCopy={() => copyToClipboard("blog", formatBlogForCopy(content.blog))}
                  copied={copiedKey === "blog"}
                />
              ) : null}
              {tab === "landing" ? (
                <LandingEditor
                  landing={content.landing}
                  onChange={(next) => updateContent((prev) => ({ ...prev, landing: next }))}
                  onCopy={() => copyToClipboard("landing", formatLandingForCopy(content.landing))}
                  copied={copiedKey === "landing"}
                />
              ) : null}
              {tab === "proposal" ? (
                <>
                  <RoleContentEditor
                    roleContent={content.roleContent}
                    onChange={(next) => updateContent((prev) => ({ ...prev, roleContent: next }))}
                    onCopy={() => copyToClipboard("role", formatRoleContentForCopy(content.roleContent))}
                    copied={copiedKey === "role"}
                  />
                  <ProposalSummaryEditor
                    sentences={content.proposalSummary.sentences}
                    onChangeSentence={(index, value) =>
                      updateContent((prev) => ({
                        ...prev,
                        proposalSummary: { sentences: replaceTupleAt(prev.proposalSummary.sentences, index, value) },
                      }))
                    }
                    onCopy={() => copyToClipboard("proposal", formatProposalSummaryForCopy(content.proposalSummary))}
                    copied={copiedKey === "proposal"}
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
