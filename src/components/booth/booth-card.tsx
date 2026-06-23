import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/common/icon";
import { CategoryChip } from "@/components/booth/category-chip";
import type { Booth, Category } from "@/lib/types";

export function BoothCard({
  booth,
  category,
  order,
  compact = false,
  action,
  className,
}: {
  booth: Booth;
  category?: Category;
  order?: number;
  /** Thin, scannable single-line row (for long lists). */
  compact?: boolean;
  /** Optional trailing control (e.g. add-to-route button). */
  action?: React.ReactNode;
  className?: string;
}) {
  if (compact) {
    return (
      <Link
        href={`/booths/${booth.id}`}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 active:bg-accent/40",
          className,
        )}
      >
        {order != null ? (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {order}
          </span>
        ) : (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: category?.color ?? "var(--muted-foreground)",
            }}
            aria-hidden
          />
        )}
        {booth.code && (
          <span className="w-12 shrink-0 text-xs font-bold tabular text-muted-foreground">
            {booth.code}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {booth.name}
        </span>
        {action}
        {!action && (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </Link>
    );
  }

  return (
    <Link
      href={`/booths/${booth.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 active:bg-accent/40",
        className,
      )}
    >
      <div
        className="relative flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: category
            ? `${category.color}1a`
            : "var(--secondary)",
        }}
      >
        {category ? (
          <Icon name={category.icon} className="size-5" />
        ) : (
          <span className="text-base font-bold">{booth.name.slice(0, 1)}</span>
        )}
        {order != null && (
          <span className="absolute -left-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {order}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{booth.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {booth.company}
        </p>
        {category && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <CategoryChip category={category} />
          </div>
        )}
      </div>

      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
