"use client";

import { useEffect, useState } from "react";
import { Expand, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 포스터 전체 보기 — 히어로는 임팩트 위해 cover 크롭이라 제목·일자가 잘린다.
 * 잘린 정보는 요구 시 원본 비율(contain)로 볼 수 있게 한다. 히어로 위 작은 버튼 →
 * 전체화면 오버레이. 배경 탭·Esc·X로 닫힘.
 */
export function PosterViewer({ src, name }: { src: string; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("common.viewPoster")}
        className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur active:scale-95"
      >
        <Expand className="size-3.5" />
        {t("common.viewPoster")}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지 위해 fill 대신 contain */}
          <img
            src={src}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-[var(--shadow-pop)]"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
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
