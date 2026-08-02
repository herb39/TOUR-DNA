import type {
  PreLaunchRecommendation,
  PreLaunchSignal,
  PreLaunchValidationReport,
  SignalStatus,
} from "@/lib/domain/preLaunchValidation";

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
 * PrintPage.tsx에서 같은 report 객체를 더 압축된 레이아웃으로 별도 렌더링한다. */
export function PreLaunchValidationSection({ report }: { report: PreLaunchValidationReport }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">사업 사전검증 리포트</h2>
        <span
          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
          title="이미 계산된 DNA·POI·이동·유사지역 비교·위험 데이터만 조합한 결정론적 규칙(CURATED)입니다."
        >
          CURATED 규칙 · {report.ruleVersion}
        </span>
      </div>

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

      <p className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">판정 기준·한계: </span>
        {report.criteria}
      </p>
    </section>
  );
}
