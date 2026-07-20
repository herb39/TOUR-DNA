import { EvidenceTable, type EvidenceRow } from "@/components/evidence/EvidenceTable";

interface ScoreBreakdown {
  demandFit: number;
  supplyFit: number;
  seasonFit: number;
  targetFit: number;
  feasibilityFit: number;
}

interface ConsumptionTouchpoints {
  food: boolean;
  lodging: boolean;
  experience: boolean;
  examples: string[];
}

export interface StrategyCardData {
  id: string;
  rank: number;
  name: string;
  concept: string;
  totalScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasons: string[];
  targetDescription: string;
  consumptionTouchpoints: ConsumptionTouchpoints;
  risks: string[];
  evidences: EvidenceRow[];
}

const SCORE_BREAKDOWN_LABEL: Record<keyof ScoreBreakdown, string> = {
  demandFit: "수요 적합도",
  supplyFit: "공급 적합도",
  seasonFit: "시즌 적합도",
  targetFit: "타깃 적합도",
  feasibilityFit: "운영 적합도",
};

export function StrategyCard({
  strategy,
  isSelected,
  onSelect,
}: {
  strategy: StrategyCardData;
  isSelected: boolean;
  onSelect: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border bg-white p-5 ${isSelected ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {strategy.rank}순위
        </span>
        <span className="text-lg font-bold text-slate-900">{strategy.totalScore}점</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-900">{strategy.name}</h3>
      <p className="mt-1 text-sm text-slate-600">{strategy.concept}</p>
      <p className="mt-2 text-xs text-slate-500">타깃: {strategy.targetDescription}</p>
      <p className="mt-1 text-xs font-medium text-amber-700">
        ※ 점수는 조건 적합도이며, 매출·방문객 증가 예측치가 아닙니다.
      </p>

      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {(Object.keys(SCORE_BREAKDOWN_LABEL) as (keyof ScoreBreakdown)[]).map((key) => (
          <li key={key} className="flex justify-between">
            <span>{SCORE_BREAKDOWN_LABEL[key]}</span>
            <span className="font-medium">{strategy.scoreBreakdown[key]}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-700">선정 이유</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {strategy.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="mt-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">지역 소비 접점</p>
        <p className="mt-1">
          음식 {strategy.consumptionTouchpoints.food ? "포함" : "미포함"} · 숙박{" "}
          {strategy.consumptionTouchpoints.lodging ? "포함" : "미포함"} · 체험{" "}
          {strategy.consumptionTouchpoints.experience ? "포함" : "미포함"}
        </p>
        {strategy.consumptionTouchpoints.examples.length > 0 ? (
          <p className="mt-0.5 text-slate-500">예: {strategy.consumptionTouchpoints.examples.join(", ")}</p>
        ) : null}
      </div>

      <div className="mt-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">위험 요인</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {strategy.risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <details className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">근거 보기</summary>
        <div className="mt-2">
          <EvidenceTable items={strategy.evidences} />
        </div>
      </details>

      <form action={onSelect} className="mt-4">
        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          이 전략 선택
        </button>
      </form>
    </div>
  );
}
