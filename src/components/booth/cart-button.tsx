"use client";

import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
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

  // Toggle + immediate "what happened / what's next" feedback. Without it the
  // visitor can't tell the tap registered or how many booths they've planned.
  function onToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const wasIn = useCartStore.getState().ids.includes(boothId);
    toggle(boothId);
    if (wasIn) {
      toast("동선에서 뺐어요");
    } else {
      const count = useCartStore.getState().ids.length;
      toast.success(`동선에 담았어요 · 총 ${count}곳`);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={active ? "동선에서 빼기" : "동선에 담기"}
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground",
          className,
        )}
      >
        {active ? (
          <Check className="size-4.5" />
        ) : (
          <Plus className="size-4.5" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
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
