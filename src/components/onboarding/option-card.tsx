"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/common/icon";

export function OptionCard({
  label,
  description,
  icon,
  selected,
  onSelect,
  layout = "row",
}: {
  label: string;
  description?: string;
  icon?: string;
  selected: boolean;
  onSelect: () => void;
  layout?: "row" | "tile";
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border-2 bg-card p-4 text-left transition-all active:scale-[0.98]",
        selected
          ? "border-primary bg-accent/60"
          : "border-border hover:border-border/80",
        layout === "tile" && "flex-col items-start gap-2",
      )}
    >
      {icon && (
        // Icon tile stays neutral even when selected — the selection cue is the
        // border + check + light fill, so a grid of selected tiles doesn't turn
        // into a wall of indigo.
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <Icon name={icon} className="size-5.5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold">{label}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          layout === "tile" && "absolute right-3 top-3",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border",
        )}
        aria-hidden
      >
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
