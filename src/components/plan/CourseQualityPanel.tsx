import type { CourseQualityReport } from "@/lib/domain/courseQualityValidation";

export function CourseQualityPanel({ report }: { report: CourseQualityReport }) {
  const { warnings } = report;

  return (
    <section
      aria-label="실시간 코스 품질검증"
      aria-live="polite"
      className={`mt-3 rounded-md border px-3 py-3 text-xs ${
        warnings.length > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">실시간 코스 품질검증</h3>
        <span className="rounded-full border border-current/20 bg-white/60 px-2 py-0.5 font-medium">
          {warnings.length > 0 ? `${warnings.length}건 확인 필요` : "현재 확인된 경고 없음"}
        </span>
      </div>
      <p className="mt-1 text-[11px] opacity-80">현재 편집 상태를 기준으로 계산한 안내입니다. 경고가 있어도 저장은 계속할 수 있습니다.</p>
      {warnings.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {warnings.map((warning) => (
            <li key={warning.id} className="rounded border border-current/15 bg-white/60 px-2 py-1.5">
              <p className="font-medium">⚠ {warning.title}</p>
              <p className="mt-0.5">{warning.message}</p>
              {warning.details && warning.details.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] opacity-80">
                  {warning.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">현재 데이터로 확인 가능한 핵심 품질 경고가 없습니다.</p>
      )}
    </section>
  );
}
