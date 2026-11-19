"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { hasNavigatedInApp } from "@/components/common/nav-tracker";
import { label } from "@/lib/copy/v1";

/**
 * UI/뒤로 버튼(Figma 2992:717) — chevron 24, 선 2, 누르는 영역 44. 앱 안에서 넘어왔으면
 * 뒤로, 공유 링크로 바로 들어왔으면 `fallbackHref`로 간다(map-view.tsx와 같은 이유).
 */
export function BackButton({
  fallbackHref,
  className,
}: {
  fallbackHref: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label.back}
      onClick={() =>
        hasNavigatedInApp() ? router.back() : router.push(fallbackHref)
      }
      className={clsx(
        "flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed",
        className,
      )}
    >
      <ChevronLeft
        aria-hidden
        strokeWidth={2}
        className="size-[var(--roam-v2-icon-size-lg)]"
      />
    </button>
  );
}
