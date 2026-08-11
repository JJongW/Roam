"use client";

import { useState } from "react";

/**
 * sessionStorage에 동기화되는 useState. 온보딩 같은 다단계 화면은 URL을 안 바꾸고
 * 순수 컴포넌트 state로만 진행되는데, 뒤로가기는 "이전 단계"가 아니라 "이전 페이지"로
 * 브라우저를 보낸다 — 그 페이지에서 온보딩 트리가 언마운트되고, 다시 돌아오면
 * 리마운트되며 useState 기본값(맨 처음)으로 초기화된다. 이 훅으로 값을 sessionStorage에
 * 같이 적어두면 리마운트돼도 마지막 자리에서 이어진다. localStorage가 아니라
 * sessionStorage인 이유: 탭/브라우저를 완전히 새로 시작하면 온보딩도 새로 시작하는 게
 * 맞다 — 중단 상태를 그렇게까지 오래 남기지 않는다.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  function set(next: T) {
    setValue(next);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage 꽉 참/비활성화 — 이번 마운트에서는 메모리 state로만 동작.
      }
    }
  }

  return [value, set];
}

/** 온보딩 완료 시 흔적을 지운다 — 다 끝난 뒤에도 남아있으면 다음 진입 때 잘못 이어붙는다. */
export function clearSessionState(...keys: string[]): void {
  if (typeof window === "undefined") return;
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
