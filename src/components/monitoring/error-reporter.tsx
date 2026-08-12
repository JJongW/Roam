"use client";

import { useEffect } from "react";

/**
 * React 렌더 트리 밖 오류(이벤트 핸들러·비동기 코드)는 error.tsx가 못 잡는다
 * — window.onerror/unhandledrejection으로 따로 잡아 서버에 보고한다.
 */
export function ErrorReporter() {
  useEffect(() => {
    function report(message: string, stack?: string) {
      fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          stack,
          path: window.location.pathname,
        }),
      }).catch(() => {});
    }

    function onError(event: ErrorEvent) {
      report(event.message, event.error?.stack);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      report(message, stack);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
