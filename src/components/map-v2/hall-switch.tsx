"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { label } from "@/lib/copy/v1";
import { shortHallName } from "@/lib/floorplan/hall-of";

/**
 * UI 3-01 오른쪽 위 홀 버튼(Figma 2994:840), 섹션 25 홀 바꾸기.
 * 홀 전체 → 버튼을 누르면 홀 목록이 펼쳐짐 → 홀 하나를 고르면 그 홀로 맞춘다.
 * 홀이 하나뿐인 박람회에는 띄우지 않는다(바꿀 게 없다).
 */
export function HallSwitch({
  halls,
  current,
  onPick,
  className,
}: {
  halls: string[];
  /** 지금 맞춘 홀 이름. 전체면 null. */
  current: string | null;
  onPick: (hall: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (halls.length < 2) return null;
  const items: (string | null)[] = open ? [null, ...halls] : [current];
  return (
    <div
      role="group"
      aria-label={label.hallSwitch}
      className={clsx(
        "flex flex-col gap-v2-x1 rounded-v2-pill bg-v2-bg-layer-floating p-v2-x1 shadow-v2-s3",
        className,
      )}
    >
      {items.map((h) => {
        const on = h === current;
        return (
          <button
            key={h ?? "__all"}
            type="button"
            aria-pressed={open ? on : undefined}
            aria-expanded={open ? undefined : false}
            onClick={() => {
              if (!open) return setOpen(true);
              setOpen(false);
              onPick(h);
            }}
            className={clsx(
              "flex h-v2-x9 min-w-v2-x9 items-center justify-center whitespace-nowrap rounded-v2-full px-v2-x2 text-v2-t3 font-v2-bold",
              on
                ? "border-[var(--roam-v2-stroke-width-s1-4)] border-v2-stroke-brand-weak bg-v2-bg-brand-weak text-v2-fg-brand"
                : "text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed",
            )}
          >
            {/* 이름이 길면 원이 알약으로 넓어진다(높이와 최소 폭은 x9 그대로). */}
            {shortHall(h)}
          </button>
        );
      })}
    </div>
  );
}

/** 칩에 들어갈 짧은 이름(`shortHallName`, iOS와 같은 규칙). 전체면 "전체". */
function shortHall(h: string | null): string {
  return h ? shortHallName(h) : label.whole;
}
