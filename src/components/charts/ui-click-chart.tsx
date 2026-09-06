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
import type { UiClickCount } from "@/lib/admin/ui-click-breakdown";
import { UI_CONTROL_LABELS, type UiControl } from "@/lib/analytics/ui-controls";

const COLORS = [
  "#4f46e5",
  "#6366f1",
  "#818cf8",
  "#8b5cf6",
  "#15c47e",
  "#ffb020",
];

export function UiClickChart({ data }: { data: UiClickCount[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        아직 집계된 클릭이 없습니다.
      </p>
    );
  }
  const rows = data
    .slice(0, 12)
    // 목록에 없는 control은 옛 데이터이거나 어휘에서 지운 것 — 원문을 그대로
    // 드러내서 "이게 뭔지 모르겠다"가 화면에 보이게 한다(조용히 감추지 않는다).
    .map((d) => ({
      ...d,
      label: UI_CONTROL_LABELS[d.control as UiControl] ?? d.control,
    }));
  return (
    <div className="h-80 w-full">
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
            width={112}
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
          <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={16}>
            {rows.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
