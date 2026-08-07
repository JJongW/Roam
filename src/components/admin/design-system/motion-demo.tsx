"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";

const DURATIONS = (Object.entries(MOTION_DURATION) as [string, number][]).map(
  ([key, seconds]) => ({ key, ms: Math.round(seconds * 1000) }),
);

const EASING_META = [
  { key: "linear", label: "linear — 등속(스피너 등)" },
  { key: "functional", label: "functional — 눌림 등 상태 전환" },
  { key: "enter", label: "enter — 화면 진입" },
  { key: "exit", label: "exit — 화면 이탈" },
  { key: "enterExpressive", label: "enter-expressive" },
  { key: "exitExpressive", label: "exit-expressive" },
] as const;

const EASINGS = EASING_META.map((meta) => {
  const [x1, y1, x2, y2] = MOTION_EASE[meta.key];
  return { ...meta, curve: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})` };
});

export function MotionDemo() {
  const [durationMs, setDurationMs] = useState<number>(200);
  const [movedKeys, setMovedKeys] = useState<Set<string>>(new Set());

  function play(key: string) {
    setMovedKeys((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setMovedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, durationMs + 400);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDurationMs(d.ms)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              durationMs === d.ms
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {d.key} · {d.ms}ms
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {EASINGS.map((e) => (
          <div key={e.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">{e.label}</p>
              <Button size="sm" variant="secondary" onClick={() => play(e.key)}>
                재생
              </Button>
            </div>
            <div className="relative h-8 w-64 rounded-md bg-secondary">
              <div
                className="absolute left-0 top-1/2 size-6 -translate-y-1/2 rounded-full bg-primary"
                style={{
                  transitionProperty: "transform",
                  transitionDuration: `${durationMs}ms`,
                  transitionTimingFunction: e.curve,
                  transform: movedKeys.has(e.key) ? "translateX(220px)" : "translateX(0)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
