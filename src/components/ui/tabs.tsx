"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const pillRef = React.useRef<HTMLSpanElement | null>(null);

  // transitions.dev 16-tabs-sliding — 활성 탭의 offsetLeft/Width를 필에 그대로
  // 옮겨 쓴다. 클릭·키보드 이동 둘 다 data-state 변화로 잡아내려고 클릭 핸들러
  // 대신 MutationObserver를 쓴다(Radix가 방향키 자동 활성화도 data-state로 반영).
  const movePill = React.useCallback((animate: boolean) => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const active = list.querySelector<HTMLElement>('[data-state="active"]');
    if (!active) return;
    const apply = () => {
      pill.style.transform = `translateX(${active.offsetLeft}px)`;
      pill.style.width = `${active.offsetWidth}px`;
    };
    if (!animate) {
      const prev = pill.style.transition;
      pill.style.transition = "none";
      apply();
      void pill.offsetWidth;
      pill.style.transition = prev;
    } else {
      apply();
    }
  }, []);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    movePill(false);
    const observer = new MutationObserver(() => movePill(true));
    observer.observe(list, {
      attributes: true,
      attributeFilter: ["data-state"],
      subtree: true,
    });
    const onResize = () => movePill(false);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [movePill]);

  return (
    <TabsPrimitive.List
      ref={(node) => {
        listRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        "t-tabs relative inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-secondary p-1 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-[1] inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground cursor-pointer",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
