"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { formatPostTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { IssueGroup } from "@/lib/admin/issue-grouping";

const SOURCES: { value: "all" | "server" | "client"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "server", label: "서버" },
  { value: "client", label: "클라이언트" },
];

const chipClass = (active: boolean) =>
  `rounded-lg border px-3 py-1 text-xs font-semibold ${
    active
      ? "border-primary bg-primary/10 text-primary"
      : "border-border text-muted-foreground"
  }`;

export function IssueLogList({ groups }: { groups: IssueGroup[] }) {
  const router = useRouter();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [component, setComponent] = useState<string>("all");
  const [source, setSource] = useState<"all" | "server" | "client">("all");
  const [cleaning, setCleaning] = useState(false);

  const components = ["all", ...new Set(groups.map((g) => g.component))];
  // 두 필터는 독립적으로 걸리고 **둘 다** 만족해야 보인다(AND).
  const filtered = groups.filter(
    (g) =>
      (source === "all" || g.sample.source === source) &&
      (component === "all" || g.component === component),
  );

  async function cleanup() {
    if (cleaning) return;
    setCleaning(true);
    try {
      const { deleted } = await api.post<{ deleted: number }>(
        "/api/admin/issues/cleanup",
      );
      toast.success(`${deleted}건 정리했어요`);
      // 삭제 결과가 목록에 반영되도록 서버 컴포넌트를 다시 그린다.
      router.refresh();
    } catch {
      toast.error("정리에 실패했어요");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSource(s.value)}
            className={chipClass(source === s.value)}
          >
            {s.label}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={cleaning}
          onClick={cleanup}
        >
          30일 이전 로그 정리
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {components.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setComponent(c)}
            className={chipClass(component === c)}
          >
            {c === "all" ? "전체" : c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">기록된 오류가 없어요.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((g) => (
            <li
              key={g.key}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() =>
                  setExpandedKey(expandedKey === g.key ? null : g.key)
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        g.sample.source === "server"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {g.sample.source === "server" ? "서버" : "클라이언트"}
                    </span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold">
                      {g.component}
                    </span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold">
                      {g.count}회
                    </span>
                    <span>{formatPostTime(g.lastSeenAt)}</span>
                    {g.path && <span className="truncate">{g.path}</span>}
                  </p>
                  <p className="mt-1 truncate font-medium">{g.message}</p>
                </div>
              </button>
              {expandedKey === g.key && (
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <p>
                    최초 발생: {new Date(g.firstSeenAt).toLocaleString("ko-KR")}
                  </p>
                  {(g.sample.device || g.sample.country || g.sample.city) && (
                    <p>
                      {[g.sample.device, g.sample.country, g.sample.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {g.sample.userId && (
                    <p>
                      사용자:{" "}
                      <a
                        href={`/admin/accounts/${g.sample.userId}`}
                        className="underline"
                      >
                        {g.sample.userId}
                      </a>
                    </p>
                  )}
                  {g.sample.context &&
                    Object.keys(g.sample.context).length > 0 && (
                      <pre className="overflow-x-auto rounded-lg bg-secondary p-2">
                        {JSON.stringify(g.sample.context, null, 2)}
                      </pre>
                    )}
                  {g.sample.stack && (
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-2">
                      {g.sample.stack}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
