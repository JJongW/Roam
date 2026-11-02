"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** 서버 컴포넌트 화면을 주기적으로 다시 그린다(`router.refresh`). 탭이 안 보일 땐 쉬고,
 *  돌아오면 바로 한 번 새로 센다. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return (
    // 서버가 그린 시각과 브라우저 시각은 몇 초 다를 수밖에 없다 — 그 차이만 눈감는다.
    <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite" suppressHydrationWarning>
      {at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 기준
    </p>
  );
}
