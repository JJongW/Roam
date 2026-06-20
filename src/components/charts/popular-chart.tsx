"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PopularDatum {
  boothId: string;
  name: string;
  views: number;
  arrivals: number;
}

const COLORS = [
  "#4f46e5",
  "#6366f1",
  "#818cf8",
  "#8b5cf6",
  "#15c47e",
  "#ffb020",
];

export function PopularChart({ data }: { data: PopularDatum[] }) {
  const top = data.slice(0, 8).map((d) => ({ ...d, label: d.name }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={top}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={92}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontSize: 13,
            }}
            formatter={(value) => `${value}회`}
          />
          <Bar dataKey="views" radius={[0, 8, 8, 0]} barSize={20}>
            {top.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
