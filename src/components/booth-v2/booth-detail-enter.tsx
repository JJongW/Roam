"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { BoothDetailSkeleton } from "@/components/booth-v2/booth-detail-skeleton";
import { previewFor, useBoothPreviewStore, type BoothPreview } from "@/lib/stores/booth-preview";

/**
 * 불러오는 중 → 다 온 상세를 제자리 페이드로 바꾼다(iOS BoothPageScreen: 두 화면을 겹쳐 두고
 * `.transition(.opacity)` + `V2Motion.enter`, 11-28 Ted).
 *
 * Next 로딩 경계는 다 오면 틀을 바로 지운다. 그래서 로딩이 실제로 보였던 경우에만(`loadingShownFor`)
 * 같은 틀을 한 번 더 위에 겹쳐 그리고, 틀은 opacity 1→0, 내용은 0→1로 같은 시간과 곡선
 * (`--roam-v2-motion-enter-duration`, `--roam-v2-motion-enter-easing`, Roam-design 토큰)에 바꾼다.
 * 링크로 바로 들어와 서버가 다 그린 화면이거나 움직임 줄이기를 켠 분에게는 겹치지 않는다.
 */
export function BoothDetailEnter({
  boothId,
  children,
}: {
  boothId: string;
  children: React.ReactNode;
}) {
  // 처음 그릴 때 정한다: 로딩이 이 부스로 보였으면 그 틀(미리 보기가 있으면 실제 글자 틀)을 겹친다.
  // 서버 렌더와 첫 화면 수화 때는 스토어가 비어 있어 겹침이 없다(수화 불일치 없음).
  const [overlay, setOverlay] = useState<{ preview?: BoothPreview } | null>(() =>
    useBoothPreviewStore.getState().loadingShownFor === boothId
      ? { preview: previewFor(boothId) ?? undefined }
      : null,
  );
  const [entered, setEntered] = useState(overlay === null);

  useEffect(() => {
    if (!overlay) return;
    useBoothPreviewStore.getState().clearLoadingShown();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // 한 프레임 뒤에 바꿔야 처음 값(틀 1, 내용 0)이 그려진 뒤 전환이 걸린다. 움직임 줄이기면 바로 틀을 걷는다.
    const raf = requestAnimationFrame(() => {
      if (reduce) setOverlay(null);
      setEntered(true);
    });
    return () => cancelAnimationFrame(raf);
    // 처음 한 번만. overlay는 끝나면 null이 될 뿐 다시 생기지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fade =
    "transition-opacity duration-[var(--roam-v2-motion-enter-duration)] ease-[var(--roam-v2-motion-enter-easing)]";
  return (
    <>
      <div className={clsx(overlay && fade, entered ? "opacity-100" : "opacity-0")}>{children}</div>
      {overlay && (
        <div
          aria-hidden
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget) setOverlay(null);
          }}
          className={clsx(
            "pointer-events-none fixed inset-0 z-30 mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] overflow-hidden",
            fade,
            entered ? "opacity-0" : "opacity-100",
          )}
        >
          <BoothDetailSkeleton preview={overlay.preview} />
        </div>
      )}
    </>
  );
}
