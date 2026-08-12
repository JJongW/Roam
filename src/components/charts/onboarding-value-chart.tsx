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
import { VALUE_TAGS } from "@/lib/values";
import type { OnboardingValueCount } from "@/lib/admin/journey-funnel";

const COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#8b5cf6", "#15c47e", "#ffb020"];

const LABEL_BY_SLUG = Object.fromEntries(
  VALUE_TAGS.map((v) => [v.slug, v.label]),
);

export function OnboardingValueChart({
  data,
}: {
  data: OnboardingValueCount[];
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        아직 온보딩을 마친 사람이 없습니다.
      </p>
    );
  }
  const rows = data
    .slice(0, 8)
    .map((d) => ({ ...d, label: LABEL_BY_SLUG[d.slug] ?? d.slug }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
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
            formatter={(value) => `${value}명`}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={20}>
            {rows.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
