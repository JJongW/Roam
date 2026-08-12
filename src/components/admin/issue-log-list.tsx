"use client";

import { useState } from "react";
import type { IssueLog } from "@/lib/types";

export function IssueLogList({ issues }: { issues: IssueLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "server" | "client">("all");

  const filtered =
    filter === "all" ? issues : issues.filter((i) => i.source === filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["all", "server", "client"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
              filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {f === "all" ? "전체" : f === "server" ? "서버" : "클라이언트"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">기록된 오류가 없어요.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((issue) => (
            <li
              key={issue.id}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() =>
                  setExpandedId(expandedId === issue.id ? null : issue.id)
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        issue.source === "server"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {issue.source === "server" ? "서버" : "클라이언트"}
                    </span>
                    <span>{new Date(issue.createdAt).toLocaleString("ko-KR")}</span>
                    {issue.path && <span className="truncate">{issue.path}</span>}
                  </p>
                  <p className="mt-1 truncate font-medium">{issue.message}</p>
                </div>
              </button>
              {expandedId === issue.id && issue.stack && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
                  {issue.stack}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
