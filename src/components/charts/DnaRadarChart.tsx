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
}

export function DnaRadarChart({ data }: { data: DnaAxisChartDatum[] }) {
  const chartData = data.map((d) => ({ axis: d.label, score: d.score ?? 0 }));

  return (
    <div>
      <div aria-hidden="true" style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: "#334155" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Radar name="관광 DNA" dataKey="score" stroke="#0f172a" fill="#0f172a" fillOpacity={0.25} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>관광 DNA 5축 점수 (차트의 텍스트 대체 정보)</caption>
        <thead>
          <tr>
            <th scope="col">축</th>
            <th scope="col">점수</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.axisKey}>
              <th scope="row">{d.label}</th>
              <td>{d.score === null ? "데이터 부족" : d.score}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
