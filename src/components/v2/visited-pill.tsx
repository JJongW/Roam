"use client";

import { Footprints } from "lucide-react";
import { clsx } from "clsx";
import { label } from "@/lib/copy/v1";

/**
 * UI/다녀왔어요 알약(Figma 2991:654) — 카드 윗선 오른쪽에 걸친다(V4, 11-10).
 * 현장에서는 누르기만, 평가는 나중에 로미가 묻는다. 켜면 브랜드색 면(iOS VisitedPill과 같다).
 * 아이콘은 발자국(UI 26-I1, Lucide Footprints, 2026-11-27 Ted). 끔은 선, 켬은 채움(아이콘 셋 v2 04).
 * 체크 아이콘은 쓰지 않는다(Roam-design docs/decisions/2026-11-27_지도-다녀온-칸-초록-면-발자국.md).
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
      <Footprints
        aria-hidden
        data-icon="footprints"
        fill={on ? "currentColor" : "none"}
        className="size-[var(--roam-v2-icon-size-sm)]"
      />
      {label.visited}
    </button>
  );
}
