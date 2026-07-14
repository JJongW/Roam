"use client";

import { useEffect } from "react";
import { useCompanionStore } from "@/lib/stores/companion";

/**
 * 전시 홈(서버 컴포넌트)이 계산한 맥락을 상주 컴패니언 바에 실어주는 클라이언트 브리지.
 * 화면을 벗어나면 맥락을 비워, 다른 화면에서 홈 발화가 새지 않게 한다.
 */
export function HomeCompanionContextBridge({
  values,
  picked,
  progress,
}: {
  values: string[];
  picked: number;
  /** 서버 브레인으로 계산한 취향 파악도 시드(0~100). */
  progress: number;
}) {
  const setHome = useCompanionStore((s) => s.setHome);
  const setProgress = useCompanionStore((s) => s.setProgress);
  const storeProgress = useCompanionStore((s) => s.progress);
  const key = values.join("·");
  useEffect(() => {
    setHome({ values, picked });
    // 서버 시드가 현재 값보다 높을 때만 올린다 — 세션 중 반응으로 오른 값을 되돌리지
    // 않게(낙관적 상승 보존).
    if (progress > storeProgress) setProgress(progress);
    return () => setHome(null);
    // values는 원시 배열이라 join 키로 비교(불필요 리셋 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHome, setProgress, key, picked, progress]);
  return null;
}
