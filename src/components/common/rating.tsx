import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Rating({
  value,
  size = 16,
  className,
  showValue = false,
}: {
  value: number;
  size?: number;
  className?: string;
  showValue?: boolean;
}) {
  const rounded = Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`별점 ${value}점 / 5점`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(i <= rounded ? "fill-warning text-warning" : "fill-secondary text-secondary")}
          aria-hidden
        />
      ))}
      {showValue && <span className="ml-1 text-sm font-semibold tabular">{value.toFixed(1)}</span>}
    </span>
  );
}
