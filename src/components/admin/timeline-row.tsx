import Link from "next/link";
import { format } from "date-fns";
import type { TimelineEvent } from "@/lib/admin/timeline";
import { Chip } from "@/components/ui/chip";

export function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 text-sm last:border-0">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {format(new Date(event.createdAt), "M.d HH:mm")}
      </span>
      <Chip variant="outline" size="sm" className="shrink-0">
        {event.label}
      </Chip>
      <span className="min-w-0 flex-1 truncate">
        {event.userId ? (
          <Link
            href={`/admin/accounts/${event.userId}`}
            className="font-semibold text-primary hover:underline"
          >
            {event.userLabel}
          </Link>
        ) : (
          <span className="text-muted-foreground">{event.userLabel}</span>
        )}
        {event.boothLabel && (
          <span className="text-muted-foreground"> · {event.boothLabel}</span>
        )}
      </span>
    </div>
  );
}
