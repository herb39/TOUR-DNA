import type { AccessibilityEvidenceDisplay } from "@/lib/domain/accessibilityEvidenceDisplay";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

const STATUS_STYLE: Record<AccessibilityEvidenceDisplay["status"], string> = {
  OFFICIAL_INFO_AVAILABLE: "border-sky-200 bg-sky-50 text-sky-800",
  OFFICIAL_INFO_UNKNOWN: "border-slate-200 bg-slate-50 text-slate-600",
};

const DIMENSION_STYLE: Record<string, string> = {
  AVAILABLE: "text-emerald-700",
  UNAVAILABLE: "text-rose-700",
  CONDITIONAL: "text-amber-700",
  UNKNOWN: "text-slate-500",
};

export function AccessibilityEvidenceBadge({
  evidence,
  compact = false,
}: {
  evidence: AccessibilityEvidenceDisplay;
  compact?: boolean;
}) {
  const meaningfulDimensions = evidence.dimensions.filter(
    (dimension) => dimension.status !== "UNKNOWN" || dimension.rawText,
  );

  return (
    <div
      className={compact ? "mt-1" : "mt-2 rounded border border-slate-200 bg-white p-2"}
      data-testid="accessibility-evidence"
    >
      <AnimatedDetails
        summary={
          <>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[evidence.status]}`}>
              {evidence.status === "OFFICIAL_INFO_AVAILABLE" ? "♿ 공식 접근성 정보" : evidence.label}
            </span>
            <span className="ml-1 text-[10px] text-slate-400">상세 보기</span>
          </>
        }
        summaryClassName="cursor-pointer list-none"
      >
        <div className="mt-1 space-y-1 text-[10px] text-slate-600">
          {evidence.status === "OFFICIAL_INFO_UNKNOWN" ? (
            <p>{evidence.repositoryUnavailable ? "현재 환경에서 공식 정보를 확인할 수 없습니다." : "공식 목록 또는 상세 근거가 확인되지 않았습니다."} {"정보 미확인은 접근 불가를 뜻하지 않습니다."}</p>
          ) : meaningfulDimensions.length > 0 ? (
            <ul className="space-y-1">
              {meaningfulDimensions.map((dimension) => (
                <li key={dimension.key} className="break-words">
                  <span className={`font-medium ${DIMENSION_STYLE[dimension.status]}`}>{dimension.label}: {dimension.statusLabel}</span>
                  {dimension.rawText ? <span className="ml-1 text-slate-500">({dimension.rawText})</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>공식 상세정보는 있으나 확인 가능한 접근성 항목이 제한적입니다.</p>
          )}
          {evidence.status === "OFFICIAL_INFO_AVAILABLE" ? (
            <p className="break-words text-slate-400">
              출처: {evidence.sourceLabel}
              {evidence.fetchedAtLabel ? ` · 확인 기준 ${evidence.fetchedAtLabel}` : ""}
            </p>
          ) : null}
        </div>
      </AnimatedDetails>
    </div>
  );
}
