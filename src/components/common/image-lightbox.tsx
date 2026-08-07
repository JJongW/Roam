"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 이미지 전체화면 오버레이 — 배경 클릭·Esc·X 버튼으로 닫힌다. 부스 갤러리·포스터
 * 확대보기가 완전히 같은 오버레이를 각자 구현하고 있던 걸 하나로 뽑았다.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지 */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-2xl object-contain shadow-[var(--shadow-pop)]"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
