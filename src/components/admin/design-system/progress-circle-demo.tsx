"use client";

import { useState } from "react";
import { ProgressCircle } from "@/components/ui/progress-circle";

export function ProgressCircleDemo() {
  const [value, setValue] = useState(60);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={40} value={value} tone="brand" />
          <p className="text-xs text-muted-foreground">size 40 · determinate</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={24} value={value} tone="neutral" />
          <p className="text-xs text-muted-foreground">size 24 · determinate</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={40} indeterminate tone="brand" />
          <p className="text-xs text-muted-foreground">size 40 · indeterminate</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={24} indeterminate tone="neutral" />
          <p className="text-xs text-muted-foreground">size 24 · indeterminate</p>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="w-16 shrink-0 font-semibold">{value}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full"
        />
      </label>
    </div>
  );
}
