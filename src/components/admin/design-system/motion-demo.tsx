"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { key: "d1", ms: 50 },
  { key: "d2", ms: 100 },
  { key: "d3", ms: 150 },
  { key: "d4", ms: 200 },
  { key: "d5", ms: 250 },
  { key: "d6", ms: 300 },
] as const;

const EASINGS = [
  { key: "linear", label: "linear — 등속(스피너 등)", curve: "cubic-bezier(0, 0, 1, 1)" },
  { key: "functional", label: "functional — 눌림 등 상태 전환", curve: "cubic-bezier(0.35, 0, 0.35, 1)" },
  { key: "enter", label: "enter — 화면 진입", curve: "cubic-bezier(0, 0, 0.15, 1)" },
  { key: "exit", label: "exit — 화면 이탈", curve: "cubic-bezier(0.35, 0, 1, 1)" },
  { key: "enter-expressive", label: "enter-expressive", curve: "cubic-bezier(0.03, 0.4, 0.1, 1)" },
  { key: "exit-expressive", label: "exit-expressive", curve: "cubic-bezier(0.35, 0, 0.95, 0.55)" },
] as const;

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
