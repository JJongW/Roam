import { Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Waiting } from "@/lib/types";

/** Color thresholds: <10m calm, <20m busy, else crowded. */
function level(min: number) {
  if (min < 10) return { label: "여유", cls: "bg-success/12 text-success" };
  if (min < 20) return { label: "보통", cls: "bg-warning/15 text-[#9a6700]" };
  return { label: "혼잡", cls: "bg-destructive/12 text-destructive" };
}

export function WaitingBadge({
  waiting,
  showQueue = false,
  className,
}: {
  waiting?: Waiting | null;
  showQueue?: boolean;
  className?: string;
}) {
  if (!waiting || !waiting.enabled) return null;
  const { label, cls } = level(waiting.estimatedMinutes);
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular", cls, className)}
      aria-label={`예상 대기 ${waiting.estimatedMinutes}분, ${label}`}
    >
      <Clock className="size-3" aria-hidden />
      {waiting.estimatedMinutes}분
      {showQueue && (
        <>
          <Users className="ml-0.5 size-3" aria-hidden />
          {waiting.queueCount}
        </>
      )}
    </span>
  );
}
