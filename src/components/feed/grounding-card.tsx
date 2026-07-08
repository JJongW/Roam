"use client";

import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Grounding } from "@/lib/feed/grounding";

const CONF: Record<Grounding["confidence"], { key: string; dot: string }> = {
  high: { key: "grounding.confHigh", dot: "bg-primary" },
  medium: { key: "grounding.confMedium", dot: "bg-primary/50" },
  low: { key: "grounding.confLow", dot: "bg-muted-foreground/40" },
};

/**
 * 근거 카드 — Roam이 이 부스를 왜 골랐는지(판단 재료)를 보여준다. 명령이 아니라
 * "왜 맞을 수 있는지 + 확인 가능한 근거 + 뭘 하면 좋은지 + 얼마나 확실한지". 결정은 사용자.
 */
export function GroundingCard({ grounding }: { grounding: Grounding }) {
  const t = useT();
  const { why, evidence, todo, confidence } = grounding;
  const c = CONF[confidence];

  return (
    <div className="mt-2 rounded-xl border border-border bg-secondary/40 p-3">
      <div className="flex items-start gap-1.5">
        <Lightbulb
          className="mt-0.5 size-3.5 shrink-0 text-primary"
          aria-hidden
        />
        <p className="text-sm font-medium leading-relaxed text-foreground/90">
          {why}
        </p>
      </div>

      {evidence.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {evidence.map((ev, i) => (
            <span
              key={i}
              className="rounded-md bg-card px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {ev}
            </span>
          ))}
        </div>
      )}

      {todo.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t("grounding.todo", { items: todo.join(" · ") })}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
        <span className="text-[11px] text-muted-foreground">{t(c.key)}</span>
      </div>
    </div>
  );
}
