"use client";

import { useEffect } from "react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { label } from "@/lib/copy/v1";

/**
 * UI/로미 줄(Figma 3002:4467), 6-03 "다녀온 곳으로 기억해 둘게요". 카드 자리에 뜨고 윗선 가운데 로미 36.
 * 동작은 오른쪽 끝 글자 동작 하나(되돌리기). 평가를 묻지 않는다(로미는 동행자, 남긴 것을 기억한다고만 말한다).
 * 6초 뒤 사라진다.
 */
export function RomiLineCard({
  title,
  sub,
  actionLabel = label.undo,
  onAction,
  onDone,
}: {
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [onDone]);
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onAction}
          className="flex min-h-v2-x9 items-center rounded-v2-r2 px-v2-x3-5 py-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}
