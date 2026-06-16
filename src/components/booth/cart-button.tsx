"use client";

import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/lib/stores/cart";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/** Add / remove a booth from the visitor's planned route ("내 동선"). */
export function CartButton({
  boothId,
  variant = "full",
  className,
}: {
  boothId: string;
  variant?: "full" | "icon";
  className?: string;
}) {
  const hydrated = useHydrated();
  const inCart = useCartStore((s) => s.ids.includes(boothId));
  const toggle = useCartStore((s) => s.toggle);
  const active = hydrated && inCart;

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={active ? "동선에서 빼기" : "동선에 담기"}
        aria-pressed={active}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(boothId);
        }}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground",
          className,
        )}
      >
        {active ? <Check className="size-4.5" /> : <Plus className="size-4.5" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(boothId);
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-foreground",
        className,
      )}
    >
      {active ? <Check className="size-4.5" /> : <Plus className="size-4.5" />}
      {active ? "동선에 담음" : "동선에 담기"}
    </button>
  );
}
