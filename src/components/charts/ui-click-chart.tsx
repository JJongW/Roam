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

const COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#8b5cf6", "#15c47e", "#ffb020"];

const LABEL_BY_CONTROL: Record<string, string> = {
  map_zoom_in: "지도 확대",
  map_zoom_out: "지도 축소",
  map_reset_view: "지도 전체 보기",
  map_rotate: "지도 회전",
  feed_exhausted_finish: "피드 소진 · 마치기",
  feed_exhausted_map: "피드 소진 · 지도로",
  feed_repick: "피드 새로 고르기",
  companion_bar_open: "컴패니언 바 열기",
  companion_faq_q1: "컴패니언 FAQ 1",
  companion_faq_q2: "컴패니언 FAQ 2",
  companion_faq_q3: "컴패니언 FAQ 3",
  finish_visit_start: "관람 마치기 시작",
};

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
    .map((d) => ({ ...d, label: LABEL_BY_CONTROL[d.control] ?? d.control }));
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
