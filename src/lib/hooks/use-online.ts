"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * 지금 네트워크가 있는지. 서버 렌더와 첫 페인트에서는 **있다고 본다** —
 * 오프라인 배너가 한 프레임 깜빡이는 건 실제로 끊긴 것보다 더 혼란스럽다.
 *
 * `navigator.onLine`은 "랜선이 꽂혀 있다"까지만 안다(캡티브 포털·죽은 와이파이는
 * 여전히 온라인으로 보인다). 그래서 이건 **배너용 신호**이고, 요청이 실제로
 * 실패했는지는 client.ts의 fetch 거부로 따로 잡는다.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
