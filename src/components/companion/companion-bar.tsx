"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useCompanionStore } from "@/lib/stores/companion";
import { RoamAvatar } from "@/components/companion/roam-avatar";

/**
 * 옛 상주 컴패니언 바(로미 알약 + FAQ 시트)는 지웠다(2026-11-25). Figma UI v1과 설계서 어디에도 없는 요소였고,
 * 로그인하면 부스 상세(4-02) 아래 바와 부스 목록(8-01) 위에 떠서 하트와 다녀왔어요 단추를 덮었다.
 * 로미 시트(UI 7)는 지도 안 로미 줄에서 연다(map-v2/romi-sheet.tsx).
 *
 * 남은 일은 로미의 짧은 반응(flash)을 토스트로 내는 것뿐이다. 아직 부르는 곳(judgment-bar, visited-retro-prompt)이
 * 있어 구독을 남긴다. 화면에는 아무것도 그리지 않는다.
 */
export function CompanionBar() {
  const flash = useCompanionStore((s) => s.flash);
  const clearFlash = useCompanionStore((s) => s.clearFlash);

  // sonner는 이미 top-center로 깔려 있고(providers.tsx) 토스트마다 role="status" + aria-live를 붙여 준다.
  useEffect(() => {
    if (!flash) return;
    toast(flash, {
      // 3.5초 — 한 줄 읽고 사라지는 길이. 남아 있어 봐야 다음 반응을 가린다.
      duration: 3500,
      icon: <RoamAvatar className="size-5" />,
    });
    clearFlash();
  }, [flash, clearFlash]);

  return null;
}
