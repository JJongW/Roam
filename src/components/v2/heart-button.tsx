"use client";

import { Heart } from "lucide-react";
import { clsx } from "clsx";
import { label } from "@/lib/copy/v1";

/**
 * Roam/찜 하트 B(Figma 2612:2438) — 카드와 상세 안의 투명 하트. 누르는 영역 44, 아이콘 24.
 * 켜지면 Fill + 브랜드색, 꺼지면 Line(아이콘 Q3). 가기 전 판단은 이것 하나뿐(11-07).
 */
export function HeartButton({
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
      // 누르면 일어날 일을 읽는다(상태에 따라 남기기, 빼기). 이름이 바뀌므로 aria-pressed는 함께 쓰지 않는다.
      aria-label={on ? label.heartRemove : label.heartAdd}
      onClick={onToggle}
      className={clsx(
        "flex size-v2-x11 shrink-0 items-center justify-center rounded-v2-full bg-v2-bg-transparent active:bg-v2-bg-transparent-pressed",
        on ? "text-v2-fg-brand" : "text-v2-fg-neutral",
        className,
      )}
    >
      <Heart
        aria-hidden
        className="size-[var(--roam-v2-icon-size-lg)]"
        fill={on ? "currentColor" : "none"}
      />
    </button>
  );
}
