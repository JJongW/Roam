"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const KEY = "roam_has_navigated_in_app";

/**
 * `window.history.length`는 앱 안에서 실제로 페이지를 넘나든 적이 있는지의
 * 신뢰할 수 없는 대용치다 — 새 탭에 공유 링크 하나만 열어도 브라우저 자체
 * 초기 엔트리 때문에 1보다 크게 나올 수 있다(지도 `handleBack`이 이걸로
 * "돌아갈 곳이 있다"고 오판해 `router.back()`을 부르면 about:blank 등
 * 앱 밖으로 떨어진다). pathname이 실제로 한 번이라도 바뀐 적 있는지를
 * sessionStorage에 남겨 그 판단을 대체한다.
 */
export function NavTracker() {
  const pathname = usePathname();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) {
      sessionStorage.setItem(KEY, "1");
    }
  }, [pathname]);
  return null;
}

export function hasNavigatedInApp(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}
