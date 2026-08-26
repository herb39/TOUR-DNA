"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

export interface DnaAxisChartDatum {
  axisKey: string;
  label: string;
  score: number | null;
  status: "LIVE" | "SNAPSHOT" | "MISSING";
  /** 스크린리더용 대체 텍스트 표에 표시할 출처 요약 문구(2026-08-06) — enum 원문(LIVE/SNAPSHOT/MISSING)
   * 대신 "모두 실시간 API"처럼 사람이 이해할 수 있는 문구를 넘긴다. 넘기지 않으면 기존처럼 status를
   * 그대로 보여준다(하위 호환). */
  sourceLabel?: string;
}

export function DnaRadarChart({ data }: { data: DnaAxisChartDatum[] }) {
  const chartData = data.map((d) => ({ axis: d.label, score: d.score ?? 0 }));

  return (
    <div className="min-w-0">
      <div aria-hidden="true" className="min-w-0 max-w-full" style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={chartData} outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: "#334155" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Radar name="관광 DNA" dataKey="score" stroke="#0f172a" fill="#0f172a" fillOpacity={0.25} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table>
          <caption>관광 DNA 5축 표시지수 (차트의 텍스트 대체 정보)</caption>
          <thead>
            <tr>
              <th scope="col">축</th>
              <th scope="col">DNA 상대지수</th>
              <th scope="col">상태</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.axisKey}>
                <th scope="row">{d.label}</th>
                <td>{d.score === null ? "데이터 부족" : d.score}</td>
                <td>{d.sourceLabel ?? d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
