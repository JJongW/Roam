"use client";

import { useEffect } from "react";
import { useCompanionStore } from "@/lib/stores/companion";
import type { InterestNode } from "@/lib/types";

/**
 * 전시 홈(서버 컴포넌트)이 계산한 맥락을 상주 컴패니언 바에 실어주는 클라이언트 브리지.
 * 화면을 벗어나면 홈 맥락은 비워, 다른 화면에서 홈 발화가 새지 않게 한다. taste·
 * interests는 안 비운다 — 둘 다 지도 등 다른 화면에서도 필요하다(reaction-bar.tsx).
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
  interests,
}: {
  values: string[];
  picked: number;
  /** 서버 브레인으로 계산한 판정 수. */
  tasteJudged: number;
  /** 판정 5개 미만이면 null(말로만 표시). */
  tastePct: number | null;
  /** 브레인 상위 관심 분야 — 지도 반응 즉답이 분야를 언급할 때 쓴다. */
  interests: InterestNode[];
}) {
  const setHome = useCompanionStore((s) => s.setHome);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const setInterests = useCompanionStore((s) => s.setInterests);
  const key = values.join("·");
  useEffect(() => {
    setHome({ values, picked });
    setTaste(tasteJudged, tastePct);
    setInterests(interests);
    return () => setHome(null);
    // values는 원시 배열이라 join 키로 비교(불필요 리셋 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setHome,
    setTaste,
    setInterests,
    key,
    picked,
    tasteJudged,
    tastePct,
    interests,
  ]);
  return null;
}
