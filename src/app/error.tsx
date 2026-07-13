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
    // monitoring hook — forward to a service in production
    console.error("[app:error]", error);
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
