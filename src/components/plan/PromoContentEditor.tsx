"use client";

import { useRef, useState, useTransition } from "react";
import { generatePromoContentAction, savePromoContentAction } from "@/app/projects/[id]/plan/actions";
import type {
  GeneratePromoContentResult,
  GetPromoContentResult,
  PromoContentErrorCode,
  SavePromoContentResult,
} from "@/lib/services/promoContentService";
import type { PromoContent } from "@/lib/domain/promoContent";
import type { PromoProjectSummary } from "@/lib/domain/promoPreview";
import { PromoPreviewPanel } from "./promo/PromoPreviewPanel";
import { formatFullPromoContentForCopy } from "@/lib/domain/promoContentFormat";
import { PromoContentSources } from "./promo/PromoContentSources";

const ERROR_MESSAGES: Record<PromoContentErrorCode, string> = {
  notFound: "프로젝트를 찾을 수 없습니다.",
  noPlan: "먼저 실행안을 생성해주세요.",
  alreadyExists: "이미 생성된 홍보자료가 있습니다.",
  invalidContent: "저장된 홍보자료 또는 편집한 내용의 구조가 올바르지 않습니다.",
  forbidden: "이 프로젝트에 접근할 권한이 없습니다.",
  internalError: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

const COPY_FEEDBACK_MS = 2000;
const SUCCESS_MESSAGE_MS = 3000;

export function PromoContentEditor({
  projectId,
  initial,
  projectSummary,
}: {
  projectId: string;
  initial: GetPromoContentResult;
  projectSummary: PromoProjectSummary;
}) {
  const [content, setContent] = useState<PromoContent | null>(initial.ok ? initial.content : null);
  const [loadErrorCode] = useState<PromoContentErrorCode | null>(initial.ok ? null : initial.code);
  const [dirty, setDirty] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [generationKey, setGenerationKey] = useState(0);
  const [isGenerating, startGenerating] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBusy = isGenerating || isSaving;

  function showSuccess(message: string) {
    setSuccessMessage(message);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), SUCCESS_MESSAGE_MS);
  }

  const CONFIRM_MESSAGE = "기존 홍보자료와 편집한 내용이 새로 생성된 문구로 교체됩니다. 재생성할까요?";

  function applyGenerateSuccess(newContent: PromoContent, overwrite: boolean) {
    setContent(newContent);
    setDirty(false);
    setGenerationKey((k) => k + 1);
    showSuccess(overwrite ? "홍보자료를 다시 생성했습니다." : "홍보자료를 생성했습니다.");
  }

  async function callGenerateOverwrite() {
    const result: GeneratePromoContentResult = await generatePromoContentAction(projectId, { overwrite: true });
    if (result.ok) {
      applyGenerateSuccess(result.content, true);
      return;
    }
    setActionError(ERROR_MESSAGES[result.code]);
  }

  /** 로컬에 이미 콘텐츠(정상이든 손상되어 확인만 된 것이든)가 있다고 알고 있는 경로 — "재생성" 버튼과
   * invalidContent 복구 버튼이 공유한다. 서버에 기존 값이 있다는 걸 이미 아는 상태이므로, 액션을 호출하기
   * 전에 먼저 사용자 확인을 받고, 확인했을 때만 overwrite:true로 호출한다. 취소하면 액션을 전혀 호출하지
   * 않고 현재 content/dirty 상태를 그대로 둔다. */
  function handleOverwriteGenerateClick() {
    if (isBusy) return;
    const confirmed = window.confirm(CONFIRM_MESSAGE);
    if (!confirmed) return;
    setActionError(null);
    startGenerating(callGenerateOverwrite);
  }

  /** 로컬에 콘텐츠가 전혀 없어 서버에 실제로 기존 값이 있는지 미리 알 수 없는 진짜 빈 상태 경로 — 먼저
   * overwrite:false로 시도하고, 서버가 alreadyExists를 반환할 때만 그 자리에서 확인을 받는다. 확인 전에는
   * overwrite:true를 호출하지 않으며, 취소하면 액션을 호출하지 않고 현재(비어있는) 상태를 유지한다. */
  function handleEmptyStateGenerateClick() {
    if (isBusy) return;
    setActionError(null);
    startGenerating(async () => {
      const result: GeneratePromoContentResult = await generatePromoContentAction(projectId, { overwrite: false });
      if (result.ok) {
        applyGenerateSuccess(result.content, false);
        return;
      }
      if (result.code === "alreadyExists") {
        const confirmed = window.confirm(CONFIRM_MESSAGE);
        if (!confirmed) return; // overwrite 호출 없이 현재 상태를 유지한다.
        await callGenerateOverwrite();
        return;
      }
      setActionError(ERROR_MESSAGES[result.code]);
    });
  }

  function handleSave() {
    if (!content || isBusy) return;
    setActionError(null);
    startSaving(async () => {
      const result: SavePromoContentResult = await savePromoContentAction(projectId, content);
      if (result.ok) {
        setContent(result.content);
        setDirty(false);
        showSuccess("저장했습니다.");
        return;
      }
      // 저장 실패 시 로컬 편집 내용을 초기 DB 값으로 되돌리지 않는다(content 상태를 건드리지 않음).
      setActionError(ERROR_MESSAGES[result.code]);
    });
  }

  async function copyToClipboard(key: string, text: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setActionError("이 브라우저에서는 자동 복사를 지원하지 않습니다. 직접 선택해 복사해주세요.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), COPY_FEEDBACK_MS);
    } catch {
      setActionError("복사에 실패했습니다. 직접 선택해 복사해주세요.");
    }
  }

  function updateContent(updater: (prev: PromoContent) => PromoContent) {
    setContent((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">홍보자료</h2>
      <p className="mt-1 text-xs text-slate-500">
        확정한 실행안을 바탕으로 제안서, 랜딩페이지, SNS, 블로그용 문구를 생성하고 편집할 수 있습니다.
      </p>

      {actionError ? (
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {actionError}
        </div>
      ) : null}
      {loadErrorCode && loadErrorCode !== "noPlan" ? (
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {ERROR_MESSAGES[loadErrorCode]}
        </div>
      ) : null}
      {successMessage ? (
        <p role="status" className="mt-3 text-xs text-emerald-600">
          {successMessage}
        </p>
      ) : null}

      {content === null ? (
        <div className="mt-4">
          {loadErrorCode === null ? <p className="text-sm text-slate-500">아직 생성된 홍보자료가 없습니다.</p> : null}
          {loadErrorCode === "noPlan" ? <p className="text-sm text-slate-500">{ERROR_MESSAGES.noPlan}</p> : null}
          {loadErrorCode === "invalidContent" ? (
            <p className="text-sm text-slate-500">다시 생성하면 새 홍보자료로 교체됩니다.</p>
          ) : null}
          {loadErrorCode !== "notFound" && loadErrorCode !== "forbidden" ? (
            <button
              type="button"
              onClick={loadErrorCode === "invalidContent" ? handleOverwriteGenerateClick : handleEmptyStateGenerateClick}
              disabled={isBusy || loadErrorCode === "noPlan"}
              className="mt-3 cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "생성 중..." : "홍보자료 생성"}
            </button>
          ) : null}
        </div>
      ) : (
        <div key={generationKey} className="mt-4 space-y-4">
          <PromoPreviewPanel
            content={content}
            project={projectSummary}
            updateContent={updateContent}
            copyToClipboard={copyToClipboard}
            copiedKey={copiedKey}
          />

          <p role="status" className="text-xs">
            {dirty ? (
              <span className="text-amber-600">저장하지 않은 변경사항이 있습니다.</span>
            ) : (
              <span className="text-emerald-600">모든 변경사항이 저장되었습니다.</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isBusy}
              className="cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
            <button
              type="button"
              onClick={handleOverwriteGenerateClick}
              disabled={isBusy}
              className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "생성 중..." : "재생성"}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard("full", formatFullPromoContentForCopy(content))}
              className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {copiedKey === "full" ? "복사됨" : "전체 복사"}
            </button>
          </div>

          {content.translationNotice ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              {content.translationNotice}
            </div>
          ) : null}

          <PromoContentSources evidenceReferences={content.evidenceReferences} courseHighlights={content.courseHighlights} />
        </div>
      )}
    </section>
  );
}
