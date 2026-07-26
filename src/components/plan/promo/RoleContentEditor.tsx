"use client";

import { useState } from "react";
import type { RolePromoContent } from "@/lib/domain/promoContent";

interface Props {
  roleContent: RolePromoContent;
  onChange: (next: RolePromoContent) => void;
  onCopy: () => void;
  copied: boolean;
}

const SELLING_POINT_INDICES = [0, 1, 2] as const;

function replaceSellingPoint(
  points: readonly [string, string, string],
  index: 0 | 1 | 2,
  value: string,
): readonly [string, string, string] {
  const next: [string, string, string] = [points[0], points[1], points[2]];
  next[index] = value;
  return next;
}

function EditableStringList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <textarea
              rows={1}
              value={item}
              onChange={(e) => onChange(items.map((v, idx) => (idx === i ? e.target.value : v)))}
              aria-label={`${label} ${i + 1}`}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label={`${label} ${i + 1} 삭제`}
              className="cursor-pointer whitespace-nowrap rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="mt-1 text-xs text-slate-400">등록된 항목이 없습니다.</p> : null}
      <div className="mt-1 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`새 ${label} 항목`}
          aria-label={`새 ${label} 항목 입력`}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => {
            const text = draft.trim();
            if (!text) return;
            onChange([...items, text]);
            setDraft("");
          }}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          추가
        </button>
      </div>
    </div>
  );
}

export function RoleContentEditor({ roleContent, onChange, onCopy, copied }: Props) {
  const copyButton = (
    <button
      type="button"
      onClick={onCopy}
      className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
    >
      {copied ? "복사됨" : "복사"}
    </button>
  );

  if (roleContent.role === "TRAVEL_AGENCY") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">여행상품 홍보자료</h3>
          {copyButton}
        </div>
        <label htmlFor="promo-agency-product" className="mt-2 block text-xs font-medium text-slate-500">
          상품명
        </label>
        <input
          id="promo-agency-product"
          value={roleContent.productName}
          onChange={(e) => onChange({ ...roleContent, productName: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <label htmlFor="promo-agency-target" className="mt-3 block text-xs font-medium text-slate-500">
          타깃 고객
        </label>
        <textarea
          id="promo-agency-target"
          rows={2}
          value={roleContent.targetAudience}
          onChange={(e) => onChange({ ...roleContent, targetAudience: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-3 text-xs font-medium text-slate-500">판매 포인트</p>
        <div className="mt-1 space-y-1">
          {SELLING_POINT_INDICES.map((i) => (
            <textarea
              key={i}
              rows={1}
              value={roleContent.sellingPoints[i]}
              onChange={(e) =>
                onChange({ ...roleContent, sellingPoints: replaceSellingPoint(roleContent.sellingPoints, i, e.target.value) })
              }
              aria-label={`판매 포인트 ${i + 1}`}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          ))}
        </div>
        <label htmlFor="promo-agency-highlight" className="mt-3 block text-xs font-medium text-slate-500">
          일정 하이라이트
        </label>
        <textarea
          id="promo-agency-highlight"
          rows={2}
          value={roleContent.itineraryHighlight}
          onChange={(e) => onChange({ ...roleContent, itineraryHighlight: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">보도자료</h3>
        {copyButton}
      </div>
      <label htmlFor="promo-gov-title" className="mt-2 block text-xs font-medium text-slate-500">
        제목
      </label>
      <input
        id="promo-gov-title"
        value={roleContent.title}
        onChange={(e) => onChange({ ...roleContent, title: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <label htmlFor="promo-gov-lead" className="mt-3 block text-xs font-medium text-slate-500">
        리드
      </label>
      <textarea
        id="promo-gov-lead"
        rows={2}
        value={roleContent.lead}
        onChange={(e) => onChange({ ...roleContent, lead: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <label htmlFor="promo-gov-background" className="mt-3 block text-xs font-medium text-slate-500">
        추진 배경
      </label>
      <textarea
        id="promo-gov-background"
        rows={2}
        value={roleContent.background}
        onChange={(e) => onChange({ ...roleContent, background: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <label htmlFor="promo-gov-core" className="mt-3 block text-xs font-medium text-slate-500">
        핵심 프로그램
      </label>
      <textarea
        id="promo-gov-core"
        rows={2}
        value={roleContent.coreProgram}
        onChange={(e) => onChange({ ...roleContent, coreProgram: e.target.value })}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <EditableStringList
        label="데이터 기반 근거"
        items={roleContent.dataBasedEvidence}
        onChange={(next) => onChange({ ...roleContent, dataBasedEvidence: next })}
      />
      <EditableStringList
        label="기대 효과"
        items={roleContent.expectedEffects}
        onChange={(next) => onChange({ ...roleContent, expectedEffects: next })}
      />
    </div>
  );
}
