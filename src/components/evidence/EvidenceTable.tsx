import type { DataProvenance } from "@/lib/domain/types";
import { formatBaseYm, formatDateTime, metricLabel, provenanceLabel, sourceLabel } from "@/lib/format";

export interface EvidenceRow {
  metricCode: string;
  rawValue: number;
  normalizedValue: number | null;
  unit: string;
  adminLevel: string;
  regionCode: string;
  baseYm: string;
  sourceCode: string;
  collectedAt: Date | string;
  appliedRule: string;
  /** 값이 없거나(레거시) 호출부가 넘기지 않으면 근거 수준 열을 생략한다(기존 호출부 회귀 방지).
   * `null`은 "판정 정보 없음"(레거시), `undefined`는 "이 호출부가 애초에 근거 수준을 넘기지 않음" —
   * 열 표시 여부는 undefined 기준으로만 판단하고, 실제 라벨 구분은 provenanceLabel()이 담당한다. */
  provenance?: DataProvenance | null;
}

/** 사용자가 주의 깊게 봐야 하는 근거 수준(추정값/근거 없음/판정 정보 없음)만 강조한다 — 확인된 실제
 * 데이터(LIVE_API/CACHED_API/CURATED)는 강조하지 않는다(2026-08-01, MISSING이 강조되지 않던 문제 수정). */
function isProvenanceCautionLevel(provenance: DataProvenance | null | undefined): boolean {
  return provenance === "ESTIMATED" || provenance === "MISSING" || provenance === null || provenance === undefined;
}

export function EvidenceTable({ items }: { items: EvidenceRow[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-500">연결된 데이터 근거가 없습니다.</p>;
  }
  const showProvenance = items.some((e) => e.provenance !== undefined);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">지표</th>
            <th scope="col" className="py-1 pr-3 font-medium">원값</th>
            <th scope="col" className="py-1 pr-3 font-medium">정규화값</th>
            <th scope="col" className="py-1 pr-3 font-medium">단위</th>
            <th scope="col" className="py-1 pr-3 font-medium">행정단위</th>
            <th scope="col" className="py-1 pr-3 font-medium">기준월</th>
            <th scope="col" className="py-1 pr-3 font-medium">출처</th>
            <th scope="col" className="py-1 pr-3 font-medium">수집일</th>
            <th scope="col" className="py-1 pr-3 font-medium">반영 규칙</th>
            {showProvenance ? <th scope="col" className="py-1 pr-3 font-medium">근거 수준</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((e, i) => (
            <tr key={`${e.metricCode}-${i}`} className="border-t border-slate-100 text-slate-700">
              <td className="py-1.5 pr-3">{metricLabel(e.metricCode)}</td>
              <td className="py-1.5 pr-3">{e.rawValue}</td>
              <td className="py-1.5 pr-3">{e.normalizedValue ?? "-"}</td>
              <td className="py-1.5 pr-3">{e.unit}</td>
              <td className="py-1.5 pr-3">{e.adminLevel}</td>
              <td className="py-1.5 pr-3">{formatBaseYm(e.baseYm)}</td>
              <td className="py-1.5 pr-3">{sourceLabel(e.sourceCode)}</td>
              <td className="py-1.5 pr-3">{formatDateTime(e.collectedAt)}</td>
              <td className="py-1.5 pr-3">{e.appliedRule}</td>
              {showProvenance ? (
                <td className="py-1.5 pr-3">
                  <span className={isProvenanceCautionLevel(e.provenance) ? "text-amber-700" : "text-slate-700"}>
                    {provenanceLabel(e.provenance)}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
