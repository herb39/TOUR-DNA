"use client";

export function PrintButton() {
  return (
    <div className="no-print mb-4 flex justify-end">
      <button
        type="button"
        onClick={() => window.print()}
        className="cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        인쇄 / PDF 저장
      </button>
    </div>
  );
}
