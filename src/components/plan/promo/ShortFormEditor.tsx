"use client";

import type { ShortFormContent } from "@/lib/domain/promoContent";

interface Props {
  shortForm: ShortFormContent;
  onChange: (next: ShortFormContent) => void;
  onCopy: () => void;
  copied: boolean;
}

/** 숏폼 편집기(2026-08-11) — CardNewsEditor.tsx와 동일한 패턴(제목/필드별 input·textarea + 복사
 * 버튼)을 그대로 따른다. 장면(scene) 추가/삭제는 지원하지 않는다 — buildShortForm이 만든 장면 구성
 * (Hook/POI/마무리)을 벗어난 임의 장면을 사용자가 만들면 실제 코스와 무관한 장면이 생길 수 있어서다. */
export function ShortFormEditor({ shortForm, onChange, onCopy, copied }: Props) {
  function updateScene(index: number, field: "visual" | "caption" | "narration", value: string) {
    const scenes = shortForm.scenes.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange({ ...shortForm, scenes });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">숏폼 구성안</h3>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>

      <label className="mt-2 block text-[11px] font-medium text-slate-500">
        제목
        <input
          value={shortForm.title}
          onChange={(e) => onChange({ ...shortForm, title: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      <label className="mt-2 block text-[11px] font-medium text-slate-500">
        Hook
        <input
          value={shortForm.hook}
          onChange={(e) => onChange({ ...shortForm, hook: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      <div className="mt-3 space-y-3">
        {shortForm.scenes.map((scene, i) => (
          <div key={i} className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-slate-400">장면 {scene.scene}</p>
            <input
              value={scene.visual}
              onChange={(e) => updateScene(i, "visual", e.target.value)}
              aria-label={`장면 ${scene.scene} 화면 구성`}
              placeholder="화면 구성"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              value={scene.caption}
              onChange={(e) => updateScene(i, "caption", e.target.value)}
              aria-label={`장면 ${scene.scene} 자막`}
              placeholder="자막"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <textarea
              rows={2}
              value={scene.narration}
              onChange={(e) => updateScene(i, "narration", e.target.value)}
              aria-label={`장면 ${scene.scene} 내레이션`}
              placeholder="내레이션"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>

      <label className="mt-3 block text-[11px] font-medium text-slate-500">
        CTA
        <input
          value={shortForm.cta}
          onChange={(e) => onChange({ ...shortForm, cta: e.target.value })}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
    </div>
  );
}
