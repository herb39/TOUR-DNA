"use client";

interface Props {
  sentences: readonly [string, string, string];
  onChangeSentence: (index: 0 | 1 | 2, value: string) => void;
  onCopy: () => void;
  copied: boolean;
}

const INDICES = [0, 1, 2] as const;

export function ProposalSummaryEditor({ sentences, onChangeSentence, onCopy, copied }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">제안서 요약</h3>
        <button
          type="button"
          onClick={onCopy}
          className="cursor-pointer whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {INDICES.map((i) => (
          <div key={i}>
            <label htmlFor={`promo-proposal-sentence-${i}`} className="block text-xs font-medium text-slate-500">
              문장 {i + 1}
            </label>
            <textarea
              id={`promo-proposal-sentence-${i}`}
              rows={2}
              value={sentences[i]}
              onChange={(e) => onChangeSentence(i, e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
