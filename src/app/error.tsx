"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:error]", error);
    if (error.digest) return; // 서버가 이미 실제 메시지로 기록했다 — 리다크트된 것만 또 남기지 않는다
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        path:
          typeof window !== "undefined" ? window.location.pathname : undefined,
        digest: error.digest,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    }).catch(() => {
      /* 오류 보고 자체가 실패해도 사용자에게 보여줄 화면엔 영향 없음 */
    });
  }, [error]);

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <RotateCcw className="size-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-extrabold">문제가 생겼어</h1>
        <p className="text-sm text-muted-foreground">잠깐 뒤에 다시 해보자.</p>
      </div>
      <Button onClick={reset}>다시 해보기</Button>
    </div>
  );
}
