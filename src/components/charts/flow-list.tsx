"use client";

import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/common/states";

export interface FlowEdge {
  from: string;
  to: string;
  count: number;
}

export function FlowList({
  edges,
  names,
}: {
  edges: FlowEdge[];
  names: Record<string, string>;
}) {
  const nameOf = (id: string) => names[id] ?? id;
  const top = [...edges].sort((a, b) => b.count - a.count).slice(0, 10);
  if (top.length === 0) {
    return (
      <EmptyState
        title="방문 흐름 데이터가 아직 없어요"
        description="방문자가 부스를 이동하면 인기 경로가 집계돼요."
      />
    );
  }
  const max = Math.max(...top.map((e) => e.count));
  return (
    <ul className="space-y-2">
      {top.map((e, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
        >
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {nameOf(e.from)}{" "}
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />{" "}
            {nameOf(e.to)}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span
              className="h-2 rounded-full bg-primary"
              style={{ width: `${(e.count / max) * 64 + 8}px` }}
            />
            <span className="tabular text-sm text-muted-foreground">
              {e.count}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
