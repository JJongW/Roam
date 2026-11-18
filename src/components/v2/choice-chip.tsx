"use client";

import { clsx } from "clsx";

/**
 * UI/고르는 칩(Figma 3002:4474). 평가 칩과 물어보기 칩. 켬은 고른 상태, 다시 누르면 풀린다.
 * 높이 36, 좌우 14, 둥글기 full. 켬 = bg-brand-solid, 끔 = bg-layer-floating + stroke-neutral-muted.
 */
export function ChoiceChip({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "flex min-h-v2-x9 shrink-0 items-center justify-center rounded-v2-full border px-v2-x3-5 py-v2-x2 text-v2-t4 font-v2-medium",
        on
          ? "border-v2-bg-brand-solid bg-v2-bg-brand-solid text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
          : "border-v2-stroke-neutral-muted bg-v2-bg-layer-floating text-v2-fg-neutral active:bg-v2-bg-layer-floating-pressed",
      )}
    >
      {children}
    </button>
  );
}
