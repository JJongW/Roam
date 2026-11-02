"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasNavigatedInApp } from "@/components/common/nav-tracker";

/**
 * Apple iOS 27 `Toolbar - Top - iPhone`(Style=Compact Large)을 웹으로 옮긴 것.
 * 자체 `상단바`(한 줄 56px · 16px 제목)는 **폐기**했다 —
 * 근거는 `docs/prd/2026-10-09_figma-handoff.md`의 역할 분담: 시스템 크롬은 Apple
 * 컴포넌트를 쓰고 제품 표면만 Roam 토큰으로 그린다.
 *
 * 두 조각으로 나온다. **44px 내비 줄**(뒤로 · 우측 액션)은 sticky로 남고,
 * **34px 큰 제목**은 스크롤에 흘려보낸다 — iOS large title이 그렇게 동작한다.
 * 내비 줄 높이를 `--toolbar-height`로 고정해 둬야 그 아래 붙는 sticky들(부스 탭·
 * 온보딩 배너)의 기준점이 서고, 제목이 두 줄로 늘어나도 그 값이 안 흔들린다.
 *
 * ponytail: 스크롤에 따라 큰 제목을 내비 줄의 작은 제목으로 바꾸는 iOS 동작은
 * 생략했다(스크롤 리스너가 필요하다). 내비 줄에 제목이 보여야 하면 그때 넣는다.
 */
export function Toolbar({
  title,
  onBack,
  right,
}: {
  title?: string;
  /** Override the default back behavior — for screens whose logical parent
   *  isn't the previous history entry (the map goes home, not back to onboarding). */
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <>
      {/* items-end: 높이에 노치 인셋이 포함돼 있어, 44px 컨트롤을 그 아래쪽에 앉힌다. */}
      <header className="sticky top-0 z-40 flex h-[var(--toolbar-height)] items-end justify-between gap-1 bg-background px-1.5">
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
        <div className="flex items-center gap-0.5">{right}</div>
      </header>
      {title && (
        <h1 className="px-[var(--spacing-global-gutter)] pb-2.5 text-large-title font-bold">
          {title}
        </h1>
      )}
    </>
  );
}
