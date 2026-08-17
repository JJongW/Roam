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
import { EmptyState } from "@/components/common/states";

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
  // 조회가 전무하면 Bar(dataKey="views")가 길이 0이라 막대 자체를 안 그린다 —
  // 축 라벨만 남아 고장난 것처럼 보인다. 옆 "방문 흐름" 섹션과 같은 톤으로
  // 정직하게 빈 상태를 알린다(가짜 인기도로 채우지 않는다는 기존 설계와 일치).
  if (top.every((d) => d.views === 0)) {
    return (
      <EmptyState
        title="아직 조회 데이터가 없어요"
        description="방문자가 부스를 조회하면 순위가 집계돼요."
      />
    );
  }
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
