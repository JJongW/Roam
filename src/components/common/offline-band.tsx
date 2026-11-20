"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { homeCopy } from "@/lib/copy/home";
import { SCREEN, track } from "@/lib/analytics/app-track";

/** 지도 화면인가. 띠 문구와 기록 화면 id가 지도와 그 밖으로 갈린다. */
export function isMapPath(pathname: string): boolean {
  return /^\/exhibitions\/[^/]+\/map$/.test(pathname);
}

/**
 * UI 16 오프라인 띠 O-C(11-11 Ted). 상태바 바로 아래 어두운 띠 한 줄. 화면을 막지 않는다.
 * - 지도: "오프라인이에요. 받아 둔 지도를 보여 드려요"(16-01), 그 밖: "…받아 둔 내용을 보여 드려요"(16-04).
 * - 띠가 떠 있는 동안 `html[data-offline]`을 켜서 맨 위 바(`pt-safe`)들을 띠 높이만큼 내린다(globals.css).
 *   그래서 띠가 찾기 줄이나 머리를 덮지 않는다.
 * - 보일 때 offline_band_shown 한 번(iOS와 같은 이름).
 */
export function OfflineBand() {
  const pathname = usePathname() ?? "";
  const map = isMapPath(pathname);
  useEffect(() => {
    document.documentElement.dataset.offline = "1";
    return () => {
      delete document.documentElement.dataset.offline;
    };
  }, []);
  useEffect(() => {
    track("offline_band_shown", { screen: map ? SCREEN.offlineMap : SCREEN.offlineHome });
  }, [map]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="offline-band fixed inset-x-0 top-0 z-50 flex justify-center bg-v2-bg-neutral-solid text-v2-fg-on-neutral-solid"
    >
      <span className="flex h-v2-x6 items-center gap-v2-x1-5 text-v2-t2 font-v2-medium">
        <WifiOff aria-hidden className="size-[var(--roam-v2-icon-size-sm)] shrink-0" />
        {map ? homeCopy.offlineMap : homeCopy.offlineHome}
      </span>
    </div>
  );
}
