"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { ImageLightbox } from "@/components/common/image-lightbox";

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
  // 못 불러온 장은 스트립에서 아예 뺀다 — 빈 회색 타일을 탭하면 빈 전체화면이
  // 열려, 사진이 있는데 내가 못 보는 건지 애초에 없는 건지 알 수 없다.
  const [broken, setBroken] = useState<string[]>([]);
  const shown = images.filter((src) => !broken.includes(src));

  // 다 실패하면 이미지가 없는 것과 같다.
  if (!shown.length) return null;

  return (
    <>
      <div className="-mx-[var(--spacing-global-gutter)] flex gap-2 overflow-x-auto px-[var(--spacing-global-gutter)] pb-1">
        {shown.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t("booth.viewImage", { n: i + 1 })}
            className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary press active:bg-secondary-pressed"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지 다수, 최적화 없이 lazy */}
            <img
              src={src}
              alt={`${name} ${i + 1}`}
              loading="lazy"
              className="size-full object-cover"
              onError={() =>
                setBroken((prev) =>
                  prev.includes(src) ? prev : [...prev, src],
                )
              }
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <ImageLightbox src={shown[open]} alt={name} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
