"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 움직이는 Roam — 배경 투명 로미 영상 아바타(자동재생·무음·루프). 순간 노출 지점
 * (전시 홈·온보딩·로딩·생각중)에 쓴다. 상시 노출(컴패니언 바)엔 정적 로고 유지.
 *
 * `pool`을 주면 그 중 하나를 인스턴스별로 골라 튼다("생각중/로딩"에서 head_spinning·
 * walk_think 두 영상을 번갈아 쓰는 용도). 고정 영상은 `src`.
 *
 * 포맷이 두 갈래다: WebKit(사파리·아이폰의 모든 브라우저)은 투명 webm의 알파를
 * 버려서 로미가 안 보이거나 검은 사각형이 된다 → 애플이 지원하는 alpha HEVC mp4를
 * 준다(같은 이름 .mp4, ffmpeg으로 webm에서 변환). 나머지는 더 작은 webm.
 * <source> 목록으로는 안 된다 — 크롬도 hvc1을 재생 가능하다고 답하고 mp4를 골라
 * 알파를 잃는다. 그래서 엔진을 보고 코드에서 고른다.
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
  // src를 처음부터 webm으로 declaratively 박아둔다(브라우저 대다수는 이게 맞는
  // 포맷) — 마운트·하이드레이션을 기다리지 않고 페인트 즉시 로드가 시작돼, poster
  // (정적 로미)가 움짤로 바뀌기까지의 공백이 사라진다. WebKit(사파리·아이폰의 모든
  // 브라우저 — vendor가 "Apple Computer, Inc.")만 투명 webm의 알파를 버리므로,
  // 그쪽만 마운트 뒤 mp4로 되돌려 건다(하이드레이션 불일치 없음 — 서버·클라이언트
  // 둘 다 같은 webm URL을 렌더하고, 되돌리는 건 클라이언트 전용 보정이다).
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const webkit = navigator.vendor === "Apple Computer, Inc.";
    if (webkit) v.src = chosen.replace(/\.webm$/, ".mp4");
  }, [chosen]);
  return (
    <video
      key={chosen}
      ref={ref}
      src={chosen}
      autoPlay
      muted
      loop
      playsInline
      // poster = 정적 로미. 영상이 안 뜨면(자동재생 차단·webm 미지원·로드 스톨)
      // 지금까지는 빈 구멍이 남았다 — 로미가 있어야 할 자리가 그냥 비었다.
      // poster는 첫 프레임이 그려지면 사라지니, 재생될 땐 아무것도 안 바뀐다.
      poster="/logo.svg"
      // 기본 preload="metadata"는 브라우저가 로드를 미룰 수 있다(백그라운드 탭·
      // 절전에서 networkState=loading·readyState=0으로 멈춘 채 요청조차 안 나감).
      preload="auto"
      aria-hidden
      // object-contain — 로미는 자르지 않는다. 영상이 정사각형이 아니라서
      // (headbunting 478×620) cover를 쓰면 정사각 박스에서 머리·발이 잘린다.
      // 아바타처럼 꽉 채워야 하는 자리가 생기면 className으로 opt-in 한다.
      className={cn("size-full object-contain", className)}
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
