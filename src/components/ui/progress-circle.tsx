import { cn } from "@/lib/utils";

export interface ProgressCircleProps {
  /** 40 = 두께 5px(풀페이지용), 24 = 두께 3px(요소 단위용). 기본 24. */
  size?: 24 | 40;
  /** 0~100. indeterminate가 true면 무시됨. */
  value?: number;
  /** true면 value 무시하고 회전 스피너로 표시. */
  indeterminate?: boolean;
  tone?: "neutral" | "brand";
  className?: string;
}

export function ProgressCircle({
  size = 24,
  value = 0,
  indeterminate = false,
  tone = "neutral",
  className,
}: ProgressCircleProps) {
  const strokeWidth = size === 40 ? 5 : 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  const color = tone === "brand" ? "var(--primary)" : "var(--muted-foreground)";
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(indeterminate && "animate-spin", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={
          indeterminate ? `${circumference * 0.25} ${circumference}` : circumference
        }
        strokeDashoffset={indeterminate ? 0 : offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
