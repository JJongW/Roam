import { cn } from "@/lib/utils";
import { CONTACT_STATUS_LABEL } from "@/lib/brands/contact";
import type { BrandContactStatus } from "@/lib/types";

/**
 * 연락 상태 색. 기존 토큰(primary, success, warning, destructive, muted)만 쓴다.
 * 흐름 순서대로 읽히게: 안 보냄(회색) → 보냄, 읽음(보라 옅게, 진하게) → 답장(주황, 손댈 것) →
 * 허락(초록) → 거절, 철회(빨강), 답 없음(어두운 회색).
 * 초록과 주황은 글자색으로 쓰면 대비가 모자라 바탕과 점에만 쓰고 글자는 본문색으로 둔다.
 */
export const STATUS_STYLE: Record<BrandContactStatus, { chip: string; bar: string; dot: string }> = {
  "not-sent": { chip: "bg-secondary text-muted-foreground", bar: "bg-muted-foreground/25", dot: "bg-muted-foreground/40" },
  sent: { chip: "bg-primary/10 text-primary", bar: "bg-primary/45", dot: "bg-primary/45" },
  read: { chip: "bg-primary/20 text-primary", bar: "bg-primary/75", dot: "bg-primary/75" },
  replied: { chip: "bg-warning/20 text-foreground", bar: "bg-warning", dot: "bg-warning" },
  granted: { chip: "bg-success/20 text-foreground", bar: "bg-success", dot: "bg-success" },
  partial: { chip: "bg-success/10 text-foreground", bar: "bg-success/55", dot: "bg-success/55" },
  declined: { chip: "bg-destructive/10 text-destructive", bar: "bg-destructive", dot: "bg-destructive" },
  "no-reply": { chip: "bg-foreground/10 text-foreground/70", bar: "bg-foreground/45", dot: "bg-foreground/45" },
  withdrawn: { chip: "bg-destructive/10 text-destructive/80", bar: "bg-destructive/50", dot: "bg-destructive/50" },
};

export function StatusChip({ status, className }: { status: BrandContactStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-bold whitespace-nowrap",
        STATUS_STYLE[status].chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_STYLE[status].dot)} aria-hidden />
      {CONTACT_STATUS_LABEL[status]}
    </span>
  );
}
