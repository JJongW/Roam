"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * 움직이는 Roam — 배경 투명 로미 영상 아바타(자동재생·무음·루프). 순간 노출 지점
 * (전시 홈·온보딩·로딩·생각중)에 쓴다. 상시 노출(컴패니언 바)엔 정적 로고 유지.
 *
 * `pool`을 주면 그 중 하나를 인스턴스별로 골라 튼다("생각중/로딩"에서 head_spinning·
 * walk_think 두 영상을 번갈아 쓰는 용도). 고정 영상은 `src`.
 */
export function RoamMotion({
  src,
  pool,
  className,
}: {
  src?: string;
  pool?: string[];
  className?: string;
}) {
  // useId = 인스턴스별 안정 값 → pool에서 결정론적으로 하나 선택(Math.random 없이 변주).
  const id = useId();
  const chosen =
    pool && pool.length > 0
      ? pool[hashStr(id) % pool.length]
      : (src ?? pool?.[0] ?? "");
  return (
    <video
      key={chosen}
      src={chosen}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      className={cn("size-full object-cover", className)}
    />
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 생각중·로딩에 번갈아 쓰는 로미 영상 풀(head_spinning·walk_think). */
export const THINKING_POOL = ["/head_spinning.webm", "/walk_think.webm"];
