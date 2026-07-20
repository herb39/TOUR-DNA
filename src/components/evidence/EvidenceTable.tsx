import { formatBaseYm, formatDateTime } from "@/lib/format";

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
}

export function EvidenceTable({ items }: { items: EvidenceRow[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-slate-500">연결된 데이터 근거가 없습니다.</p>;
  }
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
          </tr>
        </thead>
        <tbody>
          {items.map((e, i) => (
            <tr key={`${e.metricCode}-${i}`} className="border-t border-slate-100 text-slate-700">
              <td className="py-1.5 pr-3 font-mono">{e.metricCode}</td>
              <td className="py-1.5 pr-3">{e.rawValue}</td>
              <td className="py-1.5 pr-3">{e.normalizedValue ?? "-"}</td>
              <td className="py-1.5 pr-3">{e.unit}</td>
              <td className="py-1.5 pr-3">{e.adminLevel}</td>
              <td className="py-1.5 pr-3">{formatBaseYm(e.baseYm)}</td>
              <td className="py-1.5 pr-3">{e.sourceCode}</td>
              <td className="py-1.5 pr-3">{formatDateTime(e.collectedAt)}</td>
              <td className="py-1.5 pr-3">{e.appliedRule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
