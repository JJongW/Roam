"use client";

import { useCallback, useEffect, useState } from "react";
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
 * 높이 48, 그림자 s3, 행동 글자 fg.brand-inverted(Roam-design docs/decisions/2026-11-25_스낵바-행동-글자-대비.md).
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
        // 위아래 여백은 글줄(span)이 갖는다. 행동 단추가 44 높이를 가져도 스낵바는 48로 그대로다.
        "pointer-events-auto flex min-h-v2-x12 items-center gap-v2-x3 rounded-v2-r3 bg-v2-bg-neutral-solid py-v2-x0-5 pl-v2-x4 pr-v2-x2 text-v2-t4 font-v2-medium text-v2-fg-on-neutral-solid shadow-v2-s3",
        className,
      )}
    >
      <span className="min-w-0 flex-1 whitespace-pre-line py-v2-x1-5">
        {state.message}
      </span>
      {state.actionLabel && (
        <button
          type="button"
          onClick={() => {
            state.onAction?.();
            onClose();
          }}
          // 누르는 영역 44 이상(HIG). 예전 py-x2는 약 35였다.
          // 글자는 반전 바탕용 브랜드 글자(Roam-design #63 fg.brand-inverted, 라이트 5.82:1 다크 6.26:1).
          // 메시지(흰 글자)와 색으로 갈라 누를 곳이 보이게 한다(11-25 Ted 실기기 "되돌리기가 눈에 안 들어옴").
          className="flex min-h-v2-x11 min-w-v2-x11 shrink-0 items-center justify-center rounded-v2-r2 px-v2-x3 text-v2-t4 font-v2-bold text-v2-fg-brand-inverted active:bg-v2-bg-transparent-pressed"
        >
          {state.actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * 화면을 옮긴 뒤 도착한 화면에서 띄울 스낵바(15-10 로그아웃하면 마이페이지, 15-13 계정을 지우면 홈).
 * 앱 안 이동(router.replace)은 페이지를 다시 읽지 않아 이 모듈 값이 이어진다. 한 번 꺼내면 비운다.
 */
let queued: string | null = null;

export function queueSnackbar(message: string) {
  queued = message;
}

export function takeQueuedSnackbar(): string | null {
  const m = queued;
  queued = null;
  return m;
}

/** 도착한 화면이 열릴 때 한 번, 맡겨 둔 문구가 있으면 그 화면의 스낵바로 띄운다(한 번에 하나, 섹션 33). */
export function useQueuedSnackbar(show: (s: SnackbarState) => void) {
  useEffect(() => {
    const m = takeQueuedSnackbar();
    if (m) show({ key: Date.now(), message: m });
    // 열렸을 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** 자기 스낵바가 없는 화면(홈)에 두는 아래 붙은 스낵바. 맡겨 둔 문구만 띄운다. */
export function QueuedSnackbar() {
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const close = useCallback(() => setSnack(null), []);
  useQueuedSnackbar(setSnack);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] px-v2-x4 pb-safe">
      <Snackbar state={snack} onClose={close} className="mb-v2-x4 w-full" />
    </div>
  );
}
