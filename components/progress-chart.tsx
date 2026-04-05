"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ProgressChartPoint = {
  date: string;
  weight: number | null;
  energyLevel: number | null;
};

type ProgressChartProps = {
  data: ProgressChartPoint[];
};

function formatTick(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ProgressChart({ data }: ProgressChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    dateLabel: formatTick(d.date),
  }));

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: "#a3a3a3", fontSize: 11 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <YAxis
            yAxisId="weight"
            domain={["auto", "auto"]}
            tick={{ fill: "#00ff88", fontSize: 11 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
            label={{
              value: "Weight",
              angle: -90,
              position: "insideLeft",
              fill: "#00ff88",
              fontSize: 11,
            }}
          />
          <YAxis
            yAxisId="energy"
            orientation="right"
            domain={[0, 10]}
            tick={{ fill: "#00aaff", fontSize: 11 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
            label={{
              value: "Energy (1–10)",
              angle: 90,
              position: "insideRight",
              fill: "#00aaff",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0a0a0a",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              color: "#f5f5f5",
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { date?: string } | undefined;
              if (!p?.date) return "";
              try {
                return new Date(p.date).toLocaleString();
              } catch {
                return p.date;
              }
            }}
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            stroke="#00ff88"
            strokeWidth={2}
            dot={{ r: 3, fill: "#00ff88" }}
            connectNulls
          />
          <Line
            yAxisId="energy"
            type="monotone"
            dataKey="energyLevel"
            stroke="#00aaff"
            strokeWidth={2}
            dot={{ r: 3, fill: "#00aaff" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
