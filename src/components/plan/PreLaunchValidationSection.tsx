import type {
  PreLaunchRecommendation,
  PreLaunchSignal,
  PreLaunchValidationReport,
  SignalStatus,
} from "@/lib/domain/preLaunchValidation";
import { findRelatedKpiNames, type EnrichedKpi } from "@/lib/domain/kpiLinking";
import { AXIS_LABEL_KO } from "@/lib/domain/types";

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

function SignalCard({ label, signal }: { label: string; signal: PreLaunchSignal }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${SIGNAL_STYLE[signal.status]}`}>
          {SIGNAL_STATUS_LABEL_KO[signal.status]}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-600">{signal.detail}</p>
    </div>
  );
}

/** 사업 사전검증 리포트 — 실행안 화면 전용 섹션(정보 제공용, 저장하지 않음). 인쇄 화면은
 * PrintPage.tsx에서 같은 report 객체를 더 압축된 레이아웃으로 별도 렌더링한다.
 * `kpis`가 주어지면 데이터 신뢰도가 지목한 축·이 지역의 취약 축과 연결된 KPI를 "관련 KPI"로 이어
 * 보여준다(요구사항 2 — 사전검증의 위험·보완사항에서 관련 KPI로 이어지게 한다). 관련 KPI가 없으면
 * 억지로 만들지 않고 조용히 생략한다. */
export function PreLaunchValidationSection({
  report,
  kpis,
}: {
  report: PreLaunchValidationReport;
  kpis?: EnrichedKpi[];
}) {
  const dataReliabilityKpis = kpis ? findRelatedKpiNames(kpis, report.dataReliabilityFlaggedAxes) : [];
  const weakAxisKpis = kpis && report.weakestAxis ? findRelatedKpiNames(kpis, [report.weakestAxis]) : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">사업 사전검증 리포트</h2>

      <div className={`mt-3 rounded-lg border p-3 ${RECOMMENDATION_STYLE[report.recommendation]}`}>
        <p className="text-sm font-bold">추진 권고: {report.recommendationLabel}</p>
        <p className="mt-1 text-xs">{report.reason}</p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SignalCard label="데이터 신뢰도" signal={report.dataReliability} />
        <SignalCard label="POI 공급 충분성" signal={report.poiSupplySufficiency} />
        <SignalCard label="이동 현실성" signal={report.travelFeasibility} />
        <SignalCard label="지역 차별성" signal={report.regionalDifferentiation} />
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
    </section>
  );
}
