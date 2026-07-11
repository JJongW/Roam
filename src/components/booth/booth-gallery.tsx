"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 부스 작품 갤러리 — 일러스트·창작 부스는 작품 이미지가 핵심 정보다. 상세 상단에
 * 가로 스크롤 스트립으로 보여주고, 탭하면 전체화면 원본 비율(contain)로 확대.
 * 외부 CDN webp라 최적화 없이 plain img + lazy. images 없으면 아무것도 안 그림.
 */
export function BoothGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!images.length) return null;

  return (
    <>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t("booth.viewImage", { n: i + 1 })}
            className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지 다수, 최적화 없이 lazy */}
            <img
              src={src}
              alt={`${name} ${i + 1}`}
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지 */}
          <img
            src={images[open]}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-2xl object-contain"
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label={t("common.close")}
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
