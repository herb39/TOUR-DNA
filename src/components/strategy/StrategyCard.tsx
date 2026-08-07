import { EvidenceTable, type EvidenceRow } from "@/components/evidence/EvidenceTable";

interface ScoreBreakdown {
  demandFit: number;
  supplyFit: number;
  seasonFit: number;
  targetFit: number;
  feasibilityFit: number;
  // roleFit 도입 이전에 저장된 StrategyResult.scoreBreakdown(JSON)에는 이 필드 자체가 없을 수 있다 —
  // 실제 저장 데이터의 현실을 반영해 optional로 둔다(2026-07-29). 값이 없으면 화면에서 "재분석 필요"로
  // 안내한다(formatBreakdownScore).
  roleFit?: number;
  // 2026-07-29(2차 개선): computeRoleFit()이 실제로 계산한 근거 문장. roleFit이 undefined(레거시)이거나
  // role 자체가 없던 분석(중립값 50)이면 이 값도 없다 — 화면에서는 값이 있을 때만 노출한다.
  roleFitReason?: string;
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
  /** 2026-07-31: 전략 3안 구조적 차별화 필드 — 이 필드 도입 이전에 저장된 레코드는 null(레거시). */
  coreProblem: string | null;
  coreResource: string | null;
  stayStyle: string | null;
  executionDifficulty: "LOW" | "MEDIUM" | "HIGH" | null;
  expectedEffect: string | null;
}

type ScoreBreakdownKey = keyof Omit<ScoreBreakdown, "roleFitReason">;

const SCORE_BREAKDOWN_LABEL: Record<ScoreBreakdownKey, string> = {
  demandFit: "수요 적합도",
  supplyFit: "공급 적합도",
  seasonFit: "시즌 적합도",
  targetFit: "타깃 적합도(테마 반영)",
  feasibilityFit: "운영 적합도(국적 반영)",
  roleFit: "역할 적합도",
};

/** 각 적합도 항목이 무엇을 보는 점수인지 짧게 설명한다(2026-07-29) — 항목 이름만으로는 특히 "역할
 * 적합도"가 무엇을 반영하는지 알기 어렵다는 피드백에 대응한다. */
const SCORE_BREAKDOWN_DESCRIPTION: Record<ScoreBreakdownKey, string> = {
  demandFit: "지역의 객관적 관광 수요 데이터와 이 전략의 궁합",
  supplyFit: "지역의 객관적 관광 공급(체류·소비 등) 데이터와 이 전략의 궁합",
  seasonFit: "입력한 여행월과 이 전략이 어울리는 성수기의 일치도",
  targetFit: "선호/제외 테마 등 입력한 타깃 조건과의 일치도",
  feasibilityFit: "입력한 국적 조건에서 실제 운영이 가능한 정도",
  roleFit: "여행사/지자체 등 입력한 역할에 이 전략이 적합한 정도",
};

/** 분석 당시 scoreBreakdown에 이 항목 자체가 없었던 과거 데이터(예: roleFit 도입 이전에 생성된
 * StrategyResult)를 빈 문자열로 방치하지 않고 명시적으로 안내한다 — 실제 0점과 "값이 없음"을 구분한다. */
function formatBreakdownScore(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "재분석 필요";
  return `${value}`;
}

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
        {strategy.rank === 1 ? (
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">추천 1순위</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            대안 {strategy.rank}
          </span>
        )}
        <span className="text-lg font-bold text-slate-900">{strategy.totalScore}점</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-900">{strategy.name}</h3>
      <p className="mt-1 text-sm text-slate-600">{strategy.concept}</p>
      <p className="mt-2 text-xs text-slate-500">타깃: {strategy.targetDescription}</p>
      {strategy.expectedEffect ? (
        <p className="mt-1 text-xs text-slate-600">예상 효과: {strategy.expectedEffect}</p>
      ) : null}
      {strategy.risks[0] ? (
        <p className="mt-1 text-xs text-amber-700">주요 위험: {strategy.risks[0]}</p>
      ) : null}
      <p className="mt-1 text-xs font-medium text-amber-700">
        ※ 점수는 조건 적합도이며, 매출·방문객 증가 예측치가 아닙니다.
      </p>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-700">차별화 포인트</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
          {strategy.reasons.slice(0, 2).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {strategy.reasons.length > 2 ? (
          <p className="mt-1 text-[11px] text-slate-400">
            그 외 {strategy.reasons.length - 2}개는 아래 상세 근거에서 확인할 수 있습니다.
          </p>
        ) : null}
      </div>

      {/* 해결 문제·활용 자원·체류 방식·실행 난이도·기대 효과는 위쪽 "전략 3안 비교" 표에 이미 나란히
       * 표시되므로 카드에서는 중복 제거한다(2026-08-06) — 점수 세부·소비 접점·위험은 표에 없는
       * 전략별 고유 정보라 삭제하지 않고 접어서 유지한다. */}
      <details className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">점수 세부·소비 접점·위험 보기</summary>
        <div className="mt-2">
          {strategy.reasons.length > 2 ? (
            <div className="mb-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">차별화 포인트(나머지)</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {strategy.reasons.slice(2).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul className="space-y-1 text-xs text-slate-600">
            {(Object.keys(SCORE_BREAKDOWN_LABEL) as ScoreBreakdownKey[]).map((key) => (
              <li key={key}>
                <div className="flex justify-between" title={SCORE_BREAKDOWN_DESCRIPTION[key]}>
                  <span>{SCORE_BREAKDOWN_LABEL[key]}</span>
                  <span className="font-medium">{formatBreakdownScore(strategy.scoreBreakdown[key])}</span>
                </div>
                {key === "roleFit" && strategy.scoreBreakdown.roleFitReason ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">{strategy.scoreBreakdown.roleFitReason}</p>
                ) : null}
              </li>
            ))}
          </ul>

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
        </div>
      </details>

      <details className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">근거 보기</summary>
        <div className="mt-2">
          <EvidenceTable items={strategy.evidences} />
        </div>
      </details>

      <form action={onSelect} className="mt-4">
        <button
          type="submit"
          className="w-full cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          이 전략 선택
        </button>
      </form>
    </div>
  );
}
