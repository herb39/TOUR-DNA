import type { ComparedRegion } from "@/lib/domain/regionSimilarity";

/** 유사지역 비교 카드 — 전략·기회 카드와 달리 "선택" 개념이 없다(정보 제공용, 저장하지 않음). */
export function RegionComparisonCard({
  comparison,
  rank,
  comparisonBaseYm,
}: {
  comparison: ComparedRegion;
  rank: number;
  /** 이 비교 배치 전체의 기준월 — comparison.baseYm과 다르면 이 카드에 별도 기준월 배지를 보여준다. */
  comparisonBaseYm: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          유사지역 {rank}
        </span>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
          {comparison.regionName}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-700">{comparison.strengthWeaknessSummary}</p>

      {comparison.baseYm !== comparisonBaseYm ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
          ※ 이 지역은 기준월 {comparison.baseYm} 데이터를 사용했습니다(이번 비교 기준월 {comparisonBaseYm}과 다름).
        </p>
      ) : null}

      <details className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">
          축별 차이·벤치마킹 보기 ({comparison.axisDifferences.length}축)
        </summary>
        <div className="mt-2">
          <dl className="space-y-1.5 text-xs text-slate-700">
            <div>
              <dt className="font-medium text-slate-500">상대 위치</dt>
              <dd>{comparison.relativePosition}</dd>
            </div>
          </dl>

          <div className="mt-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">DNA 5축 차이</p>
            <table className="mt-1 w-full text-[11px]">
              <tbody>
                {comparison.axisDifferences.map((a) => (
                  <tr key={a.axis} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-2 text-slate-500">{a.axisLabel}</td>
                    {/* DNA 카드·레이더 차트와 동일한 사용자 표시지수(10~90)로 보여준다 — 내부 원점수
                     * (targetScore/candidateScore/diff)는 유사도 계산·강점 판정에만 쓰고 화면에는
                     * 노출하지 않는다(2026-08-10, 화면마다 다른 숫자로 보이던 문제 수정). */}
                    <td className="py-1 text-right text-slate-700">
                      {a.targetDisplayScore} vs {a.candidateDisplayScore}
                    </td>
                    <td className={`py-1 pl-2 text-right ${a.diff > 0 ? "text-emerald-600" : a.diff < 0 ? "text-red-600" : "text-slate-400"}`}>
                      {a.displayDiff > 0 ? `+${a.displayDiff}` : a.displayDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comparison.benchmarkPoints.length > 0 ? (
            <div className="mt-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">벤치마킹할 요소</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {comparison.benchmarkPoints.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-400">특별히 벤치마킹할 만한 축 차이는 확인되지 않았습니다.</p>
          )}

          {comparison.poiCompositionNote ? (
            <p className="mt-3 text-[11px] text-slate-500">{comparison.poiCompositionNote}</p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
