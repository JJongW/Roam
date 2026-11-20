"use client";

import { clsx } from "clsx";
import { RomiAvatar } from "@/components/v2/romi-avatar";

export interface RomiCardAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/**
 * 지도 아래 로미 카드(로미 줄과 같은 생김새, 윗선 가운데 로미). 길 안내(9-03~9-06)와 "지금 어디"(7-05)
 * 답이 쓴다. 저절로 사라지지 않는다. 동작은 왼쪽부터, 끝내기는 오른쪽 끝 글자 하나.
 */
export function RomiCard({
  title,
  sub,
  actions = [],
  trailing,
}: {
  title: string;
  sub?: string;
  actions?: RomiCardAction[];
  trailing?: RomiCardAction;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="pointer-events-auto relative mt-v2-x5 flex flex-col gap-v2-x3 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating px-v2-x4 pb-v2-x4 pt-v2-x5 shadow-v2-s2"
    >
      <RomiAvatar
        size="md"
        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
      />
      <div className="flex flex-col gap-v2-x1 font-v2-medium">
        <p className="text-v2-t5 text-v2-fg-neutral">{title}</p>
        {sub && <p className="text-v2-t3 text-v2-fg-neutral-muted">{sub}</p>}
      </div>
      {(actions.length > 0 || trailing) && (
        <div className="flex flex-wrap items-center gap-v2-x2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={clsx(
                "flex min-h-v2-x10 items-center rounded-v2-pill px-v2-x3-5 text-v2-t4 font-v2-bold",
                a.primary
                  ? "bg-v2-bg-brand-solid text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
                  : "border border-v2-stroke-neutral-weak bg-v2-bg-layer-default text-v2-fg-neutral active:bg-v2-bg-transparent-pressed",
              )}
            >
              {a.label}
            </button>
          ))}
          {trailing && (
            <button
              type="button"
              onClick={trailing.onClick}
              className="ml-auto flex min-h-v2-x10 items-center rounded-v2-r2 px-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
            >
              {trailing.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
