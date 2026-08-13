"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { hasNavigatedInApp } from "@/components/common/nav-tracker";

export function AppBar({
  title,
  showBack = true,
  onBack,
  right,
  transparent = false,
  className,
}: {
  title?: string;
  showBack?: boolean;
  /** Override the default back behavior — for screens whose logical parent
   *  isn't the previous history entry (the map goes home, not back to onboarding). */
  onBack?: () => void;
  right?: React.ReactNode;
  transparent?: boolean;
  className?: string;
}) {
  const router = useRouter();
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center gap-1 px-2 pt-safe",
        transparent
          ? "bg-transparent"
          : "border-b border-border bg-background/80 backdrop-blur-xl",
        className,
      )}
    >
      {showBack ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="뒤로 가기"
          onClick={
            onBack ??
            // 공유 링크로 이 화면에 바로 들어오면 앱 안 내비 이력이 없다 — 그럴 땐
            // router.back()이 about:blank 등 앱 밖으로 떨어뜨린다(map handleBack과
            // 같은 원인, nav-tracker.tsx 참고). 이 컴포넌트는 화면마다 다른 "논리적
            // 부모"를 모르니 안전한 홈으로 보낸다.
            (() => (hasNavigatedInApp() ? router.back() : router.push("/")))
          }
        >
          <ChevronLeft className="size-6" />
        </Button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate text-base font-bold">{title}</h1>
      <div className="flex items-center gap-0.5">{right}</div>
    </header>
  );
}
