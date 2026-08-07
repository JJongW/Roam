"use client";

import { useState } from "react";
import { Expand } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { ImageLightbox } from "@/components/common/image-lightbox";

/**
 * 포스터 전체 보기 — 히어로는 임팩트 위해 cover 크롭이라 제목·일자가 잘린다.
 * 잘린 정보는 요구 시 원본 비율(contain)로 볼 수 있게 한다. 히어로 위 작은 버튼 →
 * 전체화면 오버레이. 배경 탭·Esc·X로 닫힘.
 */
export function PosterViewer({ src, name }: { src: string; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("common.viewPoster")}
        // 아래쪽 — 위에 두면 포스터의 주최·후원 크레딧(보통 상단)을 가린다.
        // 히어로 하단은 스크림이 가장 진하고, 전시명 h1을 걷어내 비어 있다.
        className="pointer-events-auto absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur active:scale-95"
      >
        <Expand className="size-3.5" />
        {t("common.viewPoster")}
      </button>

      {open && <ImageLightbox src={src} alt={name} onClose={() => setOpen(false)} />}
    </>
  );
}
