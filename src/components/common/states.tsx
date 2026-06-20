import { Loader2, type LucideIcon, Inbox, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("size-5 animate-spin text-muted-foreground", className)}
      aria-hidden
    />
  );
}

export function LoadingScreen({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Spinner className="size-7" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

export function EmptyState({
  icon: IconCmp = Inbox,
  title,
  description,
  action,
  className,
  bordered = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        bordered && "rounded-2xl border border-dashed border-border",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <IconCmp className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "문제가 발생했어요",
  description = "잠시 후 다시 시도해 주세요.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
      role="alert"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="size-6 text-destructive" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
