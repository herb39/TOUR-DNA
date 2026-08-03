import {
  describeMissingStrategyField,
  EXECUTION_DIFFICULTY_LABEL_KO,
  formatRoleFitRanking,
  type StrategyComparisonRow,
} from "@/lib/domain/strategyResourcePlan";

export type { StrategyComparisonRow };

/** 전략 3안을 한 화면에서 나란히 비교하기 위한 표 — StrategyCard가 이미 보여주는 값을 다시 계산하지
 * 않고 그대로 재사용하되, "적합 역할"만 세 역할 각각의 roleFit을 비교해 새로 보여준다(2026-08-04). */
export function StrategyComparisonTable({ rows }: { rows: StrategyComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="w-28 px-3 py-2 font-medium text-slate-500">비교 항목</th>
            {rows.map((row) => (
              <th key={row.id} className="px-3 py-2 font-semibold text-slate-900">
                {row.rank}순위 · {row.name}
                <span className="block font-normal text-slate-500">{row.totalScore}점</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="align-top">
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 font-medium text-slate-500">해결 문제</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                {row.coreProblem ?? describeMissingStrategyField(row.dataAvailability)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 font-medium text-slate-500">활용 자원</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                {row.coreResource ?? describeMissingStrategyField(row.dataAvailability)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 font-medium text-slate-500">체류 방식</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                {row.stayStyle ?? describeMissingStrategyField(row.dataAvailability)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 font-medium text-slate-500">실행 난이도</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                {row.executionDifficulty
                  ? EXECUTION_DIFFICULTY_LABEL_KO[row.executionDifficulty]
                  : describeMissingStrategyField(row.dataAvailability)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 font-medium text-slate-500">기대 효과</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                {row.expectedEffect ?? describeMissingStrategyField(row.dataAvailability)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <th className="px-3 py-2 font-medium text-slate-500">주요 위험</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                <ul className="list-disc space-y-0.5 pl-4">
                  {row.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </td>
            ))}
          </tr>
          <tr>
            <th className="px-3 py-2 font-medium text-slate-500">적합 역할</th>
            {rows.map((row) => (
              <td key={row.id} className="px-3 py-2 text-slate-700">
                {formatRoleFitRanking(row.roleFitRanking)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
        ※ 적합 역할은 실제 역할별 성과 데이터가 아니라, 역할별 목표 우선순위(기획 규칙, roleFit 공식과
        동일)를 기준으로 세 역할을 비교한 참고 정보입니다.
      </p>
    </div>
  );
}
