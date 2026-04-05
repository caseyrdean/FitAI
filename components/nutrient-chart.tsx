"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type NutrientChartRow = {
  name: string;
  value: number;
  rda: number;
  percentage: number;
};

function barFill(percentage: number): string {
  if (percentage >= 80) return "#00ff88";
  if (percentage >= 50) return "#ffaa00";
  return "#ff4444";
}

type NutrientChartProps = {
  data: NutrientChartRow[];
};

export function NutrientChart({ data }: NutrientChartProps) {
  const pctMax = Math.max(100, ...data.map((d) => d.percentage), 0);
  const xMax = Math.ceil(pctMax / 10) * 10;

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4">
      <ResponsiveContainer width="100%" height={Math.max(360, data.length * 28)}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, xMax]}
            tick={{ fill: "#a3a3a3", fontSize: 11 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            tick={{ fill: "#e5e5e5", fontSize: 11 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(0, 255, 136, 0.06)" }}
            contentStyle={{
              backgroundColor: "#0a0a0a",
              border: "1px solid #2a2a2a",
              borderRadius: "8px",
              color: "#f5f5f5",
            }}
            labelStyle={{ color: "#e5e5e5" }}
            formatter={(value, _name, item) => {
              const pct = typeof value === "number" ? value : Number(value) || 0;
              const row = item?.payload as NutrientChartRow | undefined;
              if (!row || row.value == null || row.rda == null) {
                return [`${pct.toFixed(0)}%`, "RDA %"];
              }
              return [
                `${pct.toFixed(0)}% of RDA — ${row.value.toFixed(1)} / ${row.rda} (~est.)`,
                "RDA %",
              ];
            }}
          />
          <Bar dataKey="percentage" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((entry, index) => (
              <Cell key={`cell-${entry.name}-${index}`} fill={barFill(entry.percentage)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
