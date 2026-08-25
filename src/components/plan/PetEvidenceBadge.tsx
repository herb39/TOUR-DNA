import type { PetEvidenceDisplay } from "@/lib/domain/petTourEvidenceDisplay";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

const STATUS_STYLE: Record<PetEvidenceDisplay["status"], string> = {
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CONDITIONAL: "border-amber-200 bg-amber-50 text-amber-800",
  UNKNOWN: "border-slate-200 bg-slate-50 text-slate-600",
};

export function PetEvidenceBadge({ evidence, compact = false }: { evidence: PetEvidenceDisplay; compact?: boolean }) {
  return (
    <div className={compact ? "mt-1" : "mt-2 rounded border border-slate-200 bg-white p-2"} data-testid="pet-evidence">
      <AnimatedDetails
        summary={
          <>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[evidence.status]}`}>
              {evidence.label}
            </span>
            <span className="ml-1 text-[10px] text-slate-400">근거 보기</span>
          </>
        }
        summaryClassName="cursor-pointer list-none"
      >
        <div className="mt-1 space-y-0.5 text-[10px] text-slate-600">
          {evidence.detailLines.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
          {evidence.status !== "UNKNOWN" ? (
            <p className="text-slate-400">
              출처: {evidence.sourceLabel}
              {evidence.fetchedAtLabel ? ` · 정보 확인일 ${evidence.fetchedAtLabel}` : ""}
            </p>
          ) : null}
        </div>
      </AnimatedDetails>
    </div>
  );
}
