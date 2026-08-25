import type {
  PreLaunchRecommendation,
  PreLaunchSignal,
  PreLaunchValidationReport,
  SignalStatus,
} from "@/lib/domain/preLaunchValidation";
import { findRelatedKpiNames, type EnrichedKpi } from "@/lib/domain/kpiLinking";
import { AXIS_LABEL_KO } from "@/lib/domain/types";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

const RECOMMENDATION_STYLE: Record<PreLaunchRecommendation, string> = {
  RECOMMENDED: "border-emerald-300 bg-emerald-50 text-emerald-800",
  CONDITIONAL: "border-amber-300 bg-amber-50 text-amber-800",
  NEEDS_IMPROVEMENT: "border-red-300 bg-red-50 text-red-800",
};

const SIGNAL_STYLE: Record<SignalStatus, string> = {
  OK: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CAUTION: "border-amber-200 bg-amber-50 text-amber-700",
  BLOCKER: "border-red-200 bg-red-50 text-red-700",
  UNKNOWN: "border-slate-200 bg-slate-50 text-slate-600",
};

const SIGNAL_STATUS_LABEL_KO: Record<SignalStatus, string> = {
  OK: "양호",
  CAUTION: "보완 필요",
  BLOCKER: "치명적",
  UNKNOWN: "확인 필요",
};

function SignalCard({
  label,
  signal,
  unknownHint,
}: {
  label: string;
  signal: PreLaunchSignal;
  /** preliminary(예비) 단계에서만 UNKNOWN 신호에 덧붙이는 짧은 이유 — 새 판정 로직이 아니라 표시용
   * 보조 문구다(2026-08-13). */
  unknownHint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${SIGNAL_STYLE[signal.status]}`}>
          {SIGNAL_STATUS_LABEL_KO[signal.status]}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-600">
        {signal.detail}
        {signal.status === "UNKNOWN" && unknownHint ? ` (${unknownHint})` : ""}
      </p>
    </div>
  );
}

/** 사업 사전검증 리포트 — plan(실행안) 화면과 analysis(분석) 화면이 공유하는 섹션(정보 제공용,
 * 저장하지 않음). 인쇄 화면은 PrintPage.tsx에서 같은 report 객체를 더 압축된 레이아웃으로 별도
 * 렌더링한다. `kpis`가 주어지면 데이터 신뢰도가 지목한 축·이 지역의 취약 축과 연결된 KPI를 "관련
 * KPI"로 이어 보여준다. 관련 KPI가 없으면 억지로 만들지 않고 조용히 생략한다.
 *
 * `preliminary`(2026-08-13, 기본값 false — plan/print는 지금까지와 동일하게 동작한다)를 true로 주면
 * analysis(분석) 화면에서만 이 리포트가 아직 실행안(SelectedPlan) 없이 계산된 잠정 판단임을 명확히
 * 표시한다 — `computePreLaunchValidation()`의 판정 산식·threshold는 전혀 건드리지 않고, 이 컴포넌트가
 * 이미 갖고 있는 `report`를 그대로 다르게 보여주기만 한다. */
export function PreLaunchValidationSection({
  report,
  kpis,
  preliminary = false,
  compact = false,
}: {
  report: PreLaunchValidationReport;
  kpis?: EnrichedKpi[];
  preliminary?: boolean;
  /** 분석 화면에서 기본 노출량을 줄이고 권고 결과만 먼저 보여준다. */
  compact?: boolean;
}) {
  const dataReliabilityKpis = kpis ? findRelatedKpiNames(kpis, report.dataReliabilityFlaggedAxes) : [];
  const weakAxisKpis = kpis && report.weakestAxis ? findRelatedKpiNames(kpis, [report.weakestAxis]) : [];
  const unknownHint = preliminary ? "실행안을 만든 뒤 확인" : undefined;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-slate-900">사업 사전검증 리포트</h2>
        {preliminary ? (
          <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            예비
          </span>
        ) : null}
      </div>
      {preliminary ? (
        <p className="mt-1 text-xs text-slate-500">
          실행안을 만들기 전 단계의 잠정 판단입니다 — 실행안을 만들면 POI 공급·이동 동선까지 포함한
          상세 검증으로 갱신됩니다.
        </p>
      ) : null}

      <div className={`mt-3 rounded-lg border p-3 ${RECOMMENDATION_STYLE[report.recommendation]}`}>
        <p className="text-sm font-bold">
          추진 권고: {report.recommendationLabel}
          {preliminary ? " (예비 판정)" : ""}
        </p>
        <p className="mt-1 text-xs">{report.reason}</p>
        <p className="mt-1 text-xs font-medium">{report.expectedOutcomeIfImproved}</p>
      </div>

      {compact ? (
        <AnimatedDetails
          className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
          summary="세부 검증 신호 보기"
          summaryClassName="cursor-pointer text-xs font-medium text-slate-700"
        >
          <div className="mt-3">
            <ValidationDetails
              report={report}
              unknownHint={unknownHint}
              dataReliabilityKpis={dataReliabilityKpis}
              weakAxisKpis={weakAxisKpis}
            />
          </div>
        </AnimatedDetails>
      ) : (
        <div className="mt-3">
          <ValidationDetails
            report={report}
            unknownHint={unknownHint}
            dataReliabilityKpis={dataReliabilityKpis}
            weakAxisKpis={weakAxisKpis}
          />
        </div>
      )}
    </section>
  );
}

function ValidationDetails({
  report,
  unknownHint,
  dataReliabilityKpis,
  weakAxisKpis,
}: {
  report: PreLaunchValidationReport;
  unknownHint?: string;
  dataReliabilityKpis: string[];
  weakAxisKpis: string[];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SignalCard label="데이터 신뢰도" signal={report.dataReliability} unknownHint={unknownHint} />
        <SignalCard label="POI 공급 충분성" signal={report.poiSupplySufficiency} unknownHint={unknownHint} />
        <SignalCard label="이동 현실성" signal={report.travelFeasibility} unknownHint={unknownHint} />
        <SignalCard label="지역 차별성" signal={report.regionalDifferentiation} unknownHint={unknownHint} />
      </div>

      {report.keyRisks.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-700">주요 위험</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {report.keyRisks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.requiredImprovements.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-700">필수 보완사항</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {report.requiredImprovements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {dataReliabilityKpis.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-medium text-slate-600">데이터 신뢰도 보완 KPI: </span>
          {dataReliabilityKpis.join(", ")}
        </p>
      ) : null}

      {weakAxisKpis.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">
            이 지역의 취약 축({AXIS_LABEL_KO[report.weakestAxis!]})과 연결된 KPI:{" "}
          </span>
          {weakAxisKpis.join(", ")}
        </p>
      ) : null}
    </>
  );
}
