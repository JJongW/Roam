"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, onCheckedChange, ...props }, ref) => {
  // 썸 이동은 transitions.dev 27-toggle(globals.css)이 담당 — 첫 렌더에서
  // 되돌아오는 바운스가 재생되지 않도록, 실제로 한 번 조작된 뒤에만 애니메이션을 건다.
  const [interacted, setInteracted] = React.useState(false);
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-interacted={interacted || undefined}
      onCheckedChange={(checked) => {
        setInteracted(true);
        onCheckedChange?.(checked);
      }}
      className={cn(
        "t-toggle peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="t-toggle-thumb pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0" />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = "Switch";

export { Switch };
