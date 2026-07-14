"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";

/**
 * 반응이 쌓이면 피드를 갱신된 브레인으로 다시 큐레이션한다 — "취향 반영해서 다시 골라줄게".
 * 반응마다 즉시 새로고침하면 피드가 튀니, 버스트가 멎을 때(디바운스)만 한 번 refresh.
 * 신호 적재→브레인 재증류는 서버가 이미 처리하므로, 여기선 서버 재렌더만 유발한다(LLM 무).
 * 전시 홈에 1개만 마운트.
 */
export function FeedRecurator() {
  const router = useRouter();
  const t = useT();
  const tick = useCompanionStore((s) => s.reactionTick);
  const say = useCompanionStore((s) => s.say);
  const lastRefreshed = useRef(0);

  useEffect(() => {
    if (tick === 0) return; // 초기 마운트엔 아무것도 안 함
    const timer = setTimeout(() => {
      if (tick === lastRefreshed.current) return; // 이미 이 틱까지 반영
      lastRefreshed.current = tick;
      say(t("companion.recurated"));
      router.refresh(); // 서버가 갱신된 브레인으로 피드 재큐레이션
    }, 2800);
    return () => clearTimeout(timer);
  }, [tick, router, say, t]);

  return null;
}
