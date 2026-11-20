"use client";

import { useEffect, type ReactNode } from "react";
import { label } from "@/lib/copy/v1";

/**
 * 지도 위 시트 틀(6-04 오늘 다녀온 곳과 같은 생김새). 로미 시트(7), 길 안내(9-01, 9-02), 회고(12)가 쓴다.
 * 바깥을 누르거나 Esc로 닫는다. 지도는 뒤에 그대로 있다.
 */
export function BottomSheet({
  ariaLabel,
  onClose,
  children,
  tall,
}: {
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
  /** 글을 쓰는 시트(회고)는 위까지 올린다. */
  tall?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
      <section className="relative flex max-h-full w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col gap-v2-x4 overflow-y-auto rounded-t-v2-sheet bg-v2-bg-layer-floating px-v2-x4 pb-safe pt-v2-x3">
        <div className="flex justify-center">
          <span className="h-v2-x1 w-v2-x9 rounded-v2-full bg-v2-stroke-neutral-subtle" />
        </div>
        {children}
        <div className="h-v2-x2 shrink-0" />
      </section>
    </div>
  );
}
