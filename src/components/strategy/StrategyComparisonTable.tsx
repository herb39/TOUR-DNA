import {
  describeMissingStrategyField,
  EXECUTION_DIFFICULTY_LABEL_KO,
  formatRoleFitRanking,
  type StrategyComparisonRow,
} from "@/lib/domain/strategyResourcePlan";
import type { UserRoleCode } from "@/lib/domain/audienceContext";
import { AnimatedDetails } from "@/components/ui/AnimatedDetails";

export type { StrategyComparisonRow };

/** 전략 3안을 한 화면에서 나란히 비교하기 위한 표 — StrategyCard가 이미 보여주는 값을 다시 계산하지
 * 않고 그대로 재사용하되, "적합 역할"만 세 역할 각각의 roleFit을 비교해 새로 보여준다(2026-08-04).
 * 2026-08-07: "5초 안에 3안 차이를 이해한다"는 목표에 맞춰 기본 표는 핵심 방향·기대 효과·실행 난이도·
 * 주요 위험 4개 항목만 남기고, 활용 자원·체류 방식·적합 역할은 접어서 유지한다(데이터 삭제 없음).
 * 2026-08-17: 카드의 이름·점수와 표의 상세 비교를 분리해 기본 화면의 텍스트 밀도를 낮춘다.
 * 2026-08-13: 접힌 상세 안의 "적합 역할" 3역할 순위는 그대로 두되, 지금 이 프로젝트의 역할(currentRole)
 * 적합도만 기본 표(접지 않은 영역)에 배지로 노출한다 — 세 역할을 균등 비교하는 목적(더보기)과 "내
 * 역할에는 어떤 전략이 맞는지 바로 확인"하는 목적(기본 표)을 분리한다. */
export function StrategyComparisonTable({
  rows,
  currentRole,
}: {
  rows: StrategyComparisonRow[];
  currentRole?: UserRoleCode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <AnimatedDetails
        summary="핵심 비교표 보기 (4개 항목)"
        summaryClassName="cursor-pointer px-3 py-2 text-[11px] font-medium text-slate-500"
      >
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="w-28 px-3 py-2 font-medium text-slate-500">비교 항목</th>
                {rows.map((row) => (
                  <th key={row.id} className="px-3 py-2 font-semibold text-slate-900">
                    {row.rank === 1 ? (
                      <span className="mb-0.5 block rounded-full bg-slate-900 px-2 py-0.5 text-center text-[10px] font-medium text-white">
                        추천 1순위
                      </span>
                    ) : (
                      <span className="mb-0.5 block text-[10px] font-medium text-slate-400">대안 {row.rank}</span>
                    )}
                    {row.name}
                    <span className="block font-normal text-slate-500">전략 적합도 {row.totalScore}점</span>
                    {currentRole ? (
                      <span className="mt-1 block rounded-full bg-indigo-50 px-2 py-0.5 text-center text-[10px] font-medium text-indigo-700">
                        내 역할 적합도{" "}
                        {row.roleFitRanking.find((r) => r.role === currentRole)?.score ?? "-"}점
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-slate-100">
                <th className="px-3 py-2 font-medium text-slate-500">핵심 방향</th>
                {rows.map((row) => (
                  <td key={row.id} className="px-3 py-2 text-slate-700">
                    {row.coreProblem ?? describeMissingStrategyField(row.dataAvailability)}
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
                <th className="px-3 py-2 font-medium text-slate-500">실행 난이도</th>
                {rows.map((row) => (
                  <td key={row.id} className="px-3 py-2 text-slate-700">
                    {row.executionDifficulty
                      ? EXECUTION_DIFFICULTY_LABEL_KO[row.executionDifficulty]
                      : describeMissingStrategyField(row.dataAvailability)}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="px-3 py-2 font-medium text-slate-500">주요 위험</th>
                {rows.map((row) => (
                  <td key={row.id} className="px-3 py-2 text-slate-700">
                    {row.risks[0] ?? "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </AnimatedDetails>

      <AnimatedDetails
        className="border-t border-slate-100"
        summary="활용 자원·체류 방식·적합 역할 더보기"
        summaryClassName="cursor-pointer px-3 py-2 text-[11px] font-medium text-slate-500"
      >
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-xs">
            <tbody className="align-top">
            <tr className="border-t border-slate-100">
              <th className="w-28 px-3 py-2 font-medium text-slate-500">활용 자원</th>
              {rows.map((row) => (
                <td key={row.id} className="px-3 py-2 text-slate-700">
                  {row.coreResource ?? describeMissingStrategyField(row.dataAvailability)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-slate-100">
              <th className="px-3 py-2 font-medium text-slate-500">체류 방식</th>
              {rows.map((row) => (
                <td key={row.id} className="px-3 py-2 text-slate-700">
                  {row.stayStyle ?? describeMissingStrategyField(row.dataAvailability)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-slate-100">
              <th className="px-3 py-2 font-medium text-slate-500">주요 위험(전체)</th>
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
            <tr className="border-t border-slate-100">
              <th className="px-3 py-2 font-medium text-slate-500">적합 역할</th>
              {rows.map((row) => (
                <td key={row.id} className="px-3 py-2 text-slate-700">
                  {formatRoleFitRanking(row.roleFitRanking)}
                </td>
              ))}
            </tr>
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[11px] text-slate-400">
          ※ 적합 역할은 실제 역할별 성과 데이터가 아니라, 업무 목적과의 적합성을 기준으로 세 역할을
          비교한 참고 정보입니다.
        </p>
      </AnimatedDetails>
    </div>
  );
}
