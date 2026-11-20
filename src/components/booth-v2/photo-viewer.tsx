"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { label } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";

/**
 * UI 4-03 사진 크게 보기(Figma 2995:2559, 11-13 "세로 3:4 옆으로 넘김, 바는 알약").
 * 상세 사진을 누르면 화면 전체로 뜨고, 옆으로 넘기고, 왼쪽 위 X(또는 Esc)로 닫는다.
 * 아래 알약에 "2 / 5". 사진 칸은 세로 3:4이고 가로 사진은 잘리지 않게 칸 안에 담는다(위아래가 남는다, 설계서 4-03 한계).
 * 두 손가락 확대와 아래로 밀어 닫기는 Figma에 없어 두지 않았다.
 */
export function PhotoViewer({
  images,
  start,
  name,
  boothId,
  exhibitionSlug,
  onClose,
}: {
  images: string[];
  start: number;
  name: string;
  boothId: string;
  exhibitionSlug?: string;
  onClose: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(start);
  const seen = useRef(new Set([start]));

  // 누른 사진에서 시작한다(그리기 전에 맞춰 첫 장이 번쩍 보이지 않게).
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);

  useEffect(() => {
    track("screen_view", {
      screen: SCREEN.photoViewer,
      exhibitionSlug,
      boothId,
      props: { start: start + 1, count: images.length },
    });
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // 열릴 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i === index || i < 0 || i >= images.length) return;
    setIndex(i);
    if (!seen.current.has(i)) {
      seen.current.add(i);
      track("booth_photo_swipe", {
        screen: SCREEN.photoViewer,
        exhibitionSlug,
        boothId,
        props: { index: i + 1, count: images.length, seen: seen.current.size },
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} ${label.photo}`}
      className="fixed inset-0 z-50 flex flex-col bg-v2-bg-neutral-solid font-v2-ui"
    >
      <div className="flex items-center px-v2-x1-5 pt-safe">
        <button
          ref={closeRef}
          type="button"
          aria-label={label.close}
          onClick={onClose}
          className="flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral-inverted active:bg-v2-bg-neutral-solid-pressed"
        >
          <X aria-hidden strokeWidth={2} className="size-[var(--roam-v2-icon-size-lg)]" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((src, i) => (
            <div key={src + i} className="w-full shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- 브랜드 사진은 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다 */}
              <img
                src={src}
                alt={`${name} ${label.photo} ${i + 1}`}
                loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"}
                draggable={false}
                className="mx-auto aspect-3/4 max-h-[calc(100dvh-var(--spacing-v2-x40))] w-full bg-v2-bg-neutral-weak object-contain"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center pb-safe">
        <span
          aria-live="polite"
          className="mb-v2-x8 rounded-v2-full bg-v2-bg-layer-floating px-v2-x3 py-v2-x1 text-v2-t3 font-v2-medium text-v2-fg-neutral"
        >
          {index + 1} / {images.length}
        </span>
      </div>
    </div>
  );
}
