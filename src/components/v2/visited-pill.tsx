"use client";

import { Check } from "lucide-react";
import { clsx } from "clsx";
import { label } from "@/lib/copy/v1";

/**
 * UI/다녀왔어요 알약(Figma 2991:654) — 카드 윗선 오른쪽에 걸친다(V4, 11-10).
 * 현장에서는 체크만, 평가는 나중에 로미가 묻는다. 켜면 브랜드색 면(iOS VisitedPill과 같다).
 */
export function VisitedPill({
  on,
  onToggle,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={clsx(
        "flex items-center gap-v2-x1 rounded-v2-full py-v2-x1-5 pl-v2-x2-5 pr-v2-x3 text-v2-t3 font-v2-medium shadow-v2-s1",
        on
          ? "bg-v2-bg-brand-solid text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
          : "border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating text-v2-fg-neutral active:bg-v2-bg-layer-floating-pressed",
        className,
      )}
    >
      <Check aria-hidden className="size-[var(--roam-v2-icon-size-sm)]" />
      {label.visited}
    </button>
  );
}
