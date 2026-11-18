"use client";

import { useEffect } from "react";
import { clsx } from "clsx";

export interface SnackbarState {
  /** 같은 문구가 다시 떠도 타이머가 새로 돌게. */
  key: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * UI/스낵바(5-08 하트 빼기 되돌리기, 6-06 다녀온 곳 빼기). 확인 창 없이 바로 빠지고 여기서
 * 되돌린다(11-12 HX-A). 한 번에 하나만(섹션 33). 4초 뒤 사라진다.
 */
export function Snackbar({
  state,
  onClose,
  className,
}: {
  state: SnackbarState | null;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [state, onClose]);
  if (!state) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        "pointer-events-auto flex min-h-v2-x12 items-center gap-v2-x3 rounded-v2-r3 bg-v2-bg-neutral-solid py-v2-x2 pl-v2-x4 pr-v2-x2 text-v2-t4 font-v2-medium text-v2-fg-on-neutral-solid shadow-v2-s2",
        className,
      )}
    >
      <span className="min-w-0 flex-1 whitespace-pre-line">
        {state.message}
      </span>
      {state.actionLabel && (
        <button
          type="button"
          onClick={() => {
            state.onAction?.();
            onClose();
          }}
          className="shrink-0 rounded-v2-r2 px-v2-x3 py-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-on-neutral-solid active:bg-v2-bg-transparent-pressed"
        >
          {state.actionLabel}
        </button>
      )}
    </div>
  );
}
