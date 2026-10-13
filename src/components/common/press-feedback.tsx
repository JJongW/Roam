"use client";

import { useEffect } from "react";
import { pressScale } from "@/lib/press-scale";

/**
 * `.press`가 붙은 요소의 누름 축소 배율을 **누르는 순간 요소 상자에서 계산해**
 * `--press-scale`로 꽂는다. CSS 혼자서는 자기 크기를 못 읽기 때문에 이 한 겹이 필요하다.
 *
 * 컴포넌트마다 ref를 심는 대신 document 한 곳에서 위임으로 받는다:
 *  - 누르는 그 순간 재므로 회전·분할·폰트 크기 변경으로 상자가 바뀌어도 늘 최신이다
 *    (ResizeObserver를 따로 둘 이유가 없다).
 *  - 새 컴포넌트는 클래스 하나만 붙이면 된다 — 호출부마다 챙기는 구조가 아니다.
 *
 * JS가 아직 안 붙었거나 이 컴포넌트가 없는 트리에서도 `.press:active`의 폴백
 * 배율(globals.css)이 동작하므로 반응이 사라지지는 않는다.
 */
export function PressFeedback() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(".press");
      if (!(el instanceof HTMLElement)) return;
      const { width, height } = el.getBoundingClientRect();
      // 아직 레이아웃이 안 잡힌 요소(숨김·0크기)는 폴백 배율에 맡긴다.
      if (width <= 0 || height <= 0) return;
      el.style.setProperty("--press-scale", String(pressScale(width, height)));
    }
    // capture: 중간에서 stopPropagation 하는 핸들러가 있어도 먼저 받는다.
    document.addEventListener("pointerdown", onPointerDown, {
      passive: true,
      capture: true,
    });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, []);

  return null;
}
