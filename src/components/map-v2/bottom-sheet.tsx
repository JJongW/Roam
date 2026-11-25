"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { label } from "@/lib/copy/v1";

/** 아래로 민 거리가 시트 높이의 이만큼을 넘으면 닫는다(짧게 밀면 제자리로). */
const SWIPE_CLOSE_RATIO = 0.25;

/**
 * 지도 위 시트 틀(6-04 오늘 다녀온 곳과 같은 생김새). 로미 시트(7), 길 안내(9-01, 9-02), 회고(12)가 쓴다.
 * 바깥을 누르거나 Esc로 닫는다. 지도는 뒤에 그대로 있다.
 * `swipeToClose`면 아래로 밀어도 닫는다(UI 24 Q2A-2 부스 미리보기 "아래로 밀거나 바깥을 누르면").
 */
export function BottomSheet({
  ariaLabel,
  onClose,
  children,
  tall,
  swipeToClose,
}: {
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
  /** 글을 쓰는 시트(회고)는 위까지 올린다. */
  tall?: boolean;
  /** 아래로 밀어 닫기. 옆으로 미는 손(사진 넘김)과 위로 미는 손(스크롤)은 건드리지 않는다. */
  swipeToClose?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const sheetRef = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; axis?: "x" | "y" } | null>(null);
  const [drag, setDrag] = useState(0);
  const swipe = swipeToClose
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          const t = e.touches[0];
          // 시트 안이 스크롤된 채면 먼저 스크롤을 올리게 둔다.
          start.current = (sheetRef.current?.scrollTop ?? 0) > 0 ? null : { x: t.clientX, y: t.clientY };
        },
        onTouchMove: (e: React.TouchEvent) => {
          const s = start.current;
          if (!s) return;
          const t = e.touches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          if (!s.axis && Math.abs(dx) + Math.abs(dy) > 6) s.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
          if (s.axis === "y") setDrag(Math.max(0, dy));
        },
        onTouchEnd: () => {
          const h = sheetRef.current?.getBoundingClientRect().height ?? 0;
          const close = drag > 0 && drag > h * SWIPE_CLOSE_RATIO;
          start.current = null;
          setDrag(0);
          if (close) onClose();
        },
      }
    : {};
  return (
    <div
      className={`fixed inset-0 z-40 flex items-end justify-center ${tall ? "pt-v2-x12" : "pt-v2-x28"}`}
      role="dialog"
      aria-modal
      aria-label={ariaLabel}
    >
      <button
        type="button"
        aria-label={label.close}
        onClick={onClose}
        className="absolute inset-0 bg-v2-bg-overlay"
      />
      <section
        ref={sheetRef}
        {...swipe}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        className="relative flex max-h-full w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col gap-v2-x4 overflow-y-auto rounded-t-v2-sheet bg-v2-bg-layer-floating px-v2-x4 pb-safe pt-v2-x3"
      >
        <div className="flex justify-center">
          <span className="h-v2-x1 w-v2-x9 rounded-v2-full bg-v2-stroke-neutral-subtle" />
        </div>
        {children}
        <div className="h-v2-x2 shrink-0" />
      </section>
    </div>
  );
}
