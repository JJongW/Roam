"use client";

import { useEffect, useState } from "react";

/** 이 정도 지나면 "원래 이런 건가" 의심이 시작된다. */
export const SLOW_WAIT_MS = 10_000;

/**
 * 기다림이 **평소보다 길어졌는지**.
 *
 * 로딩 문구를 계속 돌리는 것만으로는 10초와 2초가 구분되지 않는다 — 회전은
 * 영원히 진행 중인 척할 수 있고, 사용자는 멈춘 건지 되는 건지 모른 채 기다린다.
 * 길어졌다는 사실 자체를 말해주면 적어도 기다릴지 말지 고를 수 있다.
 */
export function useSlowWait(active: boolean, ms: number = SLOW_WAIT_MS): boolean {
  const [slow, setSlow] = useState(false);
  // active가 바뀌는 순간 렌더 중에 되돌린다 — effect 안에서 setState하면
  // 연쇄 렌더가 된다(booth-highlights의 reqKey와 같은 방식).
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setSlow(false);
  }

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);

  return active && slow;
}
