"use client";

import { useEffect } from "react";
import { useCompanionStore } from "@/lib/stores/companion";

/**
 * 전시 홈(서버 컴포넌트)이 계산한 맥락을 상주 컴패니언 바에 실어주는 클라이언트 브리지.
 * 화면을 벗어나면 맥락을 비워, 다른 화면에서 홈 발화가 새지 않게 한다.
 *
 * 취향 정확도는 서버가 계산한 값을 그대로 시딩한다 — "서버 유일 진실" 원칙이라
 * 낙관적 보정(예전의 "더 높을 때만 올린다") 없이 매번 덮어쓴다. 반응 응답도
 * 같은 방식으로 직접 덮어쓰므로(reaction-bar.tsx) 둘 다 항상 서버 값이다.
 */
export function HomeCompanionContextBridge({
  values,
  picked,
  tasteJudged,
  tastePct,
}: {
  values: string[];
  picked: number;
  /** 서버 브레인으로 계산한 판정 수. */
  tasteJudged: number;
  /** 판정 5개 미만이면 null(말로만 표시). */
  tastePct: number | null;
}) {
  const setHome = useCompanionStore((s) => s.setHome);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const key = values.join("·");
  useEffect(() => {
    setHome({ values, picked });
    setTaste(tasteJudged, tastePct);
    return () => setHome(null);
    // values는 원시 배열이라 join 키로 비교(불필요 리셋 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHome, setTaste, key, picked, tasteJudged, tastePct]);
  return null;
}
