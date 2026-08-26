import type { CourseQualityReport, CourseQualityWarning } from "@/lib/domain/courseQualityValidation";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

const SEVERITY_ORDER: CourseQualityWarning["severity"][] = ["BLOCKER", "REVIEW", "INFO"];
const SEVERITY_LABEL: Record<CourseQualityWarning["severity"], string> = {
  BLOCKER: "일정 수정 권장",
  REVIEW: "확인 권장",
  INFO: "참고",
};
const SEVERITY_STYLE: Record<CourseQualityWarning["severity"], string> = {
  BLOCKER: "border-red-200 bg-red-50 text-red-800",
  REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  INFO: "border-slate-200 bg-slate-50 text-slate-700",
};

function WarningItem({ warning }: { warning: CourseQualityWarning }) {
  return (
    <li className="rounded border border-current/15 bg-white/70 px-2.5 py-2">
      <p className="font-medium">{warning.title}</p>
      <p className="mt-0.5">{warning.message}</p>
      {warning.details && warning.details.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] opacity-80">
          {warning.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CourseQualityPanel({ report }: { report: CourseQualityReport }) {
  const { warnings } = report;
  const grouped = SEVERITY_ORDER.map((severity) => ({
    severity,
    warnings: warnings.filter((warning) => warning.severity === severity),
  })).filter((group) => group.warnings.length > 0);
  const blockerCount = grouped.find((group) => group.severity === "BLOCKER")?.warnings.length ?? 0;
  const reviewCount = grouped.find((group) => group.severity === "REVIEW")?.warnings.length ?? 0;

  return (
    <section
      aria-label="실시간 코스 품질검증"
      aria-live="polite"
      className={`mt-3 rounded-md border px-3 py-3 text-xs ${
        blockerCount > 0
          ? "border-red-200 bg-red-50/70 text-red-900"
          : warnings.length > 0
            ? "border-amber-200 bg-amber-50/70 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">코스 확인사항</h3>
        <div className="flex flex-wrap gap-1.5">
          {blockerCount > 0 ? (
            <span className="rounded-full border border-red-300 bg-white/70 px-2 py-0.5 font-medium">수정 권장 {blockerCount}</span>
          ) : null}
          {reviewCount > 0 ? (
            <span className="rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 font-medium">확인 권장 {reviewCount}</span>
          ) : null}
          {warnings.length === 0 ? (
            <span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 font-medium">추가 확인 없음</span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-[11px] opacity-80">경고가 있어도 저장은 계속할 수 있습니다. 편집하면 다시 계산됩니다.</p>

      {grouped.length > 0 ? (
        <div className="mt-2 space-y-2">
          {grouped.map((group) => (
            <AnimatedDetails
              key={group.severity}
              className={`rounded border px-2 py-1.5 ${SEVERITY_STYLE[group.severity]}`}
              defaultOpen={false}
              summaryClassName="cursor-pointer font-medium"
              summary={`${SEVERITY_LABEL[group.severity]} ${group.warnings.length}건`}
            >
              <ul className="mt-2 space-y-2">
                {group.warnings.map((warning) => (
                  <WarningItem key={warning.id} warning={warning} />
                ))}
              </ul>
            </AnimatedDetails>
          ))}
        </div>
      ) : (
        <p className="mt-2">현재 데이터로 확인 가능한 일정 조정 항목이 없습니다.</p>
      )}
    </section>
  );
}
